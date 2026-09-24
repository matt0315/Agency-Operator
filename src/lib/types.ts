export const JOB_STATUSES = [
  "new",
  "needs_review",
  "approved",
  "generating",
  "qa",
  "delivered",
  "rejected",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const PIPELINE_LABEL: Record<JobStatus, string> = {
  new: "New",
  needs_review: "Needs Review",
  approved: "Approved",
  generating: "Generating",
  qa: "QA",
  delivered: "Delivered",
  rejected: "Rejected",
};

export type DecisionName = "accept" | "human_review" | "reject";
export type RevisionRisk = "low" | "medium" | "high";
export type ProductionRole = "search" | "control" | "ship" | "finish";
export type RecordingGate = "analysis" | "approval" | "generation" | "qa" | "delivery";

export type RightsKind =
  | "likeness"
  | "voice"
  | "logo"
  | "packaging_text"
  | "factual_claim"
  | "licensed_music"
  | "unclear_rights"
  | "impersonation"
  | "other";

export type Deliverable = {
  name: string;
  format: string;
  aspectRatio: string;
  durationSeconds: number | null;
  resolution: string;
  exactText: string;
};

export type RightsFlag = {
  kind: RightsKind;
  detail: string;
};

export type ProposedStep = {
  id: string;
  capability: string;
  role: ProductionRole;
  purpose: string;
};

export type BriefAnalysis = {
  jobType: string;
  conciseSummary: string;
  deliverables: Deliverable[];
  suppliedAssets: string[];
  missingAssets: string[];
  questionsForClient: string[];
  brandConstraints: string[];
  rightsAndConsentFlags: RightsFlag[];
  technicalRisks: string[];
  revisionRisk: RevisionRisk;
  confidence: number;
  decision: DecisionName;
  decisionReasons: string[];
  proposedWorkflow: ProposedStep[];
  estimatedAttemptsByStep: { stepId: string; attempts: number }[];
  assumptions: string[];
  cannotDeliverReliably: boolean;
  deceptiveImpersonation: boolean;
};

export type RouteStep = {
  id: string;
  order: number;
  role: ProductionRole;
  capability: string;
  purpose: string;
  modelId: string;
  modelName: string;
  why: string;
  failureMode: string;
  alternativeModelId: string;
  alternativeName: string;
  alternativeNote: string;
  attempts: number;
  quantity: number;
  unit: "image" | "second" | "generation";
  unitCostMicros: number | null;
  priceKnown: boolean;
  priceNote: string;
  estimatedTotalMicros: number | null;
  maxAuthorizedMicros: number | null;
  inputs: string;
  expectedOutputs: string;
  settings: Record<string, string | number | boolean>;
  conditional: boolean;
};

export type Economics = {
  clientPriceMicros: number;
  sourceFeeBps: number;
  sourceFeeMicros: number;
  generationMicros: number;
  contingencyBps: number;
  contingencyMicros: number;
  productionMicros: number;
  grossProfitMicros: number;
  grossMarginBps: number | null;
  targetMarginBps: number;
  maxProductionMicros: number;
  overBudget: boolean;
  negativeMargin: boolean;
  belowTargetMargin: boolean;
  missingPrices: string[];
  priceDataComplete: boolean;
};

export type DecisionResult = {
  decision: DecisionName;
  reasons: string[];
  economics: Economics;
};

export type JobRecord = {
  id: string;
  title: string;
  source: string;
  rawBrief: string;
  clientPriceMicros: number;
  deadlineAt: string;
  status: JobStatus;
  clientId: string;
  clientNotes: string;
  templateId: string | null;
  sourceFeeBps: number;
  contingencyBps: number;
  targetMarginBps: number;
  maxProductionMicros: number;
  recordingGate: RecordingGate | null;
  createdAt: string;
  updatedAt: string;
};

export type StoredAnalysis = {
  id: string;
  jobId: string;
  kind: "model" | "human";
  analysis: BriefAnalysis;
  decision: DecisionResult;
  createdAt: string;
};

export type WorkflowRecord = {
  id: string;
  jobId: string;
  status: "draft" | "approved";
  steps: RouteStep[];
  approvedMaxMicros: number | null;
  createdAt: string;
  updatedAt: string;
};

export type ProviderStatus = "queued" | "in_progress" | "completed" | "failed" | "nsfw" | "canceled";

export type AppGenerationStatus = ProviderStatus | "timed_out" | "submitting";

export type NormalizedAsset = {
  kind: "image" | "video" | "audio";
  sourceUrl: string;
  contentType: string | null;
  localPath: string | null;
  fileName: string;
};

export type GenerationRecord = {
  id: string;
  jobId: string;
  stepId: string;
  modelId: string;
  provider: "higgsfield" | "mock";
  requestId: string | null;
  statusUrl: string | null;
  cancelUrl: string | null;
  providerStatus: ProviderStatus | null;
  appStatus: AppGenerationStatus;
  estimateMicros: number | null;
  actualMicros: number | null;
  input: Record<string, unknown>;
  output: { assets: NormalizedAsset[]; rawNote?: string } | null;
  error: string | null;
  retryOf: string | null;
  createdAt: string;
  updatedAt: string;
};

export type QaCheck = {
  id: string;
  label: string;
  result: "pass" | "fail" | "na";
  note: string;
};

export type QaVerdict = "concept_ok" | "needs_controlled_edit" | "needs_regeneration" | "ready_for_delivery_review";

export type QaReport = {
  id: string;
  jobId: string;
  generationId: string | null;
  checks: QaCheck[];
  verdict: QaVerdict;
  failedComponent: string | null;
  recommendedAction: string;
  createdAt: string;
};

export type RevisionRecord = {
  id: string;
  jobId: string;
  clientNote: string;
  affectedDeliverable: string;
  affectedStepId: string;
  classification: "included" | "scope_change";
  recommendedAction: string;
  expectedIncrementalMicros: number | null;
  approval: "pending" | "approved" | "rejected";
  appliedGenerationId: string | null;
  createdAt: string;
};

export type MessageRecord = {
  id: string;
  jobId: string;
  kind:
    | "intake_question"
    | "proposal"
    | "progress"
    | "concept"
    | "revision"
    | "change_order"
    | "delivery"
    | "feedback"
    | "escalation";
  channel: "marketplace" | "direct_email" | "first_party_portal" | "internal";
  audience: "client" | "human";
  status: "draft" | "sent" | "blocked";
  subject: string;
  body: string;
  reason: string;
  createdAt: string;
};

export type AuditRecord = {
  id: string;
  jobId: string | null;
  kind: string;
  summary: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type LedgerEntry = {
  id: string;
  jobId: string;
  generationId: string | null;
  label: string;
  amountMicros: number;
  createdAt: string;
};

export type ClientMemory = {
  logos: string[];
  colors: string[];
  fonts: string[];
  tone: string;
  productDetails: string[];
  winningAssets: string[];
  rejectedStyles: string[];
  deliveryPreferences: string[];
  communicationPreferences: string[];
  likenessConsent: string;
};

export type ClientRecord = {
  id: string;
  name: string;
  channel: "marketplace" | "direct_email" | "first_party_portal";
  memory: ClientMemory;
};

export type AutoSendKey =
  | "intakeQuestions"
  | "proposals"
  | "progressUpdates"
  | "conceptShare"
  | "changeOrders"
  | "feedbackRequests";

export type AutonomySettings = {
  fullyAutomaticWithinLimits: boolean;
  autoRepair: boolean;
  autoAdvanceGenerations: boolean;
  maxAutomaticSpendPerJobMicros: number;
  maxAutomaticSpendPerRepairMicros: number;
  maxAttemptsPerStep: number;
  allowedModelFamilies: string[];
  autoSend: Record<AutoSendKey, boolean>;
  finalDeliveryRequiresApproval: boolean;
  alwaysPause: {
    likenessOrVoice: boolean;
    unclearOwnership: boolean;
    factualClaims: boolean;
    exactPackagingOrRegulatedCopy: boolean;
    negativeMargin: boolean;
    missedDeadlineRisk: boolean;
    clientDispute: boolean;
  };
};

export type JobBundle = {
  job: JobRecord;
  client: ClientRecord;
  analyses: StoredAnalysis[];
  workflow: WorkflowRecord | null;
  generations: GenerationRecord[];
  qaReports: QaReport[];
  revisions: RevisionRecord[];
  messages: MessageRecord[];
  audit: AuditRecord[];
  ledger: LedgerEntry[];
  economics: Economics | null;
  mode: { analysis: "mock" | "live"; generation: "mock" | "live" };
  settings: AutonomySettings;
};
