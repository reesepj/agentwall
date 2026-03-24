import { FastifyInstance } from "fastify";
import { inspectNetworkRequest } from "../planes/network/ssrf";
import { classifyContent } from "../planes/identity/dlp";
import { NetworkRequestSchema, ProvenanceSourceSchema, TrustLabelSchema } from "../types";
import { z } from "zod";
import { AgentwallConfig } from "../config";
import { RuntimeState } from "../dashboard/state";

const ContentInspectBodySchema = z.object({
  text: z.string(),
  source: ProvenanceSourceSchema.optional(),
  trustLabel: TrustLabelSchema.optional(),
  redact: z.boolean().optional(),
});

export async function inspectRoutes(app: FastifyInstance, config: AgentwallConfig, runtime: RuntimeState): Promise<void> {
  app.post("/inspect/network", async (req, reply) => {
    const parsed = NetworkRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid request body", details: parsed.error.flatten() });
    }

    const result = inspectNetworkRequest(parsed.data, config.egress);
    runtime.recordNetworkInspection(parsed.data, result);

    return reply.send(result);
  });

  app.post("/inspect/content", async (req, reply) => {
    const parsed = ContentInspectBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid request body", details: parsed.error.flatten() });
    }

    const { text, source = "user", trustLabel, redact = config.dlp.redactSecrets } = parsed.data;
    const result = classifyContent(text, trustLabel, redact, source);
    runtime.recordContentInspection(text, result);

    return reply.send(result);
  });
}
