import { randomUUID } from "crypto";
import { AgentwallConfig } from "../config";
import {
  AgentContext,
  ApprovalRequest,
  ApprovalResponse,
  AuditEvent,
  ContentClassification,
  NetworkInspection,
  NetworkRequest,
  RiskLevel,
  WatchdogState,
} from "../types";
import { HeartbeatWatchdog } from "../watchdog/heartbeat";
import { PersistedPendingApproval } from "../approval/store";

type RuntimeEventCategory =
  | "system"
  | "policy"
  | "approval"
  | "audit"
  | "network"
  | "content"
  | "watchdog"
  | "session";

type RuntimeEventStatus = "ok" | "pending" | "warning" | "critical";
type SessionStatus = "active" | "paused" | "terminated";
type RuntimeFlowStatus = "running" | "waiting" | "blocked" | "completed";
type EvidenceKind = "audit" | "approval" | "inspection" | "provenance" | "watchdog" | "session";

interface RuntimeEvent {
  id: string;
  timestamp: string;
  category: RuntimeEventCategory;
  title: string;
  summary: string;
  status: RuntimeEventStatus;
  riskLevel?: RiskLevel;
  plane?: string;
  agentId?: string;
  sessionId?: string;
  detail?: Record<string, unknown>;
  synthetic?: boolean;
}

interface AgentRuntimeActivity {
  agentId: string;
  lastSeenAt: string;
  lastPlane: string;
  lastAction: string;
  sessionId?: string;
  riskLevel?: RiskLevel;
}

interface SessionRuntime {
  sessionId: string;
  agentId: string;
  startedAt: string;
  lastSeenAt: string;
  lastPlane: string;
  lastAction: string;
  status: SessionStatus;
  riskLevel: RiskLevel;
  note?: string;
  pendingApprovals: number;
  evidenceCount: number;
  taskCount: number;
}

interface ApprovalActivity {
  requestId: string;
  createdAt: string;
  resolvedAt?: string;
  status: "pending" | "approved" | "denied" | "timeout";
  mode: "manual" | "auto";
  agentId: string;
  sessionId: string;
  plane: string;
  action: string;
  riskLevel: RiskLevel;
  reasons: string[];
  note?: string;
  approvedBy?: string;
}

interface OperatorSurfaceItem {
  label: string;
  value: string;
  detail: string;
  status: RuntimeEventStatus;
}

interface PriorityQueueItem {
  id: string;
  category: "approval" | "watchdog" | "provenance" | "session";
  title: string;
  owner: string;
  summary: string;
  status: RuntimeEventStatus;
  timestamp: string;
}

interface RuntimeFlow {
  id: string;
  timestamp: string;
  flowType: "policy" | "approval" | "inspection" | "session";
  status: RuntimeFlowStatus;
  agentId: string;
  sessionId: string;
  plane: string;
  action: string;
  direction: string;
  target: string;
  summary: string;
  riskLevel: RiskLevel;
  decision?: string;
  labels: string[];
  crossesBoundary: boolean;
}

interface EvidenceRecord {
  id: string;
  timestamp: string;
  kind: EvidenceKind;
  title: string;
  summary: string;
  riskLevel: RiskLevel;
  status: RuntimeEventStatus;
  agentId: string;
  sessionId: string;
  plane: string;
  linkedObjectId: string;
  attributes: Record<string, string>;
  relatedTaskIds: string[];
}

interface TaskNode {
  id: string;
  sessionId: string;
  agentId: string;
  plane: string;
  action: string;
  title: string;
  summary: string;
  status: "active" | "blocked" | "completed";
  riskLevel: RiskLevel;
  createdAt: string;
  updatedAt: string;
  evidenceIds: string[];
}

interface TaskEdge {
  from: string;
  to: string;
  relationship: "precedes" | "evidenced_by";
}

interface DrilldownPayload {
  kind: "session" | "approval" | "evidence" | "task" | "agent";
  id: string;
  title: string;
  status: string;
  summary: string;
  facts: Array<{ label: string; value: string }>;
  timeline: Array<{ timestamp: string; title: string; summary: string; status: string }>;
  related: {
    sessions: SessionRuntime[];
    approvals: ApprovalActivity[];
    evidence: EvidenceRecord[];
    tasks: TaskNode[];
  };
}

const MAX_FEED_ITEMS = 160;
const MAX_GRAPH_ITEMS = 120;

function limit<T>(items: T[], max = MAX_FEED_ITEMS): T[] {
  return items.slice(0, max);
}

function scoreRisk(level: RiskLevel): number {
  switch (level) {
    case "critical":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    default:
      return 1;
  }
}

function toStatus(level: RiskLevel): RuntimeEventStatus {
  if (level === "critical") return "critical";
  if (level === "high") return "warning";
  return "ok";
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const bucket = key(item);
    counts[bucket] = (counts[bucket] ?? 0) + 1;
  }
  return counts;
}

function defaultSessionId(agentId: string): string {
  return `${agentId}:default`;
}

function summarizeTarget(target: unknown): string {
  if (typeof target === "string" && target.length > 0) return target;
  if (target && typeof target === "object") {
    const maybeTarget = (target as Record<string, unknown>)["url"] ?? (target as Record<string, unknown>)["target"];
    if (typeof maybeTarget === "string" && maybeTarget.length > 0) return maybeTarget;
  }
  return "control-plane";
}

export class RuntimeState {
  private readonly startedAt = new Date();
  private readonly config: AgentwallConfig;
  private readonly watchdog: HeartbeatWatchdog;
  private readonly events: RuntimeEvent[] = [];
  private readonly auditEvents: AuditEvent[] = [];
  private readonly approvals: ApprovalActivity[] = [];
  private readonly agentActivity = new Map<string, AgentRuntimeActivity>();
  private readonly sessions = new Map<string, SessionRuntime>();
  private readonly runtimeFlows: RuntimeFlow[] = [];
  private readonly evidence: EvidenceRecord[] = [];
  private readonly tasks = new Map<string, TaskNode>();
  private readonly taskEdges: TaskEdge[] = [];
  private readonly lastTaskForSession = new Map<string, string>();
  private approvalMode: AgentwallConfig["approval"]["mode"];
  private totalRequests = 0;

