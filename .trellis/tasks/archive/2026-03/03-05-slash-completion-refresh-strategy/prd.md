# brainstorm: slash 补全刷新策略

## Goal

优化 slash 自动补全的**交互与设计机制**，核心目标是避免出现“远端命令获取在设计上 100% 不可达的窗口”，并避免遗漏远端命令获取；确保用户输入 `/` 时能够进入正确且可补偿的命令获取路径。

## What I already know

- 现有补全数据源在前端由 `useSlashCommands` 提供，底层用 React Query 拉取 `/api/sessions/:id/slash-commands`（`web/src/hooks/queries/useSlashCommands.ts:68`，`web/src/api/client.ts:387`）。
- 当前 query 配置为 `staleTime: Infinity`，即默认不会自动过期刷新（`web/src/hooks/queries/useSlashCommands.ts:77`）。
- 输入框补全触发链路是：`ZhushenComposer` 的 `inputState` -> `useActiveWord` -> `useActiveSuggestions` -> `autocompleteSuggestions`（`web/src/components/AssistantChat/ZhushenComposer.tsx:148`、`web/src/hooks/useActiveSuggestions.ts:68`）。
- `getAutocompleteSuggestions` 目前只分流 `$` 与其他前缀，不包含“遇到 `/` 时主动刷新命令列表”的逻辑（`web/src/router.tsx:276`）。
- 旧任务已实现 project command 扫描（CLI 层），命令来源包含 `project`，因此“命令内容本身”可变但前端当前没有按输入事件触发刷新（`cli/src/modules/common/slashCommands.ts:274`、`web/src/hooks/queries/useSlashCommands.ts:89`）。

## Assumptions (temporary)

- 需求重点从“刷新时机”切换为“正确补全”，刷新仅是可选实现手段。
- 正确补全定义应覆盖：命令完整性（builtin/user/plugin/project）、会话隔离性（session 维度）、状态转换一致性（active/inactive/busy）。

## Open Questions

- （已确认）正确补全判定口径采用：在可连接 session 时，`/` 候选应等于「builtin + 当前 session 对应远端命令集合（user/plugin/project，去重后）」。

## Requirements (evolving)

- 建立可维护的补全命令源管理模型，明确 builtin/user/plugin/project 的合并与去重规则。
- 优化交互与状态机设计，避免出现“远端命令获取在设计上 100% 不可达”的窗口。
- 建立“防漏获取”机制：任何应获取远端命令的关键场景都必须进入可执行获取路径（首次、切 session、恢复可用、失败补偿、显式失效后）。
- 保证会话隔离：不同 session 的命令集合不得串用。
- 保证状态转换一致性：active/inactive/busy 切换过程中，补全结果在可接受时间窗内收敛到正确集合。
- 与现有 `@/$` 补全机制兼容，不破坏已有键盘交互（上下选择/Tab 回填）。

## Acceptance Criteria (evolving)

- [ ] 输入 `/` 后，系统不会落入“设计上远端命令 100% 不可达”的窗口；若远端暂不可达，必须存在可触发的补偿获取路径。
- [ ] 在可连接 session 场景，`/` 候选集合满足已确认口径（builtin + 当前 session 远端命令去重结果）。
- [ ] 对每个 session 至少可观测到一次“远端命令成功获取”或明确的失败/降级状态，避免静默漏获取。
- [ ] 不同 session/项目切换后，补全不出现跨会话命令串用。
- [ ] 在不可连接场景（`!api || !sessionId`），系统保持可用降级（builtin 可补全）且行为可预期。
- [ ] 现有 `@/$` 补全与键盘交互行为不回归。

## Definition of Done (team quality bar)

- Tests added/updated (unit/integration where appropriate)
- Lint / typecheck / CI green
- Docs/notes updated if behavior changes
- Rollout/rollback considered if risky

## Out of Scope (explicit)

- 命令执行语义变更
- slash 命令协议字段变更
- 文件系统实时监听（watcher）
- 完整补全系统重构

## Technical Notes

- 关键候选改动点：
  - `web/src/hooks/queries/useSlashCommands.ts`（查询缓存与可达性/补偿语义）
  - `web/src/router.tsx`（`autocompleteSuggestions` 入口与 session 关联）
  - `web/src/components/AssistantChat/ZhushenComposer.tsx`（输入触发与 slash-entry 识别）
  - `web/src/hooks/useActiveSuggestions.ts`（异步建议更新行为）
