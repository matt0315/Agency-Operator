import { DEFAULT_AUTONOMY } from "./autonomy";
import { getSql, resetSqlClient, type SqlRow } from "./sql";
import type {
  AuditRecord,
  AutonomySettings,
  ClientMemory,
  ClientRecord,
  GenerationRecord,
  JobRecord,
  JobStatus,
  LedgerEntry,
  MessageRecord,
  QaReport,
  RecordingGate,
  RevisionRecord,
  StoredAnalysis,
  WorkflowRecord,
} from "./types";

async function get(sql: string, params: unknown[] = []): Promise<SqlRow | null> {
  return (await getSql()).get(sql, params);
}

async function all(sql: string, params: unknown[] = []): Promise<SqlRow[]> {
  return (await getSql()).all(sql, params);
}

async function run(sql: string, params: unknown[] = []): Promise<void> {
  await (await getSql()).run(sql, params);
}

export async function closeDb(): Promise<void> {
  await resetSqlClient();
}

function parse<T>(value: string): T {
  return JSON.parse(value) as T;
}

function mapJob(row: SqlRow): JobRecord {
  return {
    id: String(row.id),
    title: String(row.title),
    source: String(row.source),
    rawBrief: String(row.raw_brief),
    clientPriceMicros: Number(row.client_price_micros),
    deadlineAt: String(row.deadline_at),
    status: String(row.status) as JobStatus,
    clientId: String(row.client_id),
    clientNotes: String(row.client_notes),
    templateId: row.template_id ? String(row.template_id) : null,
    sourceFeeBps: Number(row.source_fee_bps),
    contingencyBps: Number(row.contingency_bps),
    targetMarginBps: Number(row.target_margin_bps),
    maxProductionMicros: Number(row.max_production_micros),
    recordingGate: (row.recording_gate as RecordingGate | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function listJobs(): Promise<JobRecord[]> {
  return (await all("SELECT * FROM jobs ORDER BY created_at DESC")).map(mapJob);
}

export async function getJob(id: string): Promise<JobRecord | null> {
  const row = await get("SELECT * FROM jobs WHERE id = ?", [id]);
  return row ? mapJob(row) : null;
}

export async function insertJob(job: JobRecord): Promise<void> {
  await run(
    `INSERT INTO jobs (
      id, title, source, raw_brief, client_price_micros, deadline_at, status, client_id, client_notes,
      template_id, source_fee_bps, contingency_bps, target_margin_bps, max_production_micros, recording_gate,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      job.id, job.title, job.source, job.rawBrief, job.clientPriceMicros, job.deadlineAt, job.status, job.clientId,
      job.clientNotes, job.templateId, job.sourceFeeBps, job.contingencyBps, job.targetMarginBps, job.maxProductionMicros,
      job.recordingGate, job.createdAt, job.updatedAt,
    ],
  );
}

export async function updateJob(id: string, patch: Partial<JobRecord>): Promise<JobRecord> {
  const current = await getJob(id);
  if (!current) throw new Error("Job not found.");
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  await run(
    `UPDATE jobs SET title=?, source=?, raw_brief=?, client_price_micros=?, deadline_at=?, status=?, client_id=?,
      client_notes=?, template_id=?, source_fee_bps=?, contingency_bps=?, target_margin_bps=?, max_production_micros=?,
      recording_gate=?, updated_at=? WHERE id=?`,
    [
      next.title, next.source, next.rawBrief, next.clientPriceMicros, next.deadlineAt, next.status, next.clientId,
      next.clientNotes, next.templateId, next.sourceFeeBps, next.contingencyBps, next.targetMarginBps,
      next.maxProductionMicros, next.recordingGate, next.updatedAt, id,
    ],
  );
  return next;
}

export async function upsertClient(client: ClientRecord): Promise<void> {
  await run(
    `INSERT INTO clients (id, name, channel, memory_json) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, channel=excluded.channel, memory_json=excluded.memory_json`,
    [client.id, client.name, client.channel, JSON.stringify(client.memory)],
  );
}

export async function getClient(id: string): Promise<ClientRecord | null> {
  const row = await get("SELECT * FROM clients WHERE id = ?", [id]);
  if (!row) return null;
  return {
    id: String(row.id),
    name: String(row.name),
    channel: String(row.channel) as ClientRecord["channel"],
    memory: parse<ClientMemory>(String(row.memory_json)),
  };
}

export async function listAnalyses(jobId: string): Promise<StoredAnalysis[]> {
  const rows = await all("SELECT * FROM analyses WHERE job_id = ? ORDER BY created_at ASC", [jobId]);
  return rows.map((row) => ({
    id: String(row.id),
    jobId: String(row.job_id),
    kind: String(row.kind) as StoredAnalysis["kind"],
    analysis: parse(String(row.analysis_json)),
    decision: parse(String(row.decision_json)),
    createdAt: String(row.created_at),
  }));
}

export async function insertAnalysis(row: StoredAnalysis): Promise<void> {
  await run("INSERT INTO analyses (id, job_id, kind, analysis_json, decision_json, created_at) VALUES (?, ?, ?, ?, ?, ?)", [
    row.id, row.jobId, row.kind, JSON.stringify(row.analysis), JSON.stringify(row.decision), row.createdAt,
  ]);
}

export async function getWorkflow(jobId: string): Promise<WorkflowRecord | null> {
  const row = await get("SELECT * FROM workflows WHERE job_id = ? ORDER BY created_at DESC LIMIT 1", [jobId]);
  if (!row) return null;
  return {
    id: String(row.id),
    jobId: String(row.job_id),
    status: String(row.status) as WorkflowRecord["status"],
    steps: parse(String(row.steps_json)),
    approvedMaxMicros: row.approved_max_micros == null ? null : Number(row.approved_max_micros),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function saveWorkflow(workflow: WorkflowRecord): Promise<void> {
  const existing = await getWorkflow(workflow.jobId);
  if (!existing) {
    await run(
      "INSERT INTO workflows (id, job_id, status, steps_json, approved_max_micros, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [workflow.id, workflow.jobId, workflow.status, JSON.stringify(workflow.steps), workflow.approvedMaxMicros, workflow.createdAt, workflow.updatedAt],
    );
    return;
  }
  await run("UPDATE workflows SET status=?, steps_json=?, approved_max_micros=?, updated_at=? WHERE id=?", [
    workflow.status, JSON.stringify(workflow.steps), workflow.approvedMaxMicros, workflow.updatedAt, existing.id,
  ]);
}

function mapGeneration(row: SqlRow): GenerationRecord {
  return {
    id: String(row.id),
    jobId: String(row.job_id),
    stepId: String(row.step_id),
    modelId: String(row.model_id),
    provider: String(row.provider) as GenerationRecord["provider"],
    requestId: row.request_id ? String(row.request_id) : null,
    statusUrl: row.status_url ? String(row.status_url) : null,
    cancelUrl: row.cancel_url ? String(row.cancel_url) : null,
    providerStatus: (row.provider_status as GenerationRecord["providerStatus"]) ?? null,
    appStatus: String(row.app_status) as GenerationRecord["appStatus"],
    estimateMicros: row.estimate_micros == null ? null : Number(row.estimate_micros),
    actualMicros: row.actual_micros == null ? null : Number(row.actual_micros),
    input: parse(String(row.input_json)),
    output: row.output_json ? parse(String(row.output_json)) : null,
    error: row.error ? String(row.error) : null,
    retryOf: row.retry_of ? String(row.retry_of) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function listGenerations(jobId: string): Promise<GenerationRecord[]> {
  return (await all("SELECT * FROM generations WHERE job_id = ? ORDER BY created_at ASC", [jobId])).map(mapGeneration);
}

export async function getGeneration(id: string): Promise<GenerationRecord | null> {
  const row = await get("SELECT * FROM generations WHERE id = ?", [id]);
  return row ? mapGeneration(row) : null;
}

export async function insertGeneration(row: GenerationRecord): Promise<void> {
  await run(
    `INSERT INTO generations (
      id, job_id, step_id, model_id, provider, request_id, status_url, cancel_url, provider_status, app_status,
      estimate_micros, actual_micros, input_json, output_json, error, retry_of, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id, row.jobId, row.stepId, row.modelId, row.provider, row.requestId, row.statusUrl, row.cancelUrl,
      row.providerStatus, row.appStatus, row.estimateMicros, row.actualMicros, JSON.stringify(row.input),
      row.output ? JSON.stringify(row.output) : null, row.error, row.retryOf, row.createdAt, row.updatedAt,
    ],
  );
}

export async function updateGeneration(row: GenerationRecord): Promise<void> {
  await run(
    `UPDATE generations SET provider_status=?, app_status=?, estimate_micros=?, actual_micros=?, output_json=?, error=?, status_url=?, cancel_url=?, request_id=?, updated_at=? WHERE id=?`,
    [
      row.providerStatus, row.appStatus, row.estimateMicros, row.actualMicros, row.output ? JSON.stringify(row.output) : null,
      row.error, row.statusUrl, row.cancelUrl, row.requestId, new Date().toISOString(), row.id,
    ],
  );
}

export async function findGenerationByRequest(requestId: string): Promise<GenerationRecord | null> {
  const row = await get("SELECT * FROM generations WHERE request_id = ?", [requestId]);
  return row ? mapGeneration(row) : null;
}

export async function listQa(jobId: string): Promise<QaReport[]> {
  const rows = await all("SELECT * FROM qa_reports WHERE job_id = ? ORDER BY created_at ASC", [jobId]);
  return rows.map((row) => {
    const payload = parse<Omit<QaReport, "id" | "jobId" | "createdAt">>(String(row.payload_json));
    return { ...payload, id: String(row.id), jobId: String(row.job_id), createdAt: String(row.created_at) };
  });
}

export async function insertQa(row: QaReport): Promise<void> {
  const { id, jobId, createdAt, ...payload } = row;
  await run("INSERT INTO qa_reports (id, job_id, generation_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?)", [
    id, jobId, row.generationId, JSON.stringify(payload), createdAt,
  ]);
}

export async function listRevisions(jobId: string): Promise<RevisionRecord[]> {
  const rows = await all("SELECT * FROM revisions WHERE job_id = ? ORDER BY created_at ASC", [jobId]);
  return rows.map((row) => ({
    id: String(row.id),
    jobId: String(row.job_id),
    ...parse<Omit<RevisionRecord, "id" | "jobId">>(String(row.payload_json)),
    createdAt: String(row.created_at),
  }));
}

export async function insertRevision(row: RevisionRecord): Promise<void> {
  const { id, jobId, createdAt, ...payload } = row;
  await run("INSERT INTO revisions (id, job_id, payload_json, created_at) VALUES (?, ?, ?, ?)", [
    id, jobId, JSON.stringify({ ...payload, createdAt }), createdAt,
  ]);
}

export async function updateRevision(row: RevisionRecord): Promise<void> {
  const { id, createdAt, ...payload } = row;
  await run("UPDATE revisions SET payload_json = ? WHERE id = ?", [JSON.stringify({ ...payload, createdAt }), id]);
}

export async function listMessages(jobId: string): Promise<MessageRecord[]> {
  const rows = await all("SELECT * FROM messages WHERE job_id = ? ORDER BY created_at ASC", [jobId]);
  return rows.map((row) => ({
    id: String(row.id),
    jobId: String(row.job_id),
    ...parse<Omit<MessageRecord, "id" | "jobId">>(String(row.payload_json)),
    createdAt: String(row.created_at),
  }));
}

export async function insertMessage(row: MessageRecord): Promise<void> {
  const { id, jobId, createdAt, ...payload } = row;
  await run("INSERT INTO messages (id, job_id, payload_json, created_at) VALUES (?, ?, ?, ?)", [
    id, jobId, JSON.stringify({ ...payload, createdAt }), createdAt,
  ]);
}

export async function listAudit(jobId?: string): Promise<AuditRecord[]> {
  const rows = jobId
    ? await all("SELECT * FROM audit_log WHERE job_id = ? ORDER BY created_at ASC", [jobId])
    : await all("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 200");
  return rows.map((row) => ({
    id: String(row.id),
    jobId: row.job_id ? String(row.job_id) : null,
    kind: String(row.kind),
    summary: String(row.summary),
    payload: parse(String(row.payload_json)),
    createdAt: String(row.created_at),
  }));
}

export async function insertAudit(row: AuditRecord): Promise<void> {
  await run("INSERT INTO audit_log (id, job_id, kind, summary, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)", [
    row.id, row.jobId, row.kind, row.summary, JSON.stringify(row.payload), row.createdAt,
  ]);
}

export async function listLedger(jobId: string): Promise<LedgerEntry[]> {
  const rows = await all("SELECT * FROM ledger WHERE job_id = ? ORDER BY created_at ASC", [jobId]);
  return rows.map((row) => ({
    id: String(row.id),
    jobId: String(row.job_id),
    generationId: row.generation_id ? String(row.generation_id) : null,
    label: String(row.label),
    amountMicros: Number(row.amount_micros),
    createdAt: String(row.created_at),
  }));
}

export async function insertLedger(row: LedgerEntry): Promise<void> {
  await run("INSERT INTO ledger (id, job_id, generation_id, label, amount_micros, created_at) VALUES (?, ?, ?, ?, ?, ?)", [
    row.id, row.jobId, row.generationId, row.label, row.amountMicros, row.createdAt,
  ]);
}

export async function jobSpendMicros(jobId: string): Promise<number> {
  const row = await get("SELECT COALESCE(SUM(amount_micros), 0) AS total FROM ledger WHERE job_id = ?", [jobId]);
  return Number(row?.total ?? 0);
}

export async function getAutonomy(): Promise<AutonomySettings> {
  const row = await get("SELECT value_json FROM settings WHERE key = ?", ["autonomy"]);
  if (!row) {
    await run("INSERT INTO settings (key, value_json) VALUES (?, ?)", ["autonomy", JSON.stringify(DEFAULT_AUTONOMY)]);
    return { ...DEFAULT_AUTONOMY };
  }
  return { ...DEFAULT_AUTONOMY, ...parse<AutonomySettings>(String(row.value_json)) };
}

export async function saveAutonomy(settings: AutonomySettings): Promise<void> {
  await run(
    "INSERT INTO settings (key, value_json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json",
    ["autonomy", JSON.stringify(settings)],
  );
}

export async function clearJobWork(jobId: string): Promise<void> {
  for (const table of ["analyses", "workflows", "generations", "qa_reports", "revisions", "messages", "ledger"]) {
    await run(`DELETE FROM ${table} WHERE job_id = ?`, [jobId]);
  }
  await run("DELETE FROM audit_log WHERE job_id = ?", [jobId]);
}

export async function countJobs(): Promise<number> {
  const row = await get("SELECT COUNT(*) AS count FROM jobs");
  return Number(row?.count ?? 0);
}

export async function getMeta(key: string): Promise<string | null> {
  const row = await get("SELECT value FROM meta WHERE key = ?", [key]);
  return row ? String(row.value) : null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await run("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [key, value]);
}

export async function countRecentLoginFailures(ip: string, sinceIso: string): Promise<number> {
  const row = await get("SELECT COUNT(*) AS count FROM login_attempts WHERE ip = ? AND created_at >= ?", [ip, sinceIso]);
  return Number(row?.count ?? 0);
}

export async function recordLoginFailure(ip: string, atIso: string): Promise<void> {
  await run("INSERT INTO login_attempts (ip, created_at) VALUES (?, ?)", [ip, atIso]);
}

export async function clearLoginFailures(ip: string): Promise<void> {
  await run("DELETE FROM login_attempts WHERE ip = ?", [ip]);
}
