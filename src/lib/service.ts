import { dispatchDecision, repairAllowed } from "./autonomy";
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

export function ensureReady(): void {
  if (countJobs() === 0) seedDatabase();
}

function audit(jobId: string | null, kind: string, summary: string, payload: Record<string, unknown> = {}): void {
  insertAudit({ id: uid("audit"), jobId, kind, summary, payload, createdAt: now() });
}

function latestAnalysis(jobId: string): StoredAnalysis | null {
  const rows = listAnalyses(jobId);
  return rows.filter((row) => row.kind === "human").at(-1) ?? rows.filter((row) => row.kind === "model").at(-1) ?? null;
}

function economicsFor(job: JobRecord, steps: RouteStep[]) {
  const analysis = latestAnalysis(job.id);
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

export function getBundle(id: string): JobBundle | null {
  ensureReady();
  const job = getJob(id);
  if (!job) return null;
  const client = getClient(job.clientId);
  if (!client) return null;
  const workflow = getWorkflow(id);
  return {
    job,
    client,
    analyses: listAnalyses(id),
    workflow,
    generations: listGenerations(id),
    qaReports: listQa(id),
    revisions: listRevisions(id),
    messages: listMessages(id),
    audit: listAudit(id),
    ledger: listLedger(id),
    economics: workflow ? economicsFor(job, workflow.steps) : null,
    mode: { analysis: analysisMode(), generation: generationMode() },
  };
}

export function dashboardJobs(): JobRecord[] {
  ensureReady();
  return listJobs();
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

export function createJob(input: {
  title: string;
  source: string;
  rawBrief: string;
  clientName: string;
  channel: "marketplace" | "direct_email" | "first_party_portal";
  clientPriceMicros: number;
  deadlineAt: string;
  templateId: string | null;
}): JobRecord {
  ensureReady();
  const created = now();
  const clientId = uid("client");
  upsertClient({ id: clientId, name: input.clientName || "Unnamed client", channel: input.channel, memory: blankMemory() });
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
  insertJob(job);
  audit(job.id, "intake", "Brief pasted into Agency Operator. No marketplace was contacted.", { source: job.source });
  return job;
}

function persistRoute(job: JobRecord, analysis: BriefAnalysis, kind: StoredAnalysis["kind"]): StoredAnalysis {
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
  insertAnalysis(stored);
  const existing = getWorkflow(job.id);
  saveWorkflow({
    id: existing?.id ?? uid("wf"),
    jobId: job.id,
    status: "draft",
    steps,
    approvedMaxMicros: null,
    createdAt: existing?.createdAt ?? now(),
    updatedAt: now(),
  });
  const status = decision.decision === "reject" ? "rejected" : "needs_review";
  updateJob(job.id, { status, recordingGate: job.recordingGate });
  audit(job.id, "model_decision", `Deterministic decision: ${decision.decision}.`, {
    reasons: decision.reasons,
    advisory: analysis.decision,
  });
  return stored;
}

export async function analyzeJob(jobId: string): Promise<void> {
  ensureReady();
  const job = mustJob(jobId);
  let analysis: BriefAnalysis;
  if (analysisMode() === "live") {
    analysis = await analyzeWithOpenAI({ title: job.title, brief: job.rawBrief, source: job.source });
    audit(job.id, "model_decision", `OpenAI Responses analysis using ${process.env.OPENAI_MODEL || "gpt-6-astra"}.`, {});
  } else {
    analysis = mockAnalyze(job.title, job.rawBrief);
    audit(job.id, "model_decision", "Mock analysis. No OpenAI key in use.", {});
  }
  persistRoute(job, analysis, "model");
  if (analysis.questionsForClient[0]) {
    recordMessage(job, {
      kind: "intake_question",
      subject: "One question before production",
      body: analysis.questionsForClient[0],
      audience: "client",
    });
  }
  recordMessage(job, {
    kind: "proposal",
    subject: `Proposal — ${job.title}`,
    body: proposalBody(job, analysis),
    audience: "client",
  });
}

export function saveHumanAnalysis(jobId: string, raw: unknown): { ok: true } | { ok: false; error: string } {
  ensureReady();
  const parsed = parseAnalysis(raw);
  if (!parsed.ok) return parsed;
  const job = mustJob(jobId);
  persistRoute(job, parsed.analysis, "human");
  audit(job.id, "approval", "Human edited the analysis. The original model version is kept.", {});
  return { ok: true };
}

export function approveWorkflow(jobId: string): void {
  ensureReady();
  const job = mustJob(jobId);
  const workflow = getWorkflow(jobId);
  const analysis = latestAnalysis(jobId);
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
  saveWorkflow({ ...workflow, status: "approved", approvedMaxMicros: job.maxProductionMicros, updatedAt: now() });
  updateJob(jobId, { status: "approved" });
  audit(jobId, "approval", `Human approved the workflow. Ceiling ${job.maxProductionMicros} micro-USD.`, {
    recommendation: decision.decision,
    reasons: decision.reasons,
  });
}

export function rejectJob(jobId: string): void {
  ensureReady();
  updateJob(jobId, { status: "rejected" });
  audit(jobId, "approval", "Human rejected the job.", {});
}

export function overrideStep(jobId: string, stepId: string, modelId: string): void {
  ensureReady();
  const workflow = getWorkflow(jobId);
  if (!workflow) throw new Error("No workflow yet.");
  const steps = replaceStepModel(workflow.steps, stepId, modelId);
  saveWorkflow({ ...workflow, steps, status: "draft", approvedMaxMicros: null, updatedAt: now() });
  updateJob(jobId, { status: "needs_review" });
  audit(jobId, "cost_change", `Model override on ${stepId} to ${modelId}. Approval is required again.`, {});
}

export function updateCommercials(
  jobId: string,
  patch: Partial<Pick<JobRecord, "clientPriceMicros" | "sourceFeeBps" | "contingencyBps" | "targetMarginBps" | "maxProductionMicros">>,
): void {
  ensureReady();
  const job = updateJob(jobId, patch);
  const workflow = getWorkflow(jobId);
  if (workflow?.status === "approved") {
    const analysis = latestAnalysis(jobId);
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
        saveWorkflow({ ...workflow, status: "draft", updatedAt: now() });
        updateJob(jobId, { status: "needs_review" });
        audit(jobId, "escalation", "Commercial change paused an approved job for another look.", { decision: decision.decision });
      }
    }
  }
  audit(jobId, "cost_change", "Client price, fee, contingency, or production ceiling changed.", patch);
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

export async function runApprovedSteps(jobId: string): Promise<void> {
  ensureReady();
  const job = mustJob(jobId);
  const workflow = getWorkflow(jobId);
  if (!workflow || workflow.status !== "approved") throw new Error("Approve the workflow before generating.");
  updateJob(jobId, { status: "generating" });
  let reference: string | null = null;
  for (const step of workflow.steps.filter((item) => !item.conditional)) {
    const generation = await runStep(job, step, reference, null);
    const asset = generation.output?.assets[0];
    if (asset) reference = asset.sourceUrl;
  }
  updateJob(jobId, { status: "qa" });
  recordMessage(job, {
    kind: "progress",
    subject: "Production pass is in QA",
    body: `The approved steps for ${job.title} have a first pass. Nothing has been delivered.`,
    audience: "client",
  });
}

async function runStep(job: JobRecord, step: RouteStep, reference: string | null, retryOf: string | null): Promise<GenerationRecord> {
  const settings = getAutonomy();
  const family = getModel(step.modelId)?.family ?? "";
  if (!settings.allowedModelFamilies.includes(family)) {
    throw new Error(`${step.modelName} is outside the allowed model families.`);
  }
  if (step.attempts > settings.maxAttemptsPerStep) {
    throw new Error("This step exceeds the attempt cap in Autonomy Settings.");
  }
  const passMicros = step.unitCostMicros == null ? null : step.unitCostMicros * step.quantity;
  const spent = jobSpendMicros(job.id);
  if (passMicros != null && spent + passMicros > settings.maxAutomaticSpendPerJobMicros && job.recordingGate) {
    throw new Error("This step would cross the automatic per-job spend cap.");
  }
  if (passMicros != null && workflowCeiling(job, passMicros)) {
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
  insertGeneration(row);

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
    updateGeneration(row);
    if (row.actualMicros) {
      insertLedger({ id: uid("led"), jobId: job.id, generationId: id, label: `${step.modelName} completed`, amountMicros: row.actualMicros, createdAt: now() });
    }
    audit(job.id, "generation", `${step.modelName} completed in mock mode.`, { stepId: step.id, actualMicros: row.actualMicros });
    return row;
  }

  if (reference && reference.startsWith("/") && (input.image_url || input.video_url || input.image_urls || input.video_urls)) {
    row.appStatus = "failed";
    row.providerStatus = "failed";
    row.actualMicros = 0;
    row.error = "Live image or video inputs need a public HTTPS URL. This reference is still on local storage.";
    updateGeneration(row);
    audit(job.id, "escalation", row.error, { stepId: step.id });
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
      updateGeneration(row);
      return row;
    }
    const submitted = await submitRequest(step.modelId, input);
    row.requestId = submitted.requestId;
    row.statusUrl = submitted.statusUrl;
    row.cancelUrl = submitted.cancelUrl;
    row.providerStatus = submitted.status;
    row.appStatus = submitted.status;
    updateGeneration(row);
    audit(job.id, "generation", `Submitted ${step.modelName}.`, { requestId: submitted.requestId });
    return refreshGeneration(row.id);
  } catch (error) {
    row.appStatus = "failed";
    row.providerStatus = "failed";
    row.actualMicros = 0;
    row.error = redact(error instanceof Error ? error.message : "Generation failed.");
    updateGeneration(row);
    return row;
  }
}