- 当前约束：
  - `staleTime: Infinity` + `retry: false` 使“失败后长期降级”风险较高（`web/src/hooks/queries/useSlashCommands.ts:77,79`）。
  - `queryKeys.slashCommands` 当前仅含 `sessionId` 维度（`web/src/lib/query-keys.ts:16`），存在缓存语义边界需明确。

## Research Notes

### What similar tools do

- 以“可达性 + 可补偿”为目标，而非单一刷新频率目标。
- 在降级路径中显式标记状态，避免用户把降级结果误判为完整结果。

### Constraints from our repo/project

- 远端命令链路依赖 hub -> RPC -> CLI handler，任一环节异常都会导致不可达（`hub/src/sync/rpcGateway.ts:220-230`）。
- HTTP 路由允许 inactive session 拉取 slash 命令，但不保证 RPC 端可服务（`hub/src/web/routes/sessions.ts:354-365`）。

### Feasible approaches here

**Approach A: Reachability-first state machine** (Recommended)

- How it works:
  - 维护 per-session 的 `hasFetchedSuccessfully`/`lastFetchError`；
  - 以关键场景触发“首次获取/补偿获取”；
  - 明确降级状态可观测。
- Pros:
  - 直接命中“避免不可达窗口 + 防漏获取”核心目标。
- Cons:
  - 需要增加状态语义与测试矩阵。

**Approach B: Pure refresh-policy tuning**

- How it works:
  - 仅调节刷新时机与频率（slash-entry/TTL 等）。
- Pros:
  - 改动小。
- Cons:
  - 无法从设计上保证“不可达窗口”与“漏获取”问题被覆盖。

### Session-level states

- `session.active`：会话是否活跃（`shared/src/schemas.ts:128`，在 UI 透传到输入区 `web/src/components/SessionChat.tsx:314`）。
- `session.thinking`：Agent 是否正在运行输出（`shared/src/schemas.ts:134`，runtime 里映射 `isRunning`，`web/src/lib/assistant-runtime.ts:202`）。
- `session.agentState.controlledByUser`：是否用户接管模式（`shared/src/schemas.ts:83`，UI 传入 composer，`web/src/components/SessionChat.tsx:319`）。

### Input/composer-level states

- `isSending`：前端是否有发送中的 mutation（`web/src/hooks/mutations/useSendMessage.ts:172`，用于禁用 composer，`web/src/components/SessionChat.tsx:310`）。
- `activeWord`：当前光标命中的补全触发词（`web/src/components/AssistantChat/ZhushenComposer.tsx:148`）。
- `suggestions`：由 `useActiveSuggestions` 异步维护（`web/src/hooks/useActiveSuggestions.ts:68`）。

### Data/cache-level states

- slash command query：`useSlashCommands` + `queryKeys.slashCommands(sessionId)`（`web/src/hooks/queries/useSlashCommands.ts:69`，`web/src/lib/query-keys.ts:15`）。
- 当前缓存策略：`staleTime: Infinity`（`web/src/hooks/queries/useSlashCommands.ts:77`），天然偏“稳定但不新鲜”。

### State transition summary (for slash autocomplete)

1. Normal text (`activeWord = null`) -> 用户输入 `/` -> Slash mode (`activeWord` 变为 `/...`)。
2. Slash mode 中候选来自当前 `commands`（内置 + API 返回）。
3. 若命令源变化（新增/删除 project command），在不主动 refetch 时，候选可能继续使用旧缓存。

## State-based Autocomplete Strategy (new)

### S0. Session unavailable

判定：`!api || !sessionId`
策略：仅展示内置命令（当前已支持）+ 禁止远端刷新。

### S1. Session inactive (可自动恢复)

判定：`session.active === false` 且允许发送恢复（`allowSendWhenInactive`）。
策略：补全可用，但 slash 刷新采用“轻量触发（最多一次）”，避免 inactive 期间高频请求。

### S2. Session active + idle

判定：`session.active === true && session.thinking === false && isSending === false`
策略：这是最优刷新窗口。进入 slash 模式时允许触发 refetch。

### S3. Session active + busy

判定：`session.thinking === true || isSending === true`
策略：补全继续可用，但刷新降级为“非阻塞后台刷新”或延迟到 busy 结束，避免交互抖动。

### S4. Controlled-by-user

判定：`agentState.controlledByUser === true`
策略：保持和 S2/S3 一致，不额外限制补全；只控制“请求频率”。

## Proposed New Design (state machine driven)

### Design goal

把“输入 `/` 刷新”升级为**状态驱动刷新策略**：在正确状态刷新、在忙碌状态降级、始终保证补全即时可用。

### Core rules

1. **进入 slash 上下文触发一次 refresh**
   - 触发条件：`activeWord` 从 `null`/非 `/` -> `/...`。
