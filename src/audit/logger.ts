import { randomUUID } from "crypto";
import { AuditEvent, AgentContext, PolicyResult } from "../types";

export type AuditSink = (event: AuditEvent) => void;

const sinks: AuditSink[] = [];

export function registerAuditSink(sink: AuditSink): void {
  if (!sinks.includes(sink)) {
    sinks.push(sink);
  }
}

export function emit(ctx: AgentContext, result: PolicyResult): AuditEvent {
  const event: AuditEvent = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    agentId: ctx.agentId,
    sessionId: ctx.sessionId,
    plane: ctx.plane,
    action: ctx.action,
    decision: result.decision,
    riskLevel: result.riskLevel,
    matchedRules: result.matchedRules,
    reasons: result.reasons,
    requiresApproval: result.requiresApproval,
    highRiskFlow: result.highRiskFlow,
    detections: result.detections,
    metadata: ctx.metadata,
    provenance: ctx.provenance,
    flow: ctx.flow,
  };

  for (const sink of sinks) {
    try {
      sink(event);
    } catch {
      // sinks must not throw
    }
  }

  return event;
}

export function stdoutSink(event: AuditEvent): void {
  process.stdout.write(JSON.stringify({ agentwall_audit: event }) + "\n");
}
