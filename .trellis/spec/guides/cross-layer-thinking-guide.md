# Cross-Layer Thinking Guide

> **Purpose**: Think through data flow across layers before implementing.

---

## The Problem

**Most bugs happen at layer boundaries**, not within layers.

Common cross-layer bugs:
- API returns format A, frontend expects format B
- Database stores X, service transforms to Y, but loses data
- Multiple layers implement the same logic differently

---

## Before Implementing Cross-Layer Features

### Step 1: Map the Data Flow

Draw out how data moves:

```
Source → Transform → Store → Retrieve → Transform → Display
```

For each arrow, ask:
- What format is the data in?
- What could go wrong?
- Who is responsible for validation?

### Step 2: Identify Boundaries

| Boundary | Common Issues |
|----------|---------------|
| API ↔ Service | Type mismatches, missing fields |
| Service ↔ Database | Format conversions, null handling |
| Backend ↔ Frontend | Serialization, date formats |
| Component ↔ Component | Props shape changes |

### Step 3: Define Contracts

For each boundary:
- What is the exact input format?
- What is the exact output format?
- What errors can occur?

---

## Common Cross-Layer Mistakes

### Mistake 1: Implicit Format Assumptions

**Bad**: Assuming date format without checking

**Good**: Explicit format conversion at boundaries

### Mistake 2: Scattered Validation

**Bad**: Validating the same thing in multiple layers

**Good**: Validate once at the entry point

### Mistake 3: Leaky Abstractions

**Bad**: Component knows about database schema

**Good**: Each layer only knows its neighbors

---

## Checklist for Cross-Layer Features

Before implementation:
- [ ] Mapped the complete data flow
- [ ] Identified all layer boundaries
- [ ] Defined format at each boundary
- [ ] Decided where validation happens

After implementation:
- [ ] Tested with edge cases (null, empty, invalid)
- [ ] Verified error handling at each boundary
- [ ] Checked data survives round-trip


## Slash Command Contract Checklist (CLI ↔ Hub ↔ Web)

When changing slash command discovery, verify:
- [ ] CLI function signature and handler wiring carry project directory context
- [ ] Hub response type includes all `source` variants used by CLI
- [ ] Web type union and filtering logic include the same `source` values
- [ ] Nested command paths are explicitly mapped to command names (e.g., `group/file.md` -> `group:file`)
- [ ] Integration check confirms `/api/sessions/:id/slash-commands` returns project commands

Reference executable contract:
- `backend/quality-guidelines.md` → `Scenario: Slash Command Cross-Layer Contract (Project + Nested)`

---

## Session-Scoped Client Cache Checklist (Web State ↔ Session Identity)

When UI state is cached across renders (e.g. `useRef`, query fallback, optimistic state):
- [ ] Is cache keyed/scoped by stable identity (`session.id`, `workspaceId`, etc.)?
- [ ] On identity change, do we reset previous identity cache before deriving fallback UI?
- [ ] Does fallback logic prevent previous entity errors/status from leaking into the current entity?
- [ ] Is loading/error tri-state evaluated after scope reset?
- [ ] Is there an integration test that covers "create new entity -> initial load -> no old cache leak"?

Typical failure pattern:
- Previous session status (`Git unavailable` or stale branch counters) remains in ref fallback while new session query is still loading.
- User sees wrong status until route remount/re-entry forces state reset.

---

## Session-Switch Draft Persistence Checklist (Composer ↔ Session Identity)

When chat composer text should survive switching between sessions:
- [ ] Is draft state keyed by `session.id` rather than a single global composer value?
- [ ] On session switch, do we hydrate input from the target session draft before rendering interactive input?
- [ ] Does send success clear only the active session draft key?
- [ ] Are drafts isolated between sessions (A draft never appears in B)?
- [ ] Is there an integration test for: `type in A -> switch B -> switch A -> draft restored`?

Typical failure pattern:
- Composer relies on one shared `composer.text` state with no per-session scoping.
- Navigating away and back remounts/syncs with empty state, causing unsent input loss.

---

