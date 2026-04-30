# Agentwall agentic security research memo

Date: 2026-04-20
Owner: Hermes
Status: research synthesis for build prioritization

## Objective

Find the strongest recommendations for making agentic systems like OpenClaw, Hermes-Agent, Pi Agent, and similar tool-using AI systems materially safer at runtime, then map those findings into concrete build priorities for Agentwall.

## Method note

Primary-source web scraping through the normal web tool path was rate-limited during this run, so this memo used:
- direct repo/document fetches from official URLs where possible
- current Agentwall repo docs as ground truth for existing capability
- official framework and project pages for OWASP, NIST, MCP, SAIF, and key tool repos

This is strong enough for product prioritization. If we want a citation-perfect market/analyst packet later, we can do a second pass with a paid research path.

## Current Agentwall truth from repo

Already present in this repo:
- default-deny egress and SSRF/private-range blocking
- six-plane policy model
- provenance and trust-label aware decisions
- approval gate with persistent queue
- structured audit events
- dashboard and operator controls
- actor-scoped policy
- DLP detections
- FloodGuard queue/pressure controls
- isolated red-vs-blue scenario harness

Grounded in current docs:
- `docs/threat-model.md`
- `docs/roadmap.md`
- `docs/red-blue-scenario-cards-and-results-2026-04-03.md`
- `README.md`

That matters because Agentwall is already beyond prompt-only safety theater. The next gains are mostly in execution containment, identity, attestations, and agent-specific security regression testing.

## What the research says the real problem is

For agentic systems, the central problem is not just "bad prompts." It is this:

> an LLM cannot be trusted to reliably separate trusted instructions from untrusted data while also holding real permissions, tools, secrets, memory, and network access.

Once an agent can browse, call tools, read files, use credentials, or act through other agents, prompt injection becomes an execution problem.

## Strong source-backed threat model

### 1. Prompt injection is still the top entry point
OWASP LLM01 says prompt injection vulnerabilities exist in how models process prompts and that inputs can force the model to violate guidelines, enable unauthorized access, or influence critical decisions. It also explicitly says RAG and fine-tuning do not fully mitigate prompt injection vulnerabilities.

Source:
- https://genai.owasp.org/llmrisk/llm01-prompt-injection/

Why it matters for Agentwall:
- browsing, web fetches, email ingestion, OCR, retrieved memory, and tool output are all attacker-controlled input surfaces
- provenance labels are necessary but not sufficient unless they affect authorization and execution paths

### 2. Excessive agency is what turns LLM weirdness into damage
OWASP LLM06 defines excessive agency as the vulnerability that enables damaging actions to be performed in response to unexpected, ambiguous, or manipulated LLM outputs. It ties root cause to excessive functionality, excessive permissions, and excessive autonomy.

Source:
- https://genai.owasp.org/llmrisk/llm062025-excessive-agency/

Why it matters for Agentwall:
- Agentwall should be the anti-excessive-agency layer
- the product moat is not “better prompting,” it is permission minimization plus runtime containment

### 3. NIST treats GenAI as both a force multiplier for attackers and a new attack surface
NIST AI 600-1 says GAI-based systems present two primary information security risks: they can lower barriers for offensive cyber activity, and they expand attack surface because GAI itself is vulnerable to attacks like prompt injection or data poisoning.

Source:
- https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf

Why it matters for Agentwall:
- the product needs both prevention and evidence
- you are not just blocking bad outputs, you are constraining an automation system that may become part of an attack chain

### 4. MCP and tool servers must be treated as arbitrary code and untrusted metadata
The MCP spec is explicit: tools represent arbitrary code execution and must be treated with caution. Tool descriptions and annotations should be considered untrusted unless obtained from a trusted server. It also emphasizes user consent and control.

Source:
- https://modelcontextprotocol.io/specification/2025-03-26

Why it matters for Agentwall:
- MCP servers are not just integrations
- they are supply-chain plus execution-boundary plus prompt-injection surfaces all at once

### 5. Google SAIF is now explicitly focusing on agents
Google’s SAIF guidance has moved to “Secure Agents” and frames the work as building powerful agents users can trust.

Source:
- https://saif.google/

Why it matters for Agentwall:
- the market is converging on agent-specific security controls rather than generic model-safety narratives
- this supports a product direction centered on trusted execution and operator control

