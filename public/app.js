const REFRESH_MS = 5000;

let currentState = null;
let currentDrilldown = null;
let currentDrilldownRef = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatRelative(dateString) {
  const deltaMs = Date.now() - new Date(dateString).getTime();
  const seconds = Math.max(0, Math.round(deltaMs / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return new Date(dateString).toLocaleString();
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(Number(value ?? 0));
}

function statusClass(value) {
  const normalized = String(value).toLowerCase();
  if (["approved", "operational", "healthy", "allow", "ok", "low", "active", "completed", "running"].includes(normalized)) {
    return "status-ok";
  }
  if (["pending", "approve", "manual", "medium", "paused", "waiting"].includes(normalized)) {
    return "status-pending";
  }
  if (["warning", "stale", "redact", "timeout", "degraded", "high"].includes(normalized)) {
    return "status-warning";
  }
  return "status-critical";
}

function setHTML(id, html) {
  const node = document.getElementById(id);
  if (node) node.innerHTML = html;
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

function emptyState(title, message) {
  return `
    <div class="empty">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

function skeletonCard() {
  return `
    <div class="skeleton">
      <div class="skeleton-line short"></div>
      <div class="skeleton-line long" style="margin-top:12px"></div>
      <div class="skeleton-line medium" style="margin-top:10px"></div>
    </div>
  `;
}

function chip(text, kind, attrs = "") {
  return `<button class="chip chip-button ${kind ? `chip-${kind}` : ""}" ${attrs}>${escapeHtml(text)}</button>`;
}

function renderLoading() {
  setText("service-status", "Loading Agentwall console");
  setText("service-summary", "Waiting for live runtime, policy, and approval telemetry.");
  setText("generated-at", "Syncing Agentwall runtime...");
  setHTML("service-badge", `<span class="live-dot"></span> Loading`);
  setHTML("service-facts", `<div class="fact">Polling every ${REFRESH_MS / 1000}s</div>`);
  setHTML("hero-brief", `${skeletonCard()}${skeletonCard()}`);
  [
    "hero-metrics",
    "control-matrix",
    "operator-workbench",
    "priority-queue",
    "system-health",
    "risk-posture",
    "policy-stats",
    "policy-hotspots",
    "approvals",
    "runtime-flows",
    "sessions",
    "evidence-ledger",
    "task-graph",
    "drilldown",
    "audit-feed",
    "inspection-activity",
    "prompt-risk-events",
    "agents",
    "event-feed",
  ].forEach((id) => {
    setHTML(id, `${skeletonCard()}${skeletonCard()}`);
  });
}

function renderMetrics(state) {
  const items = [
    ["Highest Risk", state.posture.highestRisk.toUpperCase(), `${state.posture.criticalSignals} critical signal(s)`],
    ["Requests Evaluated", formatNumber(state.posture.totalRequests), `${state.stats.planeCounts.network ?? 0} network evaluations tracked`],
    ["Open Approvals", formatNumber(state.posture.pendingApprovals), `${escapeHtml(state.controls.approvalMode)} mode`],
    ["Approval Rate", `${state.posture.approvalRate}%`, `${state.approvals.recent.length} recent decision(s)`],
  ];

  setHTML(
    "hero-metrics",
    items
      .map(
        ([label, value, foot]) => `
          <article class="metric">
            <span class="metric-label">${escapeHtml(label)}</span>
            <div class="metric-value">${escapeHtml(value)}</div>
            <div class="metric-foot">${escapeHtml(foot)}</div>
          </article>
        `
      )
      .join("")
  );
}

function renderHero(state) {
  setText("service-status", state.service.status === "operational" ? "Agentwall enforcement steady" : "Agentwall requires operator attention");
  setText("service-summary", state.service.operatorSummary);
  setHTML(
    "service-badge",
    `
      <span class="live-dot"></span>
      <span class="status ${statusClass(state.service.status)}">${escapeHtml(state.service.status)}</span>
    `
  );
  setText("generated-at", `Updated ${formatRelative(state.generatedAt)}`);
  setHTML(
    "service-facts",
    [
      `Uptime ${formatDuration(state.service.uptimeMs)}`,
      `${state.service.host}:${state.service.port}`,
      `${state.health.ruleCount} rules loaded`,
      `${state.controls.egress.allowedHosts.length} allowlisted hosts`,
      state.freshness?.hasLiveActivity
        ? state.freshness?.isFresh
          ? `Live telemetry fresh (${Math.round((state.freshness?.freshnessWindowMs ?? 0) / 1000)}s window)`
          : `Live telemetry stale`
        : "Awaiting first live event",
    ]
      .map((fact) => `<div class="fact">${escapeHtml(fact)}</div>`)
      .join("")
  );
  setHTML(
    "hero-brief",
    `
      <article class="hero-note">
        <strong>Control Mode</strong>
        <p>${escapeHtml(state.controls.approvalMode)} approvals, ${escapeHtml(state.controls.defaultDecision)} by default, watchdog ${escapeHtml(state.controls.watchdog.killSwitchMode)}.</p>
      </article>
      <article class="hero-note">
        <strong>Runtime Scope</strong>
        <p>${formatNumber(state.posture.activeAgentsNow ?? state.posture.activeAgents)} active now (${formatNumber(state.posture.activeAgents)} tracked), ${formatNumber(state.runtimeFlows.length)} mapped flow(s), ${formatNumber(state.evidenceLedger.length)} evidence artifact(s) in live view.</p>
      </article>
    `
  );
}

function renderControlMatrix(state) {
  setHTML(
    "control-matrix",
    state.controlMatrix.length
      ? state.controlMatrix
          .map(
            (item) => `
              <article class="list-card">
                <div class="split">
                  <div>
                    <strong>${escapeHtml(item.label)}</strong>
                    <div class="kv-value">${escapeHtml(item.value)}</div>
                  </div>
                  <span class="status ${statusClass(item.status)}">${escapeHtml(item.status)}</span>
                </div>
                <p>${escapeHtml(item.detail)}</p>
              </article>
            `
          )
          .join("")
      : emptyState("No controls", "Agentwall control posture will appear after configuration is loaded.")
  );
}

function renderOperatorWorkbench(state) {
  const sessions = state.sessions.recent.slice(0, 3);
  setHTML(
    "operator-workbench",
    `
      <article class="list-card">
        <div class="split">
          <div>
            <strong>Approval mode</strong>
            <p>Switch how new approval requests resolve.</p>
          </div>
          <span class="status ${statusClass(state.controls.approvalMode)}">${escapeHtml(state.controls.approvalMode)}</span>
        </div>
        <div class="action-row">
          ${["auto", "always", "never"]
            .map((mode) =>
              chip(
                mode,
                state.controls.approvalMode === mode ? "active" : "neutral",
                `data-approval-mode="${escapeHtml(mode)}"`
              )
            )
            .join("")}
        </div>
      </article>
      ${
        sessions.length
          ? sessions
              .map(
                (session) => `
                  <article class="list-card">
                    <div class="split">
                      <div>
                        <strong>${escapeHtml(session.sessionId)}</strong>
                        <p>${escapeHtml(session.agentId)} · ${escapeHtml(session.lastAction)}</p>
                      </div>
                      <span class="status ${statusClass(session.status)}">${escapeHtml(session.status)}</span>
                    </div>
                    <div class="action-row">
                      ${chip("Pause", "neutral", `data-session-action="pause" data-session-id="${escapeHtml(session.sessionId)}"`)}
                      ${chip("Resume", "neutral", `data-session-action="resume" data-session-id="${escapeHtml(session.sessionId)}"`)}
                      ${chip("Terminate", "critical", `data-session-action="terminate" data-session-id="${escapeHtml(session.sessionId)}"`)}
                      ${chip("Open", "active", `data-drilldown-kind="session" data-drilldown-id="${escapeHtml(session.sessionId)}"`)}
                    </div>
                  </article>
                `
              )
              .join("")
          : emptyState("No tracked sessions", "Session controls appear once live sessions are observed.")
      }
    `
  );
}

function renderPriorityQueue(state) {
  setHTML(
    "priority-queue",
    state.priorityQueue.length
      ? state.priorityQueue
          .map(
            (item) => `
              <article class="queue-card">
                <div class="queue-header">
                  <div>
                    <strong>${escapeHtml(item.title)}</strong>
                    <p>${escapeHtml(item.owner)}</p>
                  </div>
                  <div class="queue-meta">
                    <span class="queue-kind">${escapeHtml(item.category)}</span>
                    <span class="status ${statusClass(item.status)}">${escapeHtml(item.status)}</span>
                  </div>
                </div>
                <p>${escapeHtml(item.summary)}</p>
                <div class="meta">${escapeHtml(formatRelative(item.timestamp))}</div>
              </article>
            `
          )
          .join("")
      : emptyState("Queue clear", "No open approval, watchdog, session, or provenance items currently require operator action.")
  );
}

function renderSystemHealth(state) {
  const watchdog = state.health.watchdogStates
    .map(
      (item) => `
        <article class="health-card">
          <div class="split">
            <div>
              <strong>${escapeHtml(item.agentId)}</strong>
              <p>${escapeHtml(item.reason)}</p>
            </div>
            <span class="status ${statusClass(item.status)}">${escapeHtml(item.status)}</span>
          </div>
          <p class="meta">${item.lastHeartbeatAt ? `Heartbeat ${escapeHtml(formatRelative(item.lastHeartbeatAt))}` : "No heartbeat recorded"}</p>
        </article>
      `
    )
    .join("");

  setHTML(
    "system-health",
    `
      <article class="health-card">
        <div class="split">
          <div>
            <strong>${escapeHtml(state.service.status)}</strong>
            <p>${escapeHtml(state.service.operatorSummary)}</p>
          </div>
          <span class="status ${statusClass(state.service.status)}">${escapeHtml(state.service.status)}</span>
        </div>
        <p class="meta">${escapeHtml(state.service.host)}:${escapeHtml(state.service.port)} · log level ${escapeHtml(state.service.logLevel)}</p>
      </article>
      <article class="health-card">
        <div class="split">
          <div>
            <strong>Egress perimeter</strong>
            <p>${state.controls.egress.defaultDeny ? "Default deny enforced" : "Open egress configuration"} · ${state.health.allowlistedHosts.length} allowlisted host(s)</p>
          </div>
          <span class="status ${statusClass(state.controls.egress.defaultDeny ? "ok" : "warning")}">${state.controls.egress.defaultDeny ? "sealed" : "open"}</span>
        </div>
      </article>
      ${watchdog}
    `
  );
}

function renderRiskPosture(state) {
  const riskEntries = Object.entries(state.stats.riskCounts);
  const total = riskEntries.reduce((sum, [, count]) => sum + count, 0) || 1;
  setHTML(
    "risk-posture",
    riskEntries.length
      ? riskEntries
          .sort((left, right) => right[1] - left[1])
          .map(
            ([level, count]) => `
              <article class="signal">
                <div class="split">
                  <div>
                    <strong>${escapeHtml(level)}</strong>
                    <p>${escapeHtml(`${Math.round((count / total) * 100)}% of recent signals`)}</p>
                  </div>
                  <span class="status ${statusClass(level)}">${escapeHtml(String(count))}</span>
                </div>
                <div class="bar"><span style="width:${Math.max(10, Math.round((count / total) * 100))}%"></span></div>
              </article>
            `
          )
          .join("")
      : emptyState("No risk history", "Risk counters will populate as Agentwall evaluates live requests and inspections.")
  );
}

function renderPolicy(state) {
  const decisionEntries = Object.entries(state.stats.decisionCounts);
  setHTML(
    "policy-stats",
    decisionEntries.length
      ? decisionEntries
          .map(
            ([decision, count]) => `
              <article class="list-card">
                <div class="split">
                  <div>
                    <strong>${escapeHtml(decision)}</strong>
                    <p>${escapeHtml(`${count} decision(s) in recent audit window`)}</p>
                  </div>
                  <span class="status ${statusClass(decision)}">${escapeHtml(String(count))}</span>
                </div>
              </article>
            `
          )
          .join("")
      : emptyState("No decisions", "Policy decision counters will appear after Agentwall processes runtime evaluations.")
  );

  setHTML(
    "policy-hotspots",
    state.policyHotspots.length
      ? state.policyHotspots
          .map(
            (item) => `
              <article class="list-card">
                <div class="split">
                  <div>
                    <strong>${escapeHtml(item.ruleId)}</strong>
                    <p>${escapeHtml(`${item.count} match(es) in recent history`)}</p>
                  </div>
                  <span class="kv-value">${escapeHtml(String(item.count))}</span>
                </div>
              </article>
            `
          )
          .join("")
      : emptyState("No hot rules", "Rule hotspots will appear once traffic starts exercising the policy engine.")
  );
}

function renderApprovals(state) {
  const rows = [...state.approvals.pending, ...state.approvals.recent.filter((item) => item.status !== "pending")].slice(0, 8);
  setHTML(
    "approvals",
    rows.length
      ? `
          <div class="table">
            <div class="table-head">
              <div class="table-cell">Agent</div>
              <div class="table-cell">Action</div>
              <div class="table-cell">Session</div>
              <div class="table-cell">Status</div>
            </div>
            ${rows
              .map(
                (item) => `
                  <div class="table-row">
                    <div class="table-cell">
                      <div class="table-title">${escapeHtml(item.agentId)}</div>
                      <div class="table-copy">${escapeHtml(item.riskLevel)} risk</div>
                    </div>
                    <div class="table-cell">
                      <div class="table-title">${escapeHtml(item.action)}</div>
                      <div class="table-copy">${escapeHtml(item.note ?? item.reasons[0] ?? "Awaiting analyst disposition")}</div>
                    </div>
                    <div class="table-cell">
                      <div class="table-title">${escapeHtml(item.sessionId)}</div>
                      <div class="table-copy">${escapeHtml(item.plane)} · ${escapeHtml(item.mode)}</div>
                    </div>
                    <div class="table-cell">
                      <span class="status ${statusClass(item.status)}">${escapeHtml(item.status)}</span>
                      <div class="action-row compact">
                        ${
                          item.status === "pending"
                            ? `
                                ${chip("Approve", "active", `data-approval-response="approved" data-approval-id="${escapeHtml(item.requestId)}"`)}
                                ${chip("Deny", "critical", `data-approval-response="denied" data-approval-id="${escapeHtml(item.requestId)}"`)}
                              `
                            : ""
                        }
                        ${chip("Open", "neutral", `data-drilldown-kind="approval" data-drilldown-id="${escapeHtml(item.requestId)}"`)}
                      </div>
                    </div>
                  </div>
                `
              )
              .join("")}
          </div>
        `
      : emptyState("Approval queue empty", "No approval requests are waiting on human action and no recent approval decisions have been recorded.")
  );
}

function renderRuntimeFlows(state) {
  setHTML(
    "runtime-flows",
    state.runtimeFlows.length
      ? state.runtimeFlows
          .map(
            (item) => `
              <article class="list-card">
                <div class="split">
                  <div>
                    <strong>${escapeHtml(item.action)}</strong>
                    <p>${escapeHtml(item.summary)}</p>
                  </div>
                  <span class="status ${statusClass(item.status)}">${escapeHtml(item.status)}</span>
                </div>
                <div class="summary-line">
                  <span class="summary-chip">${escapeHtml(item.flowType)}</span>
                  <span class="summary-chip">${escapeHtml(item.sessionId)}</span>
                  <span class="summary-chip">${escapeHtml(item.target)}</span>
                </div>
              </article>
            `
          )
          .join("")
      : emptyState("No runtime flows", "Live runtime mapping will populate once Agentwall begins processing work.")
  );

  setHTML(
    "sessions",
    state.sessions.recent.length
      ? state.sessions.recent
          .map(
            (item) => `
              <article class="list-card">
                <div class="split">
                  <div>
                    <strong>${escapeHtml(item.sessionId)}</strong>
                    <p>${escapeHtml(item.agentId)} · ${escapeHtml(item.lastAction)}</p>
                  </div>
                  <span class="status ${statusClass(item.status)}">${escapeHtml(item.status)}</span>
                </div>
                <div class="summary-line">
                  <span class="summary-chip">${escapeHtml(item.riskLevel)}</span>
                  <span class="summary-chip">${escapeHtml(String(item.evidenceCount))} evidence</span>
                  <span class="summary-chip">${escapeHtml(String(item.taskCount))} task(s)</span>
                </div>
                <div class="action-row compact">
                  ${chip("Open", "active", `data-drilldown-kind="session" data-drilldown-id="${escapeHtml(item.sessionId)}"`)}
                </div>
              </article>
            `
          )
          .join("")
      : emptyState("No sessions", "Tracked sessions will appear after live work begins.")
  );
}

function renderEvidenceGraph(state) {
  setHTML(
    "evidence-ledger",
    state.evidenceLedger.length
      ? state.evidenceLedger
          .map(
            (item) => `
              <article class="list-card">
                <div class="split">
                  <div>
                    <strong>${escapeHtml(item.title)}</strong>
                    <p>${escapeHtml(item.summary)}</p>
                  </div>
                  <span class="status ${statusClass(item.status)}">${escapeHtml(item.status)}</span>
                </div>
                <div class="summary-line">
                  <span class="summary-chip">${escapeHtml(item.kind)}</span>
                  <span class="summary-chip">${escapeHtml(item.sessionId)}</span>
                  <span class="summary-chip">${escapeHtml(item.riskLevel)}</span>
                </div>
                <div class="action-row compact">
                  ${chip("Inspect", "neutral", `data-drilldown-kind="evidence" data-drilldown-id="${escapeHtml(item.id)}"`)}
                </div>
              </article>
            `
          )
          .join("")
      : emptyState("No evidence", "Evidence artifacts will appear as runtime actions produce auditable traces.")
  );

  setHTML(
    "task-graph",
    state.taskGraph.nodes.length
      ? state.taskGraph.nodes
          .map(
            (item) => `
              <article class="list-card">
                <div class="split">
                  <div>
                    <strong>${escapeHtml(item.title)}</strong>
                    <p>${escapeHtml(item.summary)}</p>
                  </div>
                  <span class="status ${statusClass(item.status)}">${escapeHtml(item.status)}</span>
                </div>
                <div class="summary-line">
                  <span class="summary-chip">${escapeHtml(item.sessionId)}</span>
                  <span class="summary-chip">${escapeHtml(item.riskLevel)}</span>
                  <span class="summary-chip">${escapeHtml(String(item.evidenceIds.length))} links</span>
                </div>
                <div class="action-row compact">
                  ${chip("Trace", "active", `data-drilldown-kind="task" data-drilldown-id="${escapeHtml(item.id)}"`)}
                </div>
              </article>
            `
          )
          .join("")
      : emptyState("No task graph", "Task graph nodes will appear once sessions produce runtime work.")
  );
}

function renderDrilldown() {
  if (!currentDrilldown) {
    setHTML("drilldown", emptyState("No investigation selected", "Open a session, approval, task, evidence item, or agent to inspect connected context."));
    return;
  }

  setHTML(
    "drilldown",
    `
      <article class="list-card drill-card">
        <div class="split">
          <div>
            <strong>${escapeHtml(currentDrilldown.title)}</strong>
            <p>${escapeHtml(currentDrilldown.summary)}</p>
          </div>
          <span class="status ${statusClass(currentDrilldown.status)}">${escapeHtml(currentDrilldown.status)}</span>
        </div>
        <div class="kv-grid">
          ${currentDrilldown.facts
            .map(
              (fact) => `
                <div class="kv">
                  <div class="kv-key">${escapeHtml(fact.label)}</div>
                  <div class="kv-value">${escapeHtml(fact.value)}</div>
                </div>
              `
            )
            .join("")}
        </div>
      </article>
      <article class="list-card">
        <strong>Timeline</strong>
        ${
          currentDrilldown.timeline.length
            ? currentDrilldown.timeline
                .map(
                  (item) => `
                    <div class="timeline-row">
                      <div class="meta">${escapeHtml(formatRelative(item.timestamp))}</div>
                      <div>
                        <div class="table-title">${escapeHtml(item.title)}</div>
                        <div class="table-copy">${escapeHtml(item.summary)}</div>
                      </div>
                      <span class="status ${statusClass(item.status)}">${escapeHtml(item.status)}</span>
                    </div>
                  `
                )
                .join("")
            : "<p>No timeline entries</p>"
        }
      </article>
      <article class="list-card">
        <strong>Related Objects</strong>
        <div class="summary-line">
          <span class="summary-chip">${escapeHtml(String(currentDrilldown.related.sessions.length))} sessions</span>
          <span class="summary-chip">${escapeHtml(String(currentDrilldown.related.approvals.length))} approvals</span>
          <span class="summary-chip">${escapeHtml(String(currentDrilldown.related.evidence.length))} evidence</span>
          <span class="summary-chip">${escapeHtml(String(currentDrilldown.related.tasks.length))} tasks</span>
        </div>
      </article>
    `
  );
}

function renderAuditFeed(state) {
  setHTML(
    "audit-feed",
    state.auditFeed.length
      ? state.auditFeed
          .map(
            (item) => `
              <article class="feed-item">
                <div class="feed-time">${escapeHtml(formatRelative(item.timestamp))}</div>
                <div>
                  <h4>${escapeHtml(item.agentId)} · ${escapeHtml(item.action)}</h4>
                  <p>${escapeHtml(item.reasons.join(" · ") || "Audit decision recorded")}</p>
                  <div class="summary-line">
                    <span class="summary-chip">${escapeHtml(item.plane)}</span>
                    <span class="summary-chip">${escapeHtml(item.riskLevel)}</span>
                    <span class="summary-chip">${escapeHtml(item.sessionId ?? `${item.agentId}:default`)}</span>
                  </div>
                </div>
                <span class="status ${statusClass(item.decision)}">${escapeHtml(item.decision)}</span>
              </article>
            `
          )
          .join("")
      : emptyState("No audit history", "Audit history will appear once Agentwall starts processing runtime evaluations.")
  );
}

function renderInspectionActivity(state) {
  setHTML(
    "inspection-activity",
    state.inspectionActivity.length
      ? state.inspectionActivity
          .map(
            (item) => `
              <article class="list-card">
                <div class="split">
                  <div>
                    <strong>${escapeHtml(item.title)}</strong>
                    <p>${escapeHtml(item.summary)}</p>
                  </div>
                  <span class="status ${statusClass(item.status)}">${escapeHtml(item.status)}</span>
                </div>
              </article>
            `
          )
          .join("")
      : emptyState("No inspection telemetry", "Network and content inspection telemetry will populate here when those planes are exercised.")
  );

  setHTML(
    "prompt-risk-events",
    state.promptRiskEvents.length
      ? state.promptRiskEvents
          .map(
            (item) => `
              <article class="list-card">
                <div class="split">
                  <div>
                    <strong>${escapeHtml(item.agentId)}</strong>
                    <p>${escapeHtml(item.summary)}</p>
                  </div>
                  <span class="status ${statusClass(item.riskLevel)}">${escapeHtml(item.riskLevel)}</span>
                </div>
                <p class="meta">${escapeHtml(item.plane)} · ${escapeHtml(item.sessionId)} · ${escapeHtml(formatRelative(item.timestamp))}</p>
              </article>
            `
          )
          .join("")
      : emptyState("No prompt-risk alerts", "No untrusted-provenance, high-risk prompt signals are active right now.")
  );

  setHTML(
    "agents",
    state.activeAgents.length
      ? state.activeAgents
          .map(
            (item) => `
              <article class="list-card">
                <div class="split">
                  <strong>${escapeHtml(item.agentId)}</strong>
                  <span class="kv-value">${escapeHtml(item.lastPlane)}</span>
                </div>
                <p>${escapeHtml(item.lastAction)}</p>
                <div class="action-row compact">
                  ${chip("Open", "neutral", `data-drilldown-kind="agent" data-drilldown-id="${escapeHtml(item.agentId)}"`)}
                  <span class="meta">${escapeHtml(formatRelative(item.lastSeenAt))}</span>
                </div>
              </article>
            `
          )
          .join("")
      : emptyState("No active agents", "Agent runtime activity will appear after requests start hitting the service.")
  );
}

function renderEventFeed(state) {
  setHTML(
    "event-feed",
    state.eventFeed.length
      ? state.eventFeed
          .map(
            (item) => `
              <article class="feed-item">
                <div class="feed-time">${escapeHtml(formatRelative(item.timestamp))}</div>
                <div>
                  <h4>${escapeHtml(item.title)}</h4>
                  <p>${escapeHtml(item.summary)}</p>
                  <div class="summary-line">
                    <span class="summary-chip">${escapeHtml(item.category)}</span>
                    ${item.plane ? `<span class="summary-chip">${escapeHtml(item.plane)}</span>` : ""}
                    ${item.agentId ? `<span class="summary-chip">${escapeHtml(item.agentId)}</span>` : ""}
                    ${item.sessionId ? `<span class="summary-chip">${escapeHtml(item.sessionId)}</span>` : ""}
                  </div>
                </div>
                <span class="status ${statusClass(item.status)}">${escapeHtml(item.status)}</span>
              </article>
            `
          )
          .join("")
      : emptyState("No runtime events", "Cross-plane activity will appear once Agentwall starts receiving live traffic.")
  );
}

function render(state) {
  currentState = state;
  renderHero(state);
  renderMetrics(state);
  renderControlMatrix(state);
  renderOperatorWorkbench(state);
  renderPriorityQueue(state);
  renderSystemHealth(state);
  renderRiskPosture(state);
  renderPolicy(state);
  renderApprovals(state);
  renderRuntimeFlows(state);
  renderEvidenceGraph(state);
  renderDrilldown();
  renderAuditFeed(state);
  renderInspectionActivity(state);
  renderEventFeed(state);
}

async function postJSON(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }
  return response.json();
}

async function loadDrilldown(kind, id) {
  const response = await fetch(`/api/dashboard/drilldown/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Drilldown request failed: ${response.status}`);
  currentDrilldownRef = { kind, id };
  currentDrilldown = await response.json();
  renderDrilldown();
}

async function refresh() {
  const response = await fetch("/api/dashboard/state", { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Dashboard request failed: ${response.status}`);
  const state = await response.json();
  render(state);
  if (currentDrilldownRef) {
    try {
      await loadDrilldown(currentDrilldownRef.kind, currentDrilldownRef.id);
    } catch {
      currentDrilldown = null;
      currentDrilldownRef = null;
      renderDrilldown();
    }
  }
}

function installActions() {
  document.addEventListener("click", async (event) => {
    const target = event.target.closest("button");
    if (!target) return;

    try {
      if (target.dataset.approvalMode) {
        await postJSON("/api/dashboard/control/approval-mode", { mode: target.dataset.approvalMode });
        await refresh();
        return;
      }

      if (target.dataset.sessionAction && target.dataset.sessionId) {
        const action = target.dataset.sessionAction;
        await postJSON(`/api/dashboard/control/session/${encodeURIComponent(target.dataset.sessionId)}`, {
          action,
          note: `Operator ${action} via dashboard`,
        });
        await refresh();
        if (target.dataset.sessionId) {
          await loadDrilldown("session", target.dataset.sessionId);
        }
        return;
      }

      if (target.dataset.approvalResponse && target.dataset.approvalId) {
        await postJSON(`/approval/${encodeURIComponent(target.dataset.approvalId)}/respond`, {
          decision: target.dataset.approvalResponse,
          approvedBy: "dashboard-operator",
          note: `Decision ${target.dataset.approvalResponse} from console`,
        });
        await refresh();
        await loadDrilldown("approval", target.dataset.approvalId);
        return;
      }

      if (target.dataset.drilldownKind && target.dataset.drilldownId) {
        await loadDrilldown(target.dataset.drilldownKind, target.dataset.drilldownId);
      }
    } catch (error) {
      setHTML("drilldown", emptyState("Action failed", error.message));
    }
  });
}

async function boot() {
  renderLoading();
  installActions();
  try {
    await refresh();
  } catch (error) {
    setText("service-status", "Agentwall console unavailable");
    setText("service-summary", error.message);
    setHTML("priority-queue", emptyState("Runtime unavailable", error.message));
    setHTML("event-feed", emptyState("Runtime unavailable", error.message));
  }
  window.setInterval(async () => {
    try {
      await refresh();
    } catch (error) {
      console.error(error);
    }
  }, REFRESH_MS);
}

boot();