  constructor(config: AgentwallConfig) {
    this.config = config;
    this.approvalMode = config.approval.mode;
    this.watchdog = new HeartbeatWatchdog(config.watchdog);
    this.seedRuntime();
  }

  recordAuditEvent(event: AuditEvent): void {
    this.auditEvents.unshift(event);
    this.totalRequests += 1;
    const sessionId = event.sessionId ?? defaultSessionId(event.agentId);
    this.observeAgent(event.agentId, event.plane, event.action, event.timestamp, sessionId, event.riskLevel);
    this.observeSession({
      sessionId,
      agentId: event.agentId,
      plane: event.plane,
      action: event.action,
      timestamp: event.timestamp,
      riskLevel: event.riskLevel,
    });

    const task = this.upsertTask({
      sessionId,
      agentId: event.agentId,
      plane: event.plane,
      action: event.action,
      timestamp: event.timestamp,
      riskLevel: event.riskLevel,
      status: event.decision === "deny" ? "blocked" : "completed",
      summary: event.reasons[0] ?? "Policy evaluation recorded",
    });
    const evidence = this.addEvidence({
      kind: event.highRiskFlow ? "provenance" : "audit",
      title: `${event.plane} policy ${event.decision}`,
      summary: event.reasons[0] ?? "Policy evaluation recorded",
      timestamp: event.timestamp,
      riskLevel: event.riskLevel,
      status: event.requiresApproval ? "pending" : toStatus(event.riskLevel),
      agentId: event.agentId,
      sessionId,
      plane: event.plane,
      linkedObjectId: event.id,
      attributes: {
        decision: event.decision,
        rules: String(event.matchedRules.length),
        approval: event.requiresApproval ? "required" : "not_required",
      },
      relatedTaskIds: [task.id],
    });
    this.linkEvidenceToTask(task.id, evidence.id);
    this.recordFlow({
      timestamp: event.timestamp,
      flowType: "policy",
      status: event.requiresApproval ? "waiting" : event.decision === "deny" ? "blocked" : "completed",
      agentId: event.agentId,
      sessionId,
      plane: event.plane,
      action: event.action,
      direction: event.flow?.direction ?? "internal",
      target: event.flow?.target ?? "policy-engine",
      summary: event.reasons[0] ?? "Policy evaluation recorded",
      riskLevel: event.riskLevel,
      decision: event.decision,
      labels: [
        ...(event.flow?.labels ?? []),
        ...(event.provenance?.map((entry) => `${entry.source}:${entry.trustLabel}`) ?? []),
      ],
      crossesBoundary: event.flow?.crossesBoundary ?? false,
    });
    this.pushEvent({
      id: event.id,
      timestamp: event.timestamp,
      category: "policy",
      title: `${event.plane} decision · ${event.decision.toUpperCase()}`,
      summary: event.reasons[0] ?? "Policy evaluation recorded",
      status: event.requiresApproval ? "pending" : toStatus(event.riskLevel),
      riskLevel: event.riskLevel,
      plane: event.plane,
      agentId: event.agentId,
      sessionId,
      detail: {
        action: event.action,
        matchedRules: event.matchedRules,
        requiresApproval: event.requiresApproval,
        highRiskFlow: event.highRiskFlow,
        taskId: task.id,
        evidenceId: evidence.id,
      },
    });
  }

  recordApprovalRequested(requestId: string, request: ApprovalRequest, mode: "manual" | "auto"): void {
    const createdAt = new Date().toISOString();
    const sessionId = request.context.sessionId ?? defaultSessionId(request.context.agentId);
    const activity: ApprovalActivity = {
      requestId,
      createdAt,
      status: mode === "auto" ? "approved" : "pending",
      mode,
      agentId: request.context.agentId,
      sessionId,
      plane: request.context.plane,
      action: request.context.action,
      riskLevel: request.policyResult.riskLevel,
      reasons: request.policyResult.reasons,
    };

    if (mode === "auto") {
      activity.resolvedAt = createdAt;
      activity.note = "Auto-approved by gate mode or policy";
      activity.approvedBy = "agentwall-auto";
    }

    this.approvals.unshift(activity);
    this.observeAgent(request.context.agentId, request.context.plane, request.context.action, createdAt, sessionId, request.policyResult.riskLevel);
    this.observeSession({
      sessionId,
      agentId: request.context.agentId,
      plane: request.context.plane,
      action: request.context.action,
      timestamp: createdAt,
      riskLevel: request.policyResult.riskLevel,
    });
    this.updateSessionApprovalCount(sessionId);
    const task = this.upsertTask({
      sessionId,
      agentId: request.context.agentId,
      plane: request.context.plane,
      action: request.context.action,
      timestamp: createdAt,
      riskLevel: request.policyResult.riskLevel,
      status: mode === "auto" ? "completed" : "active",
      summary: request.policyResult.reasons[0] ?? "Approval request created",
    });
    const evidence = this.addEvidence({
      kind: "approval",
      title: mode === "auto" ? "Approval auto-resolved" : "Approval queued",
      summary: `${request.context.action} · ${request.policyResult.reasons[0] ?? "Awaiting operator action"}`,
      timestamp: createdAt,
      riskLevel: request.policyResult.riskLevel,
      status: mode === "auto" ? "ok" : "pending",
      agentId: request.context.agentId,
      sessionId,
      plane: request.context.plane,
      linkedObjectId: requestId,
      attributes: {
        mode,
        reasons: String(request.policyResult.reasons.length),
      },
      relatedTaskIds: [task.id],
    });
    this.linkEvidenceToTask(task.id, evidence.id);
    this.recordFlow({
      timestamp: createdAt,
      flowType: "approval",
      status: mode === "auto" ? "completed" : "waiting",
      agentId: request.context.agentId,
      sessionId,
      plane: request.context.plane,
      action: request.context.action,
      direction: request.context.flow?.direction ?? "internal",
      target: "approval-gate",
      summary: request.policyResult.reasons[0] ?? "Approval request created",
      riskLevel: request.policyResult.riskLevel,
      decision: mode === "auto" ? "approved" : "pending",
      labels: request.context.flow?.labels ?? [],
      crossesBoundary: request.context.flow?.crossesBoundary ?? false,
    });
    this.pushEvent({
      id: randomUUID(),
      timestamp: createdAt,
      category: "approval",
      title: mode === "auto" ? "Approval auto-resolved" : "Approval queued",
      summary: `${request.context.agentId} · ${request.context.action}`,
      status: mode === "auto" ? "ok" : "pending",
      riskLevel: request.policyResult.riskLevel,
      plane: request.context.plane,
      agentId: request.context.agentId,
      sessionId,
      detail: {
        requestId,
        reasons: request.policyResult.reasons,
        mode,
        taskId: task.id,
        evidenceId: evidence.id,
      },
    });
  }

