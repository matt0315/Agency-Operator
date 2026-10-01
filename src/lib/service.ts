import { autoAdvanceDecision, dispatchDecision, repairAllowed } from "./autonomy";
import { getModel } from "./catalog";
import {
  clearJobWork,
  countJobs,
  findGenerationByRequest,
  getAutonomy,
  getClient,
  getGeneration,
  getJob,
  getWorkflow,
  insertAnalysis,
  insertAudit,
  insertGeneration,
  insertJob,
  insertLedger,
  insertMessage,
  insertQa,
  insertRevision,
  jobSpendMicros,
  listAnalyses,
  listAudit,
  listGenerations,
  listJobs,
  listLedger,
  listMessages,
  listQa,
  listRevisions,
  saveAutonomy,
  saveWorkflow,
  updateGeneration,
  updateJob,
  updateRevision,
  upsertClient,
} from "./db";
import { decideJob, stepCostMicros } from "./economics";
import { hoursUntil } from "./format";
import { analysisMode, generationMode, redact } from "./mode";
import { mockAnalyze } from "./mock-analysis";
import { analyzeWithOpenAI } from "./openai";
import { evaluateGeneration } from "./qa";
import {
  cancelRequest,
  connectionTestInput,
  estimateRequest,
  fetchStatus,
  isTerminal,
  mockEstimate,
  mockSubmit,
  persistAssets,
  submitRequest,
} from "./provider";
import { replaceStepModel, routeFromAnalysis } from "./router";
import { parseAnalysis } from "./schema";
import { ORCHARD_BRIEF, RAIN_BRIEF, seedDatabase } from "./seed";
import { getTemplate } from "./templates";
import type {
  AutonomySettings,
  BriefAnalysis,
  ClientMemory,
  GenerationRecord,
  JobBundle,
  JobRecord,
  MessageRecord,
  RevisionRecord,
  RouteStep,
  StoredAnalysis,
} from "./types";

function now(): string {
  return new Date().toISOString();
}

