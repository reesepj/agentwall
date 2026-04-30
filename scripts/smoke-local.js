#!/usr/bin/env node

const baseUrl = (process.env.AGENTWALL_URL || process.argv[2] || "http://127.0.0.1:3000").replace(/\/$/, "");

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}: ${JSON.stringify(body)}`);
  }

  return body;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }
}

function evaluatePayload(overrides) {
  return {
    agentId: "agentwall-smoke",
    sessionId: "agentwall-smoke-session",
    plane: "network",
    action: "http_request",
    payload: { url: "https://api.openai.com/v1/models" },
    actor: { channelId: "cli:smoke", userId: "local-smoke", roleIds: ["operator"] },
    control: { executionMode: "normal" },
    provenance: [{ source: "user", trustLabel: "trusted" }],
    flow: {
      direction: "egress",
      labels: ["external_egress"],
      highRisk: false,
      crossesBoundary: true,
    },
    ...overrides,
  };
}

async function main() {
  console.log(`Agentwall smoke target: ${baseUrl}`);

  const health = await request("/health");
  assertEqual(health.status, "ok", "/health status");
  assertEqual(health.service, "agentwall", "/health service");
  console.log("✓ health ok");

  const allowed = await request("/evaluate", {
    method: "POST",
    body: JSON.stringify(evaluatePayload({
      payload: { url: "https://api.openai.com/v1/models" },
    })),
  });
  assertEqual(allowed.decision, "allow", "approved API egress decision");
  console.log("✓ approved API egress allowed");

  const privateRange = await request("/evaluate", {
    method: "POST",
    body: JSON.stringify(evaluatePayload({
      payload: { url: "http://169.254.169.254/latest/meta-data" },
      flow: {
        direction: "egress",
        labels: ["external_egress", "private_network_target"],
        highRisk: true,
        crossesBoundary: true,
      },
    })),
  });
  assertEqual(privateRange.decision, "deny", "metadata/private-range egress decision");
  console.log("✓ metadata/private-range egress denied");

  console.log("Agentwall local smoke passed");
}

main().catch((error) => {
  console.error(`Agentwall local smoke failed: ${error.message}`);
  process.exit(1);
});