  hydrateApprovalQueue(entries: PersistedPendingApproval[]): void {
    for (const entry of entries.sort((left, right) => right.createdAt - left.createdAt)) {
      if (this.approvals.some((item) => item.requestId === entry.requestId)) {
        continue;
      }

      const createdAt = new Date(entry.createdAt).toISOString();
      const sessionId = entry.request.context.sessionId ?? defaultSessionId(entry.request.context.agentId);
      this.approvals.unshift({
        requestId: entry.requestId,
        createdAt,
        status: "pending",
        mode: "manual",
        agentId: entry.request.context.agentId,
        sessionId,
        plane: entry.request.context.plane,
        action: entry.request.context.action,
        riskLevel: entry.request.policyResult.riskLevel,
        reasons: entry.request.policyResult.reasons,
      });
      this.observeAgent(
        entry.request.context.agentId,
        entry.request.context.plane,
        entry.request.context.action,
        createdAt,
        sessionId,
        entry.request.policyResult.riskLevel
      );
      this.observeSession({
        sessionId,
        agentId: entry.request.context.agentId,
        plane: entry.request.context.plane,
        action: entry.request.context.action,
        timestamp: createdAt,
        riskLevel: entry.request.policyResult.riskLevel,
      });
      this.updateSessionApprovalCount(sessionId);
    }
  }

  recordApprovalResolved(
    requestId: string,
    request: ApprovalRequest | undefined,
    response: ApprovalResponse,
    mode: "manual" | "auto"
  ): void {
    const entry = this.approvals.find((item) => item.requestId === requestId) ?? (
      request
        ? {
            requestId,
            createdAt: response.timestamp,
            status: "pending" as const,
            mode,
            agentId: request.context.agentId,
            sessionId: request.context.sessionId ?? defaultSessionId(request.context.agentId),
            plane: request.context.plane,
            action: request.context.action,
            riskLevel: request.policyResult.riskLevel,
            reasons: request.policyResult.reasons,
          }
        : undefined
    );

    if (!entry) return;
    if (entry.status === response.decision && entry.resolvedAt === response.timestamp) {
      return;
    }

    entry.status = response.decision;
    entry.resolvedAt = response.timestamp;
    entry.note = response.note;
    entry.approvedBy = response.approvedBy;
    entry.mode = mode;
    this.updateSessionApprovalCount(entry.sessionId);

    const task = this.upsertTask({
      sessionId: entry.sessionId,
      agentId: entry.agentId,
      plane: entry.plane,
      action: entry.action,
      timestamp: response.timestamp,
      riskLevel: entry.riskLevel,
      status: response.decision === "approved" ? "completed" : "blocked",
      summary: response.note ?? response.decision,
    });
    const evidence = this.addEvidence({
      kind: "approval",
      title: `Approval ${response.decision}`,
      summary: response.note ?? `${entry.action} ${response.decision}`,
      timestamp: response.timestamp,
      riskLevel: entry.riskLevel,
      status: response.decision === "approved" ? "ok" : response.decision === "timeout" ? "warning" : "critical",
      agentId: entry.agentId,
      sessionId: entry.sessionId,
      plane: entry.plane,
      linkedObjectId: requestId,
      attributes: {
        approvedBy: response.approvedBy ?? "unassigned",
        mode,
      },
      relatedTaskIds: [task.id],
    });
    this.linkEvidenceToTask(task.id, evidence.id);
    this.recordFlow({
      timestamp: response.timestamp,
      flowType: "approval",
      status: response.decision === "approved" ? "completed" : "blocked",
      agentId: entry.agentId,
      sessionId: entry.sessionId,
      plane: entry.plane,
      action: entry.action,
      direction: "internal",
      target: "approval-gate",
      summary: response.note ?? `Approval ${response.decision}`,
      riskLevel: entry.riskLevel,
      decision: response.decision,
      labels: [],
      crossesBoundary: false,
    });
    this.pushEvent({
      id: randomUUID(),
      timestamp: response.timestamp,
      category: "approval",
      title: `Approval ${response.decision}`,
      summary: `${entry.agentId} · ${entry.action}`,
      status: response.decision === "approved" ? "ok" : response.decision === "timeout" ? "warning" : "critical",
      riskLevel: entry.riskLevel,
      plane: entry.plane,
      agentId: entry.agentId,
      sessionId: entry.sessionId,
      detail: {
        requestId,
        approvedBy: response.approvedBy,
        note: response.note,
        taskId: task.id,
        evidenceId: evidence.id,
      },
    });
  }

  recordNetworkInspection(request: NetworkRequest, result: NetworkInspection): void {
    const timestamp = new Date().toISOString();
    const sessionId = "inspection:network";
    const agentId = "network-probe";
    this.observeSession({
      sessionId,
      agentId,
      plane: "network",
      action: request.method ?? "GET",
      timestamp,
      riskLevel: result.riskLevel,
    });
    const task = this.upsertTask({
      sessionId,
      agentId,
      plane: "network",
      action: request.method ?? "GET",
      timestamp,
      riskLevel: result.riskLevel,
      status: result.allowed ? "completed" : "blocked",
      summary: result.reason,
    });
    const evidence = this.addEvidence({
      kind: "inspection",
      title: result.allowed ? "Egress permitted" : "Egress blocked",
      summary: request.url,
      timestamp,
      riskLevel: result.riskLevel,
      status: result.allowed ? "ok" : result.ssrf || result.privateRange ? "critical" : "warning",
      agentId,
      sessionId,
      plane: "network",
      linkedObjectId: request.url,
      attributes: {
        reason: result.reason,
        category: result.blockedCategory ?? "none",
      },
      relatedTaskIds: [task.id],
    });
    this.linkEvidenceToTask(task.id, evidence.id);
    this.recordFlow({
      timestamp,
      flowType: "inspection",
      status: result.allowed ? "completed" : "blocked",
      agentId,
      sessionId,
      plane: "network",
      action: request.method ?? "GET",
      direction: "egress",
      target: request.url,
      summary: result.reason,
      riskLevel: result.riskLevel,
      decision: result.allowed ? "allow" : "deny",
      labels: [result.blockedCategory ?? "inspection"],
      crossesBoundary: true,
    });
    this.pushEvent({
      id: randomUUID(),
      timestamp,
      category: "network",
      title: result.allowed ? "Egress permitted" : "Egress blocked",
      summary: request.url,
      status: result.allowed ? "ok" : result.ssrf || result.privateRange ? "critical" : "warning",
      riskLevel: result.riskLevel,
      plane: "network",
      agentId,
      sessionId,
      detail: {
        method: request.method ?? "GET",
        reason: result.reason,
        blockedCategory: result.blockedCategory,
        ssrf: result.ssrf,
        privateRange: result.privateRange,
        taskId: task.id,
        evidenceId: evidence.id,
      },
    });
  }