function workflowCeiling(job: JobRecord, additional: number): boolean {
  return jobSpendMicros(job.id) + additional > job.maxProductionMicros;
}

export async function refreshGeneration(id: string): Promise<GenerationRecord> {
  ensureReady();
  const row = getGeneration(id);
  if (!row) throw new Error("Generation not found.");
  if (row.provider === "mock") return row;
  if (!row.statusUrl || !row.providerStatus || isTerminal(row.providerStatus)) return row;
  const timeout = Number(process.env.POLL_TIMEOUT_MS || 180_000);
  if (Date.now() - new Date(row.createdAt).getTime() > timeout) {
    row.appStatus = "timed_out";
    row.error = "Application poll timeout. The provider status was left unchanged.";
    updateGeneration(row);
    audit(row.jobId, "generation", "Polling timed out inside Agency Operator. This is not a provider failure.", { providerStatus: row.providerStatus });
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
      insertLedger({ id: uid("led"), jobId: row.jobId, generationId: row.id, label: "Provider completed", amountMicros: actual, createdAt: now() });
    }
  } else if (isTerminal(status.providerStatus)) {
    row.actualMicros = 0;
    audit(row.jobId, "cost_change", `${status.providerStatus} generation was not billed.`, { generationId: row.id });
  }
  updateGeneration(row);
  return row;
}

