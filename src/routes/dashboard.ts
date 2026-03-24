import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ApprovalGate } from "../approval/gate";
import { PolicyEngine } from "../policy/engine";
import { RuntimeState } from "../dashboard/state";

const ApprovalModeSchema = z.object({
  mode: z.enum(["auto", "always", "never"]),
});

const SessionControlSchema = z.object({
  action: z.enum(["pause", "resume", "terminate"]),
  note: z.string().optional(),
});

const DrilldownParamsSchema = z.object({
  kind: z.enum(["session", "approval", "evidence", "task", "agent"]),
  id: z.string(),
});

export async function dashboardRoutes(
  app: FastifyInstance,
  engine: PolicyEngine,
  gate: ApprovalGate,
  runtime: RuntimeState
): Promise<void> {
  app.get("/api/dashboard/state", async (_req, reply) => {
    return reply.send(runtime.getSnapshot(engine.getRules().length));
  });

  app.get("/api/dashboard/drilldown/:kind/:id", async (req, reply) => {
    const parsed = DrilldownParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid drilldown request", details: parsed.error.flatten() });
    }

    const result = runtime.getDrilldown(parsed.data.kind, parsed.data.id);
    if (!result) {
      return reply.status(404).send({ error: "Drilldown target not found" });
    }
    return reply.send(result);
  });

  app.post("/api/dashboard/control/approval-mode", async (req, reply) => {
    const parsed = ApprovalModeSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid approval mode body", details: parsed.error.flatten() });
    }

    gate.setMode(parsed.data.mode);
    runtime.updateApprovalMode(parsed.data.mode);
    return reply.send({ ok: true, mode: gate.getMode() });
  });

  app.post("/api/dashboard/control/session/:sessionId", async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string };
    const parsed = SessionControlSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid session control body", details: parsed.error.flatten() });
    }

    const session = runtime.controlSession(sessionId, parsed.data.action, parsed.data.note);
    if (!session) {
      return reply.status(404).send({ error: "Session not found" });
    }

    return reply.send({ ok: true, session });
  });
}
