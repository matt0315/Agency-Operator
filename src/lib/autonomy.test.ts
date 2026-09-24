import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_AUTONOMY, dispatchDecision, repairAllowed } from "./autonomy";

test("marketplace messages are never sent", () => {
  const settings = {
    ...DEFAULT_AUTONOMY,
    autoSend: { ...DEFAULT_AUTONOMY.autoSend, progressUpdates: true, proposals: true },
  };
  const result = dispatchDecision({ kind: "proposal", channel: "marketplace", settings });
  assert.equal(result.status, "draft");
  assert.match(result.reason, /Marketplace/);
});

test("final delivery stays blocked when approval is required", () => {
  const result = dispatchDecision({
    kind: "delivery",
    channel: "first_party_portal",
    settings: DEFAULT_AUTONOMY,
  });
  assert.equal(result.status, "blocked");
});

test("a direct progress note sends only when the setting allows it", () => {
  const drafted = dispatchDecision({ kind: "progress", channel: "direct_email", settings: DEFAULT_AUTONOMY });
  assert.equal(drafted.status, "draft");
  const sent = dispatchDecision({
    kind: "progress",
    channel: "direct_email",
    settings: { ...DEFAULT_AUTONOMY, autoSend: { ...DEFAULT_AUTONOMY.autoSend, progressUpdates: true } },
  });
  assert.equal(sent.status, "sent");
});

test("repairs stop at the per-repair cap, the job cap, and missing prices", () => {
  const overRepair = repairAllowed({
    incrementalMicros: 3_000_000,
    jobSpendMicros: 0,
    attempts: 1,
    family: "seedance",
    settings: DEFAULT_AUTONOMY,
    introducesRightsIssue: false,
  });
  assert.equal(overRepair.ok, false);
  const overJob = repairAllowed({
    incrementalMicros: 1_000_000,
    jobSpendMicros: 19_500_000,
    attempts: 1,
    family: "seedance",
    settings: DEFAULT_AUTONOMY,
    introducesRightsIssue: false,
  });
  assert.equal(overJob.ok, false);
  const missing = repairAllowed({
    incrementalMicros: null,
    jobSpendMicros: 0,
    attempts: 1,
    family: "seedance",
    settings: DEFAULT_AUTONOMY,
    introducesRightsIssue: false,
  });
  assert.equal(missing.ok, false);
  const rights = repairAllowed({
    incrementalMicros: 100,
    jobSpendMicros: 0,
    attempts: 1,
    family: "seedance",
    settings: DEFAULT_AUTONOMY,
    introducesRightsIssue: true,
  });
  assert.equal(rights.ok, false);
  const ok = repairAllowed({
    incrementalMicros: 885_600,
    jobSpendMicros: 4_000_000,
    attempts: 1,
    family: "seedance",
    settings: DEFAULT_AUTONOMY,
    introducesRightsIssue: false,
  });
  assert.equal(ok.ok, true);
});