## Core design rules Agentwall should adopt

### Rule 1: policy outside the model
The model can propose. It cannot be the final authority.

Agentwall should remain a deterministic action-policy layer that decides:
- can this tool be called
- by this agent
- for this user
- in this session
- with these arguments
- against these resources
- under this provenance state
- with or without human approval

### Rule 2: treat all external content as untrusted data, not instructions
This includes:
- webpages
- emails
- PDFs
- OCR text
- repo content
- ticket text
- tool output
- memory recall
- peer-agent output
- MCP tool metadata

### Rule 3: minimize ambient authority
The biggest recurring failure mode in agent systems is not just injection. It is injection plus too much permission.

### Rule 4: every sensitive action needs both prevention and evidence
Prevent if possible. If allowed, preserve a signed trace showing:
- what prompted the action
- what provenance/trust labels were present
- what policy evaluated it
- what credentials were issued
- what happened at runtime
- whether a human approved it

### Rule 5: evals need to measure side effects, not just text safety
A benchmark that only checks whether the model says something bad is weak for agent security. The real question is whether an attack made the system take or attempt an unsafe action.

## Strongest recommendations on what to build next

## P0: must-build if Agentwall wants to be the real security spine

### 1. Capability-scoped execution tickets
Build a short-lived capability token layer for every tool call.

Each ticket should bind:
- agent identity
- user identity or delegated actor
- session id
- tool name
- allowed argument envelope
- allowed domains / file paths / methods
- expiry
- approval state
- provenance risk state

Why this is first:
- it converts policy from advisory to enforceable runtime scope
- it directly fights excessive agency

### 2. Real sandbox enforcement for tool execution
Agentwall already evaluates actions. The next jump is enforcing execution isolation.

Recommended stack:
- high-risk execution: Firecracker microVMs
- medium-risk container isolation: gVisor
- lightweight local wrappers: nsjail or bubblewrap

Primary references:
- Firecracker: https://github.com/firecracker-microvm/firecracker
- gVisor: https://github.com/google/gvisor
- nsjail: https://github.com/google/nsjail
- bubblewrap: https://github.com/containers/bubblewrap

Build target for Agentwall:
- turn `allow` into `allow under sandbox profile X`
- attach sandbox profile to the decision and audit path

### 3. Deny-by-default egress with policy-owned destinations
You already have strong egress posture. Push it further.

Add:
- per-tool domain allowlists
- DNS and resolved-IP verification
- egress classes per session/agent
- explicit approval on first-seen destination for risky tools
- outbound reason codes tied to operator policies

Best-fit tooling if Agentwall moves into k8s or service-mesh territory:
- Cilium + Hubble
- optional Envoy/Istio egress gateway

References:
- https://docs.cilium.io/
- https://github.com/cilium/tetragon

### 4. Secret broker, not secret exposure
Do not let agents see reusable raw secrets unless there is no alternative.

Recommended pattern:
- Vault-style secret broker
- short-lived credentials only
- credentials issued after policy decision
- scoped to exact action envelope
- automatic revocation / expiry

Recommended tools:
- Vault: https://github.com/hashicorp/vault
- SPIRE for workload identity: https://github.com/spiffe/spire

### 5. Tamper-evident audit chain
This is already on the roadmap and should move up.

Need:
- append-only event chain
- event hashes linked across decisions, approvals, and execution outcomes
- signed operator approvals
- evidence export suitable for incident review

Suggested tools/patterns:
- immudb for append-only evidence store
- Sigstore/Rekor for artifact transparency where useful
- signed JSON envelopes for audit records

References:
- https://immudb.io/
- https://github.com/sigstore/cosign

### 6. Agent-security regression harness in CI
Make the security posture measurable.

Minimum recurring scenario families:
- direct prompt injection
- indirect prompt injection through retrieved content
- tool output poisoning
- secret exfil attempts
- SSRF and metadata access
- arbitrary file read and path breakout
- browser OAuth abuse
- payment / send / publish actions
- memory poisoning and persistence replay
- peer-agent contamination
- MCP tool metadata / manifest drift abuse
- approval bypass and flood/queue overload

