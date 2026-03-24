import { FastifyInstance } from "fastify";
import { ApprovalGate } from "../approval/gate";
import { ApprovalRequestSchema } from "../types";
import { z } from "zod";
import { RuntimeState } from "../dashboard/state";

const ApprovalResponseBodySchema = z.object({
  decision: z.enum(["approved", "denied"]),
  approvedBy: z.string().optional(),
  note: z.string().optional(),
});

export async function approvalRoutes(app: FastifyInstance, gate: ApprovalGate, runtime: RuntimeState): Promise<void> {
  app.post("/approval/request", async (req, reply) => {
    const parsed = ApprovalRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid request body", details: parsed.error.flatten() });
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
    const pendingRequest = gate.getPendingRequest(requestId);
    const response = gate.respond(requestId, decision, approvedBy, note);
    if (!response) {
      return reply.status(404).send({ error: "Approval request not found or already resolved" });
    }
    runtime.recordApprovalResolved(requestId, pendingRequest, response, "manual");

    return reply.send({ ok: true });
  });
}
