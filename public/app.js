const REFRESH_MS = 5000;

let currentState = null;
let currentDrilldown = null;
let currentDrilldownRef = null;
let currentConsoleMode = "core";
let currentAppView = "dashboard";
let actionFeedbackTimer = null;
let kbSearchQuery = "";
let kbCategoryFilter = "all";
let policyEditorRuleId = null;
let policyEditorFeedback = null;
let policyEditorPreset = null;

const KB_CATEGORY_LABELS = {
  sources: "Sources",
  concepts: "Concepts",
  articles: "Articles",
  open_questions: "Open Questions",
  file_structure: "File Structure",
  runtime_context: "Runtime Context",
};

const COMMAND_DECK_PANES = ["Today", "Waiting", "Risks", "Approvals", "Auto-handled"];

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

function formatTimeUntil(dateString) {
  if (!dateString) return "expires soon";
  const deltaMs = new Date(dateString).getTime() - Date.now();
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) return "expired";
  return `expires in ${formatDuration(deltaMs)}`;
}

function formatTimestamp(dateString) {
  if (!dateString) return "";
  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) return String(dateString);
  return parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function humanizeFloodCategory(category) {
  return String(category ?? "").replaceAll("_", " ");
}

function summarizeTopCategoryCounts(counts, limit = 3) {
  return Object.entries(counts || {})
    .filter(([, count]) => Number.isFinite(count) && count > 0)
    .sort((left, right) => right[1] - left[1] || String(left[0]).localeCompare(String(right[0])))
    .slice(0, limit)
    .map(([category, count]) => `${humanizeFloodCategory(category)} ${count}`)
    .join(", ");
}

function summarizeTopPressureSessions(items, limit = 3) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item?.sessionId && (Number(item.pressure) > 0 || Number(item.blocked) > 0))
    .slice(0, limit)
    .map((item) => `${item.sessionId} ${Math.round(Number(item.pressure || 0) * 100)}%${Number(item.blocked) > 0 ? ` (${item.blocked} blocked)` : ""}`)
    .join(", ");
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(Number(value ?? 0));
}

function formatCsv(values) {
  return Array.isArray(values) ? values.filter(Boolean).join(", ") : "";
}

