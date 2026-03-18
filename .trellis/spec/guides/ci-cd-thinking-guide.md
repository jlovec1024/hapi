# CI/CD 思维指南

> **目的**：确保 CI/CD 工作流的环境一致性、可靠性和可维护性。

---

## 为什么需要这个指南？

CI/CD 工作流是代码质量的最后一道防线，但常见问题包括：

- **环境不一致**：不同 workflow 使用不同的运行时版本或缺少必要依赖
- **测试无法执行**：workflow 声称要运行测试，但环境不支持
- **静默失败**：测试失败但 workflow 仍然通过
- **配置重复**：每个 workflow 独立配置环境，难以维护

这些问题会导致：
- PR 合并后才发现测试实际没运行
- 本地通过但 CI 失败（或反之）
- 修改依赖版本需要更新多个文件

---

## 核心原则

### 1. 环境一致性原则

**所有需要运行项目代码的 workflow 必须使用相同的运行时环境。**

#### 反例：PR24 的问题

```yaml
# .github/workflows/test.yml ✅ 正确
- uses: oven-sh/setup-bun@v2
- run: bun install
- run: bun run test

# .github/workflows/codex-pr-review.yml ❌ 错误
# 缺少 setup-bun，导致无法运行 web 测试
runs-on: ubuntu-latest  # 只有基础工具，没有 bun
```

**后果**：
- AI reviewer 在 PR#24 中报告"未运行测试（自动化环境缺少 `bun`，无法执行 `web` 侧测试命令）"
- 测试文件的修改无法被验证
- 静态分析无法发现运行时错误

#### 正确做法

**方案 A：复用环境配置步骤**

```yaml
# .github/workflows/codex-pr-review.yml
steps:
  - uses: actions/checkout@v4
  - uses: oven-sh/setup-bun@v2  # ✅ 添加这一行
  - run: bun install
  # ... 其他步骤
```

**方案 B：创建复合 Action（推荐）**

```yaml
# .github/actions/setup-project-env/action.yml
name: Setup Project Environment
description: Install bun and project dependencies
runs:
  using: composite
  steps:
    - uses: oven-sh/setup-bun@v2
      with:
        bun-version: 1.3.10  # 统一版本
    - run: bun install
      shell: bash

# 在所有 workflow 中使用
- uses: ./.github/actions/setup-project-env
```

**优势**：
- 单一配置源，修改一次生效所有 workflow
- 版本统一管理
- 减少配置重复

---

### 2. 测试执行验证原则

**如果 workflow 声称要检查测试，必须确保测试能够执行。**

#### Checklist

- [ ] 运行时环境已安装（bun/node/python 等）
- [ ] 依赖已安装（`bun install` / `npm ci` / `pip install`）
- [ ] 测试命令在 CI 环境中可执行
- [ ] 测试失败会导致 workflow 失败（`set -e` 或检查退出码）

#### AI Reviewer 的责任

如果 AI reviewer 无法运行测试，应该：

```markdown
**Testing**
❌ 无法执行测试：当前环境缺少 `bun` 运行时。

**建议**：
在 workflow 中添加：
\`\`\`yaml
- uses: oven-sh/setup-bun@v2
- run: bun install
\`\`\`

**风险**：
- 测试文件的修改未经验证
- 可能存在运行时错误未被发现
```

并且 workflow 应该失败（`exit 1`），而不是继续执行。

---

### 3. 配置即代码原则

**CI/CD 配置应该像代码一样被测试和验证。**

#### 实践

1. **Workflow 配置验证**

```yaml
# .github/workflows/validate-workflows.yml
name: Validate Workflows
on: [push, pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Validate workflow syntax
        run: |
          for file in .github/workflows/*.yml; do
            echo "Validating $file"
            # 使用 actionlint 或其他工具验证
          done
```

2. **环境一致性测试**

```bash
# 检查所有 workflow 是否使用相同的 bun 版本
grep -r "setup-bun" .github/workflows/ | grep -o "bun-version: [0-9.]*" | sort -u
# 应该只有一个版本
```

3. **依赖版本锁定**

