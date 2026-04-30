import { FastifyInstance } from "fastify";
import { ApprovalGate } from "../approval/gate";
import { ApprovalRequestSchema } from "../types";
import { z } from "zod";
import { RuntimeState } from "../dashboard/state";
import { RuntimeFloodGuard } from "../runtime/floodguard";
import { prioritizePendingApprovals, summarizeApprovalSessionLane } from "../dashboard/approval-queue";

const ApprovalResponseBodySchema = z.object({
  decision: z.enum(["approved", "denied"]),
  approvedBy: z.string().optional(),
  note: z.string().optional(),
});

function buildQueueHandoff(pending: Array<{ requestId?: string; createdAt?: string | number; action?: string; sessionId?: string; agentId?: string; note?: string; reasons?: string[]; riskLevel?: string; matchedRules?: string[] }>) {
  const next = pending[0];
  const nextAgeMinutes = next?.createdAt
    ? Math.max(0, Math.round((Date.now() - new Date(next.createdAt).getTime()) / 60000))
    : null;

  return {
    pendingCount: pending.length,
    criticalCount: pending.filter((item) => item.riskLevel === "critical").length,
    nextRequestId: next?.requestId ?? null,
    nextTarget: next
      ? [next.action ?? "pending approval", next.sessionId ?? next.agentId].filter(Boolean).join(" · ")
      : null,
    nextTargetDetail: next
      ? [next.riskLevel, `waiting ${nextAgeMinutes ?? 0}m`, next.note ?? next.reasons?.[0] ?? "Awaiting analyst disposition"]
          .filter(Boolean)
          .join(" · ")
      : null,
    nextRule: next?.matchedRules?.[0] ?? null,
    nextLane: summarizeApprovalSessionLane(pending),
  };
}

export async function approvalRoutes(app: FastifyInstance, gate: ApprovalGate, runtime: RuntimeState, floodGuard: RuntimeFloodGuard): Promise<void> {
  app.post("/approval/request", async (req, reply) => {
    const parsed = ApprovalRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid request body", details: parsed.error.flatten() });
    }

    const pending = gate.listPending();
    const gateMode = gate.getMode();
    const sessionId = parsed.data.context.sessionId ?? `${parsed.data.context.agentId}:default`;
    const pendingForSession = pending.filter((item) => item.sessionId === sessionId).length;
    const guardResult = floodGuard.approvalRequest(parsed.data, gateMode, pendingForSession, pending.length);
    if (!guardResult.allowed) {
      if (guardResult.retryAfterMs) {
        reply.header("retry-after", String(Math.ceil(guardResult.retryAfterMs / 1000)));
      }
      return reply.status(429).send({
        error: "Runtime guard blocked approval request",
        reason: guardResult.reason,
        retryAfterMs: guardResult.retryAfterMs,
      });
    }

    const { requestId, response, mode } = gate.request(parsed.data);
    runtime.recordApprovalRequested(requestId, parsed.data, mode);
    const resolved = await response;
    if (mode === "auto" || resolved.decision === "timeout") {
      runtime.recordApprovalResolved(requestId, parsed.data, resolved, mode);
    }
    return reply.send(resolved);
  });

  app.get("/approval/pending", async (_req, reply) => {
    return reply.send({ pending: gate.listPending() });
  });

  app.post("/approval/:requestId/respond", async (req, reply) => {
    const { requestId } = req.params as { requestId: string };
    const parsed = ApprovalResponseBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid request body", details: parsed.error.flatten() });
    }

    const { decision, approvedBy, note } = parsed.data;
    const responseGuard = floodGuard.approvalResponse(approvedBy ?? req.ip);
    if (!responseGuard.allowed) {
      if (responseGuard.retryAfterMs) {
        reply.header("retry-after", String(Math.ceil(responseGuard.retryAfterMs / 1000)));
      }
      return reply.status(429).send({
        error: "Runtime guard blocked approval response",
        reason: responseGuard.reason,
        retryAfterMs: responseGuard.retryAfterMs,
      });
    }
    const pendingRequest = gate.getPendingRequest(requestId);
    const response = gate.respond(requestId, decision, approvedBy, note);
    if (!response) {
      return reply.status(404).send({ error: "Approval request not found or already resolved" });
    }
    runtime.recordApprovalResolved(requestId, pendingRequest, response, "manual");

    const remainingQueue = gate.listPending().map((item) => {
      const request = gate.getPendingRequest(item.requestId);
      return {
        ...item,
        note: request?.policyResult.reasons?.[0],
        reasons: request?.policyResult.reasons,
        riskLevel: request?.policyResult.riskLevel,
        matchedRules: request?.policyResult.matchedRules,
      };
    });
    const prioritizedRemainingQueue = prioritizePendingApprovals(remainingQueue, floodGuard.getTelemetrySnapshot());

    return reply.send({
      ok: true,
      queue: buildQueueHandoff(prioritizedRemainingQueue),
    });
  });
}