function parseCsvValue(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getPolicyCatalog(state) {
  return state?.policyCatalog || { editable: false, scopedRules: [], note: "" };
}

function getChannelInventory(state) {
  return state?.channelInventory || { total: 0, byAgent: [], recent: [] };
}

function getPolicyEditorDraft(state) {
  const catalog = getPolicyCatalog(state);
  return catalog.scopedRules.find((item) => item.id === policyEditorRuleId) || policyEditorPreset || null;
}

function setPolicyEditorFeedback(kind, message) {
  policyEditorFeedback = { kind, message };
}

function clearPolicyEditorFeedback() {
  policyEditorFeedback = null;
}

function setPolicyEditorPreset(preset) {
  policyEditorPreset = preset;
}

function clearPolicyEditorPreset() {
  policyEditorPreset = null;
}

function readPolicyEditorValue(id) {
  return document.getElementById(id)?.value || "";
}

function readPolicyEditorChecked(id) {
  return Boolean(document.getElementById(id)?.checked);
}

function collectPolicyEditorPayload() {
  return {
    id: readPolicyEditorValue("policy-rule-id").trim() || undefined,
    description: readPolicyEditorValue("policy-rule-description").trim(),
    plane: readPolicyEditorValue("policy-rule-plane") || "tool",
    decision: readPolicyEditorValue("policy-rule-decision") || "deny",
    riskLevel: readPolicyEditorValue("policy-rule-riskLevel") || "high",
    reason: readPolicyEditorValue("policy-rule-reason").trim(),
    actionIncludes: parseCsvValue(readPolicyEditorValue("policy-rule-actionIncludes")),
    actionEquals: parseCsvValue(readPolicyEditorValue("policy-rule-actionEquals")),
    actorChannelIds: parseCsvValue(readPolicyEditorValue("policy-rule-actorChannelIds")),
    actorRoleIds: parseCsvValue(readPolicyEditorValue("policy-rule-actorRoleIds")),
    actorUserIds: parseCsvValue(readPolicyEditorValue("policy-rule-actorUserIds")),
    subjectAgentIds: parseCsvValue(readPolicyEditorValue("policy-rule-subjectAgentIds")),
    subjectSessionIds: parseCsvValue(readPolicyEditorValue("policy-rule-subjectSessionIds")),
    executionModes: parseCsvValue(readPolicyEditorValue("policy-rule-executionModes")),
    enabled: readPolicyEditorChecked("policy-rule-enabled"),
  };
}

function buildChannelPolicyPreset(channel) {
  return {
    id: "",
    description: `${channel.agentId} guardrails for ${channel.channelId}`,
    plane: "tool",
    decision: "deny",
    riskLevel: channel.riskLevel || "high",
    reason: `Scoped containment for ${channel.agentId} in ${channel.channelId}`,
    enabled: true,
    actionIncludes: [],
    actionEquals: [],
    actorChannelIds: [channel.channelId],
    actorUserIds: [],
    actorRoleIds: Array.isArray(channel.roleIds) ? channel.roleIds : [],
    subjectAgentIds: [channel.agentId],
    subjectSessionIds: [],
    executionModes: [],
    scopeSummary: `${channel.agentId} in ${channel.channelId}`,
    actionSummary: `${channel.lastPlane} · ${channel.lastAction}`,
  };
}

function getTopSessionTarget(state) {
  const recentSessions = Array.isArray(state?.sessions?.recent) ? state.sessions.recent : [];
  const activeSession = recentSessions.find((session) => session.status === "active");
  return activeSession?.sessionId ?? recentSessions[0]?.sessionId ?? null;
}

function jumpToPanel(panelId) {
  const node = document.getElementById(panelId);
  if (!node) return;
  const advancedContainer = node.classList.contains("advanced-panel") ? node : node.closest(".advanced-panel");
  if (advancedContainer && currentConsoleMode !== "advanced") {
    applyConsoleMode("advanced");
  }
  node.scrollIntoView({ behavior: "smooth", block: "start" });
  const focusable = node.querySelector("button, [href], input, [tabindex]");
  if (focusable instanceof HTMLElement) {
    focusable.focus({ preventScroll: true });
  }
}

function needsPolicySaveConfirmation(payload) {
  const decision = String(payload?.decision || "").toLowerCase();
  const plane = String(payload?.plane || "").toLowerCase();
  const enabled = payload?.enabled !== false;
  return decision === "allow" || plane === "all" || !enabled;
}

function describePolicySaveRisk(payload) {
  const reasons = [];
  if (String(payload?.decision || "").toLowerCase() === "allow") {
    reasons.push("changes the rule decision to ALLOW");
  }
  if (String(payload?.plane || "").toLowerCase() === "all") {
    reasons.push("targets every runtime plane");
  }
  if (payload?.enabled === false) {
    reasons.push("disables this guardrail");
  }
  return reasons.join(", ") || "changes a live scoped guardrail";
}

function confirmDangerousPolicySave(payload) {
  if (!needsPolicySaveConfirmation(payload)) return true;
  return window.confirm(`Advanced User confirmation: this save ${describePolicySaveRisk(payload)}. Continue?`);
}

function statusClass(value) {
  const normalized = String(value).toLowerCase();
  if (["approved", "operational", "healthy", "allow", "ok", "low", "active", "completed", "running", "online"].includes(normalized)) {
    return "status-ok";
  }
  if (["pending", "approve", "manual", "medium", "paused", "waiting", "unknown"].includes(normalized)) {
    return "status-pending";
  }
  if (["warning", "stale", "redact", "timeout", "degraded", "high"].includes(normalized)) {
    return "status-warning";
  }
  return "status-critical";
}

function safeDisplayUrl(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  try {
    const parsed = new URL(text);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    const sanitized = parsed.toString();
    return text.endsWith("/") ? sanitized : sanitized.replace(/\/$/, "");
  } catch {
    return text.replace(/\/\/[^/@\s]+@/g, "//[redacted]@").split(/[?#]/)[0];
  }
}

function safePeerError(value) {
  return String(value ?? "")
    .replace(/Bearer\s+[^\s,;]+/gi, "Bearer [redacted]")
    .replace(/\/\/[^/@\s]+@/g, "//[redacted]@")
    .replace(/([?&][^=&#\s]*(?:token|key|secret|password|passwd|credential|auth|signature|session)[^=&#\s]*=)[^&#\s]+/gi, "$1[redacted]")
    .slice(0, 240);
}

function peerStatusChipKind(status) {
  const normalized = String(status || "unknown").toLowerCase();
  if (normalized === "online") return "active";
  if (normalized === "degraded") return "critical";
  return "neutral";
}

function setHTML(id, html) {
  const node = document.getElementById(id);
  if (node) node.innerHTML = html;
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

function showActionFeedback(title, message) {
  setHTML("drilldown", emptyState(title, message));
  if (actionFeedbackTimer) {
    window.clearTimeout(actionFeedbackTimer);
  }
  actionFeedbackTimer = window.setTimeout(() => {
    actionFeedbackTimer = null;
    if (!currentDrilldown) {
      renderDrilldown();
    }
  }, 2500);
}

function applyConsoleMode(mode) {
  currentConsoleMode = mode === "advanced" ? "advanced" : "core";
  const advancedEnabled = currentConsoleMode === "advanced";
  document.body.dataset.consoleMode = currentConsoleMode;
  for (const tab of document.querySelectorAll("[data-console-mode]")) {
    const active = tab.dataset.consoleMode === currentConsoleMode;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  }
  for (const toggle of document.querySelectorAll("[data-console-mode-toggle]")) {
    toggle.classList.toggle("is-active", advancedEnabled);
    toggle.setAttribute("aria-checked", advancedEnabled ? "true" : "false");
  }
  setText("console-mode-label", advancedEnabled ? "Advanced User" : "Operator View");
  setText(
    "console-mode-summary",
    advancedEnabled
      ? "Granular controls are visible: policies, federation, evidence, audit, and raw runtime telemetry."
      : "Simple by default. Enable Advanced User for granular controls."
  );
  try {
    window.localStorage.setItem("agentwall.consoleMode", currentConsoleMode);
  } catch {}
}

function installConsoleModeSwitch() {
  let preferred = "core";
  try {
    preferred = window.localStorage.getItem("agentwall.consoleMode") || "core";
  } catch {}
  applyConsoleMode(preferred);
  for (const toggle of document.querySelectorAll("[data-console-mode-toggle]")) {
    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      applyConsoleMode(currentConsoleMode === "advanced" ? "core" : "advanced");
    });
  }
  document.addEventListener("click", (event) => {
    const explicitTarget = event.target.closest("[data-console-mode]");
    if (explicitTarget) {
      applyConsoleMode(explicitTarget.dataset.consoleMode);
      return;
    }
    const toggleTarget = event.target.closest("[data-console-mode-toggle]");
    if (!toggleTarget) return;
    applyConsoleMode(currentConsoleMode === "advanced" ? "core" : "advanced");
  });
}

function getAppViewFromPath(pathname) {
  return String(pathname || "").includes("knowledge-base") ? "knowledge-base" : "dashboard";
}

function applyAppView(view, syncHistory = false) {
  currentAppView = view === "knowledge-base" ? "knowledge-base" : "dashboard";
  document.body.dataset.appView = currentAppView;
  document.title = currentAppView === "knowledge-base" ? "Agentwall Operator Surface Knowledge Base" : "Agentwall Operator Surface";
  for (const link of document.querySelectorAll("[data-app-nav]")) {
    const active = link.dataset.appNav === currentAppView;
    link.classList.toggle("is-active", active);
    link.setAttribute("aria-current", active ? "page" : "false");
  }
  if (syncHistory) {
    const nextPath = currentAppView === "knowledge-base" ? "/dashboard/knowledge-base" : "/dashboard";
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, "", nextPath);
    }
  }
}

function navigateKnowledgeBaseFilter(category) {
  kbCategoryFilter = Object.prototype.hasOwnProperty.call(KB_CATEGORY_LABELS, category) ? category : "all";
  const input = document.getElementById("kb-search");
  if (input) {
    input.focus();
  }
  if (currentState) {
    renderKnowledgeBase(currentState);
  }
}

function installAppNavigation() {
  applyAppView(getAppViewFromPath(window.location.pathname));
  document.addEventListener("click", (event) => {
    const link = event.target.closest("[data-app-nav]");
    if (!link) return;
    event.preventDefault();
    applyAppView(link.dataset.appNav, true);
  });
  window.addEventListener("popstate", () => {
    applyAppView(getAppViewFromPath(window.location.pathname));
  });
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
  setText("kb-summary", "Loading knowledge base entries and access metadata.");
  setText("kb-search-meta", "Preparing search index.");
  setHTML("service-badge", `<span class="live-dot"></span> Loading`);
  setHTML("service-facts", `<div class="fact">Polling every ${REFRESH_MS / 1000}s</div>`);
  setHTML("hero-brief", `${skeletonCard()}${skeletonCard()}`);
  [
    "hero-metrics",
    "control-matrix",
    "operator-workbench",
    "priority-queue",
    "incident-command",
    "investigation-workbench",
    "system-health",
    "org-control-plane",
    "risk-posture",
    "policy-stats",
    "policy-hotspots",
    "policy-scoped-rules",
    "policy-guardrail-editor",
    "policy-channel-inventory",
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
    "kb-access-panel",
    "kb-index-cards",
    "kb-filter-chips",
    "kb-entry-list",
  ].forEach((id) => {
    setHTML(id, `${skeletonCard()}${skeletonCard()}`);
  });
}

function renderMetrics(state) {
  const topPendingId = state.approvals?.queueHealth?.reviewRequestId ?? state.approvals?.pending?.[0]?.requestId ?? null;
  const items = [
    {
      label: "Highest Risk",
      value: state.posture.highestRisk.toUpperCase(),
      foot: `${state.posture.criticalSignals} critical signal(s)`,
      action: "Inspect risk posture",
      jumpPanel: "risk-posture",
    },
    {
      label: "Requests Evaluated",
      value: formatNumber(state.posture.totalRequests),
      foot: `${state.stats.planeCounts.network ?? 0} network evaluations tracked`,
      action: "Open audit feed",
      jumpPanel: "audit-feed",
    },
    {
      label: "Open Approvals",
      value: formatNumber(state.posture.pendingApprovals),
      foot: `${escapeHtml(state.controls.approvalMode)} mode`,
      action: topPendingId ? "Open top pending" : "Review queue",
      jumpPanel: "priority-queue",
      openTopPending: topPendingId,
    },
    {
      label: "Flood Blocks",
      value: formatNumber(state.floodGuard?.blockedTotal ?? 0),
      foot: `${escapeHtml(state.floodGuard?.mode ?? "normal")} mode`,
      action: "Inspect system health",
      jumpPanel: "system-health",
    },
  ];

  setHTML(
    "hero-metrics",
    items
      .map(
        (item) => `
          <button type="button" class="metric metric-button" ${item.openTopPending ? `data-open-top-pending="true" data-approval-id="${escapeHtml(item.openTopPending)}"` : `data-jump-panel="${escapeHtml(item.jumpPanel)}"`} aria-label="${escapeHtml(item.action)}">
            <span class="metric-label">${escapeHtml(item.label)}</span>
            <span class="metric-value">${escapeHtml(item.value)}</span>
            <span class="metric-foot">${escapeHtml(item.foot)}</span>
            <span class="metric-action">${escapeHtml(item.action)}</span>
          </button>
        `
      )
      .join("")
  );
}

function renderHero(state) {
  const brandMark = document.getElementById("brand-mark-img");
  if (brandMark) {
    const icon = state.service.status === "operational"
      ? (state.simulation?.enabled ? "/assets/brand/icon_flow.svg" : "/assets/brand/icon_active.svg")
      : "/assets/brand/icon_idle.svg";
    brandMark.setAttribute("src", icon);
  }

  setText("service-status", state.service.status === "operational" ? "Agentwall is protecting runtime actions" : "Agentwall needs operator attention");
  setText("service-summary", state.service.operatorSummary);
  setHTML(
    "service-badge",
    `
      <span class="live-dot"></span>
      <span class="status ${statusClass(state.service.status)}">${escapeHtml(state.service.status)}</span>
    `
  );
  setText("generated-at", `Updated ${formatRelative(state.generatedAt)}`);
  const pausedSessions = Number(state.stats.sessionCounts?.paused ?? 0);
  const terminatedSessions = Number(state.stats.sessionCounts?.terminated ?? 0);
  const blockedWork = Number(state.posture.pendingApprovals ?? 0) + Number(state.posture.criticalSignals ?? 0);
  const liveSessions = Number(state.posture.activeAgentsNow ?? state.posture.activeAgents ?? 0);
  const topPendingId = state.approvals?.queueHealth?.reviewRequestId ?? state.approvals?.pending?.[0]?.requestId ?? null;
  const topSessionId = liveSessions > 0 ? getTopSessionTarget(state) : null;
  const access = state.knowledgeBase?.access ?? {};
  const recommendedActions = Array.isArray(state.service.recommendedActions) ? state.service.recommendedActions : [];
  setHTML(
    "service-facts",
    [
      `Uptime ${formatDuration(state.service.uptimeMs)}`,
      `${state.service.host}:${state.service.port}`,
      `${state.health.ruleCount} rules loaded`,
      `${state.controls.egress.allowedHosts.length} allowlisted hosts`,
      blockedWork > 0 ? `${formatNumber(blockedWork)} blocked work item(s) waiting` : `${formatNumber(liveSessions)} live session(s)`,
      pausedSessions > 0 ? `${formatNumber(pausedSessions)} paused session(s)` : null,
      terminatedSessions > 0 ? `${formatNumber(terminatedSessions)} terminated session(s)` : null,
      state.freshness?.hasLiveActivity
        ? state.freshness?.isFresh
          ? `Live telemetry fresh (${Math.round((state.freshness?.freshnessWindowMs ?? 0) / 1000)}s window)`
          : `Live telemetry stale`
        : "Awaiting first live event",
      state.simulation?.enabled ? `SIMULATION MODE · ${state.simulation.label ?? state.simulation.scenarioId}` : null,
    ]
      .filter(Boolean).map((fact) => `<div class="fact">${escapeHtml(fact)}</div>`)
      .join("")
  );
  setHTML(
    "hero-brief",
    `
      <article class="hero-note hero-note-actionable">
        <strong>Next move</strong>
        <p>${blockedWork > 0
          ? `${formatNumber(blockedWork)} item(s) are blocked. Review the top approval before anything else.`
          : "No queue pressure right now. Keep the live surfaces moving."}</p>
        <div class="action-row compact">
          ${topPendingId ? chip("Open top pending", "critical", `data-open-top-pending="true" data-approval-id="${escapeHtml(topPendingId)}"`) : chip("Review queue", "neutral", 'data-jump-panel="priority-queue"')}
          ${chip("Jump to approvals", "neutral", 'data-jump-panel="priority-queue"')}
        </div>
      </article>
      <article class="hero-note hero-note-actionable">
        <strong>Live now</strong>
        <p>${liveSessions > 0
          ? `${formatNumber(liveSessions)} live session(s) are in view${pausedSessions > 0 ? `, ${formatNumber(pausedSessions)} paused` : ""}${terminatedSessions > 0 ? `, ${formatNumber(terminatedSessions)} terminated` : ""}.`
          : "No live sessions yet. Enable Advanced User when you need policy, federation, or diagnostic detail."}</p>
        <div class="action-row compact">
          ${topSessionId ? chip("Open hottest session", "active", `data-drilldown-kind="session" data-drilldown-id="${escapeHtml(topSessionId)}"`) : chip("Inspect sessions", "neutral", 'data-jump-panel="sessions"')}
          ${chip("Jump to sessions", "neutral", 'data-jump-panel="sessions"')}
        </div>
      </article>
      <article class="hero-note hero-note-actionable">
        <strong>System truth</strong>
        <p>${escapeHtml(`${state.service.status} · ${state.controls.approvalMode} approvals · ${access.lastVerifiedStatus || "seeded"} KB access.`)}</p>
        <div class="action-row compact">
          ${chip("Open system health", "neutral", 'data-jump-panel="system-health"')}
          ${chip("Open knowledge base", "active", 'data-app-nav="knowledge-base"')}
        </div>
        ${recommendedActions.length
          ? `<ul class="hero-list">${recommendedActions.slice(0, 2).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
          : `<p>${escapeHtml("No immediate operator action suggested. Keep watching live runtime telemetry.")}</p>`}
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
  const overrides = Array.isArray(state.floodGuard?.sessionOverrides) ? state.floodGuard.sessionOverrides : [];
  const overrideMap = new Map(overrides.map((item) => [item.sessionId, item]));
  const guidance = state.floodGuard?.operatorGuidance;
  const overrideSummary = overrides.length
    ? `Overrides: ${overrides.map((item) => `${item.sessionId} ×${item.multiplier} (${formatTimeUntil(item.expiresAt)})`).join(", ")}`
    : "Overrides: none";
  const shieldSummary = state.floodGuard?.mode === "shield" && state.floodGuard?.shieldUntil
    ? `Shield active · ${formatTimeUntil(state.floodGuard.shieldUntil)} (${formatTimestamp(state.floodGuard.shieldUntil)})`
    : "Shield idle · normal admission limits active.";
  const blockedByTypeSummary = summarizeTopCategoryCounts(state.floodGuard?.blockedByCategory);
  const pressureByTypeSummary = summarizeTopCategoryCounts(state.floodGuard?.pressureByCategory);
  const hottestSessionsSummary = summarizeTopPressureSessions(state.floodGuard?.pressureBySession);
  const latestBlock = Array.isArray(state.floodGuard?.recentBlocks) ? state.floodGuard.recentBlocks[0] : null;
  const floodCard = `
      <article class="list-card">
        <div class="split">
          <div>
            <strong>FloodGuard Shield Mode</strong>
            <p>Temporarily tighten runtime limits and prioritize high-risk approvals.</p>
          </div>
          <span class="status ${statusClass(state.floodGuard?.mode === "shield" ? "warning" : "ok")}">${escapeHtml(state.floodGuard?.mode ?? "normal")}</span>
        </div>
        <div class="action-row">
          ${chip("Enable 10m shield", "critical", 'data-floodguard-mode="shield" data-floodguard-duration="600000"')}
          ${chip("Shield 30m", "neutral", 'data-floodguard-mode="shield" data-floodguard-duration="1800000"')}
          ${chip("Back to normal", "active", 'data-floodguard-mode="normal"')}
        </div>
        <p class="meta">${escapeHtml(shieldSummary)}</p>
        <p class="meta">Blocked ${escapeHtml(String(state.floodGuard?.blockedTotal ?? 0))} requests · ${escapeHtml(String((state.floodGuard?.recentBlocks ?? []).length))} recent block events.</p>
        <p class="meta">${escapeHtml(blockedByTypeSummary ? `Blocked by type: ${blockedByTypeSummary}` : "Blocked by type will populate after live pressure trips a guard.")}</p>
        <p class="meta">${escapeHtml(pressureByTypeSummary ? `Pressure by type: ${pressureByTypeSummary}` : "Pressure by type is quiet right now.")}</p>
        <p class="meta">${escapeHtml(hottestSessionsSummary ? `Hottest sessions: ${hottestSessionsSummary}` : "No session is carrying meaningful FloodGuard pressure right now.")}</p>
        <p class="meta">${escapeHtml(latestBlock ? `Latest block: ${humanizeFloodCategory(latestBlock.category)} · ${latestBlock.reason}${latestBlock.sessionId ? ` · ${latestBlock.sessionId}` : ""} · ${formatRelative(latestBlock.timestamp)}` : "Latest block details will appear here when FloodGuard starts shedding traffic.")}</p>
        <p class="meta">${escapeHtml(guidance?.summary ?? "FloodGuard guidance will update as live pressure changes.")}</p>
        <p class="meta">${escapeHtml(guidance?.recommendedAction ?? "No FloodGuard action needed right now.")}</p>
        <p class="meta">${escapeHtml(overrideSummary)}</p>
      </article>`;
  setHTML(
    "operator-workbench",
    `
      ${floodCard}
      <article class="list-card">
        <div class="split">
          <div>
            <strong>Approval mode</strong>
            <p>Switch how new approval requests resolve.</p>
          </div>
          <span class="status ${statusClass(state.controls.approvalMode)}">${escapeHtml(state.controls.approvalMode)}</span>
        </div>
        <div class="action-row">
          ${["auto", "always"]
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
      <article class="list-card">
        <div class="split">
          <div>
            <strong>Incident simulation</strong>
            <p>Injects synthetic high-risk telemetry for demos and screenshots.</p>
          </div>
          <span class="status ${statusClass(state.simulation?.enabled ? "warning" : "ok")}">${escapeHtml(state.simulation?.enabled ? "active" : "inactive")}</span>
        </div>
        <div class="action-row">
          ${chip("Start scenario", "active", 'data-simulation-action="start"')}
          ${chip("Clear simulation", "neutral", 'data-simulation-action="clear"')}
        </div>
        <p class="meta">${escapeHtml(state.simulation?.disclaimer ?? "Synthetic incident data only.")}</p>
      </article>
      ${
        sessions.length
          ? sessions
              .map(
                (session) => {
                  const override = overrideMap.get(session.sessionId);
                  const overrideMeta = override
                    ? `<div class="override-strip"><span class="status status-pending">boost ×${escapeHtml(String(override.multiplier))}</span><span class="meta">${escapeHtml(`${formatTimeUntil(override.expiresAt)} · until ${formatTimestamp(override.expiresAt)}`)}</span></div>`
                    : `<p class="meta">No temporary FloodGuard override on this session.</p>`;
                  return `
                  <article class="list-card">
                    <div class="split">
                      <div>
                        <strong>${escapeHtml(session.sessionId)}</strong>
                        <p>${escapeHtml(session.agentId)} · ${escapeHtml(session.lastAction)}</p>
                      </div>
                      <span class="status ${statusClass(session.status)}">${escapeHtml(session.status)}</span>
                    </div>
                    ${overrideMeta}
                    <div class="action-row">
                      ${chip("Pause", "neutral", `data-session-action="pause" data-session-id="${escapeHtml(session.sessionId)}"`)}
                      ${chip("Resume", "neutral", `data-session-action="resume" data-session-id="${escapeHtml(session.sessionId)}"`)}
                      ${chip("Terminate", "critical", `data-session-action="terminate" data-session-id="${escapeHtml(session.sessionId)}"`)}
                      ${chip("Boost 15m", override ? "neutral" : "active", `data-floodguard-session="${escapeHtml(session.sessionId)}" data-floodguard-multiplier="1.5" data-floodguard-duration="900000"`)}
                      ${chip("Reset Limits", override ? "active" : "neutral", `data-floodguard-session-clear="${escapeHtml(session.sessionId)}"`)}
                      ${chip("Open", "active", `data-drilldown-kind="session" data-drilldown-id="${escapeHtml(session.sessionId)}"`)}
                    </div>
                  </article>
                `;
                }
              )
              .join("")
          : emptyState("No tracked sessions", "Session controls appear once live sessions are observed.")
      }
    `
  );
}

function renderCommandDeck(state) {
  const deck = state.commandDeck ?? {};
  const panes = [deck.today, deck.waiting, deck.risks, deck.approvals, deck.autoHandled].filter(Boolean);
  const paneNames = COMMAND_DECK_PANES.join(", ");
  setHTML(
    "command-deck",
    panes.length
      ? panes
          .map((pane) => {
            const items = Array.isArray(pane.items) ? pane.items : [];
            return `
              <article class="list-card">
                <div class="split">
                  <div>
                    <strong>${escapeHtml(pane.title ?? "Command lane")}</strong>
                    <p>${escapeHtml(pane.description ?? "")}</p>
                  </div>
                  <span class="status ${statusClass(items.some((item) => item.status === "critical") ? "critical" : items.some((item) => item.status === "pending") ? "pending" : items.some((item) => item.status === "warning") ? "warning" : "ok")}">${escapeHtml(String(items.length))}</span>
                </div>
                ${
                  items.length
                    ? items
                        .map((item) => {
                          const itemMeta = item.meta
                            ? String(item.meta).includes("T")
                              ? formatRelative(item.meta)
                              : String(item.meta)
                            : "";
                          return `
                            <div class="timeline-row">
                              <div>
                                <div class="split">
                                  <span class="table-title">${escapeHtml(item.title ?? "Work item")}</span>
                                  <span class="status ${statusClass(item.status ?? "ok")}">${escapeHtml(item.status ?? "ok")}</span>
                                </div>
                                <div class="table-copy">${escapeHtml(item.summary ?? "")}</div>
                                <div class="summary-line">
                                  ${item.actionLabel ? `<span class="summary-chip">${escapeHtml(item.actionLabel)}</span>` : ""}
                                  ${itemMeta ? `<span class="summary-chip">${escapeHtml(itemMeta)}</span>` : ""}
                                </div>
                              </div>
                              <div class="action-row compact">
                                ${
                                  item.drilldownKind && item.drilldownId
                                    ? chip(
                                        item.actionLabel || "Open",
                                        item.status === "critical" ? "critical" : "neutral",
                                        `data-drilldown-kind="${escapeHtml(item.drilldownKind)}" data-drilldown-id="${escapeHtml(item.drilldownId)}"`
                                      )
                                    : ""
                                }
                              </div>
                            </div>
                          `;
                        })
                        .join("")
                    : emptyState("Nothing here", "This lane will populate as Mission Control sees real work.")
                }
              </article>
            `;
          })
          .join("")
      : emptyState("Command deck unavailable", "Mission Control has not published the command deck yet.")
  );
}

function renderPriorityQueue(state) {
  setHTML(
    "priority-queue",
    state.priorityQueue.length
      ? state.priorityQueue
          .map((item) => {
            const quickActions = [];
            if (item.category === "approval") {
              quickActions.push(
                chip("Approve", "active", `data-approval-response="approved" data-approval-id="${escapeHtml(item.id)}"`),
                chip("Deny", "critical", `data-approval-response="denied" data-approval-id="${escapeHtml(item.id)}"`)
              );
            }
            if (item.drilldownKind && item.drilldownId) {
              quickActions.push(
                chip(
                  item.primaryAction || "Open",
                  item.status === "critical" ? "critical" : "neutral",
                  `data-drilldown-kind="${escapeHtml(item.drilldownKind)}" data-drilldown-id="${escapeHtml(item.drilldownId)}"`
                )
              );
            }
            return `
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
                <div class="action-row compact">
                  ${quickActions.join("")}
                  <span class="meta">${escapeHtml(formatRelative(item.timestamp))}</span>
                </div>
              </article>
            `;
          })
          .join("")
      : emptyState("Queue clear", "No open approval, watchdog, session, or provenance items currently require operator action.")
  );
}

function renderOperatorTimeline(state) {
  const items = Array.isArray(state.operatorTimeline) ? state.operatorTimeline : [];
  setHTML(
    "operator-timeline",
    items.length
      ? items
          .map((item) => {
            const quickActions = [];
            if (item.drilldownKind && item.drilldownId) {
              quickActions.push(
                chip(
                  item.primaryAction || "Open",
                  item.status === "critical" ? "critical" : "neutral",
                  `data-drilldown-kind="${escapeHtml(item.drilldownKind)}" data-drilldown-id="${escapeHtml(item.drilldownId)}"`
                )
              );
            }
            return `
              <article class="list-card">
                <div class="timeline-row">
                  <div class="meta">${escapeHtml(formatRelative(item.timestamp))}</div>
                  <div>
                    <div class="split">
                      <strong>${escapeHtml(item.title)}</strong>
                      <span class="status ${statusClass(item.status)}">${escapeHtml(item.status)}</span>
                    </div>
                    <p>${escapeHtml(item.summary)}</p>
                    <div class="summary-line">
                      <span class="summary-chip">${escapeHtml(item.category)}</span>
                      ${item.plane ? `<span class="summary-chip">${escapeHtml(item.plane)}</span>` : ""}
                      ${item.agentId ? `<span class="summary-chip">${escapeHtml(item.agentId)}</span>` : ""}
                      ${item.sessionId ? `<span class="summary-chip">${escapeHtml(item.sessionId)}</span>` : ""}
                    </div>
                  </div>
                  <div class="action-row compact">${quickActions.join("")}</div>
                </div>
              </article>
            `;
          })
          .join("")
      : emptyState("No active detections", "Recent risk, containment, approval, and FloodGuard events will show up here as soon as Agentwall sees live runtime traffic.")
  );
}

function renderIncidentCommand(state) {
  const highRiskSessions = state.sessions.recent.filter((s) => ["high", "critical"].includes(String(s.riskLevel)) && s.status === "active").slice(0, 6);
  const criticalSessions = state.sessions.recent.filter((s) => String(s.riskLevel) === "critical" && s.status === "active").slice(0, 4);

  setHTML("incident-command",     `<article class="runbook-card">
      <div class="split">
        <strong>Containment: Raise approval bar</strong>
        <span class="status ${statusClass(state.controls.approvalMode === "always" ? "pending" : "ok")}">${escapeHtml(state.controls.approvalMode)}</span>
      </div>
      <p>Force explicit human approval for all sensitive actions while triaging active risk.</p>
      <div class="action-row">
        ${chip("Enable strict approvals", "active", 'data-playbook="strict-approvals"')}
        ${chip("Return to auto", "neutral", 'data-playbook="restore-auto"')}
      </div>
    </article>
    <article class="runbook-card">
      <div class="split">
        <strong>Containment: Session controls</strong>
        <span class="status ${statusClass(criticalSessions.length ? "critical" : "ok")}">${criticalSessions.length} critical</span>
      </div>
      <p>${highRiskSessions.length} active high-risk session(s) detected.</p>
      <div class="action-row">
        ${chip("Pause high-risk sessions", "neutral", 'data-playbook="pause-high-risk"')}
        ${chip("Terminate critical sessions", "critical", 'data-playbook="terminate-critical"')}
      </div>
    </article>`
  );
}

function renderInvestigationWorkbench(state) {
  const boundaryCrossings = state.runtimeFlows.filter((f) => f.crossesBoundary).slice(0, 5);
  const topHotspots = state.policyHotspots.slice(0, 4);
  setHTML("investigation-workbench",     `<article class="list-card">
      <strong>Boundary Crossings (latest)</strong>
      ${boundaryCrossings.length ? boundaryCrossings.map((f) => `<div class="timeline-row"><div class="meta">${escapeHtml(f.riskLevel)}</div><div><div class="table-title">${escapeHtml(f.action)}</div><div class="table-copy">${escapeHtml(f.agentId)} → ${escapeHtml(f.target)}</div></div><button class="chip chip-button chip-neutral" data-drilldown-kind="session" data-drilldown-id="${escapeHtml(f.sessionId)}">Open</button></div>`).join("") : "<p class=\"meta\">No cross-boundary runtime flows in current window.</p>"}
    </article>
    <article class="list-card">
      <strong>Hot Rule Clusters</strong>
      ${topHotspots.length ? `<ul class="helper-list">${topHotspots.map((h) => `<li>${escapeHtml(h.ruleId)} · ${escapeHtml(String(h.count))} matches</li>`).join("")}</ul>` : "<p class=\"meta\">No hot policy rules detected yet.</p>"}
    </article>`
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

function renderOrganizationControlPlane(state) {
  const org = state.organizationControlPlane || { summary: {}, instances: [], gateways: [], agents: [], channels: [] };
  const summary = org.summary || {};
  const instances = Array.isArray(org.instances) ? org.instances : [];
  const gateways = Array.isArray(org.gateways) ? org.gateways : [];
  const agents = Array.isArray(org.agents) ? org.agents : [];
  const channels = Array.isArray(org.channels) ? org.channels : [];
  const peers = Array.isArray(state.organizationFederation?.peers) ? state.organizationFederation.peers : [];

  const summaryHtml = `
    <article class="control-card">
      <div class="split">
        <div>
          <strong>Single pane of glass</strong>
          <p>${escapeHtml(`${summary.instances ?? 0} instance(s) · ${summary.gateways ?? 0} gateway(s) · ${summary.agents ?? 0} agent(s) · ${summary.channels ?? 0} channel(s)`)}</p>
        </div>
        ${chip("Org view", "active")}
      </div>
      <p class="meta">Local dashboard stays included. Organization mode federates instance summaries and controls scoped guardrails at the owning gateway.</p>
    </article>
  `;

  const peerHtml = peers.length
    ? peers.slice(0, 8).map((peer) => {
        const status = peer.status || (peer.ok ? "online" : "unknown");
        const displayUrl = safeDisplayUrl(peer.summaryUrl || peer.url || peer.id);
        const timestamp = peer.generatedAt || peer.lastPollAt || peer.lastPolledAt || peer.polledAt || peer.lastSeenAt;
        const timestampLabel = peer.generatedAt ? "generated" : "last poll";
        const metaParts = [
          timestamp ? `${timestampLabel} ${formatTimestamp(timestamp) || timestamp}` : "",
          peer.httpStatus ? `HTTP ${peer.httpStatus}` : "",
        ].filter(Boolean);
        const error = peer.error ? safePeerError(peer.error) : "";
        return `
          <article class="control-card">
            <div class="split">
              <div>
                <strong>${escapeHtml(peer.name || peer.id)}</strong>
                <p>${escapeHtml(peer.id || "peer")}</p>
              </div>
              ${chip(status, peerStatusChipKind(status))}
            </div>
            <p class="meta">Peer summary: ${escapeHtml(displayUrl || "summary endpoint unavailable")}</p>
            ${metaParts.length ? `<p class="meta">${escapeHtml(metaParts.join(" · "))}</p>` : ""}
            ${error ? `<p class="meta">Safe error: ${escapeHtml(error)}</p>` : ""}
          </article>
        `;
      }).join("")
    : emptyState("No peers configured", "No peers configured. Org mode is local-only until instances are configured.");

  const instanceHtml = instances.length
    ? instances.slice(0, 6).map((instance) => `
        <article class="control-card">
          <div class="split">
            <div>
              <strong>${escapeHtml(instance.name || instance.id)}</strong>
              <p>${escapeHtml(safeDisplayUrl(instance.url || instance.id))}</p>
            </div>
            ${chip(instance.status || "unknown", statusClass(instance.status || "unknown"))}
          </div>
          <p class="meta">${escapeHtml([instance.role, instance.environment, instance.region].filter(Boolean).join(" · ") || "local instance")}</p>
        </article>
      `).join("")
    : emptyState("No instances configured", "This install is operating as a local instance console until organization peers are configured.");

  const gatewayHtml = gateways.length
    ? gateways.slice(0, 8).map((gateway) => `
        <article class="control-card">
          <div class="split">
            <div>
              <strong>${escapeHtml(gateway.name || gateway.id)}</strong>
              <p>${escapeHtml(`${gateway.channelCount ?? 0} channel(s) · ${gateway.agentCount ?? 0} agent(s)`)}</p>
            </div>
            ${chip(gateway.kind || "gateway", "neutral")}
          </div>
          <p class="meta">${escapeHtml(gateway.instanceId || "local")}</p>
        </article>
      `).join("")
    : emptyState("No gateways observed", "Slack, Telegram, Discord, API, browser, and custom gateways appear after they send actor.channelId.");

  const channelHtml = channels.length
    ? channels.slice(0, 10).map((channel) => `
        <article class="control-card">
          <div class="split">
            <div>
              <strong>${escapeHtml(channel.channelId)}</strong>
              <p>${escapeHtml(`${channel.agentId} · ${channel.gatewayKind} · ${channel.lastPlane} · ${channel.lastAction}`)}</p>
            </div>
            ${chip(channel.riskLevel || "low", statusClass(channel.riskLevel || "low"))}
          </div>
          <div class="action-row compact">
            ${chip("Control channel", "active", `data-channel-control="true" data-agent-id="${escapeHtml(channel.agentId)}" data-channel-id="${escapeHtml(channel.channelId)}" data-channel-risk="${escapeHtml(channel.riskLevel)}" data-channel-roles="${escapeHtml(formatCsv(channel.roleIds))}"`)}
          </div>
        </article>
      `).join("")
    : emptyState("No channels observed", "Channels appear after agent gateways call /evaluate with actor.channelId.");

  setHTML("org-control-plane", `
    ${summaryHtml}
    <div>
      <div class="subhead">Peer Federation</div>
      ${peerHtml}
    </div>
    <div class="dual-grid">
      <div><div class="subhead">Instances</div>${instanceHtml}</div>
      <div><div class="subhead">Gateways</div>${gatewayHtml}</div>
    </div>
    <div>
      <div class="subhead">Organization Channels</div>
      ${channelHtml}
    </div>
  `);
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
  const policyCatalog = getPolicyCatalog(state);
  const channelInventory = getChannelInventory(state);
  const scopedRules = Array.isArray(policyCatalog.scopedRules) ? policyCatalog.scopedRules : [];
  const draft = getPolicyEditorDraft(state);
  const editorTitle = draft ? `Editing ${draft.id || draft.scopeSummary || "scoped guardrail"}` : "Create scoped guardrail";
  const feedback = policyEditorFeedback
    ? `<div class="policy-editor-feedback ${policyEditorFeedback.kind === "error" ? "policy-editor-feedback-error" : "policy-editor-feedback-ok"}">${escapeHtml(policyEditorFeedback.message)}</div>`
    : "";

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

  setHTML(
    "policy-scoped-rules",
    scopedRules.length
      ? scopedRules
          .map(
            (item) => `
              <article class="list-card policy-rule-card">
                <div class="split">
                  <div>
                    <strong>${escapeHtml(item.description)}</strong>
                    <p>${escapeHtml(item.scopeSummary)}</p>
                  </div>
                  <span class="status ${statusClass(item.decision)}">${escapeHtml(item.decision)}</span>
                </div>
                <p class="meta">${escapeHtml(`${item.plane} · ${item.riskLevel} · ${item.enabled ? "enabled" : "disabled"}`)}</p>
                <p>${escapeHtml(item.actionSummary)}</p>
                <p class="meta">${escapeHtml(item.reason)}</p>
                <div class="action-row compact">
                  ${chip("Edit guardrail", "neutral", `data-policy-edit-id="${escapeHtml(item.id)}"`)}
                </div>
              </article>
            `
          )
          .join("")
      : emptyState("Scoped Guardrails", policyCatalog.note || "Add the first channel-aware guardrail below.")
  );

  setHTML(
    "policy-guardrail-editor",
    policyCatalog.editable
      ? `
          <article class="list-card policy-editor-card">
            <div class="split">
              <div>
                <strong>Guardrail editor</strong>
                <p>${escapeHtml(editorTitle)}</p>
              </div>
              <span class="status ${draft && draft.enabled === false ? "status-warning" : "status-ok"}">${escapeHtml(draft ? (draft.enabled === false ? "disabled" : "editing") : "new")}</span>
            </div>
            <p class="meta">${escapeHtml(policyCatalog.note || "Scoped guardrails save to the live declarative policy file.")}</p>
            ${feedback}
            <div class="policy-form-grid">
              <label class="policy-field">
                <span>Rule ID</span>
                <input id="policy-rule-id" type="text" value="${escapeHtml(draft?.id || "")}" placeholder="custom:deny-finance-agent-file-write" />
              </label>
              <label class="policy-field">
                <span>Plane</span>
                <select id="policy-rule-plane">
                  ${["network", "tool", "content", "browser", "identity", "governance", "all"].map((value) => `<option value="${value}" ${String(draft?.plane || "tool") === value ? "selected" : ""}>${escapeHtml(value)}</option>`).join("")}
                </select>
              </label>
              <label class="policy-field policy-field-wide">
                <span>Description</span>
                <input id="policy-rule-description" type="text" value="${escapeHtml(draft?.description || "")}" placeholder="Shared Slack finance room cannot drive filesystem writes through the finance analyst agent" />
              </label>
              <label class="policy-field">
                <span>Decision</span>
                <select id="policy-rule-decision">
                  ${["deny", "approve", "allow", "redact"].map((value) => `<option value="${value}" ${String(draft?.decision || "deny") === value ? "selected" : ""}>${escapeHtml(value)}</option>`).join("")}
                </select>
              </label>
              <label class="policy-field">
                <span>Risk</span>
                <select id="policy-rule-riskLevel">
                  ${["low", "medium", "high", "critical"].map((value) => `<option value="${value}" ${String(draft?.riskLevel || "high") === value ? "selected" : ""}>${escapeHtml(value)}</option>`).join("")}
                </select>
              </label>
              <label class="policy-field policy-field-wide">
                <span>Reason</span>
                <textarea id="policy-rule-reason" rows="3" placeholder="Shared business channels cannot mutate the finance analyst agent filesystem">${escapeHtml(draft?.reason || "")}</textarea>
              </label>
              <label class="policy-field policy-field-wide">
                <span>Action contains</span>
                <input id="policy-rule-actionIncludes" type="text" value="${escapeHtml(formatCsv(draft?.actionIncludes))}" placeholder="write, patch, exec" />
              </label>
              <label class="policy-field policy-field-wide">
                <span>Action equals</span>
                <input id="policy-rule-actionEquals" type="text" value="${escapeHtml(formatCsv(draft?.actionEquals))}" placeholder="credential_read" />
              </label>
              <label class="policy-field policy-field-wide">
                <span>Actor channels</span>
                <input id="policy-rule-actorChannelIds" type="text" value="${escapeHtml(formatCsv(draft?.actorChannelIds))}" placeholder="slack:finance-room, telegram:group:treasury" />
              </label>
              <label class="policy-field">
                <span>Actor roles</span>
                <input id="policy-rule-actorRoleIds" type="text" value="${escapeHtml(formatCsv(draft?.actorRoleIds))}" placeholder="operator, moderator" />
              </label>
              <label class="policy-field">
                <span>Actor users</span>
                <input id="policy-rule-actorUserIds" type="text" value="${escapeHtml(formatCsv(draft?.actorUserIds))}" placeholder="u-123" />
              </label>
              <label class="policy-field">
                <span>Subject agents</span>
                <input id="policy-rule-subjectAgentIds" type="text" value="${escapeHtml(formatCsv(draft?.subjectAgentIds))}" placeholder="finance-analyst-agent" />
              </label>
              <label class="policy-field">
                <span>Subject sessions</span>
                <input id="policy-rule-subjectSessionIds" type="text" value="${escapeHtml(formatCsv(draft?.subjectSessionIds))}" placeholder="session-finance-room" />
              </label>
              <label class="policy-field">
                <span>Execution modes</span>
                <input id="policy-rule-executionModes" type="text" value="${escapeHtml(formatCsv(draft?.executionModes))}" placeholder="answer_only, read_only" />
              </label>
              <label class="policy-field policy-field-checkbox">
                <span>Enabled</span>
                <input id="policy-rule-enabled" type="checkbox" ${draft?.enabled === false ? "" : "checked"} />
              </label>
            </div>
            <div class="action-row compact">
              ${chip("Save guardrail", "active", 'data-policy-save="true"')}
              ${chip("New guardrail", "neutral", 'data-policy-create="true"')}
            </div>
          </article>
        `
      : emptyState("Guardrail editor unavailable", policyCatalog.note || "Attach policy.configPath to enable scoped guardrail editing from the dashboard.")
  );

  setHTML(
    "policy-channel-inventory",
    channelInventory.total
      ? channelInventory.byAgent
          .map((group) => {
            const channelCards = (group.channels || []).map((channel) => {
              const matchingRules = scopedRules.filter((rule) =>
                Array.isArray(rule.actorChannelIds) && rule.actorChannelIds.includes(channel.channelId) &&
                Array.isArray(rule.subjectAgentIds) && rule.subjectAgentIds.includes(channel.agentId)
              );
              return `
                <article class="list-card policy-rule-card">
                  <div class="split">
                    <div>
                      <strong>${escapeHtml(channel.channelId)}</strong>
                      <p>${escapeHtml(`${channel.lastPlane} · ${channel.lastAction}`)}</p>
                    </div>
                    <span class="status ${statusClass(channel.riskLevel)}">${escapeHtml(channel.riskLevel)}</span>
                  </div>
                  <p class="meta">${escapeHtml(`${channel.sessionIds?.length ?? 0} session(s) · ${channel.userIds?.length ?? 0} user(s) · ${channel.roleIds?.length ?? 0} role(s)`)} </p>
                  <p class="meta">${escapeHtml(`Last seen ${formatRelative(channel.lastSeenAt)}${matchingRules.length ? ` · ${matchingRules.length} scoped guardrail(s)` : " · no scoped guardrail yet"}`)}</p>
                  <div class="action-row compact">
                    ${chip("Control channel", "active", `data-channel-control="true" data-agent-id="${escapeHtml(channel.agentId)}" data-channel-id="${escapeHtml(channel.channelId)}" data-channel-risk="${escapeHtml(channel.riskLevel)}" data-channel-roles="${escapeHtml(formatCsv(channel.roleIds))}"`)}
                    ${matchingRules[0] ? chip("Edit guardrail", "neutral", `data-policy-edit-id="${escapeHtml(matchingRules[0].id)}"`) : ""}
                  </div>
                </article>
              `;
            }).join("");

            return `
              <article class="list-card policy-channel-group">
                <div class="split">
                  <div>
                    <strong>${escapeHtml(group.agentId)}</strong>
                    <p>${escapeHtml(`${group.channels.length} communication channel(s) observed`)}</p>
                  </div>
                  <span class="kv-value">${escapeHtml(String(group.channels.length))}</span>
                </div>
                <div class="stack compact-stack">
                  ${channelCards}
                </div>
              </article>
            `;
          })
          .join("")
      : emptyState("Communication Channels", "Observed Slack, Telegram, Discord, and other channel identities will appear once requests include actor.channelId.")
  );
}

function renderApprovals(state) {
  const priorityRank = { critical: 4, high: 3, review: 2, normal: 1 };
  const pendingRows = Array.isArray(state.approvals.pending)
    ? [...state.approvals.pending]
        .sort((left, right) => {
          const queueRankDelta = Number(left.queueRank ?? Number.MAX_SAFE_INTEGER) - Number(right.queueRank ?? Number.MAX_SAFE_INTEGER);
          if (queueRankDelta !== 0) return queueRankDelta;
          const rankDelta = (priorityRank[right.priorityLabel] || 0) - (priorityRank[left.priorityLabel] || 0);
          if (rankDelta !== 0) return rankDelta;
          return String(left.createdAt || "").localeCompare(String(right.createdAt || ""));
        })
        .slice(0, 6)
    : [];
  const recentRows = Array.isArray(state.approvals.recent) ? state.approvals.recent.filter((item) => item.status !== "pending").slice(0, 6) : [];
  const summary = state.approvals.summary;
  const queueHealth = state.approvals.queueHealth;
  const summaryCard = summary
    ? `
        <article class="list-card approval-summary-card">
          <div class="split">
            <div>
              <strong>${escapeHtml(summary.headline)}</strong>
              <p>${escapeHtml(summary.reason)}</p>
            </div>
            <span class="status ${statusClass(summary.status)}">${escapeHtml(summary.status)}</span>
          </div>
          <div class="summary-line">
            <span class="summary-chip">${escapeHtml(summary.riskLevel || "unknown")}</span>
            ${summary.timestamp ? `<span class="summary-chip">${escapeHtml(formatRelative(summary.timestamp))}</span>` : ""}
          </div>
        </article>
      `
    : "";

  const queueHealthCard = queueHealth
    ? `
        <article class="list-card approval-summary-card">
              <div class="split">
                <div>
                  <strong>Queue health</strong>
                  <p>${escapeHtml(`${queueHealth.pendingCount} pending · ${queueHealth.criticalCount} critical`)}</p>
                  <p class="meta">Alt+O open top pending · Alt+A approve top pending · Alt+D deny top pending</p>
                  <p class="meta">${escapeHtml(queueHealth.reviewTarget ? `Top pending: ${queueHealth.reviewTarget}` : "Top pending clears once the queue is empty.")}</p>
                  <p class="meta">${escapeHtml(queueHealth.reviewDetail ? `Why first: ${queueHealth.reviewDetail}` : "Why first clears once the queue is empty.")}</p>
                  <p class="meta">${escapeHtml(queueHealth.reviewRule ? `Rule hit: ${queueHealth.reviewRule}` : "Rule hit clears once the queue is empty.")}</p>
                  <p class="meta">${escapeHtml(queueHealth.reviewLane ? `Session lane: ${queueHealth.reviewLane}` : "Session lane clears once the queue is empty.")}</p>
                  <div class="action-row compact">
                    ${queueHealth.reviewRequestId ? chip("Open top pending", "neutral", `data-open-top-pending="true" data-approval-id="${escapeHtml(queueHealth.reviewRequestId)}"`) : ""}
                    ${queueHealth.reviewRequestId ? chip("Approve top pending", "active", `data-approval-response="approved" data-approval-id="${escapeHtml(queueHealth.reviewRequestId)}"`) : ""}
                    ${queueHealth.reviewRequestId ? chip("Deny top pending", "critical", `data-approval-response="denied" data-approval-id="${escapeHtml(queueHealth.reviewRequestId)}"`) : ""}
                  </div>
                </div>
${queueHealth.oldestCreatedAt ? `<span class="status status-warning">oldest ${escapeHtml(formatRelative(queueHealth.oldestCreatedAt))}</span>` : `<span class="status status-ok">clear</span>`}
          </div>
        </article>
      `
    : "";

  const renderApprovalTable = (rows, sectionLabel) =>
    rows.length
      ? `
          <div class="subhead">${escapeHtml(sectionLabel)}</div>
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
                      <div class="summary-line">
                        ${item.priorityLabel === "critical" ? `<span class="summary-chip status-critical">critical priority</span>` : item.priorityLabel === "high" ? `<span class="summary-chip status-warning">high priority</span>` : ""}
                      </div>
                          <div class="table-copy">${escapeHtml(item.triageDetail ?? item.note ?? item.reasons[0] ?? "Awaiting analyst disposition")}</div>
                          ${Array.isArray(item.matchedRules) && item.matchedRules.length ? `<div class="summary-line"><span class="summary-chip">${escapeHtml(item.matchedRules[0])}</span></div>` : ""}
</div>
                    <div class="table-cell">
                      <div class="table-title">${escapeHtml(item.sessionId)}</div>
                      <div class="table-copy">${escapeHtml(item.plane)} · ${escapeHtml(item.mode)}</div>
                      ${item.queuePositionLabel || item.sessionLaneLabel ? `
                        <div class="summary-line">
                          ${item.queuePositionLabel ? `<span class="summary-chip">${escapeHtml(item.queuePositionLabel)}</span>` : ""}
                          ${item.sessionLaneLabel ? `<span class="summary-chip">${escapeHtml(item.sessionLaneLabel)}</span>` : ""}
                        </div>
                      ` : ""}
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
      : emptyState(sectionLabel, sectionLabel === "Pending Decisions" ? "No approval requests are waiting on human action right now." : "No recent approval decisions have been recorded yet.");

  setHTML(
    "approvals",
        pendingRows.length || recentRows.length
          ? `
              ${summaryCard}
              ${queueHealthCard}
              ${renderApprovalTable(pendingRows, "Pending Decisions")}
              ${renderApprovalTable(recentRows, "Recent Decisions")}
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

  const pendingApprovalDrilldown = currentDrilldown.kind === "approval" && currentDrilldown.status === "pending";
  const queueNavigation = currentDrilldown.queueNavigation || {};

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
        ${
          pendingApprovalDrilldown
            ? `
                <div class="action-row compact">
                  ${chip("Approve in drilldown", "active", `data-approval-response="approved" data-approval-id="${escapeHtml(currentDrilldown.id)}"`)}
                  ${chip("Deny in drilldown", "critical", `data-approval-response="denied" data-approval-id="${escapeHtml(currentDrilldown.id)}"`)}
                  ${queueNavigation.previousRequestId ? chip("Previous pending", "neutral", `data-drilldown-kind="approval" data-drilldown-id="${escapeHtml(queueNavigation.previousRequestId)}"`) : ""}
                  ${queueNavigation.nextRequestId ? chip("Next pending", "neutral", `data-drilldown-kind="approval" data-drilldown-id="${escapeHtml(queueNavigation.nextRequestId)}"`) : ""}
                </div>
                    <p class="meta">Alt+← previous pending · Alt+→ next pending · Alt+A approve this pending · Alt+D deny this pending</p>
                    <p class="meta">${escapeHtml(queueNavigation.previousTarget ? `Previous: ${queueNavigation.previousTarget}${queueNavigation.previousDetail ? ` · ${queueNavigation.previousDetail}` : ""}${queueNavigation.previousRule ? ` · Rule hit: ${queueNavigation.previousRule}` : ""}` : "Already at the hottest pending approval.")}</p>
                    <p class="meta">${escapeHtml(queueNavigation.nextTarget ? `Next: ${queueNavigation.nextTarget}${queueNavigation.nextDetail ? ` · ${queueNavigation.nextDetail}` : ""}${queueNavigation.nextRule ? ` · Rule hit: ${queueNavigation.nextRule}` : ""}` : "No lower-priority pending approvals behind this one.")}</p>
`
            : ""
        }
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

function knowledgeBaseStatusClass(status) {
  if (status === "available") return "status-ok";
  if (status === "missing") return "status-warning";
  if (status === "fresh") return "status-ok";
  if (status === "seeded") return "status-pending";
  return "status-warning";
}

function knowledgeBaseEntryStatusClass(status) {
  if (status === "open" || status === "missing") return "kb-status-open";
  if (status === "draft") return "kb-status-draft";
  if (status === "available") return "kb-status-available";
  return "";
}

function buildKnowledgeBaseHaystack(entry) {
  return [
    entry.title,
    entry.summary,
    entry.detail,
    entry.location,
    entry.value,
    ...(Array.isArray(entry.tags) ? entry.tags : []),
    ...(Array.isArray(entry.chips) ? entry.chips : []),
    ...(Array.isArray(entry.facts) ? entry.facts.flatMap((fact) => [fact.label, fact.value]) : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function filterKnowledgeBaseEntries(entries) {
  const query = kbSearchQuery.trim().toLowerCase();
  return (Array.isArray(entries) ? entries : []).filter((entry) => {
    if (kbCategoryFilter !== "all" && entry.category !== kbCategoryFilter) {
      return false;
    }
    if (!query) return true;
    return buildKnowledgeBaseHaystack(entry).includes(query);
  });
}

function filterKnowledgeBaseSections(sections, filteredEntries) {
  const query = kbSearchQuery.trim().toLowerCase();
  return (Array.isArray(sections) ? sections : []).filter((section) => {
    if (!query) {
      return kbCategoryFilter === "all" ? true : section.id === kbCategoryFilter;
    }
    const hasMatchingEntry = filteredEntries.some((entry) => entry.category === section.id);
    const sectionHaystack = [section.id, section.title, section.description].join(" ").toLowerCase();
    return hasMatchingEntry || sectionHaystack.includes(query);
  });
}

function renderKnowledgeBase(state) {
  const knowledgeBase = state.knowledgeBase || {};
  const access = knowledgeBase.access || {};
  const entries = Array.isArray(knowledgeBase.entries) ? knowledgeBase.entries : [];
  const sections = Array.isArray(knowledgeBase.sections) ? knowledgeBase.sections : [];
  const runtimeContextEntries = Array.isArray(knowledgeBase.runtimeContext) ? knowledgeBase.runtimeContext : [];
  const filteredEntries = filterKnowledgeBaseEntries(entries);
  const filteredSections = filterKnowledgeBaseSections(sections, filteredEntries);
  const filteredRuntimeContext = filteredEntries.filter((entry) => entry.category === "runtime_context");
  const filteredKnowledgeEntries = filteredEntries.filter((entry) => entry.category !== "runtime_context");
  const activeFilterLabel = kbCategoryFilter === "all" ? "All entries" : KB_CATEGORY_LABELS[kbCategoryFilter] || "Filtered";

  setText(
    "kb-summary",
    `${filteredEntries.length} of ${entries.length} repository-derived KB items visible. Search across sources, concepts, articles, open questions, file structure, and runtime context without leaving Mission Control.`
  );

  setHTML(
    "kb-access-panel",
    `
      <article class="kb-access-card">
        <div class="split">
          <div>
            <strong>Canonical Access</strong>
            <p>Config-backed access coordinates for the current Mission Control instance.</p>
          </div>
          <span class="status ${knowledgeBaseStatusClass(access.lastVerifiedStatus)}">${escapeHtml(access.lastVerifiedStatus || "seeded")}</span>
        </div>
        <div class="kb-access-grid">
          <div class="kb-access-row">
            <div class="kb-label">Base URL</div>
            <div class="kb-value"><a class="kb-link" href="${escapeHtml(access.baseUrl || "http://127.0.0.1:3000")}">${escapeHtml(access.baseUrl || "http://127.0.0.1:3000")}</a></div>
          </div>
          <div class="kb-access-row">
            <div class="kb-label">Dashboard URL</div>
            <div class="kb-value"><a class="kb-link" href="${escapeHtml(access.dashboardUrl || "http://127.0.0.1:3000/dashboard")}">${escapeHtml(access.dashboardUrl || "http://127.0.0.1:3000/dashboard")}</a></div>
          </div>
          <div class="kb-access-row">
            <div class="kb-label">Knowledge Base URL</div>
            <div class="kb-value"><a class="kb-link" href="${escapeHtml(access.knowledgeBaseUrl || "http://127.0.0.1:3000/dashboard/knowledge-base")}">${escapeHtml(access.knowledgeBaseUrl || "http://127.0.0.1:3000/dashboard/knowledge-base")}</a></div>
          </div>
          <div class="kb-access-row">
            <div class="kb-label">Last Verified</div>
            <div class="kb-value">${escapeHtml(access.lastVerifiedAt ? `${formatTimestamp(access.lastVerifiedAt)} · ${access.lastVerifiedStatus}` : "Not yet verified")}</div>
          </div>
        </div>
      </article>
    `
  );

  setHTML(
    "kb-index-cards",
    filteredSections.length
        ? filteredSections
          .map(
            (section) => `
              <article class="kb-index-card" data-kb-section="${escapeHtml(section.id)}" tabindex="0" role="button" aria-label="Filter knowledge base to ${escapeHtml(section.title)}">
                <div class="split">
                  <strong>${escapeHtml(section.title)}</strong>
                  <span class="status ${statusClass(section.accent === "warning" ? "warning" : section.accent === "pending" ? "pending" : "ok")}">${escapeHtml(section.accent)}</span>
                </div>
                <div class="kb-index-count">${escapeHtml(String(section.count))}</div>
                <p>${escapeHtml(section.description)}</p>
              </article>
            `
          )
          .join("")
      : emptyState("No domain matches", "Adjust the search text or clear the filters to restore the full knowledge-domain index.")
  );

  const filterChips = [
    chip("All entries", kbCategoryFilter === "all" ? "active" : "neutral", 'data-kb-filter="all"'),
    ...Object.entries(KB_CATEGORY_LABELS).map(([key, label]) =>
      chip(label, kbCategoryFilter === key ? "active" : "neutral", `data-kb-filter="${escapeHtml(key)}"`)
    ),
  ].join("");
  setHTML("kb-filter-chips", filterChips);
  for (const button of document.querySelectorAll("[data-kb-filter]")) {
    button.classList.toggle("is-active", button.dataset.kbFilter === kbCategoryFilter);
  }

  setText(
    "kb-search-meta",
    kbSearchQuery || kbCategoryFilter !== "all"
      ? `Showing ${filteredEntries.length} matching item${filteredEntries.length === 1 ? "" : "s"} in ${activeFilterLabel}, including ${filteredRuntimeContext.length} runtime-context card${filteredRuntimeContext.length === 1 ? "" : "s"}.`
      : `Showing all ${entries.length} knowledge base items, including ${runtimeContextEntries.length} runtime-context cards.`
  );

  setHTML(
    "kb-runtime-context",
    filteredRuntimeContext.length
      ? filteredRuntimeContext
          .map(
            (entry) => `
              <article class="kb-runtime-card">
                <div class="kb-entry-head">
                  <div>
                    <div class="kb-label">${escapeHtml(KB_CATEGORY_LABELS[entry.category] || entry.category)}</div>
                    <h4>${escapeHtml(entry.title)}</h4>
                  </div>
                  <span class="kb-status ${knowledgeBaseEntryStatusClass(entry.status)}">${escapeHtml(entry.status || "curated")}</span>
                </div>
                <div class="kb-runtime-value">${escapeHtml(entry.value || "missing/not configured")}</div>
                ${entry.excerpt ? `<p class="kb-entry-excerpt">${escapeHtml(entry.excerpt)}</p>` : ""}
                <p>${escapeHtml(entry.summary)}</p>
                <p class="kb-entry-detail">${escapeHtml(entry.detail)}</p>
                ${
                  Array.isArray(entry.facts) && entry.facts.length
                    ? `<div class="kb-runtime-facts">
                        ${entry.facts
                          .map(
                            (fact) => `
                              <div class="kb-runtime-fact">
                                <div class="kb-label">${escapeHtml(fact.label)}</div>
                                <div class="kb-value">${escapeHtml(fact.value)}</div>
                              </div>
                            `
                          )
                          .join("")}
                      </div>`
                    : ""
                }
                <div class="kb-tag-row">
                  ${[...(Array.isArray(entry.chips) ? entry.chips : []), ...(Array.isArray(entry.tags) ? entry.tags : [])]
                    .map((tag) => `<span class="kb-tag">${escapeHtml(tag)}</span>`)
                    .join("")}
                </div>
              </article>
            `
          )
          .join("")
      : emptyState("No runtime context matches", "Adjust the search text or clear the category filter to restore runtime context probes.")
  );

  setHTML(
    "kb-entry-list",
    filteredKnowledgeEntries.length
      ? filteredKnowledgeEntries
          .map(
            (entry) => `
              <article class="kb-entry-card">
                <div class="kb-entry-head">
                  <div>
                    <div class="kb-label">${escapeHtml(KB_CATEGORY_LABELS[entry.category] || entry.category)}</div>
                    <h4>${escapeHtml(entry.title)}</h4>
                  </div>
                  <span class="kb-status ${knowledgeBaseEntryStatusClass(entry.status)}">${escapeHtml(entry.status || "curated")}</span>
                </div>
                <p>${escapeHtml(entry.summary)}</p>
                <p class="kb-entry-detail">${escapeHtml(entry.detail)}</p>
                <div class="kb-entry-meta">
                  <div class="kb-entry-location">${escapeHtml(entry.location || entry.href || "Mission Control reference")}</div>
                  ${entry.href ? `<a class="section-link" href="${escapeHtml(entry.href)}">Open reference</a>` : ""}
                </div>
                <div class="kb-tag-row">
                  ${[...(Array.isArray(entry.chips) ? entry.chips : []), ...(Array.isArray(entry.tags) ? entry.tags : [])]
                    .map((tag) => `<span class="kb-tag">${escapeHtml(tag)}</span>`)
                    .join("")}
                </div>
              </article>
            `
          )
          .join("")
      : filteredRuntimeContext.length
        ? emptyState("No non-runtime matches", "All current matches are in Runtime Context above.")
        : emptyState("No KB matches", "Adjust the search text or clear the category filter.")
  );

  for (const card of document.querySelectorAll("[data-kb-section]")) {
    const activate = () => navigateKnowledgeBaseFilter(card.dataset.kbSection);
    card.onclick = activate;
    card.onkeydown = (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activate();
      }
    };
  }
}

function render(state) {
  currentState = state;
  renderHero(state);
  renderMetrics(state);
  renderControlMatrix(state);
  renderCommandDeck(state);
  renderOperatorWorkbench(state);
  renderPriorityQueue(state);
  renderOperatorTimeline(state);
  renderIncidentCommand(state);
  renderInvestigationWorkbench(state);
  renderSystemHealth(state);
  renderOrganizationControlPlane(state);
  renderRiskPosture(state);
  renderPolicy(state);
  renderApprovals(state);
  renderRuntimeFlows(state);
  renderEvidenceGraph(state);
  renderDrilldown();
  renderAuditFeed(state);
  renderInspectionActivity(state);
  renderEventFeed(state);
  renderKnowledgeBase(state);
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

function clearDrilldownSelection() {
  currentDrilldown = null;
  currentDrilldownRef = null;
  renderDrilldown();
}

async function handleMissingDrilldownAfterRefresh() {
  const missingApprovalDrilldown = currentDrilldownRef?.kind === "approval";
  const nextPendingId = currentState?.approvals?.queueHealth?.reviewRequestId ?? currentState?.approvals?.pending?.[0]?.requestId ?? null;
  if (missingApprovalDrilldown && nextPendingId) {
    await loadDrilldown("approval", nextPendingId);
    showActionFeedback("Approval updated", `Approval already resolved elsewhere. Moved to next pending: ${currentState?.approvals?.queueHealth?.reviewTarget ?? "pending approval"}.`);
    return;
  }

  clearDrilldownSelection();
  if (missingApprovalDrilldown) {
    applyConsoleMode("core");
    showActionFeedback("Approval updated", "Approval already resolved elsewhere. Queue clear. Back to core console.");
  }
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
      await handleMissingDrilldownAfterRefresh();
    }
  }
}

async function openTopPendingApproval(topPendingId) {
  if (!topPendingId) return;
  applyConsoleMode("advanced");
  await loadDrilldown("approval", topPendingId);
}

function isPendingApprovalDrilldown() {
  return currentDrilldown?.kind === "approval" && currentDrilldown?.status === "pending";
}

function getTopPendingApprovalTarget() {
  return currentState?.approvals?.queueHealth?.reviewRequestId ?? currentState?.approvals?.pending?.[0]?.requestId ?? null;
}

function getPendingApprovalHotkeyTarget() {
  if (isPendingApprovalDrilldown()) {
    return currentDrilldown.id;
  }
  return getTopPendingApprovalTarget();
}

async function openApprovalNeighbor(direction) {
  if (!isPendingApprovalDrilldown()) return;
  const queueNavigation = currentDrilldown.queueNavigation || {};
  const targetId = direction === "previous"
    ? queueNavigation.previousRequestId
    : queueNavigation.nextRequestId;
  if (!targetId) return;
  applyConsoleMode("advanced");
  await loadDrilldown("approval", targetId);
}

async function handoffToNextPendingApproval(nextRequestId) {
  const candidateIds = [
    nextRequestId,
    currentState?.approvals?.queueHealth?.reviewRequestId,
    currentState?.approvals?.pending?.[0]?.requestId,
  ].filter((value, index, items) => Boolean(value) && items.indexOf(value) === index);

  for (const candidateId of candidateIds) {
    try {
      applyConsoleMode("advanced");
      await loadDrilldown("approval", candidateId);
      return { ok: true, shifted: candidateId !== nextRequestId };
    } catch {
      continue;
    }
  }

  clearDrilldownSelection();
  applyConsoleMode("core");
  return { ok: false, shifted: true };
}

function escapeApprovalNoteSegment(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/[|]+/g, " ")
    .trim();
}

function findApprovalDecisionContext(approvalId) {
  if (currentDrilldown?.kind === "approval" && currentDrilldown?.id === approvalId) {
    const drilldownRule = currentDrilldown.facts?.find((fact) => fact.label === "Rule hit")?.value ?? null;
    return {
      action: currentDrilldown.title,
      sessionId: currentDrilldown.related?.sessions?.[0] ?? null,
      matchedRule: drilldownRule,
    };
  }

  const approvals = [
    ...(currentState?.approvals?.pending ?? []),
    ...(currentState?.approvals?.recent ?? []),
  ];
  return approvals.find((item) => item.requestId === approvalId) ?? null;
}

function buildApprovalDecisionNoteDefault(approvalId, decision) {
  const context = findApprovalDecisionContext(approvalId);
  const detailSegments = [
    escapeApprovalNoteSegment(context?.action),
    escapeApprovalNoteSegment(context?.sessionId),
    escapeApprovalNoteSegment(context?.matchedRule),
  ].filter(Boolean);

  return detailSegments.length
    ? `${decision} ${detailSegments.join(" · ")} from console`
    : `Decision ${decision} from console`;
}

async function submitApprovalDecision(approvalId, decision) {
  const defaultNote = buildApprovalDecisionNoteDefault(approvalId, decision);
  const operatorNote = window.prompt("Add a short operator note", defaultNote);
  if (operatorNote === null) return;
  const result = await postJSON(`/approval/${encodeURIComponent(approvalId)}/respond`, {
    decision,
    approvedBy: "dashboard-operator",
    note: operatorNote.trim() || defaultNote,
  });
  await refresh();
  const pendingCount = Number(result?.queue?.pendingCount ?? 0);
  const criticalCount = Number(result?.queue?.criticalCount ?? 0);
  let handoff = { ok: pendingCount === 0, shifted: false };
  if (pendingCount > 0) {
    handoff = await handoffToNextPendingApproval(result?.queue?.nextRequestId ?? approvalId);
  } else {
    clearDrilldownSelection();
    applyConsoleMode("core");
  }
  const queueMessage = pendingCount > 0
    ? `${pendingCount} pending remain. ${criticalCount > 0 ? `${criticalCount} critical still pending. ` : ""}${result?.queue?.nextTarget ? `Next up: ${result.queue.nextTarget}. ` : ""}${result?.queue?.nextTargetDetail ? `${result.queue.nextTargetDetail}. ` : ""}${result?.queue?.nextRule ? `Rule hit: ${result.queue.nextRule}. ` : ""}${result?.queue?.nextLane ? `Session lane: ${result.queue.nextLane}. ` : ""}${result?.queue?.nextTarget ? `Hotkeys now target ${result.queue.nextTarget}.` : ""}${handoff.shifted ? ` Queue shifted while you were deciding. ${handoff.ok ? "Moved to the latest pending approval." : "Back to core console."}` : ""}`.trim()
    : "Queue clear. Back to core console.";
  showActionFeedback("Decision saved", `Approval ${decision} with note recorded. ${queueMessage}`.trim());
}

function installKnowledgeBaseControls() {
  const input = document.getElementById("kb-search");
  if (input) {
    input.addEventListener("input", (event) => {
      kbSearchQuery = event.target.value || "";
      if (currentState) {
        renderKnowledgeBase(currentState);
      }
    });
  }
  const clearButton = document.getElementById("kb-clear-search");
  if (clearButton) {
    clearButton.addEventListener("click", () => {
      kbSearchQuery = "";
      kbCategoryFilter = "all";
      if (input) {
        input.value = "";
        input.focus();
      }
      if (currentState) {
        renderKnowledgeBase(currentState);
      }
    });
  }
}

function installActions() {
  document.addEventListener("click", async (event) => {
    const target = event.target.closest("button");
    if (!target) return;

    try {
      if (target.dataset.kbFilter) {
        navigateKnowledgeBaseFilter(target.dataset.kbFilter);
        return;
      }

      if (target.dataset.policyEditId) {
        policyEditorRuleId = target.dataset.policyEditId;
        clearPolicyEditorPreset();
        clearPolicyEditorFeedback();
        renderPolicy(currentState);
        jumpToPanel("policy-panel");
        return;
      }

      if (target.dataset.channelControl) {
        policyEditorRuleId = null;
        setPolicyEditorPreset(buildChannelPolicyPreset({
          agentId: target.dataset.agentId,
          channelId: target.dataset.channelId,
          riskLevel: target.dataset.channelRisk,
          roleIds: parseCsvValue(target.dataset.channelRoles),
          lastPlane: "tool",
          lastAction: "channel_scope",
        }));
        clearPolicyEditorFeedback();
        renderPolicy(currentState);
        jumpToPanel("policy-panel");
        return;
      }

      if (target.dataset.policyCreate) {
        policyEditorRuleId = null;
        clearPolicyEditorPreset();
        clearPolicyEditorFeedback();
        renderPolicy(currentState);
        jumpToPanel("policy-panel");
        return;
      }

      if (target.dataset.policySave) {
        const payload = collectPolicyEditorPayload();
        if (!confirmDangerousPolicySave(payload)) {
          setPolicyEditorFeedback("warning", "Guardrail save cancelled. Advanced User confirmation is required for broad allow/disable/all-plane changes.");
          renderPolicy(currentState);
          jumpToPanel("policy-panel");
          return;
        }
        try {
          const result = await postJSON("/api/dashboard/control/policy-scoped-rule", payload);
          policyEditorRuleId = result?.rule?.id || payload.id || null;
          clearPolicyEditorPreset();
          setPolicyEditorFeedback("ok", `Scoped guardrail ${policyEditorRuleId || "saved"} is live.`);
          await refresh();
          jumpToPanel("policy-panel");
        } catch (error) {
          setPolicyEditorFeedback("error", error.message);
          renderPolicy(currentState);
          jumpToPanel("policy-panel");
        }
        return;
      }

      if (target.dataset.approvalMode) {
        if (target.dataset.approvalMode === "never") {
          const ok = window.confirm("Advanced User confirmation: NEVER mode auto-approves approval-required requests. Continue?");
          if (!ok) return;
        }
        await postJSON("/api/dashboard/control/approval-mode", { mode: target.dataset.approvalMode });
        await refresh();
        return;
      }

      if (target.dataset.floodguardMode) {
        await postJSON("/api/dashboard/control/floodguard-mode", {
          mode: target.dataset.floodguardMode,
          durationMs: target.dataset.floodguardDuration ? Number(target.dataset.floodguardDuration) : undefined,
        });
        await refresh();
        return;
      }

      if (target.dataset.floodguardSession) {
        await postJSON(`/api/dashboard/control/floodguard-session/${encodeURIComponent(target.dataset.floodguardSession)}`, {
          action: "set",
          multiplier: target.dataset.floodguardMultiplier ? Number(target.dataset.floodguardMultiplier) : 1.5,
          durationMs: target.dataset.floodguardDuration ? Number(target.dataset.floodguardDuration) : 900000,
        });
        await refresh();
        return;
      }

      if (target.dataset.floodguardSessionClear) {
        await postJSON(`/api/dashboard/control/floodguard-session/${encodeURIComponent(target.dataset.floodguardSessionClear)}`, {
          action: "clear",
        });
        await refresh();
        return;
      }

      if (target.dataset.simulationAction) {
        await postJSON("/api/dashboard/control/simulation", { action: target.dataset.simulationAction });
        await refresh();
        return;
      }

      if (target.dataset.sessionAction && target.dataset.sessionId) {
        const action = target.dataset.sessionAction;
        if (action === "terminate") {
          const ok = window.confirm(`Terminate ${target.dataset.sessionId}? This is hard containment and cannot be resumed.`);
          if (!ok) return;
        }
        await postJSON(`/api/dashboard/control/session/${encodeURIComponent(target.dataset.sessionId)}`, {
          action,
          confirm: action === "terminate",
          note: `Operator ${action} via dashboard`,
        });
        await refresh();
        if (target.dataset.sessionId) {
          await loadDrilldown("session", target.dataset.sessionId);
        }
        return;
      }

      if (target.dataset.approvalResponse && target.dataset.approvalId) {
        await submitApprovalDecision(target.dataset.approvalId, target.dataset.approvalResponse);
        return;
      }

      if (target.dataset.openTopPending && target.dataset.approvalId) {
        await openTopPendingApproval(target.dataset.approvalId);
        return;
      }

      if (target.dataset.jumpPanel) {
        if (target.dataset.jumpPanel === "knowledge-base") {
          applyAppView("knowledge-base", true);
          return;
        }
        jumpToPanel(target.dataset.jumpPanel);
        return;
      }

      if (target.dataset.playbook) {
        const mode = target.dataset.playbook;
        if (mode === "strict-approvals") {
          await postJSON('/api/dashboard/control/approval-mode', { mode: 'always' });
        } else if (mode === "restore-auto") {
          await postJSON('/api/dashboard/control/approval-mode', { mode: 'auto' });
        } else if (mode === "pause-high-risk") {
          const sessions = (currentState?.sessions?.recent ?? []).filter((s) => ["high", "critical"].includes(String(s.riskLevel)) && s.status === "active");
          for (const session of sessions.slice(0, 8)) {
            await postJSON(`/api/dashboard/control/session/${encodeURIComponent(session.sessionId)}`, { action: 'pause', note: 'Containment playbook: pause high-risk sessions' });
          }
        } else if (mode === "terminate-critical") {
          const ok = window.confirm('Terminate active critical sessions? This is an emergency containment action.');
          if (!ok) return;
          const sessions = (currentState?.sessions?.recent ?? []).filter((s) => String(s.riskLevel) === "critical" && s.status === "active");
          for (const session of sessions.slice(0, 8)) {
            await postJSON(`/api/dashboard/control/session/${encodeURIComponent(session.sessionId)}`, { action: 'terminate', confirm: true, note: 'Containment playbook: terminate critical sessions' });
          }
        }
        await refresh();
        return;
      }

      if (target.dataset.drilldownKind && target.dataset.drilldownId) {
        applyConsoleMode("advanced");
        await loadDrilldown(target.dataset.drilldownKind, target.dataset.drilldownId);
      }
    } catch (error) {
      setHTML("drilldown", emptyState("Action failed", error.message));
    }
  });

  document.addEventListener("keydown", async (event) => {
    if (!event.altKey) return;
    const key = String(event.key || "").toLowerCase();
    const navigationKey = event.key === "ArrowLeft" ? "previous" : event.key === "ArrowRight" ? "next" : null;
    if (key !== "a" && key !== "d" && key !== "o" && !navigationKey) return;
    const approvalTargetId = getPendingApprovalHotkeyTarget();
    const topPendingApprovalTarget = getTopPendingApprovalTarget();
    if ((!approvalTargetId && key !== "o") || (key === "o" && !topPendingApprovalTarget && !navigationKey)) return;
    event.preventDefault();
    try {
      if (navigationKey) {
        await openApprovalNeighbor(navigationKey);
        return;
      }
      if (key === "o") {
        await openTopPendingApproval(getTopPendingApprovalTarget());
        return;
      }
      await submitApprovalDecision(approvalTargetId, key === "a" ? "approved" : "denied");
    } catch (error) {
      setHTML("drilldown", emptyState("Action failed", error.message));
    }
  });
}

async function boot() {
  renderLoading();
  installAppNavigation();
  installConsoleModeSwitch();
  installKnowledgeBaseControls();
  installActions();
  try {
    await refresh();
  } catch (error) {
    setText("service-status", "Agentwall console unavailable");
    setText("service-summary", error.message);
    setHTML("priority-queue", emptyState("Runtime unavailable", error.message));
    setHTML("event-feed", emptyState("Runtime unavailable", error.message));
    setHTML("kb-access-panel", emptyState("Runtime unavailable", error.message));
    setHTML("kb-entry-list", emptyState("Runtime unavailable", error.message));
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