```yaml
# ✅ 好：明确版本
- uses: oven-sh/setup-bun@v2
  with:
    bun-version: 1.3.10

# ❌ 差：使用 latest
- uses: oven-sh/setup-bun@v2
  # 可能导致不同时间运行结果不同
```

---

### 4. 测试稳定性原则

**涉及时间流逝的测试必须使用 fake timers，避免真实定时器导致的不稳定性。**

#### 问题：Flaky Tests（不稳定测试）

**反例：PR#52 的问题**

```typescript
// ❌ 错误：依赖真实定时器
it('uses custom reset delay', async () => {
    const { result } = renderHook(() => useCopyToClipboard(50))  // 50ms delay

    await act(async () => {
        await result.current.copy('test')
    })

    expect(result.current.copied).toBe(true)

    // 问题：waitFor timeout=100ms，但 resetDelay=50ms
    // 在高负载环境下，setTimeout 可能在 waitFor 轮询间隔之后才触发
    await waitFor(() => expect(result.current.copied).toBe(false), { timeout: 100 })
})
```

**后果**：
- 本地通过，CI 环境失败（或反之）
- 测试结果不可预测，依赖系统负载
- 难以调试，因为问题不稳定复现
- 浪费开发时间在"重新运行 CI"上

#### 时序竞态分析

```
时间轴（真实定时器）：
0ms:   copy() 调用，setTimeout(50ms) 启动，copied = true
       waitFor 开始，第一次检查：copied = true ✗
50ms:  waitFor 第二次检查（轮询间隔 50ms）
       ⚠️ 竞态窗口：setTimeout 可能在检查前/后触发
       - 如果 setTimeout 先触发：copied = false ✓
       - 如果检查先执行：copied = true ✗
100ms: waitFor timeout，如果 copied 仍为 true 则失败

在 CI 高负载环境下，setTimeout 调度延迟更明显，失败概率更高。
```

#### 正确做法：使用 Fake Timers

```typescript
// ✅ 正确：使用 fake timers 控制时间
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

describe('useCopyToClipboard', () => {
    beforeEach(() => {
        vi.useFakeTimers()  // 启用 fake timers
    })

    afterEach(() => {
        vi.restoreAllMocks()
        vi.useRealTimers()  // 恢复真实定时器
    })

    it('uses custom reset delay', async () => {
        const { result } = renderHook(() => useCopyToClipboard(50))

        await act(async () => {
            await result.current.copy('test')
        })

        expect(result.current.copied).toBe(true)

        // 精确控制时间流逝
        act(() => {
            vi.advanceTimersByTime(50)  // 快进 50ms
        })

        expect(result.current.copied).toBe(false)  // 确定性结果
    })
})
```

**优势**：
- **确定性**：时间流逝完全可控，结果可预测
- **速度快**：不需要真实等待，测试瞬间完成
- **无竞态**：消除了调度延迟导致的不确定性
- **易调试**：失败时可以精确重现

#### Checklist：何时使用 Fake Timers

- [ ] 测试中使用了 `setTimeout` / `setInterval`
- [ ] 测试中使用了 `waitFor` 等待状态变化
- [ ] 测试中有延迟或定时行为
- [ ] 测试依赖时间流逝（如倒计时、过期检查）
- [ ] 测试中有防抖（debounce）或节流（throttle）

**规则**：只要测试涉及时间，就应该使用 fake timers。

#### 常见模式

**模式 1：测试 setTimeout**

```typescript
it('resets state after delay', () => {
    vi.useFakeTimers()

    const { result } = renderHook(() => useDelayedReset(1000))

    act(() => {
        result.current.trigger()
    })
    expect(result.current.active).toBe(true)

    act(() => {
        vi.advanceTimersByTime(1000)
    })
    expect(result.current.active).toBe(false)

    vi.useRealTimers()
})
```

**模式 2：测试 setInterval**