2. **Busy 状态不阻塞 UI**
   - 先返回当前缓存候选，再后台刷新；刷新回来由 `commands` 更新触发 suggestions 重算。
3. **去重与节流**
   - 同一 session 在短窗口（例如 3~5s）内仅触发一次 slash-entry refresh。
4. **离开 slash 上下文重置触发锁**
   - 用户从 `/...` 回到普通文本后，下次再次输入 `/` 可重新触发刷新。

### Implementation sketch (minimal changes)

- `web/src/hooks/queries/useSlashCommands.ts`
  - 暴露 `refetchCommands` 与 `isFetchingCommands`（在现有 query 上封装）。
- `web/src/router.tsx`
  - 维持 `getAutocompleteSuggestions` 职责单一，仅分流建议来源。
- `web/src/components/AssistantChat/ZhushenComposer.tsx`
  - 新增 slash entry 检测（比较上一个 `activeWord` 与当前值）。
  - 在满足状态规则时调用 `refetchCommands`（fire-and-forget，不阻塞输入）。
- `web/src/hooks/useActiveSuggestions.ts`
  - 保持现状，利用 ValueSync 承接“数据刷新后的建议重算”。

### Why this design (trade-off)

- 保留即时体验（KISS）：输入 `/` 立即有候选。
- 增强新鲜度：关键时机触发刷新，解决 stale cache 痛点。
- 控制请求量：只在状态切换/进入 slash 时触发，不按每次按键触发。

## Requirements (evolving)

- 建立可维护的补全命令源管理模型，明确 builtin/user/plugin/project 的合并与去重规则。
- 优化交互与状态机设计，避免出现“远端命令获取在设计上 100% 不可达”的窗口。
- 建立“防漏获取”机制：任何应获取远端命令的关键场景都必须进入可执行获取路径（首次、切 session、恢复可用、失败补偿、显式失效后）。
- 保证会话隔离：不同 session 的命令集合不得串用。
- 保证状态转换一致性：active/inactive/busy 切换过程中，补全结果在可接受时间窗内收敛到正确集合。
- 与现有 `@/$` 补全机制兼容，不破坏已有键盘交互（上下选择/Tab 回填）。

为避免“从未获取刷新过补全内容”，定义以下**必须触发首次获取/补偿获取**场景：

1. **首次进入 slash 上下文**
   - 条件：当前 session 下首次 `activeWord` 进入 `/...`。
   - 要求：若 remote 命令尚未成功获取过，必须发起一次获取。

2. **session 切换后首次 slash**
   - 条件：`sessionId` 变化后的第一次 `/...`。
   - 要求：必须重新获取该 session 对应命令，禁止沿用上个 session 的“已获取”标记。

3. **会话从 unavailable -> available 后首次 slash**
   - 条件：之前 `!api || !sessionId`，后续恢复可用。
   - 要求：恢复后第一次 `/...` 必须触发获取。

4. **首次获取失败后的补偿**
   - 条件：曾触发获取但失败（网络/接口错误）。
   - 要求：下一次进入 `/...` 必须重试，直到至少成功一次或达到错误保护策略。

5. **显式失效事件后的首次 slash**
   - 条件：检测到 session 变化、agent flavor 变化，或手动失效标记。
   - 要求：下一次 `/...` 必须补偿获取。

实现上建议维护每个 session 的 `hasFetchedSuccessfully` 标志与 `lastFetchError`，以区分“已成功获取过”与“仅尝试过但失败”。

## Decision (ADR-lite)

**Context**: 为避免“应获取却从未成功获取”的漏刷场景，需要定义首次获取失败后的补偿策略。

**Decision**: 采用 **Option A** —— 仅在“下一次输入 `/`”时重试获取（不做后台自动重试）。

**Consequences**:
- Pros:
  - 请求行为可预测，避免后台噪声请求。
  - 与“正常情况一次获取即可”目标一致，简单可维护。
- Cons:
  - 若用户长时间不再输入 `/`，错误状态可能持续更久。
- Mitigation:
  - 保留手动失效/重试触发点；下一次 slash 输入必定补偿获取。

## Scenario Inventory: potential missing/invalid remote command data (new)

以下场景已基于代码与交互链路识别，聚焦“输入 `/` 时是否可能未调用远端、或远端缓存无效、或远端调用设计上不可达”。

### A. 输入 `/` 但远端列表可能从未成功获取

