import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DEFAULT_AUTONOMY } from "./autonomy";
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

let db: DatabaseSync | null = null;

function databasePath(): string {
  const configured = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "agency-operator.sqlite");
  if (configured === ":memory:") return ":memory:";
  const abs = path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
  mkdirSync(path.dirname(abs), { recursive: true });
  return abs;
}

export function getDb(): DatabaseSync {
  if (db) return db;
  db = new DatabaseSync(databasePath());
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source TEXT NOT NULL,
      raw_brief TEXT NOT NULL,
      client_price_micros INTEGER NOT NULL,
      deadline_at TEXT NOT NULL,
      status TEXT NOT NULL,
      client_id TEXT NOT NULL,
      client_notes TEXT NOT NULL,
      template_id TEXT,
      source_fee_bps INTEGER NOT NULL,
      contingency_bps INTEGER NOT NULL,
      target_margin_bps INTEGER NOT NULL,
      max_production_micros INTEGER NOT NULL,
      recording_gate TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      channel TEXT NOT NULL,
      memory_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS analyses (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      analysis_json TEXT NOT NULL,
      decision_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      status TEXT NOT NULL,
      steps_json TEXT NOT NULL,
      approved_max_micros INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS generations (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      step_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      request_id TEXT,
      status_url TEXT,
      cancel_url TEXT,
      provider_status TEXT,
      app_status TEXT NOT NULL,
      estimate_micros INTEGER,
      actual_micros INTEGER,
      input_json TEXT NOT NULL,
      output_json TEXT,
      error TEXT,
      retry_of TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS qa_reports (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      generation_id TEXT,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS revisions (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      job_id TEXT,
      kind TEXT NOT NULL,
      summary TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ledger (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      generation_id TEXT,
      label TEXT NOT NULL,
      amount_micros INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  const existing = db.prepare("SELECT value_json FROM settings WHERE key = ?").get("autonomy") as { value_json: string } | undefined;
  if (!existing) {
    db.prepare("INSERT INTO settings (key, value_json) VALUES (?, ?)").run("autonomy", JSON.stringify(DEFAULT_AUTONOMY));
  }
  return db;
}

export function closeDb(): void {
  db?.close();
  db = null;
}

function parse<T>(value: string): T {
  return JSON.parse(value) as T;
}

function mapJob(row: Record<string, unknown>): JobRecord {
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

export function listJobs(): JobRecord[] {
  const rows = getDb().prepare("SELECT * FROM jobs ORDER BY created_at DESC").all() as Record<string, unknown>[];
  return rows.map(mapJob);
}

export function getJob(id: string): JobRecord | null {
  const row = getDb().prepare("SELECT * FROM jobs WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? mapJob(row) : null;
}

export function insertJob(job: JobRecord): void {
  getDb()
    .prepare(
      `INSERT INTO jobs (
        id, title, source, raw_brief, client_price_micros, deadline_at, status, client_id, client_notes,
        template_id, source_fee_bps, contingency_bps, target_margin_bps, max_production_micros, recording_gate,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      job.id,
      job.title,
      job.source,
      job.rawBrief,
      job.clientPriceMicros,
      job.deadlineAt,
      job.status,
      job.clientId,
      job.clientNotes,
      job.templateId,
      job.sourceFeeBps,
      job.contingencyBps,
      job.targetMarginBps,
      job.maxProductionMicros,
      job.recordingGate,
      job.createdAt,
      job.updatedAt,
    );
}

export function updateJob(id: string, patch: Partial<JobRecord>): JobRecord {
  const current = getJob(id);
  if (!current) throw new Error("Job not found.");
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  getDb()
    .prepare(
      `UPDATE jobs SET title=?, source=?, raw_brief=?, client_price_micros=?, deadline_at=?, status=?, client_id=?,
        client_notes=?, template_id=?, source_fee_bps=?, contingency_bps=?, target_margin_bps=?, max_production_micros=?,
        recording_gate=?, updated_at=? WHERE id=?`,
    )
    .run(
      next.title,
      next.source,
      next.rawBrief,
      next.clientPriceMicros,
      next.deadlineAt,
      next.status,
      next.clientId,
      next.clientNotes,
      next.templateId,
      next.sourceFeeBps,
      next.contingencyBps,
      next.targetMarginBps,
      next.maxProductionMicros,
      next.recordingGate,
      next.updatedAt,
      id,
    );
  return next;
}

export function upsertClient(client: ClientRecord): void {
  getDb()
    .prepare(
      `INSERT INTO clients (id, name, channel, memory_json) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, channel=excluded.channel, memory_json=excluded.memory_json`,
    )
    .run(client.id, client.name, client.channel, JSON.stringify(client.memory));
}

export function getClient(id: string): ClientRecord | null {
  const row = getDb().prepare("SELECT * FROM clients WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: String(row.id),
    name: String(row.name),
    channel: String(row.channel) as ClientRecord["channel"],
    memory: parse<ClientMemory>(String(row.memory_json)),
  };
}

export function listAnalyses(jobId: string): StoredAnalysis[] {
  const rows = getDb().prepare("SELECT * FROM analyses WHERE job_id = ? ORDER BY created_at ASC").all(jobId) as Record<string, unknown>[];
  return rows.map((row) => ({
    id: String(row.id),
    jobId: String(row.job_id),
    kind: String(row.kind) as StoredAnalysis["kind"],
    analysis: parse(String(row.analysis_json)),
    decision: parse(String(row.decision_json)),
    createdAt: String(row.created_at),
  }));
}

export function insertAnalysis(row: StoredAnalysis): void {
  getDb()
    .prepare("INSERT INTO analyses (id, job_id, kind, analysis_json, decision_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(row.id, row.jobId, row.kind, JSON.stringify(row.analysis), JSON.stringify(row.decision), row.createdAt);
}

export function getWorkflow(jobId: string): WorkflowRecord | null {
  const row = getDb().prepare("SELECT * FROM workflows WHERE job_id = ? ORDER BY created_at DESC LIMIT 1").get(jobId) as
    | Record<string, unknown>
    | undefined;
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

export function saveWorkflow(workflow: WorkflowRecord): void {
  const existing = getWorkflow(workflow.jobId);
  if (!existing) {
    getDb()
      .prepare(
        "INSERT INTO workflows (id, job_id, status, steps_json, approved_max_micros, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        workflow.id,
        workflow.jobId,
        workflow.status,
        JSON.stringify(workflow.steps),
        workflow.approvedMaxMicros,
        workflow.createdAt,
        workflow.updatedAt,
      );
    return;
  }
  getDb()
    .prepare("UPDATE workflows SET status=?, steps_json=?, approved_max_micros=?, updated_at=? WHERE id=?")
    .run(workflow.status, JSON.stringify(workflow.steps), workflow.approvedMaxMicros, workflow.updatedAt, existing.id);
}

export function listGenerations(jobId: string): GenerationRecord[] {
  const rows = getDb().prepare("SELECT * FROM generations WHERE job_id = ? ORDER BY created_at ASC").all(jobId) as Record<string, unknown>[];
  return rows.map(mapGeneration);
}

export function getGeneration(id: string): GenerationRecord | null {
  const row = getDb().prepare("SELECT * FROM generations WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? mapGeneration(row) : null;
}

function mapGeneration(row: Record<string, unknown>): GenerationRecord {
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

export function insertGeneration(row: GenerationRecord): void {
  getDb()
    .prepare(
      `INSERT INTO generations (
        id, job_id, step_id, model_id, provider, request_id, status_url, cancel_url, provider_status, app_status,
        estimate_micros, actual_micros, input_json, output_json, error, retry_of, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.id,
      row.jobId,
      row.stepId,
      row.modelId,
      row.provider,
      row.requestId,
      row.statusUrl,
      row.cancelUrl,
      row.providerStatus,
      row.appStatus,
      row.estimateMicros,
      row.actualMicros,
      JSON.stringify(row.input),
      row.output ? JSON.stringify(row.output) : null,
      row.error,
      row.retryOf,
      row.createdAt,
      row.updatedAt,
    );
}

export function updateGeneration(row: GenerationRecord): void {
  getDb()
    .prepare(
      `UPDATE generations SET provider_status=?, app_status=?, estimate_micros=?, actual_micros=?, output_json=?, error=?, status_url=?, cancel_url=?, request_id=?, updated_at=? WHERE id=?`,
    )
    .run(
      row.providerStatus,
      row.appStatus,
      row.estimateMicros,
      row.actualMicros,
      row.output ? JSON.stringify(row.output) : null,
      row.error,
      row.statusUrl,
      row.cancelUrl,
      row.requestId,
      new Date().toISOString(),
      row.id,
    );
}

export function findGenerationByRequest(requestId: string): GenerationRecord | null {
  const row = getDb().prepare("SELECT * FROM generations WHERE request_id = ?").get(requestId) as Record<string, unknown> | undefined;
  return row ? mapGeneration(row) : null;
}

export function listQa(jobId: string): QaReport[] {
  const rows = getDb().prepare("SELECT * FROM qa_reports WHERE job_id = ? ORDER BY created_at ASC").all(jobId) as Record<string, unknown>[];
  return rows.map((row) => {
    const payload = parse<Omit<QaReport, "id" | "jobId" | "createdAt">>(String(row.payload_json));
    return { ...payload, id: String(row.id), jobId: String(row.job_id), createdAt: String(row.created_at) };
  });
}

export function insertQa(row: QaReport): void {
  const { id, jobId, createdAt, ...payload } = row;
  getDb()
    .prepare("INSERT INTO qa_reports (id, job_id, generation_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(id, jobId, row.generationId, JSON.stringify(payload), createdAt);
}

export function listRevisions(jobId: string): RevisionRecord[] {
  const rows = getDb().prepare("SELECT * FROM revisions WHERE job_id = ? ORDER BY created_at ASC").all(jobId) as Record<string, unknown>[];
  return rows.map((row) => ({ id: String(row.id), jobId: String(row.job_id), ...parse<Omit<RevisionRecord, "id" | "jobId">>(String(row.payload_json)), createdAt: String(row.created_at) }));
}

export function insertRevision(row: RevisionRecord): void {
  const { id, jobId, createdAt, ...payload } = row;
  getDb().prepare("INSERT INTO revisions (id, job_id, payload_json, created_at) VALUES (?, ?, ?, ?)").run(id, jobId, JSON.stringify({ ...payload, createdAt }), createdAt);
}

export function updateRevision(row: RevisionRecord): void {
  const { id, createdAt, jobId, ...payload } = row;
  getDb().prepare("UPDATE revisions SET payload_json = ? WHERE id = ?").run(JSON.stringify({ ...payload, createdAt }), id);
  void jobId;
}

export function listMessages(jobId: string): MessageRecord[] {
  const rows = getDb().prepare("SELECT * FROM messages WHERE job_id = ? ORDER BY created_at ASC").all(jobId) as Record<string, unknown>[];
  return rows.map((row) => ({ id: String(row.id), jobId: String(row.job_id), ...parse<Omit<MessageRecord, "id" | "jobId">>(String(row.payload_json)), createdAt: String(row.created_at) }));
}

export function insertMessage(row: MessageRecord): void {
  const { id, jobId, createdAt, ...payload } = row;
  getDb().prepare("INSERT INTO messages (id, job_id, payload_json, created_at) VALUES (?, ?, ?, ?)").run(id, jobId, JSON.stringify({ ...payload, createdAt }), createdAt);
}

export function listAudit(jobId?: string): AuditRecord[] {
  const rows = (
    jobId
      ? getDb().prepare("SELECT * FROM audit_log WHERE job_id = ? ORDER BY created_at ASC").all(jobId)
      : getDb().prepare("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 200").all()
  ) as Record<string, unknown>[];
  return rows.map((row) => ({
    id: String(row.id),
    jobId: row.job_id ? String(row.job_id) : null,
    kind: String(row.kind),
    summary: String(row.summary),
    payload: parse(String(row.payload_json)),
    createdAt: String(row.created_at),
  }));
}

export function insertAudit(row: AuditRecord): void {
  getDb()
    .prepare("INSERT INTO audit_log (id, job_id, kind, summary, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(row.id, row.jobId, row.kind, row.summary, JSON.stringify(row.payload), row.createdAt);
}

export function listLedger(jobId: string): LedgerEntry[] {
  const rows = getDb().prepare("SELECT * FROM ledger WHERE job_id = ? ORDER BY created_at ASC").all(jobId) as Record<string, unknown>[];
  return rows.map((row) => ({
    id: String(row.id),
    jobId: String(row.job_id),
    generationId: row.generation_id ? String(row.generation_id) : null,
    label: String(row.label),
    amountMicros: Number(row.amount_micros),
    createdAt: String(row.created_at),
  }));
}

export function insertLedger(row: LedgerEntry): void {
  getDb()
    .prepare("INSERT INTO ledger (id, job_id, generation_id, label, amount_micros, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(row.id, row.jobId, row.generationId, row.label, row.amountMicros, row.createdAt);
}

export function jobSpendMicros(jobId: string): number {
  const row = getDb().prepare("SELECT COALESCE(SUM(amount_micros), 0) AS total FROM ledger WHERE job_id = ?").get(jobId) as { total: number };
  return Number(row.total);
}

export function getAutonomy(): AutonomySettings {
  const row = getDb().prepare("SELECT value_json FROM settings WHERE key = ?").get("autonomy") as { value_json: string };
  return { ...DEFAULT_AUTONOMY, ...parse<AutonomySettings>(row.value_json) };
}

export function saveAutonomy(settings: AutonomySettings): void {
  getDb().prepare("UPDATE settings SET value_json = ? WHERE key = ?").run(JSON.stringify(settings), "autonomy");
}

export function clearJobWork(jobId: string): void {
  const database = getDb();
  for (const table of ["analyses", "workflows", "generations", "qa_reports", "revisions", "messages", "ledger"]) {
    database.prepare(`DELETE FROM ${table} WHERE job_id = ?`).run(jobId);
  }
  database.prepare("DELETE FROM audit_log WHERE job_id = ?").run(jobId);
}

export function countJobs(): number {
  const row = getDb().prepare("SELECT COUNT(*) AS count FROM jobs").get() as { count: number };
  return Number(row.count);
}

export function getMeta(key: string): string | null {
  const row = getDb().prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setMeta(key: string, value: string): void {
  getDb().prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}