```typescript
it('polls every 500ms', () => {
    vi.useFakeTimers()
    const callback = vi.fn()

    const { result } = renderHook(() => useInterval(callback, 500))

    expect(callback).toHaveBeenCalledTimes(0)

    act(() => {
        vi.advanceTimersByTime(500)
    })
    expect(callback).toHaveBeenCalledTimes(1)

    act(() => {
        vi.advanceTimersByTime(1000)
    })
    expect(callback).toHaveBeenCalledTimes(3)  // 总共 1500ms

    vi.useRealTimers()
})
```

**模式 3：测试 debounce**

```typescript
it('debounces input', () => {
    vi.useFakeTimers()
    const callback = vi.fn()

    const { result } = renderHook(() => useDebounce(callback, 300))

    // 快速连续调用
    act(() => {
        result.current('a')
        result.current('ab')
        result.current('abc')
    })

    expect(callback).not.toHaveBeenCalled()

    // 等待 debounce 延迟
    act(() => {
        vi.advanceTimersByTime(300)
    })

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith('abc')  // 只调用最后一次

    vi.useRealTimers()
})
```

#### 避免的反模式

**反模式 1：混用真实和 fake timers**

```typescript
// ❌ 错误：部分测试用 fake，部分用真实
describe('MyComponent', () => {
    it('test 1', async () => {
        vi.useFakeTimers()
        // ...
        vi.useRealTimers()
    })

    it('test 2', async () => {
        // 忘记设置 fake timers，使用真实定时器
        await waitFor(...)  // 不稳定！
    })
})
```

**解决方案**：在 `beforeEach` 中统一设置

```typescript
// ✅ 正确：统一管理
describe('MyComponent', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    // 所有测试都使用 fake timers
})
```

**反模式 2：忘记恢复真实定时器**

```typescript
// ❌ 错误：影响后续测试
it('test with timers', () => {
    vi.useFakeTimers()
    // ...
    // 忘记 vi.useRealTimers()
})

it('another test', () => {
    // 这个测试会意外使用 fake timers！
})
```

**解决方案**：使用 `afterEach` 确保清理

---

## 常见场景 Checklist

### 添加新的 CI Workflow

- [ ] 是否需要运行项目代码？
  - 是 → 添加 `setup-project-env` 或等效步骤
  - 否 → 明确说明为何不需要
- [ ] 是否需要运行测试？
  - 是 → 确保 `bun run test` 可执行
  - 否 → 在 workflow 注释中说明
- [ ] 失败时是否会阻止 PR 合并？
  - 是 → 确保 `set -e` 或检查退出码
  - 否 → 考虑是否应该阻止

### 修改测试文件

- [ ] 本地测试通过
- [ ] CI 中的测试 workflow 通过
- [ ] 如果有 AI reviewer，确认它能运行测试
- [ ] 如果 AI reviewer 报告"未运行测试"，检查环境配置
- [ ] **检查是否引入了运行时特定依赖（见下方"引入运行时特定依赖"）**
- [ ] **检查是否涉及定时器（setTimeout/setInterval/waitFor）**
  - 是 → 必须使用 `vi.useFakeTimers()`（见"测试稳定性原则"）
  - 否 → 无需额外处理

### 升级运行时版本

- [ ] 更新所有 workflow 中的版本号
- [ ] 更新 Dockerfile 中的版本号
- [ ] 更新 `package.json` 中的 `engines` 字段
- [ ] 更新文档中的版本要求

### 引入运行时特定依赖

- [ ] 依赖是否只在特定运行时可用？（如 `bun:ffi`、`bun:sqlite`、Node.js 特定模块）
- [ ] 测试环境是否与生产环境使用相同的运行时？
  - 是 → 无需额外处理
  - 否 → 必须提供测试环境的 mock
- [ ] 是否在 vitest.config.ts 中配置了 alias mock？
- [ ] Mock 实现是否覆盖了测试所需的接口？
- [ ] 是否添加了注释说明为何需要 mock？

### 版本发布

- [ ] 是否更新了所有 workspace 的 `package.json` 版本号？
- [ ] 是否运行了 `bun install` 重新生成 lockfile？
- [ ] 是否验证了 lockfile 包含所有平台的包定义？
  - 对于有 optionalDependencies 的包，检查所有平台都有对应的包定义行
