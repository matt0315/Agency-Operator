import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("seeded demos walk the supervised pipeline in mock mode", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "agency-operator-"));
  process.env.DATABASE_PATH = path.join(dir, "test.sqlite");
  process.env.ASSET_DIR = path.join(dir, "assets");
  process.env.APP_MODE = "mock";
  delete process.env.OPENAI_API_KEY;
  delete process.env.HF_API_KEY_ID;
  delete process.env.HF_API_KEY_SECRET;

  const service = await import("./service");
  const { getBundle, resetDemo, advanceRecording, agentAttemptDelivery, approveDelivery, dashboardJobs, createJob, runAutomatic } = service;

  const jobs = dashboardJobs();
  assert.ok(jobs.some((job: { id: string }) => job.id === "job_rain"));
  assert.ok(jobs.some((job: { id: string }) => job.id === "job_orchard"));

  const rain = getBundle("job_rain");
  assert.ok(rain);
  assert.equal(rain.job.status, "qa");
  assert.equal(rain.mode.analysis, "mock");
  assert.equal(rain.mode.generation, "mock");
  assert.ok(rain.generations.some((gen: { appStatus: string; actualMicros: number | null }) => gen.appStatus === "failed" && gen.actualMicros === 0));
  assert.ok(rain.ledger.every((entry: { amountMicros: number }) => entry.amountMicros >= 0));
  assert.equal(rain.analyses.filter((row: { kind: string }) => row.kind === "model").length > 0, true);
  assert.equal(rain.analyses.filter((row: { kind: string }) => row.kind === "human").length > 0, true);
  const rainShip = rain.workflow?.steps.find((step: { id: string }) => step.id === "film-169");
  assert.equal(rainShip?.modelId, "kling-video/v3.0/pro/image-to-video");

  const orchard = getBundle("job_orchard");
  assert.ok(orchard?.workflow);
  const orbit = orchard.workflow.steps.find((step: { id: string }) => step.id === "orbit");
  assert.equal(orbit?.modelId, "bytedance/seedance-2.5/image-to-video");
  assert.notEqual(orbit?.modelId, rainShip?.modelId);
  assert.equal(orchard.workflow.steps[0]?.modelId, "pixverse/v6/text-to-video");

  const rejected = getBundle("job_reject");
  assert.ok(rejected);
  assert.equal(rejected.job.status, "rejected");
  assert.equal(rejected.analyses[0]?.decision.decision, "reject");

  resetDemo("job_rain");
  assert.equal(getBundle("job_rain")?.job.recordingGate, "analysis");
  assert.match(await advanceRecording("job_rain"), /approval/);
  assert.match(await advanceRecording("job_rain"), /generation/);
  assert.match(await advanceRecording("job_rain"), /QA/);
  assert.match(await advanceRecording("job_rain"), /delivery/);
  const paused = getBundle("job_rain");
  assert.ok(paused);
  assert.equal(paused.job.status, "qa");
  assert.notEqual(paused.job.status, "delivered");
  assert.ok(paused.revisions.some((row: { clientNote: string }) => /warmer and more hopeful/i.test(row.clientNote)));
  assert.ok(paused.qaReports.some((row: { verdict: string }) => row.verdict === "needs_controlled_edit"));
  assert.ok(paused.generations.some((row: { stepId: string }) => row.stepId === "repair"));

  const blocked = agentAttemptDelivery("job_rain");
  assert.equal(blocked.status, "blocked");
  assert.equal(getBundle("job_rain")?.job.status, "qa");

  approveDelivery("job_rain");
  assert.equal(getBundle("job_rain")?.job.status, "delivered");

  resetDemo("job_orchard");
  await advanceRecording("job_orchard");
  await advanceRecording("job_orchard");
  const approved = getBundle("job_orchard");
  assert.ok(approved?.workflow);
  assert.equal(approved.job.recordingGate, "generation");
  assert.equal(approved.workflow.steps.find((step: { id: string }) => step.id === "orbit")?.modelId, "bytedance/seedance-2.5/image-to-video");

  const clean = createJob({
    title: "Harbor dusk",
    source: "Email",
    rawBrief: "A quiet 16:9 harbor at dusk, 8 seconds, no people and no readable type. The dusk photos are the reference.",
    clientName: "Harbor",
    channel: "direct_email",
    clientPriceMicros: 900_000_000,
    deadlineAt: new Date(Date.now() + 72 * 3_600_000).toISOString(),
    templateId: "launch-video",
  });
  const ran = await runAutomatic(clean.id);
  assert.match(ran, /approve delivery/i);
  const done = getBundle(clean.id);
  assert.equal(done?.job.status, "qa");
  assert.ok((done?.generations.length ?? 0) > 0);
  assert.ok(done?.messages.some((message: { kind: string; status: string }) => message.kind === "delivery" && message.status === "draft"));
  assert.ok(done?.audit.some((entry: { summary: string }) => entry.summary.startsWith("Ran without a person")));

  const held = createJob({
    title: "Face spot",
    source: "Email",
    rawBrief: "An 8 second 16:9 video using my face as the spokesperson.",
    clientName: "Face",
    channel: "direct_email",
    clientPriceMicros: 900_000_000,
    deadlineAt: new Date(Date.now() + 72 * 3_600_000).toISOString(),
    templateId: null,
  });
  const heldRun = await runAutomatic(held.id);
  assert.match(heldRun, /Waiting on a person/);
  const face = getBundle(held.id);
  assert.equal(face?.job.status, "needs_review");
  assert.equal(face?.generations.length, 0);
});