1. **首次加载失败后仅回退 builtin，且无自动重试**
   - 现状：`useSlashCommands` 在失败时直接回退 builtin（`web/src/hooks/queries/useSlashCommands.ts:94`），且 `retry: false`（同文件:79）。
   - 结果：若用户后续不再触发 slash-entry 补偿机制，可能长期处于“看起来可补全，但从未成功拿到 remote 列表”。

2. **`sessionId` 暂不可用阶段（或无效）输入 `/`**
   - 现状：query 仅在 `enabled: Boolean(api && sessionId)` 时执行（`web/src/hooks/queries/useSlashCommands.ts:76`）。
   - 结果：此时只能 builtin；若后续没有“可用后首次 slash 必补偿获取”规则，会形成漏刷。

3. **补全触发词未被识别为 activeWord**
   - 现状：只有 `activeWord` 命中前缀逻辑才进入 suggestions handler（`web/src/components/AssistantChat/ZhushenComposer.tsx:149-153`，`web/src/utils/findActiveWord.ts:119`）。
   - 结果：某些输入/光标状态下即使看到 `/` 字符，也可能未进入 slash 查询链路。

### B. 本地缓存的远端命令列表可能无效/陈旧

4. **`staleTime: Infinity` 导致长期不失效**
   - 现状：slash query 永不过期（`web/src/hooks/queries/useSlashCommands.ts:77`）。
   - 结果：远端命令源变化后（新增/删除/覆盖），本地仍可能使用旧集合。

5. **仅按 sessionId 缓存 key，未包含 flavor/version 维度**
   - 现状：key 为 `['slash-commands', sessionId]`（`web/src/lib/query-keys.ts:16`）。
   - 风险：若 session 内 flavor 变化或命令源语义变化，可能复用不匹配缓存。

6. **远端返回失败结构时静默降级**
   - 现状：只有 `query.data?.success && query.data.commands` 才合并远端；否则 builtin（`web/src/hooks/queries/useSlashCommands.ts:87-95`）。
   - 结果：用户侧可能无感知地使用降级结果，误认为是“正确全集”。

### C. 设计上“远端命令 100% 无法调用”的场景

7. **RPC handler 未注册或 socket 断开**
   - 现状：hub -> rpcGateway 调用 `sessionRpc(..., 'listSlashCommands')`，若无 handler/断连直接抛错（`hub/src/sync/rpcGateway.ts:192`、`220-228`）。
   - 结果：该 session 的远端列表在该时段内必然不可达。

8. **会话存在但对应 CLI 侧不可服务**
   - 现状：HTTP 路由允许 inactive session 请求 slash-commands（`hub/src/web/routes/sessions.ts:354-365`），但最终仍依赖 RPC 可用。
   - 结果：会话可见 ≠ 远端可调用；会出现“接口存在但命令拿不到”的稳定失败窗口。

9. **请求超时（30s）后持续失败**
   - 现状：RPC ack timeout 30s（`hub/src/sync/rpcGateway.ts:230`）。
   - 结果：在网络或后端异常时，可形成长期不可达。

### E. 当前改动 vs 之前代码（工作区 vs HEAD）差异梳理（new, 2026-03-05）

> 对比基线已确认：**当前分支改动前的 HEAD**。

#### 功能差异

1. **slash 命令查询缓存维度增强**
   - 之前：仅按 `sessionId` 缓存（`web/src/lib/query-keys.ts` 旧实现）。
   - 当前：按 `sessionId + agentType` 缓存（`web/src/lib/query-keys.ts:16`）。
   - 影响：同一 session 内 flavor 切换时，不再错误复用旧命令缓存。

2. **新增 slash-entry 主动补偿刷新链路**
   - 之前：输入 `/` 仅走本地 suggestions 计算，不触发远端命令刷新。
   - 当前：`ZhushenComposer` 检测“首次进入 slash 上下文”后触发 `onSlashEntry`（`web/src/components/AssistantChat/ZhushenComposer.tsx:156-165`），由路由层调用 `refetchCommands`（`web/src/router.tsx:285-287`）。
   - 影响：降低“长期只看到 builtin”但无补偿重试的风险。

3. **useSlashCommands 引入会话级刷新状态语义**
   - 当前新增：
     - `hasFetchedSuccessfully`
     - `lastFetchError`
     - `lastEntryRefetchAt`
     - 以及 `refetchCommands` / `isFetchingCommands`（`web/src/hooks/queries/useSlashCommands.ts:53-269`）。
   - 作用：让“首次成功前/失败后”的 slash-entry 进入必尝试重拉；成功后进入冷却窗口节流。