- [ ] 是否运行了 `bun install --frozen-lockfile` 验证一致性？
- [ ] 是否运行了 `git diff --exit-code bun.lock` 确认无额外变更？
- [ ] 是否提交了 lockfile 和 package.json？

**示例：Mock bun-pty**

```typescript
// vitest.config.ts
export default defineConfig({
    test: {
        alias: {
            // Mock bun-pty for test environment (vitest runs in Node.js, not Bun)
            // bun-pty depends on bun:ffi which is not available in Node.js
            'bun-pty': resolve('./src/__mocks__/bun-pty.ts'),
        }
    }
})
```

```typescript
// src/__mocks__/bun-pty.ts
export interface IPty { /* ... */ }
export const spawn: null = null  // Simulate unavailable runtime
```

---

## 快速诊断

### 问题：AI reviewer 说"无法运行测试"

**检查清单**：
1. 查看 workflow 文件是否有 `setup-bun` 或等效步骤
2. 查看是否有 `bun install` 步骤
3. 查看测试命令是否正确（`bun run test` vs `npm test`）
4. 查看 workflow 日志，确认失败原因

**修复**：
```yaml
# 在 steps 中添加
- uses: oven-sh/setup-bun@v2
- run: bun install
```

### 问题：本地通过但 CI 失败

**可能原因**：
- 本地使用不同的运行时版本
- 本地有全局安装的依赖，CI 没有
- 环境变量不同
- 文件路径大小写敏感性（macOS vs Linux）

**诊断**：
```bash
# 本地模拟 CI 环境
docker run -it --rm -v $(pwd):/app -w /app oven/bun:1.3.10 bash
bun install
bun run test
```

### 问题：CI 通过但本地失败

**可能原因**：
- 本地依赖版本不同（`bun.lock` 未同步）
- 本地有未提交的文件影响测试
- 本地环境变量干扰

**诊断**：
```bash
# 清理并重新安装
rm -rf node_modules
bun install --frozen-lockfile
bun run test
```

### 问题：测试失败提示"Cannot find package 'bun:ffi'"

**原因**：
- 代码中静态导入了依赖 Bun 运行时特定模块的包（如 `bun-pty`）
- 测试环境运行在 Node.js（vitest），无法解析 `bun:ffi` 等 Bun 特定模块

**修复**：
1. 在 `vitest.config.ts` 中添加 alias mock：
```typescript
export default defineConfig({
    test: {
        alias: {
            'bun-pty': resolve('./src/__mocks__/bun-pty.ts'),
        }
    }
})
```

2. 创建 mock 文件 `src/__mocks__/bun-pty.ts`：
```typescript
// Mock for bun-pty in test environment
export interface IPty { /* ... */ }
export const spawn: null = null  // Simulate unavailable runtime
```

**预防**：
- 引入新的运行时特定依赖时，立即提供测试环境的 mock
- 参考"引入运行时特定依赖" checklist

---

## 案例 3: Lockfile Drift - 依赖锁文件不一致

### 问题描述

CI 中的 `compose-smoke` job 失败，错误信息：

```
Lockfile precheck (frozen)
Process completed with exit code 1.
```

检查步骤：
```yaml
- name: Lockfile precheck (frozen)
  run: |
    bun install --frozen-lockfile
    git diff --exit-code bun.lock
```

### 根本原因

**Category C: Change Propagation Failure（变更传播失败）**

开发者修改了依赖或 `package.json`，但是：
1. 忘记提交更新后的 `bun.lock` 文件
2. 或者在不同的 bun 版本下，lockfile 产生了不同的哈希值
3. 或者 lockfile 不完整/损坏，CI 重新生成后与原文件不同

### 为什么会发生

**常见场景**：

