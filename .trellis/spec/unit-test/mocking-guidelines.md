# Mock 规范

> 定义何时以及如何替换依赖。

---

## 本指南的边界

本指南只覆盖依赖替换策略：

- Network / FS / process / clock / randomness 等外部边界
- Mock 的生命周期与隔离方式

本指南**不**定义以下内容：

- 夹具数据构建（见 `fixtures-and-data.md`）
- 断言细节（见 `assertion-style.md`）

---

## Mock 规则（基线）

- 在外部边界做 Mock，而不是在纯领域逻辑内部做 Mock
- 不要 Mock 被测函数本身
- 每个测试用例中的 Mock 应显式且最小化
- 每个测试之间都要 reset / restore Mock
- **涉及时间的测试必须使用 fake timers**（见下方"Fake Timers 规则"）

---

## 推荐模式

- 语义清晰的测试替身（test doubles）
- 优先按测试用例单独 setup，而不是全局隐藏行为
- Mock 行为应与当前场景明确绑定

---

## 不推荐的模式

- 全局 Mock 泄漏到其他测试用例
- 过度 Mock，掩盖真实集成假设
- 多个测试共享可变的 Mock 状态


## 模块级 Mock 合约（Bun / Vitest 通用）

### 核心原则

**模块级 Mock 也有“导出契约”。**

当你 mock 一个模块时，必须同时考虑：
- 当前测试要替换哪个行为
- 其他导出是否仍会被同一测试文件、后续导入链或共享运行时使用
- 当前测试框架是否会让顶层模块 mock 在整个测试进程中继续生效

如果 mock 后的模块丢失了调用方仍会访问的导出，那么失败表面上会表现为：
- `Export named 'X' not found`
- 单独运行测试通过，但批量运行失败
- 一个测试文件通过，另一个无关文件导入时报错

### 强制规则

- **不要在 `mock.module()` / `vi.mock()` 工厂中递归 `import()` 同一个被 mock 的模块**
  - 尤其在 Bun 下，这很容易拿到**半初始化模块**，制造假性的“导出不存在”错误
- **如果只替换模块中的一部分行为，必须显式保留完整导出面**
  - 要么保留真实导出
  - 要么提供一个覆盖调用面所需的完整 stub
- **对公共工具模块（process / child_process / logger / protocol / shared utils）做 mock 时，先检查它是否有额外导出被其他文件依赖**
- **迁移测试运行器（Vitest → Bun 等）时，优先排查顶层模块 mock 的作用域和缓存模型差异**

### 优先模式

**模式 A：保留真实导出，再覆盖特定行为**

适用：mock 框架支持安全地读取真实模块，且不会递归导入同一个 mock 目标。

```typescript
mock.module('node:child_process', async () => {
    const actual = await import('node:child_process')
    return {
        ...actual,
        execFile: mockExecFile
    }
})
```

**模式 B：提供显式完整 stub（推荐用于 Bun 的自模块 mock）**

适用：mock 目标本身就是当前导入链的高频公共模块，或已经出现过半初始化 / 导出缺失问题。

```typescript
mock.module('@/runner/controlClient', () => ({
    notifyRunnerSessionStarted: mock(async () => ({ ok: true })),
    listRunnerSessions: mock(async () => []),
    stopRunnerSession: mock(async () => false),
    spawnRunnerSession: mock(async () => ({})),
    stopRunnerHttp: mock(async () => undefined),
    getInstalledCliMtimeMs: mock(() => undefined),
    getRunnerAvailability: mock(async () => ({ status: 'missing', state: null })),
    checkIfRunnerRunningAndCleanupStaleState: mock(async () => false),
    isRunnerRunningCurrentlyInstalledZhushenVersion: mock(async () => false),
    cleanupRunnerState: mock(async () => undefined),
    stopRunner: mock(async () => false)
}))
```

### 明确禁止的模式

**❌ 错误：递归导入同一个被 mock 模块**

```typescript
mock.module('@/runner/controlClient', async () => {
    const actual = await import('@/runner/controlClient')
    return {
        ...actual,
        isRunnerRunningCurrentlyInstalledZhushenVersion: mockIsRunnerRunningCurrentlyInstalledZhushenVersion
    }
})
```

