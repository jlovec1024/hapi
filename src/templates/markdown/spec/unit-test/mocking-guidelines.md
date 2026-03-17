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

---

## Fake Timers 规则

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