| 场景 | 原因 | 后果 |
|------|------|------|
| **忘记提交** | `git add package.json` 但忘记 `git add bun.lock` | CI 检测到不一致 |
| **版本差异** | 本地 bun 1.3.10，CI bun 1.3.15 | lockfile 格式/哈希不同 |
| **部分安装** | 只安装了部分 workspace 的依赖 | lockfile 不完整 |
| **手动编辑** | 直接编辑 lockfile（极少见） | 格式损坏 |
| **版本升级遗漏** | 升级版本时遗漏某些平台的包定义 | lockfile 不完整，CI 重新生成后不一致 |

### 循环复现分析（2026-03-16）

**问题时间线**：
1. **首次发现** (commit 0068697)：lockfile 缺少 Windows 平台支持
   - 修复：手动添加了 `@jlovec/zhushen-win32-x64@0.3.1` 的包定义
   - 状态：✅ 修复成功
2. **循环复现** (commit e91f8f0)：版本升级到 0.3.2 时，同样的问题再次发生
   - 触发：本地执行 `bun run release-all 0.3.2` → git push tag → GitHub Actions 触发
   - 失败：docker-images.yml 的 compose-smoke job 在 "Lockfile precheck" 步骤失败
   - 状态：❌ 预防机制失效

**真正的根本原因（竞态条件）**：

`cli/scripts/release-all.ts` 的执行流程存在时序问题：

```typescript
// Step 3: 顺序发布 5 个平台包
for (const platform of ['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64', 'win32-x64']) {
    run(`npm publish --access public`, npmDir);  // win32-x64 是最后一个
}

// Step 4: 发布主包
run(`npm publish --access public`, mainNpmDir);

// Step 5: 立即运行 bun install 更新 lockfile
await runWithTimeoutRetry('bun install', repoRoot);  // ❌ 问题在这里！

// Step 6: git commit + tag + push
```

**竞态条件**：
- `npm publish` 完成 ≠ 包在 registry 上立即可用
- npm registry 有同步延迟（CDN 缓存、镜像同步等，通常几秒到几分钟）
- Step 5 的 `bun install` 在 Step 3 发布完成后**立即**运行
- 此时 win32-x64@0.3.2（最后发布的包）可能还没有在 registry 上可用
- 结果：`bun install` 找不到 win32-x64@0.3.2，lockfile 中缺少这个包的定义
- Step 6 提交了不完整的 lockfile → git push tag → CI 失败

**为什么总是 win32-x64**：
- 它是循环中**最后一个**发布的平台（line 118）
- 当 `bun install` 运行时，前面的包可能已经同步，但最后一个包还没有

**为什么预防机制失效**：

| 失效点 | 原因 | 影响 |
|--------|------|------|
| **隐式假设** | release-all.ts 假设 `npm publish` 后包立即可用 | 竞态条件 |
| **缺少等待** | Step 5 没有等待 registry 同步完成 | lockfile 不完整 |
| **缺少验证** | Step 5 后没有验证 lockfile 完整性 | 无法检测问题 |
| **补丁式修复** | 首次修复只是手动补全，没有修复 release-all.ts | 问题会重复 |

**根本问题**：
- release-all.ts 的 Step 5 存在**时序依赖**，但没有等待机制
- 没有验证 lockfile 是否包含所有 optionalDependencies
- 即使有 `runWithTimeoutRetry`，也只是重试 `bun install`，不会等待 registry 同步

### 预防机制

#### P0: 修复 release-all.ts 的竞态条件

在 `cli/scripts/release-all.ts` 的 Step 5 中添加等待和验证：