为什么危险：
- 在 Bun 中，mock 工厂执行时该模块可能尚未完成初始化
- `actual` 可能是残缺对象
- 后续文件导入同一模块时，会看到缺失导出而不是拿到真实模块

**❌ 错误：只 mock 单个导出，忽略模块的其余公共 API**

```typescript
mock.module('@/utils/spawnZhushenCLI', () => ({
    spawnZhushenCLI: mockSpawnZhushenCLI
}))
```

为什么危险：
- 其他代码可能仍依赖 `getZhushenCliCommand` / `getSpawnedCliWorkingDirectory`
- 单测单独运行可能通过，批量运行时会污染其他文件

### 排查清单：当你看到“单独过、批量挂”时

- [ ] 是否有顶层 `mock.module()` / `vi.mock()` 在文件加载时就生效？
- [ ] mock 的是否是公共基础模块（`child_process`、`fs`、`protocol`、shared utils、运行时 helper）？
- [ ] mock 返回对象是否遗漏了调用链还会访问的导出？
- [ ] 是否在 mock 工厂内再次 `import()` 了同一个模块？
- [ ] 是否需要把“部分保留真实导出”改成“显式完整 stub”？
- [ ] 是否应该把需要特殊运行时的测试（例如 Ink / renderer / fake TTY）拆到独立 lane？

### 运行器迁移专项检查（Vitest ↔ Bun）

当迁移测试框架时，额外检查：
- [ ] mock 生命周期是否仍与原框架一致？
- [ ] fake timer API / module mock API 是否语义兼容？
- [ ] 顶层 mock 是否在新框架下变成全进程共享污染源？
- [ ] 是否有需要保留在独立测试通道的文件（例如依赖真实 renderer / 特定 mock API 的测试）？
- [ ] 是否应该增加分批脚本（`test:fast` / `test:runtime` / `test:changed`）来缩短定位回路？

---


### 何时使用

**强制要求**：以下情况必须使用 `vi.useFakeTimers()`：

- 测试中使用了 `setTimeout` / `setInterval`
- 测试中使用了 `waitFor` 等待状态变化
- 测试中有延迟或定时行为
- 测试依赖时间流逝（如倒计时、过期检查）
- 测试中有防抖（debounce）或节流（throttle）

**原因**：真实定时器会导致测试不稳定（flaky tests），在不同负载环境下结果不一致。

### 标准模式

```typescript
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

describe('MyComponent', () => {
    beforeEach(() => {
        vi.useFakeTimers()  // 启用 fake timers
    })

    afterEach(() => {
        vi.restoreAllMocks()
        vi.useRealTimers()  // 恢复真实定时器
    })

    it('resets state after delay', () => {
        const { result } = renderHook(() => useDelayedReset(1000))

        act(() => {
            result.current.trigger()
        })
        expect(result.current.active).toBe(true)

        // 精确控制时间流逝
        act(() => {
            vi.advanceTimersByTime(1000)
        })
        expect(result.current.active).toBe(false)
    })
})
```

### 禁止模式

**❌ 错误：使用真实定时器 + waitFor**

```typescript
it('resets after delay', async () => {
    const { result } = renderHook(() => useDelayedReset(50))

    act(() => {
        result.current.trigger()
    })

    // 不稳定！依赖真实时间和系统负载
    await waitFor(() => expect(result.current.active).toBe(false), { timeout: 100 })
})
```

**❌ 错误：忘记恢复真实定时器**

```typescript
it('test with timers', () => {
    vi.useFakeTimers()
    // ...
    // 忘记 vi.useRealTimers()，会影响后续测试
})
```

### 参考资源

- [CI/CD 思维指南 - 测试稳定性原则](../guides/ci-cd-thinking-guide.md#4-测试稳定性原则)
- [Vitest Fake Timers 文档](https://vitest.dev/api/vi.html#vi-usefaketimers)

---

## 代码库中的示例

- `cli/src/claude/utils/startHookServer.test.ts`（进程 / 边界 Mock 场景）
- `cli/src/codex/codexRemoteLauncher.test.ts`（launcher 依赖隔离）
- `hub/src/socket/handlers/terminal.test.ts`（socket / handler 边界测试）