export async function cancelGeneration(id: string): Promise<string> {
  ensureReady();
  const row = getGeneration(id);
  if (!row) throw new Error("Generation not found.");
  if (row.providerStatus !== "queued") return "Cancellation is only available while the provider status is queued.";
  if (row.provider === "mock") {
    row.providerStatus = "canceled";
    row.appStatus = "canceled";
    row.actualMicros = 0;
    updateGeneration(row);
    audit(row.jobId, "generation", "Mock generation canceled before it ran. Not billed.", {});
    return "Canceled.";
  }
  if (!row.cancelUrl) return "This request has no cancel URL.";
  const result = await cancelRequest(row.cancelUrl);
  if (result.ok) {
    row.providerStatus = "canceled";
    row.appStatus = "canceled";
    row.actualMicros = 0;
    updateGeneration(row);
    audit(row.jobId, "generation", "Queued provider request canceled.", {});
  }
  return result.reason;
}

export async function retryGeneration(id: string): Promise<void> {
  ensureReady();
  const prior = getGeneration(id);
  if (!prior) throw new Error("Generation not found.");
  const job = mustJob(prior.jobId);
  const workflow = getWorkflow(job.id);
  const step = workflow?.steps.find((item) => item.id === prior.stepId);
  if (!step) throw new Error("The original step is gone.");
  await runStep(job, step, null, prior.id);
  audit(job.id, "generation", "Retry created a new generation and left the failed attempt in place.", { retryOf: prior.id });
}