```typescript
// Step 5: bun install to get complete lockfile
console.log('\n📥 Step 5: Updating lockfile...');
console.log('⏳ Waiting for npm registry to sync (60s)...');
await new Promise(resolve => setTimeout(resolve, 60_000));  // 等待 60 秒

// 重试机制：验证 lockfile 完整性
let retries = 0;
const maxRetries = 5;
while (retries < maxRetries) {
    await runWithTimeoutRetry('bun install', repoRoot);

    // 验证 lockfile 完整性
    const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf-8'));
    const lockfile = readFileSync(join(repoRoot, 'bun.lock'), 'utf-8');
    const optionalDeps = packageJson.optionalDependencies || {};
    const missing: string[] = [];

    for (const [name, version] of Object.entries(optionalDeps)) {
        const expectedPattern = `"${name}@${version}"`;
        if (!lockfile.includes(expectedPattern)) {
            missing.push(`${name}@${version}`);
        }
    }

    if (missing.length === 0) {
        console.log('✅ Lockfile 完整性验证通过');
        break;
    }

    retries++;
    if (retries < maxRetries) {
        console.warn(`⚠️ Lockfile 缺少包定义: ${missing.join(', ')}`);
        console.warn(`⏳ 等待 npm registry 同步... (${retries}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 60_000));
    } else {
        console.error('❌ Lockfile 验证失败，缺少以下包定义：');
        missing.forEach(pkg => console.error(`  - ${pkg}`));
        process.exit(1);
    }
}
```

#### P0: 创建独立的 lockfile 验证脚本

创建 `scripts/verify-lockfile.ts` 用于手动验证：

```typescript
#!/usr/bin/env bun
// 验证 lockfile 中所有 optionalDependencies 都有对应的包定义

import { readFileSync } from 'fs';
import { join } from 'path';

const packageJson = JSON.parse(readFileSync('cli/package.json', 'utf-8'));
const lockfile = readFileSync('bun.lock', 'utf-8');

const optionalDeps = packageJson.optionalDependencies || {};
const missing: string[] = [];

for (const [name, version] of Object.entries(optionalDeps)) {
  const expectedPattern = `"${name}@${version}"`;
  if (!lockfile.includes(expectedPattern)) {
    missing.push(`${name}@${version}`);
  }
}

if (missing.length > 0) {
  console.error('❌ Lockfile 缺少以下包定义：');
  missing.forEach(pkg => console.error(`  - ${pkg}`));
  console.error('\n修复方法：');
  console.error('  1. 等待 npm registry 同步（如果刚发布）');
  console.error('  2. 运行: bun install');
  console.error('  3. 提交: git add bun.lock');
  process.exit(1);
}

console.log('✅ Lockfile 完整性验证通过');
```

**在 package.json 中添加脚本**：

```json
{
  "scripts": {
    "verify-lockfile": "bun run scripts/verify-lockfile.ts"
  }
}
```

#### P0: Pre-commit Hook

在 `.git/hooks/pre-commit` 中添加检查：

```bash
#!/bin/bash
# 检查 package.json 和 lockfile 是否同步

if git diff --cached --name-only | grep -q "package.json"; then
  if ! git diff --cached --name-only | grep -q "bun.lock"; then
    echo "❌ Error: package.json changed but bun.lock not staged"
    echo "Run: bun install && git add bun.lock"
    exit 1
  fi
fi
```

#### P0: 开发规范文档

在 `.trellis/spec/backend/quality-guidelines.md` 或前端规范中明确：

**Lockfile 提交规则**：
- ✅ 修改依赖时，必须同时提交 lockfile
- ✅ 使用 `bun install` 而不是 `bun add --no-save`
- ✅ 提交前运行 `bun install` 确保 lockfile 最新
- ❌ 不要手动编辑 lockfile
- ❌ 不要在 `.gitignore` 中忽略 lockfile

#### P1: 改进 CI 错误信息

修改 workflow 提供更清晰的错误提示：

```yaml
- name: Lockfile precheck (frozen)
  run: |
    echo "Checking lockfile consistency..."
    bun install --frozen-lockfile || {
      echo "❌ Lockfile is out of sync with package.json"
      echo ""
      echo "To fix this:"
      echo "  1. Run: bun install"
      echo "  2. Commit the updated bun.lock"
      echo "  3. Push again"
      exit 1
    }

    git diff --exit-code bun.lock || {
      echo "❌ Lockfile was modified during install"
      echo "This means your committed lockfile is incomplete or uses a different bun version"
      echo ""
      echo "To fix this:"
      echo "  1. Ensure you're using bun >= 1.3.10"
      echo "  2. Run: bun install"
      echo "  3. Commit the updated bun.lock"
      echo "  4. Push again"
      exit 1
    }
