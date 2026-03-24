# Agentwall Research Backlog

Areas being tracked for post-MVP development. Nothing here is in scope until the core inline enforcement engine is production-ready. Entries are ordered roughly by dependency on the MVP foundation.

---

## 1. Agentic antivirus

**Problem:** Agents retrieve, process, and forward files and web content. Malicious payloads can be embedded in documents, images, or structured data returned from external sources.

**Research direction:**
- Stream-scan agent I/O for known malware signatures (YARA rules, hash databases)
- Detect polyglot files (e.g., PDF+executable, SVG+script) before an agent writes them to disk or forwards them
- Integration point: `content` plane pre-processor, runs before DLP

**Open questions:**
- Scan at ingestion (agent receives content) vs. egress (agent writes/sends content) vs. both?
- How to handle archive files (zip bombs, nested archives)?
- Performance budget: content scanning must not meaningfully increase hot-path latency

**Dependencies:** Content plane MVP, streaming inspection API

---

## 2. Prompt injection detection

**Problem:** Agents reading external content (web pages, documents, emails, API responses) can be hijacked by adversarial instructions embedded in that content. This is the highest-severity class of agent-specific attack.

**Research direction:**
- Classify `web`, `email`, and user-originated content as untrusted before it enters the agent's context
- Heuristic detection of injection patterns: instruction-like text in non-instruction contexts, role-switching language, "ignore previous instructions" patterns
- Model-based classifiers trained on injection examples
- Canary tokens: inject known strings into agent context; detect if they appear in tool actions (signals the agent was manipulated)

**Open questions:**
- False positive rate is the primary constraint — over-blocking legitimate content is unacceptable
- Should Agentwall redact suspected injections or flag them for human review?
- How does detection interact with multi-turn sessions where context accumulates?

**Dependencies:** Content plane MVP, trust label propagation across planes

---

## 3. Email security plane

**Problem:** Email is a primary vector for agent compromise — phishing links, malicious attachments, social engineering payloads directed at agents managing inboxes.

**Research direction:**
- New `email` plane alongside existing planes
- Inspect inbound messages before they enter agent context: SPF/DKIM/DMARC validation, link defang, attachment scanning
- Rate-limit outbound sends; require approval for bulk sends or sends to new recipients
- Detect agents being used to send spam or exfiltrate data via email

**MVP scope for this feature:**
- Approval gate on any outbound email send action
- Link extraction and SSRF-style blocklist check on URLs in email body
- Attachment DLP scan before agent receives file content

**Dependencies:** Email integration adapter, content plane, SSRF network inspector

---

## 4. Browser threat defense

**Problem:** Beyond the current payment/OAuth gates, browser-using agents face a broader attack surface: malicious redirects, drive-by downloads, clickjacking, fake login pages harvesting credentials.

**Research direction:**
- URL reputation checking against threat intel feeds before navigation
- Detect credential form submission to non-allowlisted domains (potential credential phishing)
- Screenshot-based anomaly detection: flag pages that look like login forms on unexpected domains
- Block resource loads (iframes, scripts) from known malicious hosts
- Give operators an OSINT-oriented workflow for triaging suspicious destinations without forcing those lookups into the blocking path

**Current state:** `browser` plane blocks payment submission and gates OAuth flows. The rest of the browser threat surface is unguarded.

**Open questions:**
- How to integrate URL reputation without introducing high-latency lookups in the hot path?
- Cached vs. real-time reputation checks trade-off
- How to handle HTTPS inspection for browser traffic?

**Dependencies:** Browser plane MVP, threat intel feed integration, URL normalization

---

## 5. Adversarial testing lab

**Problem:** It is impossible to have confidence in a firewall that has not been systematically attacked. Agentwall needs a structured adversarial testing program, not just unit tests.

**Research direction:**
- **Prompt injection corpus:** Curated dataset of injection attempts across categories (role-switching, instruction override, encoding evasion, multi-step). Used to benchmark detection modules.
- **Evasion test suite:** Automated tests that attempt to bypass each built-in rule via encoding tricks, Unicode normalization, nested structures, and timing attacks.
- **Fuzzing harness:** Property-based fuzzing of the policy engine and plane inspectors with arbitrary `AgentContext` inputs.
- **Red team playbooks:** Documented attack chains that chain multiple planes (e.g., prompt injection → SSRF → credential exfil) to test Agentwall's defense in depth.
- **Benchmark suite:** Latency and throughput benchmarks for the hot path under load, to catch performance regressions from new rules or inspectors.
- **Battleground fixtures:** Scenario fixtures grounded in ATT&CK-style TTPs and current OSINT casework so tests resemble real operator incidents instead of synthetic strings.

**Target:** Every built-in rule should have at least one positive test (rule fires) and one evasion attempt test (rule resists bypass). No rule ships without both.

**Dependencies:** Core test infrastructure, adversarial examples dataset

---

## 6. Agent identity and trust tiers

**Problem:** Not all agents should have the same policy. A low-trust agent handling user-uploaded content warrants stricter rules than a high-trust internal agent processing structured data.

**Research direction:**
- Agent identity attestation: how does Agentwall verify the claimed `agentId`?
- Policy sets scoped to agent trust tier (tiered rule sets, not one global policy)
- Session-level trust decay: an agent that has triggered multiple risky rules in a session should face stricter policy for subsequent actions
- Integration with external identity providers (Workload Identity, mTLS)

**Dependencies:** Core policy engine, config system extension

---

## 7. Policy-as-code and GitOps

**Problem:** Operators need to manage Agentwall policy the same way they manage infrastructure — version-controlled, reviewed, auditable.

**Research direction:**
- YAML-based policy file format with a well-defined schema (beyond the current `agentwall.config.yaml`)
- Policy validation CLI: `agentwall policy lint` catches conflicts, unreachable rules, and missing plane coverage before deployment
- Git-native workflow: policy changes go through PR review; Agentwall loads policy on startup from a file, not a database
- Policy diff tooling: show what changes between two policy versions in human-readable form
- Optional ATT&CK annotations on rules and detections when that context improves review, coverage discussions, or audit interpretation

**Dependencies:** Config system, rule schema stabilization

---

## 8. Threat-intel-assisted triage

**Problem:** Operators need context on suspicious URLs, domains, files, and hashes, but live intelligence lookups should not become a hard dependency for inline enforcement.

**Research direction:**
- Keep threat-intel enrichment asynchronous and operator-facing first
- Start with lightweight evidence packaging: emit normalized URLs, domains, hashes, and file metadata so analysts can investigate quickly
- Add future enrichment adapters for services such as VirusTotal without coupling the policy engine to any single provider
- Reuse enrichment output in battleground fixtures and regression cases when it improves realism

**Dependencies:** Stable audit schema, artifact normalization, dashboard or queue surfaces for triage

---

## Not on the roadmap (intentional scope exclusions)

- **General WAF:** Agentwall is not a web application firewall. It does not inspect traffic between external clients and APIs.
- **IDS/IPS:** No packet-level inspection or network flow analysis.
- **Secrets management:** Agentwall detects secrets in transit. It does not store, rotate, or manage them.
- **Agent orchestration:** Agentwall enforces policy on agents; it does not schedule, route, or manage them.
- **Model safety filters:** Content moderation and harm filtering are the model provider's responsibility. Agentwall enforces *actions*, not *outputs*.