4. **命令合并规则从直接拼接升级为去重合并**
   - 之前：builtin 与远端命令直接拼接，可能出现同名重复。
   - 当前：`mergeSlashCommands` 对 user/plugin/project 命令按名称（case-insensitive）去重合并（`web/src/hooks/queries/useSlashCommands.ts:93-113`）。
   - 影响：候选列表更稳定，减少重复项干扰。

5. **新增单元测试覆盖关键策略**
   - 新增 `web/src/hooks/queries/useSlashCommands.test.ts`：验证合并去重、失败补偿、冷却窗口判定。

#### 效果差异（用户可感知）

1. **输入 `/` 后候选“新鲜度”提升**
   - 之前：高度依赖历史缓存（`staleTime: Infinity`），远端变化可能长期不可见。
   - 当前：slash-entry 触发补偿刷新，远端变化更快反映。

2. **失败场景可恢复性提升**
   - 之前：失败后通常退回 builtin，且可能长期停留。
   - 当前：下一次 slash-entry 会继续尝试刷新，不易形成“静默漏获取”。

3. **跨 flavor 串缓存风险下降**
   - 之前：`sessionId` 单维 key 存在语义串用窗口。
   - 当前：`sessionId + agentType` 二维 key 隔离更明确。

4. **交互性能与稳定性折中更平衡**
   - 通过 `isFetching` 防重入 + cooldown（4s）避免频繁重复请求，同时保留关键入口的补偿能力。


### F. 新需求对齐：新会话打开后无法自动补全（bug triage, 2026-03-05）

#### 目标重述

- 用户最新目标：确认并定位具体 bug：**在 web 打开新会话时，自动补全不可用/不稳定**。

#### 当前代码下该 bug 是否仍可能存在

- 结论：**仍存在条件性复现窗口（未完全根除）**。

#### 根因分析（基于当前实现）

1. **新会话早期阶段会触发一次自动 query，但 RPC 可能尚未就绪**
   - `useSlashCommands` 只要 `api && sessionId` 即会触发请求（`enabled: Boolean(api && sessionId)`，`web/src/hooks/queries/useSlashCommands.ts:152`）。
   - 新会话刚建立时，RPC handler/连接状态可能短暂不可达，导致首次获取失败。

2. **首次请求失败后没有自动重试**
   - 当前仍是 `retry: false` + `staleTime: Infinity`（`web/src/hooks/queries/useSlashCommands.ts:153-156`）。
   - 因此会停留在 builtin 降级状态，直到后续有补偿触发。

3. **补偿触发存在竞态缺口（slash-entry + fetching 门槛）**
   - `ZhushenComposer` 仅在“非 slash -> slash”边沿触发 `onSlashEntry`，且要求 `!isFetchingSlashCommands`（`web/src/components/AssistantChat/ZhushenComposer.tsx:156-165`）。
   - 若用户首次输入 `/` 时 query 正在 fetching，则这次不会触发补偿；若该 in-flight 请求失败且用户未退出再进入 slash，上述边沿不会再次出现。

#### 用户可见效果

- 典型表现：新会话刚打开输入 `/` 时，远端命令未出现（仅 builtin 或无候选），需要再次切换输入状态/重新进入 slash 才可能恢复。

### G. 决策更新（2026-03-05）

#### Decision (ADR-lite)

**Context**: 新会话场景下，slash 自动补全仍存在“首发失败 + 无后续补偿”的竞态窗口。需要在不大幅改动架构的前提下修复。

**Decision**: 采用 **中等修复（推荐）** —— 将补偿触发从“仅 slash-entry 边沿触发”升级为“slash 上下文 + 失败态驱动触发”，不再依赖单次 entry 边沿。

**Consequences**:
- Pros:
  - 修复新会话首屏补全竞态窗口的概率更高。
  - 改动可控，复用现有 hook 与 query 结构。
  - 与当前节流逻辑兼容，避免请求风暴。
- Cons:
  - 状态判定复杂度会上升，需要补充行为测试。

#### Requirements（增量）

- 在 slash 上下文持续期间，若远端命令尚未成功获取或最近获取失败，系统必须具备可执行的补偿刷新路径。
- 补偿触发不依赖“再次离开再进入 slash”，即使用户停留在 `/...` 也可在合适时机自动补偿。
- 保持请求节流与并发去重（避免高频重复 refetch）。

#### Acceptance Criteria（增量）

- [ ] 新会话首次进入 `/` 且初始获取失败时，在不退出 slash 上下文的前提下可触发后续补偿获取。
- [ ] 补偿机制在连续输入过程中不会造成明显重复请求风暴（有节流/并发保护）。
- [ ] `@/$` 自动补全行为不回归。