Best starting references:
- AgentDojo: https://github.com/ethz-spylab/agentdojo
- PyRIT: https://github.com/microsoft/PyRIT
- OpenAI Evals: https://github.com/openai/evals
- Purple Llama: https://github.com/meta-llama/PurpleLlama

## P1: highest-leverage next layer after P0

### 7. Provenance and taint propagation all the way to execution
You already label provenance. Extend that into a first-class taint system.

Need:
- trust score or trust class per context block
- propagation across planner -> subagent -> tool -> result -> memory
- policy clauses like:
  - `deny if untrusted_web_content influences credential access`
  - `require approval if tainted input reaches browser auth or external messaging`

This is one of the clearest product gaps in the market.

### 8. Tool and MCP attestation gate
Add a signed-manifest and attestation layer for tools and MCP servers.

Need:
- manifest fingerprinting beyond hash-only drift alerts
- publisher identity
- signed version pinning
- allowed capability declaration
- review workflow for new or changed servers
- quarantine mode for untrusted tool descriptions and annotations

Suggested supply-chain tooling:
- Cosign
- in-toto
- SLSA framing
- Syft/Grype/Trivy

References:
- https://slsa.dev/
- https://github.com/anchore/syft
- https://github.com/anchore/grype
- https://github.com/aquasecurity/trivy

### 9. Runtime telemetry tied to decisions
Pair action policy with host/runtime observability.

Best candidates:
- Tetragon for eBPF-based enforcement and observability
- Falco for runtime detections
- OpenTelemetry for decision traces

References:
- https://github.com/cilium/tetragon
- https://falco.org/
- https://opentelemetry.io/

What Agentwall should do:
- correlate `agent intended X` with `sandbox executed Y`
- flag drift between approved action and observed behavior

### 10. Approval system with stronger step-up semantics
Your approval flow is already strong. Push it into a real privileged action system.

Add:
- policy-based step-up approval classes
- approver binding by role and risk
- approval TTLs
- just-in-time capability issuance after approval
- dual control for the highest-risk classes

### 11. Honeytokens and canary secrets for detection
Add seeded fake secrets/docs/routes and alert when an agent touches them.

Why it matters:
- detects prompt injection and exfil paths that preventive controls missed
- gives you high-signal attacker-in-the-loop indicators

## P2: important, but after execution control is hard

### 12. Memory quarantine and durable-state hygiene
Memory is an attack surface.

Need:
- reviewable writes to long-term memory
- source provenance stored with memory items
- TTL and confidence decay
- per-namespace isolation
- quarantine / appeal path for poisoned memory

### 13. Output validators and content rails
Useful, but not the core moat.

Good options:
- NeMo Guardrails
- Guardrails AI
- Pydantic/JSON Schema validators
- domain-specific URL/path/command validators

References:
- https://github.com/NVIDIA/NeMo-Guardrails
- https://github.com/guardrails-ai/guardrails

Use these as defense-in-depth, not as the main barrier.

### 14. Defense scorecards with latency/cost tradeoff tracking
Agentwall should not just say “more secure.” It should measure:
- block rate
- approval rate
- false positive rate
- time to containment
- time to operator decision
- security regression pass rate
- latency overhead per defense layer

This will matter commercially.

## Tools and frameworks worth using or learning from

### Execution and containment
- Firecracker
  - secure, multi-tenant, minimal-overhead execution for functions and containers
  - https://github.com/firecracker-microvm/firecracker
- gVisor
  - strong isolation between applications and host OS via a userspace application kernel
  - https://github.com/google/gvisor
- Kata Containers
  - VM-isolated pods if you go k8s-heavy
  - https://github.com/kata-containers/kata-containers
- nsjail / bubblewrap
  - good local fast wrappers

### Policy and authorization
- OPA
  - general-purpose context-aware policy enforcement
  - https://github.com/open-policy-agent/opa
- Cedar
  - readable authorization policy language
  - https://www.cedarpolicy.com/
- OpenFGA
  - good for relationship-based authorization around agents, operators, tenants, resources
  - https://openfga.dev/

### Identity and secrets
- Vault
  - secret brokering and dynamic credentials
  - https://github.com/hashicorp/vault
- SPIRE
  - workload identity and attestation
  - https://github.com/spiffe/spire

### Runtime observability and detection
- Tetragon
  - real-time eBPF security observability and runtime enforcement
  - https://github.com/cilium/tetragon
