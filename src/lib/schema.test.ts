import assert from "node:assert/strict";
import test from "node:test";
import { parseAnalysis, parseAnalysisResponse } from "./schema";
import { rainAnalysis } from "./mock-analysis";

test("accepts a complete analysis", () => {
  const parsed = parseAnalysis(rainAnalysis());
  assert.equal(parsed.ok, true);
});

test("rejects malformed JSON", () => {
  const parsed = parseAnalysisResponse("{not json");
  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.match(parsed.error, /JSON/);
});

test("rejects a missing required field", () => {
  const { conciseSummary, ...rest } = rainAnalysis();
  void conciseSummary;
  const parsed = parseAnalysis(rest);
  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.match(parsed.error, /conciseSummary/);
});

test("rejects an out-of-range confidence and an unknown decision", () => {
  const high = parseAnalysis({ ...rainAnalysis(), confidence: 140 });
  assert.equal(high.ok, false);
  const decision = parseAnalysis({ ...rainAnalysis(), decision: "maybe" });
  assert.equal(decision.ok, false);
});

test("rejects extra fields", () => {
  const parsed = parseAnalysis({ ...rainAnalysis(), inventedPrice: 12 });
  assert.equal(parsed.ok, false);
});

test("rejects a missing deliverable field", () => {
  const analysis = rainAnalysis();
  const broken = {
    ...analysis,
    deliverables: analysis.deliverables.map((item, index) => (index === 0 ? { ...item, aspectRatio: "" } : item)),
  };
  const parsed = parseAnalysis(broken);
  assert.equal(parsed.ok, false);
});