## Terminal Session Contract Checklist (Web ↔ Hub ↔ CLI)
When wiring terminal sessions across layers:
- [ ] Is `terminalId` scoped per session (no reuse across sessions in the same UI lifecycle)?
- [ ] Does the Web client reset cached `terminalId` on session change before reconnecting?
- [ ] Does the Hub remove registry entries on **both** web socket disconnect and CLI socket disconnect?
- [ ] Is duplicate `terminalId` creation handled as idempotent or surfaced with a clear error?
- [ ] Are platform constraints (e.g. Windows terminal unsupported) surfaced consistently to the UI?
- [ ] Is there an integration test covering "reconnect then reopen terminal" without ID collisions?

Typical failure pattern:
- A stale `terminalId` remains registered in the Hub after a disconnect, so the next connect returns
  "Terminal ID is already in use" even though the UI thinks it is a new session.

---

## Terminal Copy/Interrupt Input Contract Checklist (Web Keybinding ↔ Browser Clipboard ↔ PTY)

When terminal input includes `Ctrl+C`, `Enter`, selection copy, and clipboard fallback:
- [ ] Is there a deterministic decision order for `Ctrl+C`? (`hasSelection` copy > otherwise send `\u0003` interrupt)
- [ ] Does copy behavior avoid forwarding input bytes to PTY in the same key path?
- [ ] If copy branch is taken, does the handler explicitly `preventDefault`/`stopPropagation` to avoid accidental newline/command submit side effects?
- [ ] Are browser-unsupported clipboard paths covered by a fallback (manual copy dialog or explicit user hint)?
- [ ] Are keybinding rules documented for platform differences (`Ctrl+C` on Windows/Linux, `Cmd+C` on macOS)?
- [ ] Is there an integration test for `select text -> copy -> shell receives no ^C/\n`?

Typical failure pattern:
- Frontend forwards `Ctrl+C` directly through terminal `onData` to backend PTY (`\u0003`) even while user intent is copy.
- Result: copy fails and the active command is interrupted (or appears as unexpected enter/newline behavior).

---

## Independent Mainline Migration Checklist

When switching from upstream-collaboration mode to independent development mode:
- [ ] Is `main` merged/rebased with intended source branch before changing remote topology?
- [ ] If rebase/merge paused, did we fully resolve conflicts before running `pull`?
- [ ] Does `main` explicitly track `origin/main`?
- [ ] Is `upstream` remote removed (or intentionally retained) with clear policy?
- [ ] Did we verify end-to-end sync (`pull --rebase origin main` then `push origin main`)?

Reference executable contract:
- `backend/quality-guidelines.md` -> `Scenario: Independent Development Mode (Origin-only Mainline)`

---

## Branch Strategy Thinking Checklist

When deciding branch strategy for fork + upstream collaboration:
- [ ] Is there a clean upstream mirror branch (`main`) with no product-only commits?
- [ ] Are upstream PR branches created from mirror `main` instead of product branch?
- [ ] Is product development isolated to a dedicated long-lived branch (e.g., `main-custom`)?
- [ ] Is there a periodic sync plan from `main` into product branch?
- [ ] Before force-pushing `origin/main`, did you verify unique commits that may be lost?

Reference executable contract:
- `backend/quality-guidelines.md` -> `Scenario: Branch Topology for Upstream Collaboration + Custom Product Line`

---

## Monorepo Workspace Dependency Checklist (Build Path)

When fixing build failures in a Bun workspace monorepo (`web`/`hub`/`cli` + shared package):
- [ ] Does every imported workspace package name exactly match the producer package `name` field?
- [ ] Did you run dependency installation at repository root after rename or workspace metadata changes?
- [ ] Is the dependency link visible from the consumer (`web/node_modules/<pkg>`) before diagnosing bundler config?
- [ ] If Vite/Rollup says "failed to resolve import", did you verify package linking first (before alias/external workarounds)?
- [ ] Is there a CI/local prebuild check that validates workspace links for critical shared packages?

