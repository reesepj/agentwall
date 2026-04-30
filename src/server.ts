import Fastify, { FastifyInstance } from "fastify";
import { PolicyEngine } from "./policy/engine";
import { builtinRules } from "./policy/rules";
import { ApprovalGate } from "./approval/gate";
import { healthRoutes } from "./routes/health";
import { policyRoutes } from "./routes/policy";
import { inspectRoutes } from "./routes/inspect";
import { approvalRoutes } from "./routes/approval";
import { registerAuditSink, stdoutSink } from "./audit/logger";
import { AgentwallConfig, defaultRuntimeGuards } from "./config";
import { RuntimeState } from "./dashboard/state";
import { dashboardRoutes } from "./routes/dashboard";
import { uiRoutes } from "./routes/ui";
import { FileBackedPolicyRuntime, ReloadResult } from "./policy/runtime";
import { RuntimeFloodGuard } from "./runtime/floodguard";
import { createDecisionTraceExporter } from "./telemetry/otel";

export interface AgentwallServer {
  app: FastifyInstance;
  engine: PolicyEngine;
  gate: ApprovalGate;
  runtime: RuntimeState;
  policyRuntime?: FileBackedPolicyRuntime;
  reloadPolicy: () => ReloadResult | undefined;
}

export async function buildServer(config: AgentwallConfig): Promise<AgentwallServer> {
  const app = Fastify({
    logger: { level: config.logLevel },
  });

  registerAuditSink(stdoutSink);

  const policyRuntime = config.policy.configPath
    ? new FileBackedPolicyRuntime(config.policy.configPath, { logger: app.log })
    : undefined;
  const engine = new PolicyEngine(
    [...builtinRules, ...(policyRuntime?.getRules() ?? [])],
    config.policy.defaultDecision
  );
  const gate = new ApprovalGate(
    config.approval.mode,
    config.approval.timeoutMs,
    config.approval.backend,
    config.approval.persistencePath,
    {
      webhookUrl: config.approval.webhookUrl,
      logger: app.log,
    }
  );
  const runtime = new RuntimeState(config);
  const floodGuard = new RuntimeFloodGuard(config.runtimeGuards ?? defaultRuntimeGuards);
  const telemetry = createDecisionTraceExporter(config.telemetry, app.log);
  runtime.hydrateApprovalQueue(gate.getPersistedPending());

  const applyReload = (result: ReloadResult) => {
    if (!result.reloaded) {
      return;
    }

    engine.replaceRules([...builtinRules, ...result.rules]);
    app.log.info(
      { policyPath: config.policy.configPath, ruleCount: engine.getRules().length },
      "Reloaded declarative policy rules"
    );
  };

  const reloadPolicy = (): ReloadResult | undefined => {
    if (!policyRuntime) {
      return undefined;
    }

    const result = policyRuntime.reload();
    applyReload(result);
    return result;
  };

  policyRuntime?.start(applyReload);

  app.addHook("onClose", async () => {
    policyRuntime?.stop();
    gate.close();
  });

  await healthRoutes(app);
  await policyRoutes(app, engine, runtime, floodGuard, telemetry);
  await inspectRoutes(app, config, runtime, telemetry);
  await approvalRoutes(app, gate, runtime, floodGuard);
  await dashboardRoutes(app, config, engine, gate, runtime, floodGuard, policyRuntime);
  await uiRoutes(app);

  return { app, engine, gate, runtime, policyRuntime, reloadPolicy };
}