  recordContentInspection(sourceText: string, result: ContentClassification): void {
    const timestamp = new Date().toISOString();
    const sessionId = "inspection:content";
    const agentId = "content-probe";
    this.observeSession({
      sessionId,
      agentId,
      plane: "content",
      action: "inspect_content",
      timestamp,
      riskLevel: result.riskLevel,
    });
    const task = this.upsertTask({
      sessionId,
      agentId,
      plane: "content",
      action: "inspect_content",
      timestamp,
      riskLevel: result.riskLevel,
      status: result.containsSecrets ? "blocked" : "completed",
      summary: result.containsSecrets ? "Sensitive content detected" : "Content classified",
    });
    const evidence = this.addEvidence({
      kind: result.containsSecrets || result.containsPII ? "provenance" : "inspection",
      title: result.containsSecrets ? "DLP secret match" : result.containsPII ? "DLP PII match" : "Content scan clean",
      summary: sourceText.slice(0, 96),
      timestamp,
      riskLevel: result.riskLevel,
      status: result.containsSecrets ? "critical" : result.containsPII ? "warning" : "ok",
      agentId,
      sessionId,
      plane: "content",
      linkedObjectId: randomUUID(),
      attributes: {
        secrets: result.secretTypes.join(",") || "none",
        pii: result.piiTypes.join(",") || "none",
        redacted: String(result.redacted),
      },
      relatedTaskIds: [task.id],
    });
    this.linkEvidenceToTask(task.id, evidence.id);
    this.recordFlow({
      timestamp,
      flowType: "inspection",
      status: result.containsSecrets ? "blocked" : "completed",
      agentId,
      sessionId,
      plane: "content",
      action: "inspect_content",
      direction: "ingress",
      target: "dlp-engine",
      summary: result.containsSecrets ? "Secret material detected" : result.containsPII ? "PII classified" : "Content clean",
      riskLevel: result.riskLevel,
      decision: result.redacted ? "redact" : "allow",
      labels: result.labels,
      crossesBoundary: false,
    });
    this.pushEvent({
      id: randomUUID(),
      timestamp,
      category: "content",
      title: result.containsSecrets ? "DLP secret match" : result.containsPII ? "DLP PII match" : "Content scan clean",
      summary: sourceText.slice(0, 96),
      status: result.containsSecrets ? "critical" : result.containsPII ? "warning" : "ok",
      riskLevel: result.riskLevel,
      plane: "content",
      agentId,
      sessionId,
      detail: {
        source: result.source,
        trustLabel: result.trustLabel,
        labels: result.labels,
        secretTypes: result.secretTypes,
        piiTypes: result.piiTypes,
        taskId: task.id,
        evidenceId: evidence.id,
      },
    });
  }

  updateApprovalMode(mode: AgentwallConfig["approval"]["mode"]): void {
    if (this.approvalMode === mode) return;
    this.approvalMode = mode;
    this.pushEvent({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      category: "system",
      title: "Approval gate mode changed",
      summary: `Approval mode now ${mode}`,
      status: mode === "always" ? "pending" : "ok",
      detail: { mode },
    });
  }

  getApprovalMode(): AgentwallConfig["approval"]["mode"] {
    return this.approvalMode;
  }

  getSessionState(sessionId?: string): SessionRuntime | undefined {
    if (!sessionId) return undefined;
    return this.sessions.get(sessionId);
  }

  controlSession(sessionId: string, action: "pause" | "resume" | "terminate", note?: string): SessionRuntime | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;

    session.status = action === "pause" ? "paused" : action === "resume" ? "active" : "terminated";
    session.note = note;
    session.lastSeenAt = new Date().toISOString();
    const riskLevel = session.status === "terminated" ? "high" : session.riskLevel;
    const task = this.upsertTask({
      sessionId: session.sessionId,
      agentId: session.agentId,
      plane: session.lastPlane,
      action: `session_${action}`,
      timestamp: session.lastSeenAt,
      riskLevel,
      status: session.status === "active" ? "completed" : "blocked",
      summary: note ?? `Session ${action}`,
    });
    const evidence = this.addEvidence({
      kind: "session",
      title: `Session ${action}`,
      summary: note ?? `${session.sessionId} ${action}d by operator`,
      timestamp: session.lastSeenAt,
      riskLevel,
      status: session.status === "active" ? "ok" : "warning",
      agentId: session.agentId,
      sessionId: session.sessionId,
      plane: session.lastPlane,
      linkedObjectId: session.sessionId,
      attributes: {
        action,
      },
      relatedTaskIds: [task.id],
    });
    this.linkEvidenceToTask(task.id, evidence.id);
    this.recordFlow({
      timestamp: session.lastSeenAt,
      flowType: "session",
      status: session.status === "active" ? "completed" : "blocked",
      agentId: session.agentId,
      sessionId: session.sessionId,
      plane: session.lastPlane,
      action: `session_${action}`,
      direction: "internal",
      target: "runtime-session",
      summary: note ?? `Session ${action}`,
      riskLevel,
      decision: session.status,
      labels: ["operator-control"],
      crossesBoundary: false,
    });
    this.pushEvent({
      id: randomUUID(),
      timestamp: session.lastSeenAt,
      category: "session",
      title: `Session ${action}`,
      summary: `${session.sessionId} · ${session.agentId}`,
      status: session.status === "terminated" ? "critical" : "warning",
      riskLevel,
      plane: session.lastPlane,
      agentId: session.agentId,
      sessionId: session.sessionId,
      detail: {
        note,
        taskId: task.id,
        evidenceId: evidence.id,
      },
    });

