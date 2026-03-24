import { afterAll, describe, expect, it } from "@jest/globals";
import { buildServer } from "../src/server";
import { AgentwallConfig } from "../src/config";

async function waitForPendingApproval(
  app: Awaited<ReturnType<typeof buildServer>>["app"],
  attempts = 20
): Promise<Array<{ requestId: string }>> {
  for (let index = 0; index < attempts; index += 1) {
    const pendingResponse = await app.inject({ method: "GET", url: "/approval/pending" });
    const pending = pendingResponse.json().pending;
    if (pending.length > 0) {
      return pending;
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  return [];
}

const config: AgentwallConfig = {
  port: 3000,
  host: "127.0.0.1",
  logLevel: "silent",
  approval: {
    mode: "always",
    timeoutMs: 30_000,
    backend: "memory",
  },
  policy: {
    defaultDecision: "deny",
  },
  dlp: {
    enabled: true,
    redactSecrets: true,
  },
  egress: {
    enabled: true,
    defaultDeny: true,
    allowPrivateRanges: false,
    allowedHosts: ["api.openai.com"],
    allowedSchemes: ["https"],
    allowedPorts: [443],
  },
  manifestIntegrity: {
    enabled: true,
  },
  watchdog: {
    enabled: true,
    staleAfterMs: 15_000,
    timeoutMs: 30_000,
    killSwitchMode: "deny_all",
  },
};

describe("Dashboard routes", () => {
  const serverPromise = buildServer(config);

  afterAll(async () => {
    const { app } = await serverPromise;
    await app.close();
  });

  it("serves the Agentwall dashboard shell and seeded runtime state", async () => {
    const { app } = await serverPromise;
    const html = await app.inject({ method: "GET", url: "/" });
    expect(html.statusCode).toBe(200);
    expect(html.body).toContain("Agentwall");
    expect(html.body).toContain("Operator Investigation");

    const stateResponse = await app.inject({ method: "GET", url: "/api/dashboard/state" });
    expect(stateResponse.statusCode).toBe(200);
    const state = stateResponse.json();
    expect(state.brand).toBe("Agentwall");
    expect(state.eventFeed.length).toBeGreaterThan(0);
    expect(Array.isArray(state.runtimeFlows)).toBe(true);
    expect(Array.isArray(state.evidenceLedger)).toBe(true);
    expect(state.freshness.hasLiveActivity).toBe(false);
    expect(state.service.operatorSummary).toContain("Awaiting first live agent activity");
    expect(state.health.watchdogStates[0].status).toBe("healthy");
  });

  it("reflects live policy, inspection, and approval activity", async () => {
    const { app } = await serverPromise;

    await app.inject({
      method: "POST",
      url: "/evaluate",
      payload: {
        agentId: "agent-ops",
        plane: "network",
        action: "http_request",
        payload: { url: "https://api.openai.com/v1/chat/completions" },
        provenance: [{ source: "web", trustLabel: "untrusted" }],
        flow: { direction: "egress", labels: ["external_egress"], highRisk: true, crossesBoundary: true },
      },
    });

    await app.inject({
      method: "POST",
      url: "/inspect/network",
      payload: { url: "http://169.254.169.254/latest/meta-data/" },
    });

    await app.inject({
      method: "POST",
      url: "/inspect/content",
      payload: { text: "Reach me at alice@example.com" },
    });

    const approvalRequest = app.inject({
      method: "POST",
      url: "/approval/request",
      payload: {
        context: {
          agentId: "agent-ops",
          plane: "tool",
          action: "bash_exec",
          payload: { command: "rm -rf /tmp/example" },
        },
        policyResult: {
          decision: "approve",
          riskLevel: "high",
          matchedRules: ["tool:require-approval-shell"],
          reasons: ["Shell execution requires human approval"],
          requiresApproval: true,
          highRiskFlow: false,
        },
      },
    });
    const pending = await waitForPendingApproval(app);
    expect(pending.length).toBeGreaterThan(0);

    await app.inject({
      method: "POST",
      url: `/approval/${pending[0].requestId}/respond`,
      payload: {
        decision: "approved",
        approvedBy: "analyst-1",
        note: "Reviewed in dashboard test",
      },
    });

    const resolvedApproval = await approvalRequest;
    expect(resolvedApproval.statusCode).toBe(200);

    const stateResponse = await app.inject({ method: "GET", url: "/api/dashboard/state" });
    const state = stateResponse.json();

    expect(state.auditFeed.some((item: { agentId: string }) => item.agentId === "agent-ops")).toBe(true);
    expect(state.inspectionActivity.length).toBeGreaterThan(0);
    expect(state.approvals.recent.some((item: { status: string }) => item.status === "approved")).toBe(true);
    expect(state.promptRiskEvents.length).toBeGreaterThan(0);
    expect(state.runtimeFlows.length).toBeGreaterThan(0);
    expect(state.evidenceLedger.length).toBeGreaterThan(0);
    expect(state.taskGraph.nodes.length).toBeGreaterThan(0);
  });

  it("supports operator approval mode changes, session controls, and drilldowns", async () => {
    const { app } = await serverPromise;

    const evaluation = await app.inject({
      method: "POST",
      url: "/evaluate",
      payload: {
        agentId: "agent-session",
        sessionId: "session-42",
        plane: "tool",
        action: "bash_exec",
        payload: { command: "ls -la" },
        provenance: [{ source: "user", trustLabel: "trusted" }],
        flow: { direction: "internal", labels: ["destructive_action"], highRisk: true },
      },
    });
    expect(evaluation.statusCode).toBe(200);

    const modeResponse = await app.inject({
      method: "POST",
      url: "/api/dashboard/control/approval-mode",
      payload: { mode: "never" },
    });
    expect(modeResponse.statusCode).toBe(200);
    expect(modeResponse.json().mode).toBe("never");

    const autoApproval = await app.inject({
      method: "POST",
      url: "/approval/request",
      payload: {
        context: {
          agentId: "agent-session",
          sessionId: "session-42",
          plane: "tool",
          action: "rm_exec",
          payload: { command: "rm -rf /tmp/foo" },
        },
        policyResult: {
          decision: "approve",
          riskLevel: "high",
          matchedRules: ["tool:require-approval-shell"],
          reasons: ["Destructive shell execution requires human approval"],
          requiresApproval: true,
          highRiskFlow: true,
        },
      },
    });
    expect(autoApproval.statusCode).toBe(200);
    expect(autoApproval.json().decision).toBe("approved");

    const sessionControl = await app.inject({
      method: "POST",
      url: "/api/dashboard/control/session/session-42",
      payload: { action: "pause", note: "Hold investigation" },
    });
    expect(sessionControl.statusCode).toBe(200);
    expect(sessionControl.json().session.status).toBe("paused");

    const blockedEval = await app.inject({
      method: "POST",
      url: "/evaluate",
      payload: {
        agentId: "agent-session",
        sessionId: "session-42",
        plane: "tool",
        action: "bash_exec",
        payload: { command: "pwd" },
      },
    });
    expect(blockedEval.statusCode).toBe(423);

    const stateResponse = await app.inject({ method: "GET", url: "/api/dashboard/state" });
    const state = stateResponse.json();
    expect(state.controls.approvalMode).toBe("never");
    expect(state.sessions.recent.some((item: { sessionId: string; status: string }) => item.sessionId === "session-42" && item.status === "paused")).toBe(true);

    const sessionDrilldown = await app.inject({ method: "GET", url: "/api/dashboard/drilldown/session/session-42" });
    expect(sessionDrilldown.statusCode).toBe(200);
    const sessionDetail = sessionDrilldown.json();
    expect(sessionDetail.kind).toBe("session");
    expect(sessionDetail.related.evidence.length).toBeGreaterThan(0);
    expect(sessionDetail.related.tasks.length).toBeGreaterThan(0);
  });
});