export async function runQa(jobId: string): Promise<void> {
  ensureReady();
  const job = mustJob(jobId);
  const analysis = latestAnalysis(jobId);
  const workflow = getWorkflow(jobId);
  if (!analysis || !workflow) throw new Error("QA needs an analysis and a workflow.");
  updateJob(jobId, { status: "qa" });
  for (const generation of listGenerations(jobId)) {
    if (generation.appStatus !== "completed" && generation.appStatus !== "failed") continue;
    if (listQa(jobId).some((report) => report.generationId === generation.id)) continue;
    const step = workflow.steps.find((item) => item.id === generation.stepId);
    const report = evaluateGeneration({ analysis: analysis.analysis, step, generation });
    insertQa({ id: uid("qa"), jobId, createdAt: now(), ...report });
    if (report.verdict === "needs_controlled_edit") {
      await maybeRepair(job, workflow.steps, report.failedComponent ?? "continuity");
    }
  }
  audit(jobId, "repair", "QA compared outputs with the approved brief.", {});
}

async function maybeRepair(job: JobRecord, steps: RouteStep[], failedComponent: string): Promise<void> {
  const repair = steps.find((step) => step.conditional && step.role === "finish");
  if (!repair) {
    recordMessage(job, {
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
    jobSpendMicros: jobSpendMicros(job.id),
    attempts: 1,
    family,
    settings: getAutonomy(),
    introducesRightsIssue: false,
  });
  audit(job.id, "repair", gate.ok ? `Auto repair: ${failedComponent}.` : `Repair escalated: ${gate.reason}`, {
    incrementalMicros: incremental,
  });
  if (!gate.ok) {
    recordMessage(job, {
      kind: "escalation",
      subject: "Repair needs approval",
      body: `${failedComponent}. ${gate.reason}`,
      audience: "human",
    });
    return;
  }
  const generation = await runStep(job, { ...repair, attempts: 1, settings: { ...repair.settings, qaScript: "" } }, null, null);
  insertLedger({
    id: uid("lednote"),
    jobId: job.id,
    generationId: generation.id,
    label: `Repair note: ${failedComponent}`,
    amountMicros: 0,
    createdAt: now(),
  });
  recordMessage(job, {
    kind: "progress",
    subject: "One shot was repaired",
    body: `The smallest failed piece was ${failedComponent}. A targeted edit ran inside the repair cap. The rest of the film was left alone.`,
    audience: "client",
  });
}

export function addRevision(jobId: string, note: string): RevisionRecord {
  ensureReady();
  const job = mustJob(jobId);
  const template = getTemplate(job.templateId);
  const used = listRevisions(jobId).filter((row) => row.classification === "included" && row.approval !== "rejected").length;
  const remaining = (template?.includedRevisions ?? 2) - used;
  const classified = classify(note, remaining);
  const workflow = getWorkflow(jobId);
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
  insertRevision(row);
  recordMessage(job, {
    kind: classified.classification === "scope_change" ? "change_order" : "revision",
    subject: classified.classification === "scope_change" ? "Change order" : "Revision read",
    body:
      classified.classification === "scope_change"
        ? `This asks for something outside the package: “${note}”. It is a change order, not an included revision. No generation will run until you price it.`
        : `“${note}” maps to ${classified.affected}. It is an included revision. Expected incremental generation cost is on the revision row.`,
    audience: "human",
  });
  audit(jobId, classified.classification === "scope_change" ? "escalation" : "revision", row.recommendedAction, {
    incrementalMicros: row.expectedIncrementalMicros,
  });
  return row;
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

export async function applyRevision(revisionId: string): Promise<void> {
  ensureReady();
  const all = listJobs().flatMap((job) => listRevisions(job.id).map((revision) => revision));
  const revision = all.find((item) => item.id === revisionId);
  if (!revision) throw new Error("Revision not found.");
  if (revision.classification !== "included") throw new Error("Scope changes stay blocked until a person writes a new price.");
  if (revision.approval === "approved") return;
  const job = mustJob(revision.jobId);
  const workflow = getWorkflow(job.id);
  const step = workflow?.steps.find((item) => item.id === revision.affectedStepId) ?? workflow?.steps.find((item) => item.conditional);
  if (!step) throw new Error("No step to apply this revision to.");
  const family = getModel(step.modelId)?.family ?? "";
  const gate = repairAllowed({
    incrementalMicros: revision.expectedIncrementalMicros,
    jobSpendMicros: jobSpendMicros(job.id),
    attempts: 1,
    family,
    settings: getAutonomy(),
    introducesRightsIssue: false,
  });
  if (!gate.ok) {
    audit(job.id, "escalation", gate.reason, {});
    throw new Error(gate.reason);
  }
  const generation = await runStep(job, { ...step, attempts: 1, purpose: revision.clientNote, settings: { ...step.settings, qaScript: "" } }, null, null);
  revision.approval = "approved";
  revision.appliedGenerationId = generation.id;
  updateRevision(revision);
  audit(job.id, "approval", "Included revision applied inside the spend cap.", { revisionId });
}

export function resetDemo(jobId: string): void {
  ensureReady();
  if (jobId !== "job_rain" && jobId !== "job_orchard") throw new Error("Only the two seeded demos can be reset.");
  const job = mustJob(jobId);
  clearJobWork(jobId);
  updateJob(jobId, {
    status: "new",
    recordingGate: "analysis",
    rawBrief: jobId === "job_rain" ? RAIN_BRIEF : ORCHARD_BRIEF,
    clientNotes: "Recording reset. Paused before analysis.",
  });
  audit(jobId, "intake", "Recording reset to the seeded brief. Paused before analysis.", {});
  void job;
}

export async function advanceRecording(jobId: string): Promise<string> {
  ensureReady();
  const job = mustJob(jobId);
  if (!job.recordingGate) throw new Error("Reset the demo to arm recording mode.");
  if (job.recordingGate === "analysis") {
    await analyzeJob(jobId);
    updateJob(jobId, { recordingGate: "approval" });
    return "Paused before approval.";
  }
  if (job.recordingGate === "approval") {
    const analysis = latestAnalysis(jobId);
    if (analysis?.analysis.missingAssets.length) {
      const edited: BriefAnalysis = {
        ...analysis.analysis,
        missingAssets: [],
        assumptions: [...analysis.analysis.assumptions, "Recording approval assumes the open question is answered for this pass."],
      };
      persistRoute(getJob(jobId)!, edited, "human");
    }
    approveWorkflow(jobId);
    updateJob(jobId, { recordingGate: "generation" });
    return "Paused before generation.";
  }
  if (job.recordingGate === "generation") {
    await runApprovedSteps(jobId);
    updateJob(jobId, { recordingGate: "qa", status: "qa" });
    return "Paused before QA.";
  }
  if (job.recordingGate === "qa") {
    await runQa(jobId);
    if (jobId === "job_rain") {
      addRevision(jobId, "Make the final reveal warmer and more hopeful.");
    }
    updateJob(jobId, { recordingGate: "delivery", status: "qa" });
    return "Paused before delivery. The warmer reveal is waiting as an included revision.";
  }
  draftDelivery(jobId);
  return "Delivery package drafted. Final delivery still requires explicit approval.";
}

export function draftDelivery(jobId: string): void {
  ensureReady();
  const job = mustJob(jobId);
  const decision = dispatchDecision({ kind: "delivery", channel: "first_party_portal", settings: getAutonomy() });
  insertMessage({
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
  insertMessage({
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
  audit(jobId, "message_draft", "Delivery note and feedback request drafted. Not sent.", {});
}

export function approveDelivery(jobId: string): void {
  ensureReady();
  const job = mustJob(jobId);
  if (job.status === "rejected") throw new Error("Rejected jobs cannot be delivered.");
  updateJob(jobId, { status: "delivered", recordingGate: null });
  audit(jobId, "approval", "Human approved final delivery.", {});
}

export function agentAttemptDelivery(jobId: string): { status: "blocked"; reason: string } {
  ensureReady();
  const job = mustJob(jobId);
  const result = dispatchDecision({ kind: "delivery", channel: "first_party_portal", settings: getAutonomy() });
  recordMessage(job, {
    kind: "escalation",
    subject: "Delivery was not sent",
    body: result.reason,
    audience: "human",
  });
  audit(jobId, "escalation", result.reason, {});
  return { status: "blocked", reason: result.reason };
}

export function saveSettings(settings: AutonomySettings): void {
  ensureReady();
  saveAutonomy(settings);
  audit(null, "approval", "Autonomy Settings saved.", {});
}

export function readSettings(): AutonomySettings {
  ensureReady();
  return getAutonomy();
}

export async function connectionEstimate(): Promise<{ usdMicros: number | null; note: string; mode: string }> {
  ensureReady();
  const test = connectionTestInput();
  if (generationMode() === "mock") {
    const estimate = mockEstimate(test.endpoint, 1);
    audit(null, "generation", "Connection test estimate in mock mode. Nothing was submitted.", {});
    return { usdMicros: estimate.usdMicros, note: test.note, mode: "mock" };
  }
  const estimate = await estimateRequest(test.endpoint, test.input);
  audit(null, "generation", "Live estimate for the Soul 2 connection test. No generation was submitted.", {});
  return { usdMicros: estimate.usdMicros, note: test.note, mode: "live" };
}

export async function connectionSubmit(): Promise<{ requestId: string; status: string }> {
  ensureReady();
  const test = connectionTestInput();
  if (generationMode() === "mock") {
    const submitted = mockSubmit("connection");
    audit(null, "generation", "Mock connection test completed locally.", {});
    return { requestId: submitted.requestId, status: "completed" };
  }
  await estimateRequest(test.endpoint, test.input);
  const submitted = await submitRequest(test.endpoint, test.input);
  audit(null, "generation", "Connection test submitted after estimate.", { requestId: submitted.requestId });
  return { requestId: submitted.requestId, status: submitted.status };
}

export function globalAudit() {
  ensureReady();
  return listAudit();
}

export function updateClientMemory(clientId: string, memory: ClientMemory, name: string): void {
  ensureReady();
  const existing = getClient(clientId);
  if (!existing) throw new Error("Client not found.");
  upsertClient({ ...existing, name, memory });
  audit(null, "approval", `Client memory updated for ${name}. Likeness consent was not inferred from older work.`, {});
}

export async function applyWebhook(body: unknown): Promise<{ ok: boolean; reason: string }> {
  if (!body || typeof body !== "object") return { ok: false, reason: "Invalid envelope." };
  const envelope = body as { request_id?: string; status?: string; error?: string | null; payload?: { images?: { url: string }[]; video?: { url: string } } | null };
  if (!envelope.request_id || !envelope.status) return { ok: false, reason: "Invalid envelope." };
  const row = findGenerationByRequest(envelope.request_id);
  if (!row) return { ok: true, reason: "Unknown request ignored." };
  if (row.providerStatus === envelope.status && isTerminal(row.providerStatus)) return { ok: true, reason: "Duplicate ignored." };
  if (row.statusUrl) await refreshGeneration(row.id);
  return { ok: true, reason: "Recorded." };
}

function recordMessage(
  job: JobRecord,
  input: { kind: MessageRecord["kind"]; subject: string; body: string; audience: MessageRecord["audience"] },
): void {
  const channel: MessageRecord["channel"] = /upwork|fiverr|contra/i.test(job.source)
    ? "marketplace"
    : /email/i.test(job.source)
      ? "direct_email"
      : "first_party_portal";
  const decision = dispatchDecision({ kind: input.kind, channel, settings: getAutonomy() });
  insertMessage({
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
  audit(job.id, "message_draft", `${input.kind} ${decision.status}. ${decision.reason}`, {});
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

function mustJob(id: string): JobRecord {
  const job = getJob(id);
  if (!job) throw new Error("Job not found.");
  return job;
}

export function spendSnapshot(jobId: string): { spent: number; cap: number; repairCap: number } {
  ensureReady();
  const settings = getAutonomy();
  return {
    spent: jobSpendMicros(jobId),
    cap: settings.maxAutomaticSpendPerJobMicros,
    repairCap: settings.maxAutomaticSpendPerRepairMicros,
  };
}