    return { ...session };
  }

  recordSessionRejection(context: AgentContext, reason: string): void {
    const timestamp = new Date().toISOString();
    const sessionId = context.sessionId ?? defaultSessionId(context.agentId);
    const status = this.sessions.get(sessionId)?.status ?? "paused";
    this.observeSession({
      sessionId,
      agentId: context.agentId,
      plane: context.plane,
      action: context.action,
      timestamp,
      riskLevel: "high",
    });
    const task = this.upsertTask({
      sessionId,
      agentId: context.agentId,
      plane: context.plane,
      action: context.action,
      timestamp,
      riskLevel: "high",
      status: "blocked",
      summary: reason,
    });
    const evidence = this.addEvidence({
      kind: "session",
      title: "Session blocked by operator control",
      summary: reason,
      timestamp,
      riskLevel: "high",
      status: "critical",
      agentId: context.agentId,
      sessionId,
      plane: context.plane,
      linkedObjectId: sessionId,
      attributes: {
        status,
      },
      relatedTaskIds: [task.id],
    });
    this.linkEvidenceToTask(task.id, evidence.id);
    this.recordFlow({
      timestamp,
      flowType: "session",
      status: "blocked",
      agentId: context.agentId,
      sessionId,
      plane: context.plane,
      action: context.action,
      direction: context.flow?.direction ?? "internal",
      target: summarizeTarget(context.payload),
      summary: reason,
      riskLevel: "high",
      decision: status,
      labels: context.flow?.labels ?? [],
      crossesBoundary: context.flow?.crossesBoundary ?? false,
    });
    this.pushEvent({
      id: randomUUID(),
      timestamp,
      category: "session",
      title: "Session rejected",
      summary: `${context.agentId} · ${reason}`,
      status: "critical",
      riskLevel: "high",
      plane: context.plane,
      agentId: context.agentId,
      sessionId,
      detail: {
        taskId: task.id,
        evidenceId: evidence.id,
      },
    });
  }

  getSnapshot(ruleCount: number) {
    const now = new Date();
    const uptimeMs = now.getTime() - this.startedAt.getTime();
    const recentEvents = this.events.slice(0, 40);
    const recentAudits = this.auditEvents.slice(0, 12);
    const recentApprovals = this.approvals.slice(0, 12);
    const pendingApprovals = this.approvals.filter((item) => item.status === "pending");
    const recentSessions = Array.from(this.sessions.values())
      .sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt))
      .slice(0, 12);
    const promptRiskEvents = this.auditEvents.filter((event) =>
      event.highRiskFlow &&
      (event.provenance?.some((entry) => entry.trustLabel !== "trusted") ?? false)
    ).slice(0, 8);
    const watchdogStates = this.getWatchdogStates(now);
    const riskCounts = countBy(recentEvents.filter((item) => item.riskLevel), (item) => item.riskLevel as string);
    const approvalCounts = countBy(this.approvals.slice(0, 40), (item) => item.status);
    const decisionCounts = countBy(this.auditEvents.slice(0, 50), (item) => item.decision);
    const inspectionEvents = recentEvents.filter((item) => item.category === "network" || item.category === "content").slice(0, 10);
    const policyHotspots = Object.entries(
      countBy(
        this.auditEvents.flatMap((item) => item.matchedRules.map((ruleId) => ({ ruleId }))).slice(0, 200),
        (item) => item.ruleId
      )
    )
      .map(([ruleId, count]) => ({ ruleId, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 6);
    const highestRisk = recentEvents.reduce<RiskLevel>(
      (current, item) => {
        if (!item.riskLevel) return current;
        return scoreRisk(item.riskLevel) > scoreRisk(current) ? item.riskLevel : current;
      },
      "low"
    );
    const sessionCounts = countBy(recentSessions, (item) => item.status);
    const controlMatrix: OperatorSurfaceItem[] = [
      {
        label: "Approval Gate",
        value: this.approvalMode,
        detail: `Timeout ${Math.round(this.config.approval.timeoutMs / 1000)}s · ${pendingApprovals.length} queued`,
        status: this.approvalMode === "always" ? "pending" : "ok",
      },
      {
        label: "Session Control",
        value: `${sessionCounts["active"] ?? 0} active / ${sessionCounts["paused"] ?? 0} paused`,
        detail: `${sessionCounts["terminated"] ?? 0} terminated session(s) retained for audit`,
        status: (sessionCounts["paused"] ?? 0) > 0 || (sessionCounts["terminated"] ?? 0) > 0 ? "warning" : "ok",
      },
      {
        label: "Egress Policy",
        value: this.config.egress.defaultDeny ? "default deny" : "open",
        detail: `${this.config.egress.allowedHosts.length} allowlisted host(s)`,
        status: this.config.egress.enabled ? "ok" : "warning",
      },
      {
        label: "Content Controls",
        value: this.config.dlp.enabled ? "dlp active" : "dlp disabled",
        detail: this.config.dlp.redactSecrets ? "Secret redaction on" : "Secret redaction off",
        status: this.config.dlp.enabled ? "ok" : "warning",
      },
      {
        label: "Evidence Ledger",
        value: `${this.evidence.length} artifacts`,
        detail: `${this.runtimeFlows.length} runtime flow(s) mapped into evidence and task graph`,
        status: this.evidence.length > 0 ? "ok" : "warning",
      },
      {
        label: "Policy Default",
        value: this.config.policy.defaultDecision,
        detail: `${ruleCount} active rule(s) loaded`,
        status: this.config.policy.defaultDecision === "deny" ? "ok" : "warning",
      },
      {
        label: "Watchdog",
        value: this.config.watchdog.killSwitchMode,
        detail: `Stale ${Math.round(this.config.watchdog.staleAfterMs / 1000)}s / timeout ${Math.round(this.config.watchdog.timeoutMs / 1000)}s`,
        status: watchdogStates.some((item) => item.killSwitchEngaged) ? "critical" : this.config.watchdog.enabled ? "ok" : "warning",
      },
    ];
    const priorityQueue: PriorityQueueItem[] = [
      ...pendingApprovals.slice(0, 4).map((item) => ({
        id: item.requestId,
        category: "approval" as const,
        title: `${item.action} awaiting decision`,
        owner: item.agentId,
        summary: `${item.plane} plane · ${item.riskLevel} risk`,
        status: "pending" as const,
        timestamp: item.createdAt,
      })),
      ...recentSessions
        .filter((item) => item.status !== "active")
        .slice(0, 3)
        .map((item) => ({
          id: item.sessionId,
          category: "session" as const,
          title: `${item.sessionId} ${item.status}`,
          owner: item.agentId,
          summary: item.note ?? `${item.lastAction} on ${item.lastPlane}`,
          status: item.status === "terminated" ? "critical" as const : "warning" as const,
          timestamp: item.lastSeenAt,
        })),
      ...watchdogStates
        .filter((item) => item.killSwitchEngaged || item.status === "stale" || item.status === "expired")
        .slice(0, 3)
        .map((item) => ({
          id: `watchdog-${item.agentId}`,
          category: "watchdog" as const,
          title: `${item.agentId} watchdog ${item.status}`,
          owner: item.agentId,
          summary: item.reason,
          status: (item.status === "expired" ? "critical" : "warning") as RuntimeEventStatus,
          timestamp: item.lastHeartbeatAt ?? now.toISOString(),
        })),
      ...promptRiskEvents.slice(0, 3).map((event) => ({
        id: event.id,
        category: "provenance" as const,
        title: `${event.action} crossed trust boundary`,
        owner: event.agentId,
        summary: event.reasons[0] ?? "Untrusted provenance triggered high-risk flow",
        status: (event.riskLevel === "critical" ? "critical" : "warning") as RuntimeEventStatus,
        timestamp: event.timestamp,
      })),
    ]
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
      .slice(0, 8);
    const attentionRequired =
      pendingApprovals.length > 0 ||
      watchdogStates.some((item) => item.killSwitchEngaged) ||
      (riskCounts["critical"] ?? 0) > 0 ||
      (sessionCounts["paused"] ?? 0) > 0;
    const liveActivityEvents = this.events.filter((item) => !item.synthetic);
    const lastLiveEventAt = liveActivityEvents[0]?.timestamp;
    const hasLiveActivity = Boolean(lastLiveEventAt) || this.totalRequests > 0 || this.approvals.length > 0;
    const freshnessWindowMs = Math.max(this.config.watchdog.staleAfterMs, 30_000);
    const activeAgentsNow = Array.from(this.agentActivity.values()).filter((item) => now.getTime() - new Date(item.lastSeenAt).getTime() <= freshnessWindowMs).length;
    const isFresh = !lastLiveEventAt ? false : now.getTime() - new Date(lastLiveEventAt).getTime() <= freshnessWindowMs;
    const operatorSummary = !hasLiveActivity
      ? "Awaiting first live agent activity. Policy and controls are loaded."
      : attentionRequired
        ? `${pendingApprovals.length} approval(s) open, ${(riskCounts["critical"] ?? 0) + (sessionCounts["terminated"] ?? 0)} critical signal(s), ${sessionCounts["paused"] ?? 0} session(s) paused.`
        : `No open approvals, no critical runtime signals, all tracked sessions active.`;

    return {
      brand: "Agentwall",
      generatedAt: now.toISOString(),
      service: {
        status: watchdogStates.some((item) => item.killSwitchEngaged) ? "degraded" : "operational",
        attentionRequired,
        operatorSummary,
        uptimeMs,
        startedAt: this.startedAt.toISOString(),
        host: this.config.host,
        port: this.config.port,
        logLevel: this.config.logLevel,
      },
      posture: {
        highestRisk,
        totalRequests: this.totalRequests,
        activeAgents: this.agentActivity.size,
        activeAgentsNow,
        pendingApprovals: pendingApprovals.length,
        criticalSignals: (riskCounts["critical"] ?? 0) + (approvalCounts["denied"] ?? 0) + (sessionCounts["terminated"] ?? 0),
        approvalRate:
          recentApprovals.length === 0
            ? 100
            : Math.round(((approvalCounts["approved"] ?? 0) / recentApprovals.length) * 100),
      },
      controls: {
        defaultDecision: this.config.policy.defaultDecision,
        approvalMode: this.approvalMode,
        dlpEnabled: this.config.dlp.enabled,
        redactSecrets: this.config.dlp.redactSecrets,
        egress: this.config.egress,
        watchdog: this.config.watchdog,
      },
      health: {
        watchdogStates,
        allowlistedHosts: this.config.egress.allowedHosts,
        ruleCount,
      },
      freshness: {
        hasLiveActivity,
        isFresh,
        lastLiveEventAt: lastLiveEventAt ?? null,
        freshnessWindowMs,
      },
      stats: {
        riskCounts,
        approvalCounts,
        decisionCounts,
        planeCounts: countBy(this.auditEvents.slice(0, 50), (item) => item.plane),
        sessionCounts,
      },
      controlMatrix,
      priorityQueue,
      policyHotspots,
      approvals: {
        pending: pendingApprovals,
        recent: recentApprovals,
      },
      sessions: {
        recent: recentSessions,
      },
      runtimeFlows: this.runtimeFlows.slice(0, 12),
      evidenceLedger: this.evidence.slice(0, 12),
      taskGraph: {
        nodes: Array.from(this.tasks.values())
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
          .slice(0, 10),
        edges: this.taskEdges.slice(0, 20),
      },
      auditFeed: recentAudits,
      eventFeed: recentEvents,
      inspectionActivity: inspectionEvents,
      promptRiskEvents: promptRiskEvents.map((event) => ({
        id: event.id,
        timestamp: event.timestamp,
        agentId: event.agentId,
        sessionId: event.sessionId ?? defaultSessionId(event.agentId),
        action: event.action,
        plane: event.plane,
        decision: event.decision,
        riskLevel: event.riskLevel,
        summary: event.reasons[0] ?? "High-risk untrusted provenance event",
      })),
      activeAgents: Array.from(this.agentActivity.values()).sort((left, right) =>
        right.lastSeenAt.localeCompare(left.lastSeenAt)
      ),
    };
  }

  getDrilldown(kind: DrilldownPayload["kind"], id: string): DrilldownPayload | undefined {
    if (kind === "session") {
      const session = this.sessions.get(id);
      if (!session) return undefined;
      return {
        kind,
        id,
        title: `${session.agentId} · ${session.sessionId}`,
        status: session.status,
        summary: session.note ?? `${session.lastAction} on ${session.lastPlane}`,
        facts: [
          { label: "Risk", value: session.riskLevel },
          { label: "Plane", value: session.lastPlane },
          { label: "Pending approvals", value: String(session.pendingApprovals) },
          { label: "Evidence", value: String(session.evidenceCount) },
        ],
        timeline: this.events
          .filter((item) => item.sessionId === id)
          .slice(0, 8)
          .map((item) => ({ timestamp: item.timestamp, title: item.title, summary: item.summary, status: item.status })),
        related: {
          sessions: [session],
          approvals: this.approvals.filter((item) => item.sessionId === id).slice(0, 6),
          evidence: this.evidence.filter((item) => item.sessionId === id).slice(0, 6),
          tasks: Array.from(this.tasks.values()).filter((item) => item.sessionId === id).slice(0, 6),
        },
      };
    }

    if (kind === "approval") {
      const approval = this.approvals.find((item) => item.requestId === id);
      if (!approval) return undefined;
      return {
        kind,
        id,
        title: `${approval.agentId} · ${approval.action}`,
        status: approval.status,
        summary: approval.note ?? approval.reasons[0] ?? "Approval activity",
        facts: [
          { label: "Plane", value: approval.plane },
          { label: "Session", value: approval.sessionId },
          { label: "Mode", value: approval.mode },
          { label: "Risk", value: approval.riskLevel },
        ],
        timeline: this.events
          .filter((item) => item.detail?.["requestId"] === id)
          .slice(0, 8)
          .map((item) => ({ timestamp: item.timestamp, title: item.title, summary: item.summary, status: item.status })),
        related: {
          sessions: this.sessions.has(approval.sessionId) ? [this.sessions.get(approval.sessionId) as SessionRuntime] : [],
          approvals: [approval],
          evidence: this.evidence.filter((item) => item.linkedObjectId === id).slice(0, 6),
          tasks: Array.from(this.tasks.values()).filter((item) => item.sessionId === approval.sessionId && item.action === approval.action).slice(0, 6),
        },
      };
    }

    if (kind === "evidence") {
      const evidence = this.evidence.find((item) => item.id === id);
      if (!evidence) return undefined;
      return {
        kind,
        id,
        title: evidence.title,
        status: evidence.status,
        summary: evidence.summary,
        facts: [
          { label: "Kind", value: evidence.kind },
          { label: "Plane", value: evidence.plane },
          { label: "Risk", value: evidence.riskLevel },
          { label: "Session", value: evidence.sessionId },
        ],
        timeline: this.events
          .filter((item) => item.detail?.["evidenceId"] === id || item.id === evidence.linkedObjectId)
          .slice(0, 8)
          .map((item) => ({ timestamp: item.timestamp, title: item.title, summary: item.summary, status: item.status })),
        related: {
          sessions: this.sessions.has(evidence.sessionId) ? [this.sessions.get(evidence.sessionId) as SessionRuntime] : [],
          approvals: this.approvals.filter((item) => item.requestId === evidence.linkedObjectId).slice(0, 6),
          evidence: [evidence],
          tasks: Array.from(this.tasks.values()).filter((item) => evidence.relatedTaskIds.includes(item.id)).slice(0, 6),
        },
      };
    }

    if (kind === "task") {
      const task = this.tasks.get(id);
      if (!task) return undefined;
      return {
        kind,
        id,
        title: task.title,
        status: task.status,
        summary: task.summary,
        facts: [
          { label: "Plane", value: task.plane },
          { label: "Action", value: task.action },
          { label: "Risk", value: task.riskLevel },
          { label: "Evidence", value: String(task.evidenceIds.length) },
        ],
        timeline: this.events
          .filter((item) => item.detail?.["taskId"] === id)
          .slice(0, 8)
          .map((item) => ({ timestamp: item.timestamp, title: item.title, summary: item.summary, status: item.status })),
        related: {
          sessions: this.sessions.has(task.sessionId) ? [this.sessions.get(task.sessionId) as SessionRuntime] : [],
          approvals: this.approvals.filter((item) => item.sessionId === task.sessionId && item.action === task.action).slice(0, 6),
          evidence: this.evidence.filter((item) => item.relatedTaskIds.includes(id)).slice(0, 6),
          tasks: [task],
        },
      };
    }

    const agent = this.agentActivity.get(id);
    if (!agent) return undefined;
    return {
      kind: "agent",
      id,
      title: id,
      status: "active",
      summary: `${agent.lastAction} on ${agent.lastPlane}`,
      facts: [
        { label: "Last seen", value: agent.lastSeenAt },
        { label: "Plane", value: agent.lastPlane },
        { label: "Session", value: agent.sessionId ?? "none" },
        { label: "Risk", value: agent.riskLevel ?? "low" },
      ],
      timeline: this.events
        .filter((item) => item.agentId === id)
        .slice(0, 8)
        .map((item) => ({ timestamp: item.timestamp, title: item.title, summary: item.summary, status: item.status })),
      related: {
        sessions: Array.from(this.sessions.values()).filter((item) => item.agentId === id).slice(0, 6),
        approvals: this.approvals.filter((item) => item.agentId === id).slice(0, 6),
        evidence: this.evidence.filter((item) => item.agentId === id).slice(0, 6),
        tasks: Array.from(this.tasks.values()).filter((item) => item.agentId === id).slice(0, 6),
      },
    };
  }

  private getWatchdogStates(now: Date): WatchdogState[] {
    const agents = Array.from(this.agentActivity.values());
    if (agents.length === 0) {
      return [
        this.watchdog.evaluate("control-plane", now, now),
      ];
    }

    return agents.map((agent) =>
      this.watchdog.evaluate(agent.agentId, new Date(agent.lastSeenAt), now)
    );
  }

  private observeAgent(
    agentId: string,
    plane: string,
    action: string,
    timestamp: string,
    sessionId?: string,
    riskLevel?: RiskLevel
  ): void {
    this.agentActivity.set(agentId, {
      agentId,
      lastSeenAt: timestamp,
      lastPlane: plane,
      lastAction: action,
      sessionId,
      riskLevel,
    });
  }

  private observeSession(input: {
    sessionId: string;
    agentId: string;
    plane: string;
    action: string;
    timestamp: string;
    riskLevel: RiskLevel;
  }): SessionRuntime {
    const session = this.sessions.get(input.sessionId) ?? {
      sessionId: input.sessionId,
      agentId: input.agentId,
      startedAt: input.timestamp,
      lastSeenAt: input.timestamp,
      lastPlane: input.plane,
      lastAction: input.action,
      status: "active" as const,
      riskLevel: input.riskLevel,
      pendingApprovals: 0,
      evidenceCount: 0,
      taskCount: 0,
    };
    session.agentId = input.agentId;
    session.lastSeenAt = input.timestamp;
    session.lastPlane = input.plane;
    session.lastAction = input.action;
    if (scoreRisk(input.riskLevel) > scoreRisk(session.riskLevel)) {
      session.riskLevel = input.riskLevel;
    }
    this.sessions.set(input.sessionId, session);
    return session;
  }

  private updateSessionApprovalCount(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.pendingApprovals = this.approvals.filter((item) => item.sessionId === sessionId && item.status === "pending").length;
  }

  private recordFlow(flow: Omit<RuntimeFlow, "id">): RuntimeFlow {
    const record: RuntimeFlow = { id: randomUUID(), ...flow };
    this.runtimeFlows.unshift(record);
    this.runtimeFlows.splice(MAX_GRAPH_ITEMS);
    return record;
  }

  private addEvidence(record: Omit<EvidenceRecord, "id">): EvidenceRecord {
    const evidence: EvidenceRecord = { id: randomUUID(), ...record };
    this.evidence.unshift(evidence);
    this.evidence.splice(MAX_GRAPH_ITEMS);
    const session = this.sessions.get(record.sessionId);
    if (session) session.evidenceCount = this.evidence.filter((item) => item.sessionId === record.sessionId).length;
    return evidence;
  }

  private upsertTask(input: {
    sessionId: string;
    agentId: string;
    plane: string;
    action: string;
    timestamp: string;
    riskLevel: RiskLevel;
    status: TaskNode["status"];
    summary: string;
  }): TaskNode {
    const taskId = `${input.sessionId}:${input.plane}:${input.action}`;
    const existing = this.tasks.get(taskId);
    const task: TaskNode = existing ?? {
      id: taskId,
      sessionId: input.sessionId,
      agentId: input.agentId,
      plane: input.plane,
      action: input.action,
      title: `${input.plane} · ${input.action}`,
      summary: input.summary,
      status: input.status,
      riskLevel: input.riskLevel,
      createdAt: input.timestamp,
      updatedAt: input.timestamp,
      evidenceIds: [],
    };
    task.summary = input.summary;
    task.status = input.status;
    task.updatedAt = input.timestamp;
    if (scoreRisk(input.riskLevel) > scoreRisk(task.riskLevel)) {
      task.riskLevel = input.riskLevel;
    }
    this.tasks.set(taskId, task);
    const previousTaskId = this.lastTaskForSession.get(input.sessionId);
    if (previousTaskId && previousTaskId !== taskId && !this.taskEdges.some((edge) => edge.from === previousTaskId && edge.to === taskId && edge.relationship === "precedes")) {
      this.taskEdges.unshift({ from: previousTaskId, to: taskId, relationship: "precedes" });
      this.taskEdges.splice(MAX_GRAPH_ITEMS);
    }
    this.lastTaskForSession.set(input.sessionId, taskId);
    const session = this.sessions.get(input.sessionId);
    if (session) session.taskCount = Array.from(this.tasks.values()).filter((item) => item.sessionId === input.sessionId).length;
    return task;
  }

  private linkEvidenceToTask(taskId: string, evidenceId: string): void {
    const task = this.tasks.get(taskId);
    if (task && !task.evidenceIds.includes(evidenceId)) {
      task.evidenceIds.unshift(evidenceId);
    }
    if (!this.taskEdges.some((edge) => edge.from === taskId && edge.to === evidenceId && edge.relationship === "evidenced_by")) {
      this.taskEdges.unshift({ from: taskId, to: evidenceId, relationship: "evidenced_by" });
      this.taskEdges.splice(MAX_GRAPH_ITEMS);
    }
  }

  private pushEvent(event: RuntimeEvent): void {
    this.events.unshift(event);
    this.events.splice(MAX_FEED_ITEMS);
    this.auditEvents.splice(MAX_FEED_ITEMS);
    this.approvals.splice(MAX_FEED_ITEMS);
  }

  private seedRuntime(): void {
    const seededAt = new Date().toISOString();
    this.pushEvent({
      id: randomUUID(),
      timestamp: seededAt,
      category: "system",
      title: "Agentwall control plane online",
      summary: `Approval mode ${this.approvalMode}; default policy ${this.config.policy.defaultDecision}`,
      status: "ok",
      detail: {
        host: this.config.host,
        port: this.config.port,
      },
      synthetic: true,
    });
    this.pushEvent({
      id: randomUUID(),
      timestamp: seededAt,
      category: "system",
      title: "Egress and DLP controls loaded",
      summary: `${this.config.egress.allowedHosts.length} allowlisted host(s), redact=${this.config.dlp.redactSecrets}`,
      status: this.config.egress.enabled && this.config.dlp.enabled ? "ok" : "warning",
      synthetic: true,
    });
    this.pushEvent({
      id: randomUUID(),
      timestamp: seededAt,
      category: "watchdog",
      title: "Watchdog policy armed",
      summary: `Kill switch mode ${this.config.watchdog.killSwitchMode}`,
      status: this.config.watchdog.enabled ? "ok" : "warning",
      synthetic: true,
    });
    this.observeSession({
      sessionId: "control-plane",
      agentId: "agentwall-console",
      plane: "governance",
      action: "boot",
      timestamp: seededAt,
      riskLevel: "low",
    });
  }
}
