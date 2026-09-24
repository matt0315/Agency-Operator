"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseDollarsToMicros } from "@/lib/format";
import { redact } from "@/lib/mode";
import {
  addRevision,
  advanceRecording,
  agentAttemptDelivery,
  analyzeJob,
  applyRevision,
  approveDelivery,
  approveWorkflow,
  cancelGeneration,
  connectionEstimate,
  connectionSubmit,
  createJob,
  draftDelivery,
  overrideStep,
  refreshGeneration,
  rejectJob,
  resetDemo,
  retryGeneration,
  runApprovedSteps,
  runQa,
  saveHumanAnalysis,
  saveSettings,
  updateClientMemory,
  updateCommercials,
} from "@/lib/service";
import type { AutonomySettings, ClientMemory } from "@/lib/types";

function refresh(jobId?: string) {
  revalidatePath("/");
  revalidatePath("/audit");
  revalidatePath("/settings/autonomy");
  revalidatePath("/settings/connection");
  if (jobId) {
    revalidatePath(`/jobs/${jobId}`);
    revalidatePath(`/jobs/${jobId}/review`);
    revalidatePath(`/jobs/${jobId}/record`);
  }
}

function fail(error: unknown): { ok: false; error: string } {
  return { ok: false, error: redact(error instanceof Error ? error.message : "Something failed.") };
}

export async function createJobAction(formData: FormData) {
  const price = parseDollarsToMicros(String(formData.get("price") || "0")) ?? 0;
  const deadline = String(formData.get("deadline") || "");
  const job = createJob({
    title: String(formData.get("title") || ""),
    source: String(formData.get("source") || "Direct form"),
    rawBrief: String(formData.get("brief") || ""),
    clientName: String(formData.get("client") || ""),
    channel: String(formData.get("channel") || "direct_email") as "marketplace" | "direct_email" | "first_party_portal",
    clientPriceMicros: price,
    deadlineAt: deadline ? new Date(deadline).toISOString() : new Date(Date.now() + 72 * 3_600_000).toISOString(),
    templateId: String(formData.get("template") || "") || null,
  });
  refresh(job.id);
  redirect(`/jobs/${job.id}`);
}

export async function analyzeAction(jobId: string) {
  try {
    await analyzeJob(jobId);
    refresh(jobId);
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function saveReviewAction(jobId: string, raw: unknown) {
  const result = saveHumanAnalysis(jobId, raw);
  refresh(jobId);
  return result;
}

export async function approveAction(jobId: string) {
  try {
    approveWorkflow(jobId);
    refresh(jobId);
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function rejectAction(jobId: string) {
  rejectJob(jobId);
  refresh(jobId);
}

export async function overrideAction(jobId: string, stepId: string, modelId: string) {
  try {
    overrideStep(jobId, stepId, modelId);
    refresh(jobId);
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function commercialsAction(formData: FormData) {
  const jobId = String(formData.get("jobId"));
  updateCommercials(jobId, {
    clientPriceMicros: parseDollarsToMicros(String(formData.get("price") || "0")) ?? 0,
    sourceFeeBps: Math.round(Number(formData.get("fee") || 0) * 100),
    contingencyBps: Math.round(Number(formData.get("contingency") || 0) * 100),
    targetMarginBps: Math.round(Number(formData.get("margin") || 0) * 100),
    maxProductionMicros: parseDollarsToMicros(String(formData.get("ceiling") || "0")) ?? 0,
  });
  refresh(jobId);
}

export async function generateAction(jobId: string) {
  try {
    await runApprovedSteps(jobId);
    refresh(jobId);
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function qaAction(jobId: string) {
  try {
    await runQa(jobId);
    refresh(jobId);
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function pollAction(id: string, jobId: string) {
  try {
    await refreshGeneration(id);
    refresh(jobId);
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function cancelAction(id: string, jobId: string) {
  try {
    const message = await cancelGeneration(id);
    refresh(jobId);
    return { ok: true as const, message };
  } catch (error) {
    return fail(error);
  }
}

export async function retryAction(id: string, jobId: string) {
  try {
    await retryGeneration(id);
    refresh(jobId);
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function revisionAction(jobId: string, note: string) {
  addRevision(jobId, note);
  refresh(jobId);
}

export async function applyRevisionAction(jobId: string, revisionId: string) {
  try {
    await applyRevision(revisionId);
    refresh(jobId);
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function resetAction(jobId: string) {
  resetDemo(jobId);
  refresh(jobId);
}

export async function advanceAction(jobId: string) {
  try {
    const message = await advanceRecording(jobId);
    refresh(jobId);
    return { ok: true as const, message };
  } catch (error) {
    return fail(error);
  }
}

export async function deliveryDraftAction(jobId: string) {
  draftDelivery(jobId);
  refresh(jobId);
}

export async function deliverAction(jobId: string) {
  try {
    const blocked = agentAttemptDelivery(jobId);
    if (blocked.status === "blocked") {
      refresh(jobId);
      return blocked;
    }
    return blocked;
  } catch (error) {
    return fail(error);
  }
}

export async function approveDeliveryAction(jobId: string) {
  try {
    approveDelivery(jobId);
    refresh(jobId);
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function settingsAction(settings: AutonomySettings) {
  saveSettings(settings);
  refresh();
}

export async function memoryAction(clientId: string, name: string, memory: ClientMemory, jobId: string) {
  updateClientMemory(clientId, memory, name);
  refresh(jobId);
}

export async function estimateConnectionAction() {
  try {
    return { ok: true as const, ...(await connectionEstimate()) };
  } catch (error) {
    return fail(error);
  }
}

export async function submitConnectionAction() {
  try {
    return { ok: true as const, ...(await connectionSubmit()) };
  } catch (error) {
    return fail(error);
  }
}
