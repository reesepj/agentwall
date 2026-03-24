import { FastifyInstance } from "fastify";
import { PolicyEngine } from "../policy/engine";
import { AgentContextSchema } from "../types";
import { emit } from "../audit/logger";
import { RuntimeState } from "../dashboard/state";
import { detectionCatalog } from "../policy/detections";

export async function policyRoutes(app: FastifyInstance, engine: PolicyEngine, runtime: RuntimeState): Promise<void> {
  app.post("/evaluate", async (req, reply) => {
    const parsed = AgentContextSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid request body", details: parsed.error.flatten() });
    }

    const ctx = parsed.data;
    const session = runtime.getSessionState(ctx.sessionId ?? `${ctx.agentId}:default`);
    if (session?.status === "paused" || session?.status === "terminated") {
      const reason = `Session ${session.sessionId} is ${session.status}; operator intervention required`;
      runtime.recordSessionRejection(ctx, reason);
      return reply.status(session.status === "terminated" ? 403 : 423).send({
        error: "Session blocked",
        sessionId: session.sessionId,
        sessionStatus: session.status,
        reason,
      });
    }

    const result = engine.evaluate(ctx);
    const auditEvent = emit(ctx, result);
    runtime.recordAuditEvent(auditEvent);

    return reply.send({
      decision: result.decision,
      riskLevel: result.riskLevel,
      matchedRules: result.matchedRules,
      reasons: result.reasons,
      requiresApproval: result.requiresApproval,
      highRiskFlow: result.highRiskFlow,
      detections: result.detections,
      auditEventId: auditEvent.id,
    });
  });

  app.get("/detections", async (_req, reply) => {
    return reply.send({ detections: detectionCatalog, count: detectionCatalog.length });
  });

  app.get("/rules", async (_req, reply) => {
    const rules = engine.getRules().map((r) => ({
      id: r.id,
      description: r.description,
      plane: r.plane,
      decision: r.decision,
      riskLevel: r.riskLevel,
    }));
    return reply.send({ rules, count: rules.length });
  });
}