Typical failure pattern:
- Import path in app code is correct, but workspace links are stale/missing because install step was skipped after package rename.
- Symptom appears as bundler resolution error, but root cause is dependency graph state.

Recommended fast verification:
1. Check producer package name (e.g. `shared/package.json`).
2. Check consumer dependency declaration (e.g. `web/package.json`).
3. Verify installed link in consumer `node_modules`.
4. Run root install (`bun install`) and rebuild.

---

## Docker Build Lockfile Immutability Checklist (GitHub Actions + Bun Workspace)

When Docker image builds use `bun install --frozen-lockfile` in CI:
- [ ] Does Dockerfile copy **all workspace manifests** used by `bun.lock` before install (root + each workspace `package.json`)?
- [ ] Was `bun.lock` regenerated and committed from repo root after any workspace dependency/script/workspace metadata change?
- [ ] Is local verification done with the same strict mode (`bun install --frozen-lockfile`) before pushing?
- [ ] Does CI pin Bun version consistently with local/dev container to avoid lockfile format drift?
- [ ] Are PR checks configured to fail early when `bun.lock` is dirty (`git diff --exit-code bun.lock` after install)?

Typical failure pattern:
- Docker build reaches `RUN bun install --frozen-lockfile` and fails with `lockfile had changes, but lockfile is frozen`.
- Multi-arch Buildx log may show unrelated platform stage cancellation (`arm64 CANCELED`), while root cause is `amd64` lockfile mutation.

Recommended fast verification:
1. Run `bun install` at repository root.
2. Check whether `bun.lock` changes.
3. If changed, commit `bun.lock` with corresponding manifest changes.
4. Re-run `bun install --frozen-lockfile` locally and in Docker context.

---

## Docker Workflow Scope Checklist (PR 校验 vs 发布)

当 GitHub Actions 同时承担 Docker 校验与镜像发布职责时：
- [ ] PR 触发的 Docker job 是否有明确校验目标（例如仅验证 Dockerfile 可构建）？
- [ ] 如果 PR 不产出用户可见制品，是否避免了发布级成本（QEMU、多架构 Buildx、registry login）？
- [ ] 多架构构建是否只保留在 `main` / tag 发布路径，或已有明确文档说明为什么 PR 必须验证多架构？
- [ ] `packages: write` 是否只授予真正需要推送镜像的 job / 事件？
- [ ] path filter 是否足够精确，避免与 Docker 无关的 PR 触发镜像流程？
- [ ] 评审时是否明确区分了“验证失败”与“流程成本设计错误”？

典型坏味道：
- PR 中 `push=false`，但仍完整执行 QEMU + `linux/amd64,linux/arm64` 构建。
- 表面上没有“发布”，实际上 PR 仍在消耗接近发布级别的 CI 成本。

推荐快速判断：
1. 先看 workflow 的事件边界：`pull_request` 是校验还是发布复用？
2. 再看 Buildx 参数：PR 是否真的需要多架构。
3. 最后看权限与登录：PR 是否不必要地申请 `packages: write` / GHCR 登录。

Reference executable contract:
- `backend/quality-guidelines.md` -> `Scenario: Docker Workflow Scope Contract (PR Validation vs Mainline Publish)`

---

## Global Package Manager Context Checklist (Dependency Warning Triage)

When analyzing `pnpm install -g` or other global install warnings:
- [ ] Is the warning from this project's direct dependency graph, or from unrelated global packages already present on the machine?
- [ ] Did you reproduce in a clean environment/profile before changing repository dependencies?
- [ ] Does install succeed and does the shipped CLI binary run (`--help` / basic command)?
- [ ] If warning is external and non-blocking, did you record it as monitored risk instead of forcing repo-level overrides?
- [ ] If warning is from direct dependencies, is there a concrete compatibility plan (upgrade/isolate/pin) with release impact assessed?

Reference executable contract:
- `backend/quality-guidelines.md` -> `Scenario: Global npm Install Peer-Dependency Drift (Published CLI Package)`

---

Create detailed flow docs when:
- Feature spans 3+ layers
- Multiple teams are involved
- Data format is complex
- Feature has caused bugs before
