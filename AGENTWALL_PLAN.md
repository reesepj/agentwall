# 🛡️ Project: Agentwall MVP Plan 🛡️

**Goal:** Achieve Minimum Viable Product (MVP) readiness, defined by demonstrable, reliable, and safe execution of the core decision loop.

## 🏛️ Architectural Pillars of the MVP
### 1. 🔄 Core Execution Loop
*   **Input:** Structured task/request (e.g., "Write a Python script to fetch weather data for Chicago").
*   **Process:** State/Context Retrieval $\rightarrow$ Plan Formulation $\rightarrow$ Tool Selection/Execution $\rightarrow$ Code Generation/Execution $\rightarrow$ Output Synthesis.
*   **Output:** Verified result that directly answers the request.

### 2. 🔭 Observability (The "Why")
*   **Decision Logging:** Every major decision (`ToolSelect: CodeGen`, `PlanStep: ContextCheck`, etc.) must be logged.
*   **Telemetry:** Record timing (latency) and resource usage (CPU/Memory).
*   **Error Reporting:** Clear, machine-readable logging of failures and exceptions.

### ⚔️ Safety Guardrails (The "Must Not")
*   **🚫 Infinite Loop Detection:** Implement a turn limit and monitor execution path complexity to kill runaway processes.
*   **🚫 Unverified Tool Use:** By default, tool calls must be verified against a pre-approved list unless explicitly allowed.
*   **🛡️ Code Safety:** Implement static analysis (`Semgrep` or similar check) *before* execution, and memory footprint checks *during/after* execution.
*   **⚖️ Resource Budgeting:** Track CPU and memory consumption against a defined budget for an agent turn.

## 🔨 Phase 1 (MVP) Implementations
1.  Implement the basic **Core Loop** (Can take input, generate a simple block of code, and run it).
2.  Implement mandatory **Decision Logging** (Log the tool/step taken).
3.  Implement **Turn Limit** (If $>10$ turns without conclusion, panic/flag).

*(Further development (Phase 2: Advanced Guardrails, Phase 3: Orchestration) will follow this.)*