- Falco
  - runtime threat detection
  - https://falco.org/
- Cilium + Hubble
  - egress policy and network visibility
  - https://docs.cilium.io/

### Supply chain and artifact trust
- Cosign
  - sign OCI artifacts and more
  - https://github.com/sigstore/cosign
- SLSA
  - supply-chain maturity and attestation framing
  - https://slsa.dev/
- in-toto
  - provenance/attestation framework
  - https://in-toto.io/
- Trivy
  - vulnerability, misconfiguration, secret, and SBOM scanning
  - https://github.com/aquasecurity/trivy
- Syft / Grype
  - SBOM + vuln scan
  - https://github.com/anchore/syft
  - https://github.com/anchore/grype
- Semgrep / Gitleaks / OSV-Scanner
  - code and secret hygiene around integrations and wrappers

### Guardrails and evals
- NeMo Guardrails
  - useful for rails orchestration, not a full security boundary
  - https://github.com/NVIDIA/NeMo-Guardrails
- Guardrails AI
  - useful for output and schema validation
  - https://github.com/guardrails-ai/guardrails
- PyRIT
  - open-source genAI risk identification and red-team automation
  - https://github.com/microsoft/PyRIT
- AgentDojo
  - dynamic environment for evaluating prompt injection attacks and defenses for LLM agents
  - https://github.com/ethz-spylab/agentdojo
- OpenAI Evals
  - general eval harness for custom security regressions
  - https://github.com/openai/evals
- Purple Llama / CyberSecEval
  - good reference for security benchmark methodology
  - https://github.com/meta-llama/PurpleLlama

## What not to over-trust

These are useful, but weak as primary defenses:
- prompt injection classifiers alone
- moderation models alone
- bigger system prompts alone
- generic “jailbreak resistance” scores without tool-use evaluation
- static allowlists without runtime attestation
- audit logs that are mutable or detached from actual execution telemetry

## Best product direction for Agentwall

The strongest version of Agentwall is not a prompt filter.

It is a runtime trust fabric for agents:
- action policy engine
- capability-scoped execution
- sandbox and egress enforcement
- identity-aware secret brokerage
- trusted-tool attestation
- human approval as a first-class privileged action workflow
- tamper-evident evidence
- agent-native adversarial testing harness

That is a real product category, and it fits your current architecture far better than chasing generic “LLM safety” branding.

## Gap mapping against current roadmap

Already on roadmap and should move up:
- signed/tamper-evident audit events
- per-agent/session policy overlays
- OpenTelemetry export for decision traces
- policy simulation mode

Not yet prominent enough on roadmap but should be added:
- capability-scoped execution tickets
- sandbox profile enforcement
- JIT secret issuance
- tool/MCP attestation and signed publisher trust
- taint propagation from provenance labels into authorization
- execution-vs-decision drift detection
- agent-native security eval harness and nightly regression corpus
- memory quarantine and poisoning controls
- honeytoken/canary instrumentation

## Recommended build order

### Wave 1
- signed audit chain
- capability-scoped execution tickets
- SDK wrappers that enforce preflight plus execution ticket checks
- nightly security regression suite expansion

### Wave 2
- sandbox profile enforcement for shell/browser/high-risk tools
- Vault + SPIRE identity-broker pattern
- OpenTelemetry + Tetragon/Falco correlation
- MCP attestation and tool trust store

### Wave 3
- taint propagation into every policy decision
- memory quarantine and poisoning controls
- defense scorecards and operator ROI metrics

## Repo touchpoints likely involved later

Policy and execution control:
- `src/engine/*`
- `src/approval/*`
- `src/runtime/*`
- `src/planes/*`
- `src/routes/*`
- `src/config.ts`

Operator evidence surfaces:
- `src/routes/dashboard.ts`
- `public/app.js`
- `public/index.html`
- `tests/dashboard.test.ts`
- `tests/floodguard.test.ts`
- future `tests/security-regression/*`

## Bottom line

The strongest move is to double down on what Agentwall already is becoming:

not “an AI safety wrapper,” but “the operator-owned runtime security control plane for agent systems.”

If we execute this cleanly, Agentwall can own the part of the stack most teams still hand-wave:
- who or what is allowed to act
- under what trust conditions
- with what permissions
- inside what containment boundary
- with what evidence after the fact