```

#### P1: 统一 Bun 版本

在 `package.json` 中已经锁定：

```json
{
  "engines": {
    "bun": ">=1.3.10"
  }
}
```

但考虑更严格的版本范围：

```json
{
  "engines": {
    "bun": "^1.3.10"  // 只允许 1.3.x 版本
  }
}
```

### 修复步骤

当遇到 lockfile precheck 失败时：

```bash
# 1. 确保使用正确的 bun 版本
bun --version  # 应该 >= 1.3.10

# 2. 重新生成 lockfile
bun install

# 3. 检查变更
git diff bun.lock

# 4. 如果变更合理，提交
git add bun.lock
git commit -m "chore: update lockfile"
git push

# 5. 如果变更异常（大量无关变更），检查 bun 版本
# 可能需要升级/降级到与 CI 一致的版本
```

### 系统性扩展

**类似问题**：
- `package-lock.json` (npm)
- `yarn.lock` (yarn)
- `pnpm-lock.yaml` (pnpm)
- 任何需要"成对提交"的文件：
  - Database schema + migration files
  - TypeScript types + implementation
  - OpenAPI spec + generated code

**设计改进**：
- 考虑在 `setup-project-env` action 中验证 bun 版本
- 添加 lockfile 验证脚本到 `package.json` scripts
- 在 PR template 中添加 lockfile 检查项

**流程改进**：
- 在开发者 onboarding 文档中强调 lockfile 重要性
- 考虑添加 pre-push hook（比 pre-commit 更宽松）
- 在 code review checklist 中添加"lockfile 已更新"项

---

## Docker 平台依赖最小化（构建目标隔离）

当 Docker 镜像只面向单一平台（如 Linux x64）时：

- **只下载当前构建目标必需的资源**，避免因无关平台资源不可用而阻断构建
- **推荐做法**：构建脚本支持按平台下载（例如通过环境变量传入目标平台）
- **风险点**：一次性下载所有平台资源 → 任何一个平台失败都会导致构建失败

**示例（推荐）**：
```dockerfile
# 仅下载 Linux x64 资源
RUN TUNWG_TARGET_PLATFORM=x64-linux bun run download:tunwg
```

---

## 相关资源

- [GitHub Actions 文档](https://docs.github.com/en/actions)
- [Bun CI 集成指南](https://bun.sh/docs/cli/test#ci)
- [跨平台思维指南](./cross-platform-thinking-guide.md)（处理路径和命令）

---

## 记住

> **CI 环境不一致是技术债的隐形来源。**
>
> 花 10 分钟统一环境配置，可以避免数小时的"为什么 CI 失败"调试时间。

> **Lockfile 是依赖管理的契约。**
>
> 修改依赖时忘记提交 lockfile，就像修改 API 接口但不更新文档一样危险。

---

## Docker 构建依赖检查清单（构建脚本 ↔ 外部资源）

当 Docker 镜像构建需要外部资源（二进制文件、下载的资源等）时：

### 核心原则

**Docker 构建必须是自包含的，所有依赖必须在 Dockerfile 中显式获取。**

### 检查清单

- [ ] **构建脚本是否依赖外部文件？**
  - 检查 `COPY . .` 后构建步骤是否访问项目外的资源
  - 检查代码中是否有 `import` 或 `require` 指向非版本控制的文件

- [ ] **外部资源是否在 Dockerfile 中下载？**
  - 如果构建需要下载的资源（二进制文件、依赖包等），必须在 Dockerfile 中显式下载
  - 不要假设这些文件在 `COPY . .` 时已经存在

- [ ] **是否避免了对无关平台资源的依赖？** ⚠️ **关键**
  - **反模式**：下载所有平台资源，但只用到其中一个（脆弱点）
  - **正模式**：只下载当前构建目标必需的资源
  - 例如：Linux x64 构建不应该依赖 darwin/win 资源的可用性

- [ ] **本地开发与 CI/CD 是否一致？**
  - 本地 `package.json` scripts 可能包含前置步骤（如 `download:tunwg`）
  - Dockerfile 必须复制这些步骤，而不是只复制文件

- [ ] **错误信息是否明确？**
  - 文件不存在时，错误信息应该提示如何获取（如"请运行 bun run download:tunwg"）
  - 不要只报 "Could not resolve"，要给出解决方案

### 典型失败模式

**案例：Docker runner 构建失败（2026-03-18）**

**问题**：
```dockerfile
# Dockerfile.runner
COPY . .
RUN cd /app/cli && bun run build:exe --target bun-linux-x64-baseline
# ❌ 失败：Could not resolve "../../../hub/tools/tunwg/tunwg-x64-linux"
```

**根本原因**：
1. `embeddedAssets.bun.ts` 期望导入 `hub/tools/tunwg/tunwg-x64-linux`
2. 这个文件需要通过 `bun run download:tunwg` 下载
3. 本地开发时 `package.json` 的 `build:single-exe` script 包含下载步骤
4. **但 Dockerfile 没有执行下载步骤**，直接开始构建

**错误修复（引入新脆弱点）**：
```dockerfile
COPY . .