function uid(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

export async function ensureReady() {
  const { hydrateProcessEnv } = await import("./cloudflare-env");
  await hydrateProcessEnv();
  if ((await countJobs()) === 0) await seedDatabase();
}

async function audit(jobId: string | null, kind: string, summary: string, payload: Record<string, unknown> = {}) {
  await insertAudit({ id: uid("audit"), jobId, kind, summary, payload, createdAt: now() });
}

async function latestAnalysis(jobId: string) {
  const rows = await listAnalyses(jobId);
  return rows.filter((row) => row.kind === "human").at(-1) ?? rows.filter((row) => row.kind === "model").at(-1) ?? null;
}

async function economicsFor(job: JobRecord, steps: RouteStep[]) {
  const analysis = await latestAnalysis(job.id);
  if (!analysis) return null;
  return decideJob({
    analysis: analysis.analysis,
    steps,
    clientPriceMicros: job.clientPriceMicros,
    sourceFeeBps: job.sourceFeeBps,
    contingencyBps: job.contingencyBps,
    targetMarginBps: job.targetMarginBps,
    maxProductionMicros: job.maxProductionMicros,
    deadlineAt: job.deadlineAt,
  }).economics;
}

export async function getBundle(id: string) {
  await ensureReady();
  const job = await getJob(id);
  if (!job) return null;
  const client = await getClient(job.clientId);
  if (!client) return null;
  const workflow = await getWorkflow(id);
  return {
    job,
    client,
    analyses: await listAnalyses(id),
    workflow,
    generations: await listGenerations(id),
    qaReports: await listQa(id),
    revisions: await listRevisions(id),
    messages: await listMessages(id),
    audit: await listAudit(id),
    ledger: await listLedger(id),
    economics: workflow ? await economicsFor(job, workflow.steps) : null,
    mode: { analysis: analysisMode(), generation: generationMode() },
    settings: await getAutonomy(),
  };
}

export async function dashboardJobs() {
  await ensureReady();
  return await listJobs();
}

const blankMemory = (): ClientMemory => ({
  logos: [],
  colors: [],
  fonts: [],
  tone: "",
  productDetails: [],
  winningAssets: [],
  rejectedStyles: [],
  deliveryPreferences: [],
  communicationPreferences: [],
  likenessConsent: "None on file.",
});

export async function createJob(input: {
  title: string;
  source: string;
  rawBrief: string;
  clientName: string;
  channel: "marketplace" | "direct_email" | "first_party_portal";
  clientPriceMicros: number;
  deadlineAt: string;
  templateId: string | null;
}) {
  await ensureReady();
  const created = now();
  const clientId = uid("client");
  await upsertClient({ id: clientId, name: input.clientName || "Unnamed client", channel: input.channel, memory: blankMemory() });
  const template = getTemplate(input.templateId);
  const job: JobRecord = {
    id: uid("job"),
    title: input.title.trim() || "Untitled job",
    source: input.source,
    rawBrief: input.rawBrief,
    clientPriceMicros: input.clientPriceMicros,
    deadlineAt: input.deadlineAt,
    status: "new",
    clientId,
    clientNotes: "",
    templateId: input.templateId,
    sourceFeeBps: input.channel === "marketplace" ? 1000 : 0,
    contingencyBps: 2000,
    targetMarginBps: template?.targetGrossMarginBps ?? 5500,
    maxProductionMicros: template?.maxProductionMicros ?? Number(process.env.DEFAULT_MAX_PRODUCTION_MICROS || 40_000_000),
    recordingGate: null,
    createdAt: created,
    updatedAt: created,
  };
  await insertJob(job);
  await audit(job.id, "intake", "Brief pasted into Agency Operator. No marketplace was contacted.", { source: job.source });
  return job;
}

async function persistRoute(job: JobRecord, analysis: BriefAnalysis, kind: StoredAnalysis["kind"]) {
  const steps = routeFromAnalysis(analysis, `${job.title}\n${analysis.conciseSummary}`);
  const decision = decideJob({
    analysis,
    steps,
    clientPriceMicros: job.clientPriceMicros,
    sourceFeeBps: job.sourceFeeBps,
    contingencyBps: job.contingencyBps,
    targetMarginBps: job.targetMarginBps,
    maxProductionMicros: job.maxProductionMicros,
    deadlineAt: job.deadlineAt,
  });
  const stored: StoredAnalysis = { id: uid("analysis"), jobId: job.id, kind, analysis, decision, createdAt: now() };
  await insertAnalysis(stored);
  const existing = await getWorkflow(job.id);
  await saveWorkflow({
    id: existing?.id ?? uid("wf"),
    jobId: job.id,
    status: "draft",
    steps,
    approvedMaxMicros: null,
    createdAt: existing?.createdAt ?? now(),
    updatedAt: now(),
  });
  const status = decision.decision === "reject" ? "rejected" : "needs_review";
  await updateJob(job.id, { status, recordingGate: job.recordingGate });
  await audit(job.id, "model_decision", `Deterministic decision: ${decision.decision}.`, {
    reasons: decision.reasons,
    advisory: analysis.decision,
  });
  return stored;
}

export async function analyzeJob(jobId: string) {
  await ensureReady();
  const job = await mustJob(jobId);
  let analysis: BriefAnalysis;
  if (analysisMode() === "live") {
    analysis = await analyzeWithOpenAI({ title: job.title, brief: job.rawBrief, source: job.source });
    await audit(job.id, "model_decision", `OpenAI Responses analysis using ${process.env.OPENAI_MODEL || "gpt-6-astra"}.`, {});
  } else {
    analysis = mockAnalyze(job.title, job.rawBrief);
    await audit(job.id, "model_decision", "Mock analysis. No OpenAI key in use.", {});
  }
  await persistRoute(job, analysis, "model");
  if (analysis.questionsForClient[0]) {
    await recordMessage(job, {
      kind: "intake_question",
      subject: "One question before production",
      body: analysis.questionsForClient[0],
      audience: "client",
    });
  }
  await recordMessage(job, {
    kind: "proposal",
    subject: `Proposal — ${job.title}`,
    body: proposalBody(job, analysis),
    audience: "client",
  });
}

export async function saveHumanAnalysis(jobId: string, raw: unknown) {
  await ensureReady();
  const parsed = parseAnalysis(raw);
  if (!parsed.ok) return parsed;
  const job = await mustJob(jobId);
  await persistRoute(job, parsed.analysis, "human");
  await audit(job.id, "approval", "Human edited the analysis. The original model version is kept.", {});
  return { ok: true };
}

export async function approveWorkflow(jobId: string, actor: "human" | "automatic" = "human") {
  await ensureReady();
  const job = await mustJob(jobId);
  const workflow = await getWorkflow(jobId);
  const analysis = await latestAnalysis(jobId);
  if (!workflow || !analysis) throw new Error("Analyze the brief before approval.");
  const decision = decideJob({
    analysis: analysis.analysis,
    steps: workflow.steps,
    clientPriceMicros: job.clientPriceMicros,
    sourceFeeBps: job.sourceFeeBps,
    contingencyBps: job.contingencyBps,
    targetMarginBps: job.targetMarginBps,
    maxProductionMicros: job.maxProductionMicros,
    deadlineAt: job.deadlineAt,
  });
  if (!decision.economics.priceDataComplete) {
    throw new Error("Approval is blocked until every selected model has a price or a live estimate.");
  }
  if (decision.economics.overBudget) {
    throw new Error("Approval is blocked because generation plus contingency exceeds the production budget.");
  }
  await saveWorkflow({ ...workflow, status: "approved", approvedMaxMicros: job.maxProductionMicros, updatedAt: now() });
  await updateJob(jobId, { status: "approved" });
  await audit(
    jobId,
    "approval",
    actor === "automatic"
      ? "Ran without a person: approved the workflow inside the production ceiling and the per-job cap."
      : `Human approved the workflow. Ceiling ${job.maxProductionMicros} micro-USD.`,
    { actor, recommendation: decision.decision, reasons: decision.reasons },
  );
}

export async function runAutomatic(jobId: string) {
  await ensureReady();
  const job = await mustJob(jobId);
  if (job.recordingGate) return "Recording mode stays stepped. Automatic run skipped.";
  const settings = await getAutonomy();
  if (!settings.fullyAutomaticWithinLimits) {
    await audit(jobId, "escalation", "Waiting on a person: fully automatic within limits is off.", { actor: "waiting" });
    return "Waiting on a person: fully automatic within limits is off.";
  }
  try {
    await analyzeJob(jobId);
  } catch (error) {
    const message = redact(error instanceof Error ? error.message : "Analysis failed.");
    await audit(jobId, "escalation", `Waiting on a person: analysis failed. ${message}`, { actor: "waiting" });
    await updateJob(jobId, { status: "needs_review" });
    return message;
  }
  await audit(jobId, "model_decision", "Ran without a person: analyzed the brief and priced the route.", { actor: "automatic" });
  const stored = await latestAnalysis(jobId);
  const workflow = await getWorkflow(jobId);
  if (!stored || !workflow) {
    await audit(jobId, "escalation", "Waiting on a person: analysis did not produce a route.", { actor: "waiting" });
    return "Waiting on a person: analysis did not produce a route.";
  }
  const gate = autoAdvanceDecision({
    settings,
    decision: stored.decision.decision,
    analysis: stored.analysis,
    productionMicros: stored.decision.economics.productionMicros,
    generationMicros: stored.decision.economics.generationMicros,
    maxProductionMicros: job.maxProductionMicros,
    priceDataComplete: stored.decision.economics.priceDataComplete,
    negativeMargin: stored.decision.economics.negativeMargin,
    belowTargetMargin: stored.decision.economics.belowTargetMargin,
    overBudget: stored.decision.economics.overBudget,
    hoursUntilDeadline: hoursUntil(job.deadlineAt),
  });
  if (gate.action !== "run") {
    const summary = `Waiting on a person: ${gate.reasons.join(" ")}`;
    await audit(jobId, "escalation", summary, { actor: "waiting" });
    return summary;
  }
  try {
    await approveWorkflow(jobId, "automatic");
  } catch (error) {
    const message = redact(error instanceof Error ? error.message : "Approval blocked.");
    await audit(jobId, "escalation", `Waiting on a person: ${message}`, { actor: "waiting" });
    return message;
  }
  if (!settings.autoAdvanceGenerations) {
    await audit(jobId, "escalation", "Waiting on a person to start generation. The workflow is already approved.", { actor: "waiting" });
    return "Waiting on a person to start generation.";
  }
  try {
    const stage = await resumeProduction(jobId);
    if (stage !== "qa") {
      await audit(jobId, "generation", "Ran without a person: submitted work. The browser will poll until the provider finishes.", { actor: "automatic" });
      return "Generating. Status is polled from the job page so the request does not stay open.";
    }
    await audit(jobId, "generation", "Ran without a person: generated the approved steps.", { actor: "automatic" });
    await audit(jobId, "repair", "Ran without a person: QA, and repair if it stayed inside the caps.", { actor: "automatic" });
    await audit(jobId, "message_draft", "Ran without a person: drafted the delivery package. It has not been sent.", { actor: "automatic" });
  } catch (error) {
    const message = redact(error instanceof Error ? error.message : "Automatic production stopped.");
    await audit(jobId, "escalation", `Waiting on a person: ${message}`, { actor: "waiting" });
    return message;
  }
  if ((await getAutonomy()).finalDeliveryRequiresApproval) {
    await audit(jobId, "escalation", "Waiting on a person: approve delivery. Final delivery has not been sent.", { actor: "waiting" });
    return "Waiting on a person: approve delivery.";
  }
  const channel = /upwork|fiverr|contra/i.test(job.source) ? "marketplace" : "direct";
  if (channel === "marketplace") {
    await audit(jobId, "escalation", "Waiting on a person: marketplace delivery is never sent by the agent.", { actor: "waiting" });
    return "Waiting on a person: marketplace delivery is never sent.";
  }
  await approveDelivery(jobId);
  return "Delivered on a direct channel because final-delivery approval is off.";
}

export async function rejectJob(jobId: string) {
  await ensureReady();
  await updateJob(jobId, { status: "rejected" });
  await audit(jobId, "approval", "Human rejected the job.", {});
}

export async function overrideStep(jobId: string, stepId: string, modelId: string) {
  await ensureReady();
  const workflow = await getWorkflow(jobId);
  if (!workflow) throw new Error("No workflow yet.");
  const steps = replaceStepModel(workflow.steps, stepId, modelId);
  await saveWorkflow({ ...workflow, steps, status: "draft", approvedMaxMicros: null, updatedAt: now() });
  await updateJob(jobId, { status: "needs_review" });
  await audit(jobId, "cost_change", `Model override on ${stepId} to ${modelId}. Approval is required again.`, {});
}

export async function updateCommercials(
  jobId: string,
  patch: Partial<Pick<JobRecord, "clientPriceMicros" | "sourceFeeBps" | "contingencyBps" | "targetMarginBps" | "maxProductionMicros">>,
) {
  await ensureReady();
  const job = await updateJob(jobId, patch);
  const workflow = await getWorkflow(jobId);
  if (workflow?.status === "approved") {
    const analysis = await latestAnalysis(jobId);
    if (analysis) {
      const decision = decideJob({
        analysis: analysis.analysis,
        steps: workflow.steps,
        clientPriceMicros: job.clientPriceMicros,
        sourceFeeBps: job.sourceFeeBps,
        contingencyBps: job.contingencyBps,
        targetMarginBps: job.targetMarginBps,
        maxProductionMicros: job.maxProductionMicros,
        deadlineAt: job.deadlineAt,
      });
      if (decision.decision !== "accept") {
        await saveWorkflow({ ...workflow, status: "draft", updatedAt: now() });
        await updateJob(jobId, { status: "needs_review" });
        await audit(jobId, "escalation", "Commercial change paused an approved job for another look.", { decision: decision.decision });
      }
    }
  }
  await audit(jobId, "cost_change", "Client price, fee, contingency, or production ceiling changed.", patch);
}

function mockAssetFor(step: RouteStep, job: JobRecord): { url: string; kind: "image" | "video" } {
  const rain = job.id === "job_rain" || /glass monument|after the rain/i.test(job.title);
  const table: Record<string, string> = rain
    ? {
        concepts: "/demo/rain-concept.svg",
        keyframes: "/demo/rain-keyframe-1.svg",
        "film-169": "/demo/rain-film-169.svg",
        "film-916": "/demo/rain-film-916.svg",
        repair: "/demo/rain-repair.svg",
        "grade-stills": "/demo/rain-grade.svg",
      }
    : {
        "orbit-studies": "/demo/orchard-study.svg",
        "palette-lock": "/demo/orchard-still.svg",
        orbit: "/demo/orchard-orbit.svg",
        "orbit-repair": "/demo/orchard-orbit.svg",
      };
  const url = table[step.id] ?? (step.unit === "second" ? "/demo/generic-film.svg" : "/demo/generic-still.svg");
  return { url, kind: step.unit === "second" ? "video" : "image" };
}

function buildProviderInput(step: RouteStep, referenceUrl: string | null): Record<string, unknown> {
  const model = getModel(step.modelId);
  const input: Record<string, unknown> = { ...(model?.defaultInput ?? {}), prompt: `${step.purpose} ${step.inputs}` };
  for (const [key, value] of Object.entries(step.settings)) {
    if (key === "qaScript") continue;
    input[key] = value;
  }
  if (referenceUrl && "image_url" in input) input.image_url = referenceUrl;
  if (referenceUrl && "image_urls" in input) input.image_urls = [referenceUrl];
  if (referenceUrl && "video_url" in input) input.video_url = referenceUrl;
  if (referenceUrl && "video_urls" in input) input.video_urls = [referenceUrl];
  return input;
}

function settled(status: string): boolean {
  return status === "completed" || status === "failed" || status === "nsfw" || status === "canceled" || status === "timed_out";
}

export async function runApprovedSteps(jobId: string): Promise<boolean> {
  await ensureReady();
  const job = await mustJob(jobId);
  const workflow = await getWorkflow(jobId);
  if (!workflow || workflow.status !== "approved") throw new Error("Approve the workflow before generating.");
  if (job.status !== "generating" && job.status !== "qa") await updateJob(jobId, { status: "generating" });
  let reference: string | null = null;
  for (const step of workflow.steps.filter((item) => !item.conditional)) {
    const prior = (await listGenerations(job.id)).filter((item) => item.stepId === step.id).at(-1);
    if (prior && !settled(prior.appStatus)) {
      const refreshed = await refreshGeneration(prior.id);
      if (!settled(refreshed.appStatus)) return false;
      const asset = refreshed.output?.assets[0];
      if (asset) reference = asset.sourceUrl;
      continue;
    }
    if (prior?.appStatus === "completed") {
      const asset = prior.output?.assets[0];
      if (asset) reference = asset.sourceUrl;
      continue;
    }
    const generation = await runStep(job, step, reference, null);
    const asset = generation.output?.assets[0];
    if (asset) reference = asset.sourceUrl;
    if (!settled(generation.appStatus)) return false;
  }
  await updateJob(jobId, { status: "qa" });
  const already = (await listMessages(job.id)).some((item) => item.kind === "progress" && item.subject === "Production pass is in QA");
  if (!already) {
    await recordMessage(job, {
      kind: "progress",
      subject: "Production pass is in QA",
      body: `The approved steps for ${job.title} have a first pass. Nothing has been delivered.`,
      audience: "client",
    });
  }
  return true;
}

export async function resumeProduction(jobId: string): Promise<string> {
  const finished = await runApprovedSteps(jobId);
  if (!finished) return "generating";
  if ((await listQa(jobId)).length === 0) await runQa(jobId);
  if (!(await listMessages(jobId)).some((item) => item.kind === "delivery")) await draftDelivery(jobId);
  return "qa";
}

async function runStep(job: JobRecord, step: RouteStep, reference: string | null, retryOf: string | null) {
  const settings = await getAutonomy();
  const family = getModel(step.modelId)?.family ?? "";
  if (!settings.allowedModelFamilies.includes(family)) {
    throw new Error(`${step.modelName} is outside the allowed model families.`);
  }
  if (step.attempts > settings.maxAttemptsPerStep) {
    throw new Error("This step exceeds the attempt cap in Autonomy Settings.");
  }
  const passMicros = step.unitCostMicros == null ? null : step.unitCostMicros * step.quantity;
  const spent = await jobSpendMicros(job.id);
  if (passMicros != null && spent + passMicros > settings.maxAutomaticSpendPerJobMicros && job.recordingGate) {
    throw new Error("This step would cross the automatic per-job spend cap.");
  }
  if (passMicros != null && await workflowCeiling(job, passMicros)) {
    throw new Error("This step would cross the approved production ceiling.");
  }
  const mode = generationMode();
  const created = now();
  const id = uid("gen");
  const preview = mockAssetFor(step, job);
  const input = buildProviderInput(step, reference);
  const row: GenerationRecord = {
    id,
    jobId: job.id,
    stepId: step.id,
    modelId: step.modelId,
    provider: mode === "live" ? "higgsfield" : "mock",
    requestId: null,
    statusUrl: null,
    cancelUrl: null,
    providerStatus: null,
    appStatus: "submitting",
    estimateMicros: passMicros,
    actualMicros: null,
    input: { ...input, settings: step.settings, mockAsset: preview.url },
    output: null,
    error: null,
    retryOf,
    createdAt: created,
    updatedAt: created,
  };
  await insertGeneration(row);

  if (mode === "mock") {
    const estimate = mockEstimate(step.modelId, step.quantity);
    const submitted = mockSubmit(id);
    row.requestId = submitted.requestId;
    row.statusUrl = submitted.statusUrl;
    row.cancelUrl = submitted.cancelUrl;
    row.providerStatus = "completed";
    row.appStatus = "completed";
    row.estimateMicros = estimate.usdMicros ?? passMicros;
    row.actualMicros = row.estimateMicros;
    row.output = {
      assets: [
        {
          kind: preview.kind,
          sourceUrl: preview.url,
          contentType: "image/svg+xml",
          localPath: null,
          fileName: preview.url.split("/").pop() ?? "asset.svg",
        },
      ],
      rawNote: "Mock mode completed locally. No provider request was sent.",
    };
    row.output.assets = await persistAssets(job.id, id, row.output.assets);
    await updateGeneration(row);
    if (row.actualMicros) {
      await insertLedger({ id: uid("led"), jobId: job.id, generationId: id, label: `${step.modelName} completed`, amountMicros: row.actualMicros, createdAt: now() });
    }
    await audit(job.id, "generation", `${step.modelName} completed in mock mode.`, { stepId: step.id, actualMicros: row.actualMicros });
    return row;
  }

  if (reference && reference.startsWith("/") && (input.image_url || input.video_url || input.image_urls || input.video_urls)) {
    row.appStatus = "failed";
    row.providerStatus = "failed";
    row.actualMicros = 0;
    row.error = "Live image or video inputs need a public HTTPS URL. This reference is still on local storage.";
    await updateGeneration(row);
    await audit(job.id, "escalation", row.error, { stepId: step.id });
    return row;
  }
  try {
    const estimate = await estimateRequest(step.modelId, input);
    row.estimateMicros = estimate.usdMicros ?? row.estimateMicros;
    if (row.estimateMicros == null) {
      row.appStatus = "failed";
      row.providerStatus = "failed";
      row.actualMicros = 0;
      row.error = "The estimate endpoint did not return a USD amount. The step was not submitted.";
      await updateGeneration(row);
      return row;
    }
    const submitted = await submitRequest(step.modelId, input);
    row.requestId = submitted.requestId;
    row.statusUrl = submitted.statusUrl;
    row.cancelUrl = submitted.cancelUrl;
    row.providerStatus = submitted.status;
    row.appStatus = submitted.status;
    await updateGeneration(row);
    await audit(job.id, "generation", `Submitted ${step.modelName}.`, { requestId: submitted.requestId });
    return await refreshGeneration(row.id);
  } catch (error) {
    row.appStatus = "failed";
    row.providerStatus = "failed";
    row.actualMicros = 0;
    row.error = redact(error instanceof Error ? error.message : "Generation failed.");
    await updateGeneration(row);
    return row;
  }
}

async function workflowCeiling(job: JobRecord, additional: number) {
  return await jobSpendMicros(job.id) + additional > job.maxProductionMicros;
}

export async function refreshGeneration(id: string) {
  await ensureReady();
  const row = await getGeneration(id);
  if (!row) throw new Error("Generation not found.");
  if (row.provider === "mock") return row;
  if (!row.statusUrl || !row.providerStatus || isTerminal(row.providerStatus)) return row;
  const timeout = Number(process.env.POLL_TIMEOUT_MS || 180_000);
  if (Date.now() - new Date(row.createdAt).getTime() > timeout) {
    row.appStatus = "timed_out";
    row.error = "Application poll timeout. The provider status was left unchanged.";
    await updateGeneration(row);
    await audit(row.jobId, "generation", "Polling timed out inside Agency Operator. This is not a provider failure.", { providerStatus: row.providerStatus });
    return row;
  }
  const status = await fetchStatus(row.statusUrl);
  row.providerStatus = status.providerStatus;
  row.appStatus = status.providerStatus;
  row.error = status.error;
  if (status.providerStatus === "completed") {
    const assets = await persistAssets(row.jobId, row.id, status.assets);
    row.output = { assets };
    const actual = status.actualUsdMicros ?? row.estimateMicros ?? 0;
    row.actualMicros = actual;
    if (actual > 0) {
      await insertLedger({ id: uid("led"), jobId: row.jobId, generationId: row.id, label: "Provider completed", amountMicros: actual, createdAt: now() });
    }
  } else if (isTerminal(status.providerStatus)) {
    row.actualMicros = 0;
    await audit(row.jobId, "cost_change", `${status.providerStatus} generation was not billed.`, { generationId: row.id });
  }
  await updateGeneration(row);
  return row;
}

export async function cancelGeneration(id: string) {
  await ensureReady();
  const row = await getGeneration(id);
  if (!row) throw new Error("Generation not found.");
  if (row.providerStatus !== "queued") return "Cancellation is only available while the provider status is queued.";
  if (row.provider === "mock") {
    row.providerStatus = "canceled";
    row.appStatus = "canceled";
    row.actualMicros = 0;
    await updateGeneration(row);
    await audit(row.jobId, "generation", "Mock generation canceled before it ran. Not billed.", {});
    return "Canceled.";
  }
  if (!row.cancelUrl) return "This request has no cancel URL.";
  const result = await cancelRequest(row.cancelUrl);
  if (result.ok) {
    row.providerStatus = "canceled";
    row.appStatus = "canceled";
    row.actualMicros = 0;
    await updateGeneration(row);
    await audit(row.jobId, "generation", "Queued provider request canceled.", {});
  }
  return result.reason;
}

export async function retryGeneration(id: string) {
  await ensureReady();
  const prior = await getGeneration(id);
  if (!prior) throw new Error("Generation not found.");
  const job = await mustJob(prior.jobId);
  const workflow = await getWorkflow(job.id);
  const step = workflow?.steps.find((item) => item.id === prior.stepId);
  if (!step) throw new Error("The original step is gone.");
  await runStep(job, step, null, prior.id);
  await audit(job.id, "generation", "Retry created a new generation and left the failed attempt in place.", { retryOf: prior.id });
}

export async function runQa(jobId: string) {
  await ensureReady();
  const job = await mustJob(jobId);
  const analysis = await latestAnalysis(jobId);
  const workflow = await getWorkflow(jobId);
  if (!analysis || !workflow) throw new Error("QA needs an analysis and a workflow.");
  await updateJob(jobId, { status: "qa" });
  for (const generation of await listGenerations(jobId)) {
    if (generation.appStatus !== "completed" && generation.appStatus !== "failed") continue;
    if ((await listQa(jobId)).some((report) => report.generationId === generation.id)) continue;
    const step = workflow.steps.find((item) => item.id === generation.stepId);
    const report = evaluateGeneration({ analysis: analysis.analysis, step, generation });
    await insertQa({ id: uid("qa"), jobId, createdAt: now(), ...report });
    if (report.verdict === "needs_controlled_edit") {
      await maybeRepair(job, workflow.steps, report.failedComponent ?? "continuity");
    }
  }
  await audit(jobId, "repair", "QA compared outputs with the approved brief.", {});
}

async function maybeRepair(job: JobRecord, steps: RouteStep[], failedComponent: string) {
  if (!(await getAutonomy()).autoRepair) {
    await recordMessage(job, {
      kind: "escalation",
      subject: "Repair is waiting",
      body: `${failedComponent} failed. Auto-repair is off, so a person chooses the next edit.`,
      audience: "human",
    });
    await audit(job.id, "escalation", "Waiting on a person: auto-repair is off.", { actor: "waiting" });
    return;
  }
  const repair = steps.find((step) => step.conditional && step.role === "finish");
  if (!repair) {
    await recordMessage(job, {
      kind: "escalation",
      subject: "QA needs a person",
      body: `${failedComponent} failed and the route has no priced repair step.`,
      audience: "human",
    });
    return;
  }
  const incremental = stepCostMicros({ ...repair, attempts: 1 });
  const family = getModel(repair.modelId)?.family ?? "";
  const gate = repairAllowed({
    incrementalMicros: incremental,
    jobSpendMicros: await jobSpendMicros(job.id),
    attempts: 1,
    family,
    settings: await getAutonomy(),
    introducesRightsIssue: false,
  });
  await audit(job.id, "repair", gate.ok ? `Auto repair: ${failedComponent}.` : `Repair escalated: ${gate.reason}`, {
    incrementalMicros: incremental,
  });
  if (!gate.ok) {
    await recordMessage(job, {
      kind: "escalation",
      subject: "Repair needs approval",
      body: `${failedComponent}. ${gate.reason}`,
      audience: "human",
    });
    return;
  }
  const generation = await runStep(job, { ...repair, attempts: 1, settings: { ...repair.settings, qaScript: "" } }, null, null);
  await insertLedger({
    id: uid("lednote"),
    jobId: job.id,
    generationId: generation.id,
    label: `Repair note: ${failedComponent}`,
    amountMicros: 0,
    createdAt: now(),
  });
  await recordMessage(job, {
    kind: "progress",
    subject: "One shot was repaired",
    body: `The smallest failed piece was ${failedComponent}. A targeted edit ran inside the repair cap. The rest of the film was left alone.`,
    audience: "client",
  });
}

export async function addRevision(jobId: string, note: string) {
  await ensureReady();
  const job = await mustJob(jobId);
  const template = getTemplate(job.templateId);
  const used = (await listRevisions(jobId)).filter((row) => row.classification === "included" && row.approval !== "rejected").length;
  const remaining = (template?.includedRevisions ?? 2) - used;
  const classified = classify(note, remaining);
  const workflow = await getWorkflow(jobId);
  const repair = workflow?.steps.find((step) => step.id === "repair" || step.conditional);
  const incremental = repair ? stepCostMicros({ ...repair, attempts: 1 }) : null;
  const row: RevisionRecord = {
    id: uid("rev"),
    jobId,
    clientNote: note,
    affectedDeliverable: classified.affected,
    affectedStepId: repair?.id ?? "repair",
    classification: classified.classification,
    recommendedAction: classified.action,
    expectedIncrementalMicros: classified.classification === "included" ? incremental : (incremental ?? 0) * 2,
    approval: "pending",
    appliedGenerationId: null,
    createdAt: now(),
  };
  await insertRevision(row);
  await recordMessage(job, {
    kind: classified.classification === "scope_change" ? "change_order" : "revision",
    subject: classified.classification === "scope_change" ? "Change order" : "Revision read",
    body:
      classified.classification === "scope_change"
        ? `This asks for something outside the package: “${note}”. It is a change order, not an included revision. No generation will run until you price it.`
        : `“${note}” maps to ${classified.affected}. It is an included revision. Expected incremental generation cost is on the revision row.`,
    audience: "human",
  });
  await audit(jobId, classified.classification === "scope_change" ? "escalation" : "revision", row.recommendedAction, {
    incrementalMicros: row.expectedIncrementalMicros,
    actor: classified.classification === "scope_change" ? "waiting" : "automatic",
  });
  return row;
}

export async function maybeAutoApplyRevision(revisionId: string) {
  await ensureReady();
  const settings = await getAutonomy();
  const revision = (await Promise.all((await listJobs()).map((job) => listRevisions(job.id)))).flat().find((item) => item.id === revisionId);
  if (!revision || revision.classification !== "included") return;
  const job = await mustJob(revision.jobId);
  if (job.recordingGate || !settings.fullyAutomaticWithinLimits || !settings.autoRepair) return;
  const workflow = await getWorkflow(job.id);
  const step = workflow?.steps.find((item) => item.id === revision.affectedStepId) ?? workflow?.steps.find((item) => item.conditional);
  const family = getModel(step?.modelId ?? "")?.family ?? "";
  const gate = repairAllowed({
    incrementalMicros: revision.expectedIncrementalMicros,
    jobSpendMicros: await jobSpendMicros(job.id),
    attempts: 1,
    family,
    settings,
    introducesRightsIssue: false,
  });
  if (!gate.ok) {
    await audit(job.id, "escalation", `Waiting on a person: ${gate.reason}`, { actor: "waiting" });
    return;
  }
  await applyRevision(revisionId);
  await audit(job.id, "repair", "Ran without a person: applied an included revision inside the spend cap.", { actor: "automatic" });
}

function classify(note: string, remaining: number): { classification: "included" | "scope_change"; affected: string; action: string } {
  const text = note.toLowerCase();
  const warmer = /warm|hope|grade|color|reveal|darker|slower|faster/.test(text);
  const bigger = /another|additional|extra|30-second|30 second|new language|translate|second film|also deliver|add a /.test(text);
  if (bigger && !warmer) {
    return {
      classification: "scope_change",
      affected: "New scope",
      action: "Draft a change order. Do not generate.",
    };
  }
  if (remaining <= 0) {
    return { classification: "scope_change", affected: "Revision rounds are used up", action: "Included rounds are exhausted. This is a change order." };
  }
  return {
    classification: "included",
    affected: "Final reveal",
    action: "Apply one targeted grade on the reveal.",
  };
}

export async function applyRevision(revisionId: string) {
  await ensureReady();
  const all = (await Promise.all((await listJobs()).map((job) => listRevisions(job.id)))).flat();
  const revision = all.find((item) => item.id === revisionId);
  if (!revision) throw new Error("Revision not found.");
  if (revision.classification !== "included") throw new Error("Scope changes stay blocked until a person writes a new price.");
  if (revision.approval === "approved") return;
  const job = await mustJob(revision.jobId);
  const workflow = await getWorkflow(job.id);
  const step = workflow?.steps.find((item) => item.id === revision.affectedStepId) ?? workflow?.steps.find((item) => item.conditional);
  if (!step) throw new Error("No step to apply this revision to.");
  const family = getModel(step.modelId)?.family ?? "";
  const gate = repairAllowed({
    incrementalMicros: revision.expectedIncrementalMicros,
    jobSpendMicros: await jobSpendMicros(job.id),
    attempts: 1,
    family,
    settings: await getAutonomy(),
    introducesRightsIssue: false,
  });
  if (!gate.ok) {
    await audit(job.id, "escalation", gate.reason, {});
    throw new Error(gate.reason);
  }
  const generation = await runStep(job, { ...step, attempts: 1, purpose: revision.clientNote, settings: { ...step.settings, qaScript: "" } }, null, null);
  revision.approval = "approved";
  revision.appliedGenerationId = generation.id;
  await updateRevision(revision);
  await audit(job.id, "approval", "Included revision applied inside the spend cap.", { revisionId });
}

export async function resetDemo(jobId: string) {
  await ensureReady();
  if (jobId !== "job_rain" && jobId !== "job_orchard") throw new Error("Only the two seeded demos can be reset.");
  const job = await mustJob(jobId);
  await clearJobWork(jobId);
  await updateJob(jobId, {
    status: "new",
    recordingGate: "analysis",
    rawBrief: jobId === "job_rain" ? RAIN_BRIEF : ORCHARD_BRIEF,
    clientNotes: "Recording reset. Paused before analysis.",
  });
  await audit(jobId, "intake", "Recording reset to the seeded brief. Paused before analysis.", {});
  void job;
}

export async function advanceRecording(jobId: string) {
  await ensureReady();
  const job = await mustJob(jobId);
  if (!job.recordingGate) throw new Error("Reset the demo to arm recording mode.");
  if (job.recordingGate === "analysis") {
    await analyzeJob(jobId);
    await updateJob(jobId, { recordingGate: "approval" });
    return "Paused before approval.";
  }
  if (job.recordingGate === "approval") {
    const analysis = await latestAnalysis(jobId);
    if (analysis?.analysis.missingAssets.length) {
      const edited: BriefAnalysis = {
        ...analysis.analysis,
        missingAssets: [],
        assumptions: [...analysis.analysis.assumptions, "Recording approval assumes the open question is answered for this pass."],
      };
      const current = await getJob(jobId);
      if (!current) throw new Error("Job not found.");
      await persistRoute(current, edited, "human");
    }
    await approveWorkflow(jobId);
    await updateJob(jobId, { recordingGate: "generation" });
    return "Paused before generation.";
  }
  if (job.recordingGate === "generation") {
    await runApprovedSteps(jobId);
    await updateJob(jobId, { recordingGate: "qa", status: "qa" });
    return "Paused before QA.";
  }
  if (job.recordingGate === "qa") {
    await runQa(jobId);
    if (jobId === "job_rain") {
      await addRevision(jobId, "Make the final reveal warmer and more hopeful.");
    }
    await updateJob(jobId, { recordingGate: "delivery", status: "qa" });
    return "Paused before delivery. The warmer reveal is waiting as an included revision.";
  }
  await draftDelivery(jobId);
  return "Delivery package drafted. Final delivery still requires explicit approval.";
}

export async function draftDelivery(jobId: string) {
  await ensureReady();
  const job = await mustJob(jobId);
  const decision = dispatchDecision({ kind: "delivery", channel: "first_party_portal", settings: await getAutonomy() });
  await insertMessage({
    id: uid("msg"),
    jobId,
    kind: "delivery",
    channel: job.source.toLowerCase().includes("upwork") || job.source.toLowerCase().includes("fiverr") ? "marketplace" : "first_party_portal",
    audience: "client",
    status: "draft",
    subject: `${job.title} — delivery note`,
    body: deliveryNote(job),
    reason: decision.reason,
    createdAt: now(),
  });
  await insertMessage({
    id: uid("msg"),
    jobId,
    kind: "feedback",
    channel: "first_party_portal",
    audience: "client",
    status: "draft",
    subject: "After this film",
    body: `If the cut is the one you wanted, tell me what to keep for the next piece. I can draft a recurring package, but I will not start it from this delivery.`,
    reason: "Feedback requests stay drafted unless Autonomy Settings allows them.",
    createdAt: now(),
  });
  await audit(jobId, "message_draft", "Delivery note and feedback request drafted. Not sent.", {});
}

export async function approveDelivery(jobId: string) {
  await ensureReady();
  const job = await mustJob(jobId);
  if (job.status === "rejected") throw new Error("Rejected jobs cannot be delivered.");
  await updateJob(jobId, { status: "delivered", recordingGate: null });
  await audit(jobId, "approval", "Human approved final delivery.", {});
}

export async function agentAttemptDelivery(jobId: string): Promise<{ status: "blocked"; reason: string }> {
  await ensureReady();
  const job = await mustJob(jobId);
  const result = dispatchDecision({ kind: "delivery", channel: "first_party_portal", settings: await getAutonomy() });
  await recordMessage(job, {
    kind: "escalation",
    subject: "Delivery was not sent",
    body: result.reason,
    audience: "human",
  });
  await audit(jobId, "escalation", result.reason, {});
  return { status: "blocked", reason: result.reason };
}

export async function saveSettings(settings: AutonomySettings) {
  await ensureReady();
  await saveAutonomy(settings);
  await audit(null, "approval", "Autonomy Settings saved.", {});
}

export async function readSettings() {
  await ensureReady();
  return await getAutonomy();
}

export async function connectionEstimate() {
  await ensureReady();
  const test = connectionTestInput();
  if (generationMode() === "mock") {
    const estimate = mockEstimate(test.endpoint, 1);
    await audit(null, "generation", "Connection test estimate in mock mode. Nothing was submitted.", {});
    return { usdMicros: estimate.usdMicros, note: test.note, mode: "mock" };
  }
  const estimate = await estimateRequest(test.endpoint, test.input);
  await audit(null, "generation", "Live estimate for the Soul 2 connection test. No generation was submitted.", {});
  return { usdMicros: estimate.usdMicros, note: test.note, mode: "live" };
}

export async function connectionSubmit() {
  await ensureReady();
  const test = connectionTestInput();
  if (generationMode() === "mock") {
    const submitted = mockSubmit("connection");
    await audit(null, "generation", "Mock connection test completed locally.", {});
    return { requestId: submitted.requestId, status: "completed" };
  }
  await estimateRequest(test.endpoint, test.input);
  const submitted = await submitRequest(test.endpoint, test.input);
  await audit(null, "generation", "Connection test submitted after estimate.", { requestId: submitted.requestId });
  return { requestId: submitted.requestId, status: submitted.status };
}

export async function globalAudit() {
  await ensureReady();
  return await listAudit();
}

export async function updateClientMemory(clientId: string, memory: ClientMemory, name: string) {
  await ensureReady();
  const existing = await getClient(clientId);
  if (!existing) throw new Error("Client not found.");
  await upsertClient({ ...existing, name, memory });
  await audit(null, "approval", `Client memory updated for ${name}. Likeness consent was not inferred from older work.`, {});
}

export async function applyWebhook(body: unknown) {
  if (!body || typeof body !== "object") return { ok: false, reason: "Invalid envelope." };
  const envelope = body as { request_id?: string; status?: string; error?: string | null; payload?: { images?: { url: string }[]; video?: { url: string } } | null };
  if (!envelope.request_id || !envelope.status) return { ok: false, reason: "Invalid envelope." };
  const row = await findGenerationByRequest(envelope.request_id);
  if (!row) return { ok: true, reason: "Unknown request ignored." };
  if (row.providerStatus === envelope.status && isTerminal(row.providerStatus)) return { ok: true, reason: "Duplicate ignored." };
  if (row.statusUrl) await refreshGeneration(row.id);
  return { ok: true, reason: "Recorded." };
}

async function recordMessage(
  job: JobRecord,
  input: { kind: MessageRecord["kind"]; subject: string; body: string; audience: MessageRecord["audience"] },
) {
  const channel: MessageRecord["channel"] = /upwork|fiverr|contra/i.test(job.source)
    ? "marketplace"
    : /email/i.test(job.source)
      ? "direct_email"
      : "first_party_portal";
  const decision = dispatchDecision({ kind: input.kind, channel, settings: await getAutonomy() });
  await insertMessage({
    id: uid("msg"),
    jobId: job.id,
    kind: input.kind,
    channel,
    audience: input.audience,
    status: decision.status === "blocked" ? "draft" : decision.status,
    subject: input.subject,
    body: input.body,
    reason: decision.reason,
    createdAt: now(),
  });
  await audit(job.id, "message_draft", `${input.kind} ${decision.status}. ${decision.reason}`, {});
}

function proposalBody(job: JobRecord, analysis: BriefAnalysis): string {
  const template = getTemplate(job.templateId);
  const deliverables = analysis.deliverables.map((item) => `${item.name} (${item.aspectRatio}${item.durationSeconds ? `, ${item.durationSeconds}s` : ""})`).join("; ");
  return [
    `Scope: ${analysis.conciseSummary}`,
    `Deliverables: ${deliverables || "To be confirmed."}`,
    `Timeline: ${template?.timeline ?? "As dated on the job."}`,
    `Price: fixed package on the job record.`,
    `Included revisions: ${template?.includedRevisions ?? 2}.`,
    `Not included: marketplace delivery, licensed music, likeness or voice, and any cut that is not listed above.`,
    analysis.questionsForClient[0] ? `Open question: ${analysis.questionsForClient[0]}` : "No open question.",
  ].join("\n");
}

function deliveryNote(job: JobRecord): string {
  return [
    `${job.title} is ready for your review.`,
    "Files: the masters and stills listed on the deliverables screen. Download them from this workspace. Provider links are copied into Agency Operator storage because they expire.",
    "Usage: you can use the files for the campaign described in the brief. This package does not include a new person's likeness, a voice clone, or music you did not already own.",
    "A reflection repair, if present, replaced one shot. It did not open a new round of scope.",
    "Tell me if the last frame should go warmer. That note is an included revision when a round remains.",
  ].join("\n\n");
}

async function mustJob(id: string) {
  const job = await getJob(id);
  if (!job) throw new Error("Job not found.");
  return job;
}

export async function spendSnapshot(jobId: string): Promise<{ spent: number; cap: number; repairCap: number }> {
  await ensureReady();
  const settings = await getAutonomy();
  return {
    spent: await jobSpendMicros(jobId),
    cap: settings.maxAutomaticSpendPerJobMicros,
    repairCap: settings.maxAutomaticSpendPerRepairMicros,
  };
}
