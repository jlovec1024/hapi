# CI Test Contract

> Define CI requirements for type safety and test gates.

---

## Boundary of This Guide

This guide covers only:

- Which checks CI runs
- Required local parity before PR
- Failure triage expectations

This guide does **not** define coverage thresholds (see `coverage-policy.md`).

---

## Current CI Facts

From `.github/workflows/test.yml`:

- Trigger: push and pull_request
- Core checks include:
  - `bun install`
  - `bun typecheck`
  - setup integration test env file for CLI
  - `bun run test` (default safe entrypoint)
- The current root test entrypoint `package.json:test` runs `test:cli`, `test:hub`, and `test:web` sequentially
- `package.json:test:cli` now defaults to `cd cli && bun run test:safe`
- `cli/package.json:test` now defaults to `bun run test:safe` instead of entering the heavy integration path directly
- CLI runner integration now requires explicit `cli/package.json:test:integration` / `test:all`
- **The confirmed high-load evidence comes mainly from the CLI runner integration path, not from “Bun” in the abstract**:
  - `cli/src/runner/runner.integration.test.ts:148-171`: each test stops any existing runner and then starts a fresh real runner process via `spawnZhushenCLI(['runner', 'start'])`
  - `cli/src/runner/runner.integration.test.ts:262-295`: `stress test: spawn / stop` spawns 20 sessions concurrently and then stops them concurrently
  - `cli/src/runner/runner.integration.test.ts:372-396`: starts a second runner process to verify mutual exclusion behavior
  - `cli/src/runner/runner.integration.test.ts:457-484` and `560-631`: exercises `SIGKILL`, `SIGTERM`, version mismatch, and restart-heavy flows
  - `cli/src/runner/run.ts:421-549`: the implementation under test truly calls `spawnZhushenCLI(... detached: true, stdio: ['ignore', 'pipe', 'pipe'])` and waits for webhook/timeout resolution
  - `cli/scripts/unpack-tools.ts:47-103`: every CLI test run also synchronously extracts two tar.gz tool archives (`difftastic`, `ripgrep`) and chmods unpacked files

---

## Contributor Contract

- Run local checks that match CI entry points when possible
- Test-related changes must pass both typecheck and tests before merge
- Required env setup must be documented and reproducible
- If `bun test` / `bun run test` would create meaningful host load or interfere with business processes on the current machine, prefer **narrow local verification + full CI validation** instead of treating a local full-suite run as the only acceptable gate.
- When the host serves real services, a shared runner, or has already shown resource alarms, default local verification should begin with `bun run typecheck` and targeted tests.
- Any claim that a test command is “high load” must include code evidence: at minimum, document the entrypoint chain, the implicated test files, and the concrete resource-cost source (real processes, concurrency fan-out, synchronous I/O, or long waits) instead of inferring from the command name alone.
- In this repository, the confirmed high-load path is the root `package.json:test` chain into `cli/package.json:test:integration` / `test:all` for CLI runner integration tests, not an assumption that every Bun/Vitest test in `hub` or `web` is equally dangerous.

---

## Failure Handling

- Classify failure first: typecheck vs test vs environment
- Fix root cause; do not bypass checks

### Monorepo Test Failure Triage (CLI Changes)

When a CLI-focused change triggers failures in `bun run test:cli` (default safe entrypoint) or explicit `cd cli && bun run test:integration`, triage in this order:

1. **Identify unrelated global failures first**
   - If a non-runner file like `src/agent/backends/acp/AcpSdkBackend.test.ts` fails before/alongside your target area, treat it as a separate baseline issue.
   - Do not assume all red tests are caused by your current change.

2. **Separate environment-gated integration tests from logic regressions**
   - `src/runner/runner.integration.test.ts` depends on local hub reachability and hook timing.
   - A failure like `Hook timed out in 10000ms` in `beforeEach` is environment-or-runtime-timing evidence first, not automatic proof that the edited assertion path is wrong.

3. **For process-lifecycle changes, verify state-transition contracts explicitly**
   - If command behavior depends on old/new PID handoff, tests must assert PID replacement rather than just "some runner is alive".
   - If stop/start semantics change, re-check helper return contracts (`void` vs `boolean`) and all callers.

4. **Prefer narrow verification before full-suite conclusions**
   - Run typecheck first.
   - Then inspect diff and failing stack sites.
   - Then classify failures into:
     - unrelated baseline failure
     - environment-gated integration failure
     - true regression in changed contract

### Local Runner / Production-Business Isolation Contract

For CLI runner integration tests and any test that starts real local processes:

- Treat local `runner` / `session` lifecycle tests as **host-affecting** by default, even when they use isolated `ZS_HOME`.
- Isolation of state files/log directories does **not** guarantee isolation of:
  - local background processes
  - ports / sockets
  - machine resources
  - currently running developer workflows in the same worktree
- If the machine is serving real production business or business-critical local automation, do **not** run disruptive integration tests on that machine.
- Allowed policy must be explicit:
  - **Production / business environment**: no interference allowed
  - **Developer local environment**: interference is acceptable only if the operator intentionally runs the test and understands it may stop/restart local runner processes
- Tests that can kill/restart runner processes must document this side effect in the test contract or test description.
- Before debugging a runner failure, classify whether the observed issue is:
  - production/business runner impact
  - local test interference
  - true product regression

### Runner Debugging Contract (Execution CWD vs Business Working Directory)

When changing CLI process launch behavior (`spawnZhushenCLI`, agent entrypoints, runner child spawning):

- Separate **execution/runtime resolution context** from **business working directory**.
- In development mode, the runtime must start from a location where TS entrypoints, aliases, and assets resolve correctly.
- If the product semantics need a user-requested working directory, pass it explicitly as data/config/env instead of overloading process execution cwd.
- Any helper that changes spawn semantics must be reviewed across all agent entrypoints, not only the first failing path.
- Integration tests must verify both:
  - runtime can start successfully
  - session metadata/behavior still reflects the requested working directory


If CI adds coverage gating, reference policy from `coverage-policy.md` (single source of truth).

---

## Bot Workflow Contract

For GitHub Actions bot workflows using `openai/codex-action@v1`:

- Prepare runner-local `codex-home` explicitly before the action step
- Prefer `${{ runner.temp }}/codex-home` over implicit `~/.codex`
- Treat `read-server-info` ENOENT as startup/runner-state failure, not prompt failure
- If a custom `responses-api-endpoint` is configured, it must be a full Responses API URL ending with `/responses`
- Do not pass provider root URLs like `https://host/` or partial base URLs like `https://host/v1`
- In repositories that cannot use the default OpenAI endpoint, fail fast when `OPENAI_BASE_URL` is missing or malformed instead of silently falling back
- If logs show `stream disconnected before response.completed`, first verify the endpoint path and then verify that the upstream service fully supports Responses streaming semantics

---

## Reference Files in This Repo

- `.github/workflows/test.yml`
- `package.json`
- `cli/vitest.config.ts`
- `web/vitest.config.ts`