# ❌ 反模式：下载所有平台资源，但只用到 Linux x64
# 如果 darwin/win 资源不可用，会阻断 Linux 镜像构建
RUN bun run download:tunwg

RUN cd /app/cli && bun run build:exe --target bun-linux-x64-baseline
```

**正确修复（只下载必需资源，且复用脚本契约）**：
```dockerfile
COPY . .

# ✅ 正模式：仅下载 Linux x64，复用统一下载脚本（避免 Dockerfile 与脚本逻辑分叉）
RUN TUNWG_TARGET_PLATFORM=x64-linux bun run download:tunwg

RUN cd /app/cli && bun run build:exe --target bun-linux-x64-baseline
```

**预防**：
1. 在 Dockerfile 中明确所有外部依赖的获取步骤
2. **只下载当前构建目标必需的资源，避免无关平台依赖**
3. 不要依赖 `COPY . .` 包含本地开发时生成的文件
4. 参考 `package.json` scripts，确保 Dockerfile 包含必要的前置步骤

### 快速验证

```bash
# 1. 检查代码中是否有导入非常规文件
grep -r "import.*tunwg\|import.*\.exe\|import.*\.tar\.gz" cli/src/

# 2. 检查 package.json scripts 中是否有下载步骤
grep -A5 '"scripts"' package.json | grep download

# 3. 验证 Dockerfile 是否包含这些步骤
grep -n "download\|curl\|wget" Dockerfile.runner
```

### 设计改进

**反模式**：隐式依赖本地文件
```dockerfile
# ❌ 假设文件已经存在
COPY . .
RUN bun run build
```

**正模式**：显式获取依赖
```dockerfile
# ✅ 明确下载依赖
COPY . .
RUN bun run download:tunwg  # 显式获取外部资源
RUN bun run build
```

**正模式**：构建前验证
```typescript
// scripts/verify-build-dependencies.ts
import { existsSync } from 'fs';

const requiredFiles = [
  'hub/tools/tunwg/tunwg-x64-linux',
  'hub/tools/tunwg/tunwg-arm64-linux',
  // ...
];

for (const file of requiredFiles) {
  if (!existsSync(file)) {
    console.error(`❌ Missing required file: ${file}`);
    console.error(`Please run: bun run download:tunwg`);
    process.exit(1);
  }
}
```

---

**最后更新**：2026-03-18
- 基于 PR#24 的教训：环境一致性原则
- 基于 Issue#313-012 的教训：运行时特定依赖的 mock 处理
- 基于 CI failure (compose-smoke) 的教训：Lockfile drift 预防与修复
- 基于 Lockfile drift 循环复现 (0068697 → e91f8f0) 的教训：npm registry 延迟导致的竞态条件，需要在 release-all.ts 中添加等待和验证机制
- 基于 PR#52 CI 失败的教训：测试稳定性原则 - 涉及定时器的测试必须使用 fake timers 避免时序竞态
- 基于 Docker runner 构建失败 (2026-03-18) 的教训：Docker 构建必须是自包含的，所有外部依赖必须在 Dockerfile 中显式获取
