# 质量规范

> 前端开发的代码质量标准。

---

## 概述

Zhushen Web 通过以下方式维持高代码质量：

- **TypeScript 严格模式** - 禁止隐式 any，启用严格 null 检查
- **Vitest** 用于在 jsdom 环境中进行单元测试
- **Testing Library** 用于组件测试
- **手动测试** 用于 UI/UX 验证
- **代码审查** 后才允许合并

**理念**：务实的质量观——测试关键路径，而不是所有东西。聚焦用户可见功能与业务逻辑。

---

## 禁止模式

### ❌ 绝不要使用

1. **`any` 类型** - 改用 `unknown`
   ```typescript
   // Bad
   function handle(data: any) { }

   // Good
   function handle(data: unknown) { }
   ```

2. **忽略 TypeScript 错误** - 修复根因
   ```typescript
   // Bad
   // @ts-ignore
   const value = data.prop

   // Good - 正确的类型守卫
   const value = typeof data === 'object' && data && 'prop' in data ? data.prop : undefined
   ```

3. **硬编码颜色** - 使用 CSS 变量
   ```typescript
   // Bad
   'bg-blue-500 text-white'

   // Good
   'bg-[var(--app-button)] text-[var(--app-button-text)]'
   ```

4. **未翻译的用户可见文本** - 使用 `useTranslation()`
   ```typescript
   // Bad
   <span>Loading...</span>

   // Good
   const { t } = useTranslation()
   <span>{t('loading')}</span>
   ```

5. **默认导出** - 使用具名导出
   ```typescript
   // Bad
   export default function Button() { }

   // Good
   export function Button() { }
   ```

6. **在组件中写业务逻辑** - 抽取到 hooks 中
   ```typescript
   // Bad - 逻辑写在组件中
   function MyComponent() {
       const [data, setData] = useState(null)
       useEffect(() => {
           fetch('/api/data').then(r => r.json()).then(setData)
       }, [])
   }

   // Good - 逻辑写在 hook 中
   function MyComponent() {
       const { data } = useData()
   }
   ```

7. **相对导入** - 使用路径别名
   ```typescript
   // Bad
   import { Button } from '../../../components/ui/button'

   // Good
   import { Button } from '@/components/ui/button'
   ```

8. **缺少可访问性属性**
   ```typescript
   // Bad - 没有 aria 属性
   <div onClick={handleClick}>Click me</div>

   // Good - 正确使用 button 并具备可访问性
   <button onClick={handleClick} aria-label="Submit form">Click me</button>
   ```

---

## 必需模式

### ✅ 始终使用

1. **具名导出** 用于所有组件与 hooks
   ```typescript
   export function MyComponent() { }
   export function useMyHook() { }
   ```

2. **仅类型导入** 用于类型
   ```typescript
   import type { Session } from '@/types/api'
   ```

3. **`cn()` 工具函数** 用于合并 className
   ```typescript
   import { cn } from '@/lib/utils'
   <div className={cn('base-class', condition && 'conditional', className)} />
   ```

4. **CSS 变量** 用于主题颜色
   ```typescript
   'bg-[var(--app-bg)] text-[var(--app-fg)]'
   ```

5. **`useTranslation()`** 用于所有用户可见文本
   ```typescript
   const { t } = useTranslation()
   return <span>{t('misc.loading')}</span>
   ```

6. **路径别名**（`@/*`）用于导入
   ```typescript
   import { useAuth } from '@/hooks/useAuth'
   ```

7. **在 useEffect 中清理副作用**
   ```typescript
   useEffect(() => {
       const listener = () => { }
       element.addEventListener('event', listener)
       return () => element.removeEventListener('event', listener)
   }, [])
   ```

8. **Error boundaries** 用于组件错误处理
   - 为路由组件包裹 error boundary
   - 为错误提供 fallback UI

9. **加载状态** 用于异步操作
   ```typescript
   if (isLoading) return <Spinner />
   if (error) return <ErrorMessage error={error} />
   return <Content data={data} />
   ```

---

## 品牌资源一致性检查（favicon / PWA / 安装图标）

当修改项目 logo、品牌色或应用名称时，不能只改网页可见入口，还必须把“安装入口”当作同一条交付链路的一部分检查。

### 必查文件

- `web/index.html`：`favicon`、`apple-touch-icon`、`mask-icon`
- `web/vite.config.ts`：`VitePWA().manifest.icons`、`name`、`short_name`
- `web/public/`：被上述配置引用的实际图标文件

### 常见陷阱

**陷阱：站点 logo 已更新，但 Chrome 安装后的应用图标仍显示旧图标**

- **症状**：浏览器标签页、页面内 logo 已正确，但“安装应用”后的桌面 / 启动器图标仍是旧资源
- **根因**：只更新了 `index.html` 或页面内资源，没有同步 `manifest.icons` 指向的 `pwa-*.png`
- **为什么容易漏**：网页入口与 PWA 安装入口属于两套资源声明，浏览器安装时优先使用 manifest，而不是页面中的 `favicon` / `icon.svg`

### 修改检查清单

- [ ] 是否同时检查了 `favicon.ico`、`icon.svg`、`apple-touch-icon`、`mask-icon`
- [ ] 是否同时检查了 `manifest.icons` 中的全部 PNG 资源（如 `pwa-64x64.png`、`pwa-192x192.png`、`pwa-512x512.png`）
- [ ] `name` / `short_name` / logo / 主题色 是否仍与当前品牌一致
- [ ] 是否执行过一次真实的安装链路验证（Chrome install prompt / DevTools Application / 安装后的启动器图标）
- [ ] 如果资源文件名未变，仅内容变更，是否考虑了浏览器 / Service Worker 缓存导致的旧图标残留

### 禁止模式

```typescript
// Bad：只改页面入口，不改安装入口
<link rel="icon" href="/favicon.ico" />
<link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png" />
// 但 manifest.icons 仍指向旧的 pwa-*.png
```

```typescript
// Good：把品牌资源当成一组跨入口契约统一维护
VitePWA({
  manifest: {
    icons: [
      { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
      { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' }
    ]
  }
})
```

---

## 检查前的环境恢复
- `tsc: command not found`
- `vitest: command not found`

这应被视为**环境前置条件问题**，而不是立即判定为代码失败。
此时应先执行：

```bash
bun install
```

然后重新运行必需检查：

```bash
bun run lint
bun run type-check
bun run test
```

只有在依赖安装完成并重新执行这些命令之后，才应评估代码质量。

---

## 测试要求

### 测试环境

- **框架**：Vitest + jsdom 环境
- **组件测试**：@testing-library/react
- **位置**：测试文件与源码同目录（`*.test.ts`、`*.test.tsx`）
- **运行方式**：`bun run test`（在 web 目录中执行）

### 测什么

**优先级 1 - 关键路径**：
- 认证流程
- 消息发送/接收
- Session 管理
- 文件操作

**优先级 2 - 业务逻辑**：
- 含复杂逻辑的自定义 hooks
- 工具函数
- 数据转换
- 状态管理逻辑

**优先级 3 - 组件**（选择性测试）：
- 复杂交互组件
- 含条件渲染逻辑的组件
- 表单验证逻辑

**不要测试**：
- 简单展示型组件
- 第三方库封装
- 简单工具函数
- 类型定义

### 移动端测试要求

**必须测试的场景**：
- 触摸事件不会透传到下层元素
- 列表项点击 + 内嵌按钮的事件隔离
- 长按菜单 + 普通点击的区分
- 导航后不会意外触发目标页面的按钮

**测试方法**：
```typescript
// 模拟触摸事件序列
fireEvent.touchStart(element, { touches: [{ clientX: 0, clientY: 0 }] })
fireEvent.touchEnd(element)

// 验证不会触发意外的 click
expect(unexpectedHandler).not.toHaveBeenCalled()
```

### 测试结构

```typescript
// lib/clipboard.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('clipboard utilities', () => {
    beforeEach(() => {
        // Setup
    })

    afterEach(() => {
        // Cleanup
    })

    it('copies text to clipboard', async () => {
        // Arrange
        const text = 'test'

        // Act
        const result = await copyToClipboard(text)

        // Assert
        expect(result).toBe(true)
    })
})
```

### 组件测试

```typescript
// components/LoginPrompt.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LoginPrompt } from './LoginPrompt'

describe('LoginPrompt', () => {
    it('renders login button', () => {
        render(<LoginPrompt />)
        expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument()
    })
})
```

---

## 可访问性要求

### 最低标准

1. **语义化 HTML** - 使用正确的元素
   - 按钮使用 `<button>`，不要用 `<div onClick>`
   - 导航使用 `<nav>`
   - 主要内容使用 `<main>`

2. **在需要时使用 ARIA 属性**
   - 图标按钮使用 `aria-label`
   - 加载状态使用 `aria-busy`
   - 状态消息使用 `role="status"`
   - 装饰性元素使用 `aria-hidden="true"`

3. **键盘导航**
   - 所有交互元素都必须可通过键盘访问
   - 正确管理焦点
   - 不得出现键盘陷阱

4. **屏幕阅读器支持**
   - 使用 `sr-only` 类提供仅供屏幕阅读器使用的文本
   - 为视觉内容提供文本替代
   - 动态内容变化要能被播报

5. **颜色对比度**
   - 使用符合 WCAG AA 标准的 CSS 变量
   - 不要仅依赖颜色传递信息

### 示例

```typescript
// Good accessibility
<button
    onClick={handleSubmit}
    aria-busy={isLoading}
    aria-label="Submit form"
    disabled={isDisabled}
>
    {isLoading ? (
        <>
            <Spinner size="sm" label={null} />
            <span className="sr-only">{t('loading')}</span>
        </>
    ) : (
        t('submit')
    )}
</button>
```

---

## 代码审查清单

### 提交前

- [ ] TypeScript 无编译错误（`bun run typecheck`）
- [ ] 测试通过（`bun run test`）
- [ ] 浏览器控制台无错误
- [ ] 已对变更功能完成手动测试
- [ ] 已测试可访问性（键盘导航、屏幕阅读器）
- [ ] 所有用户可见文本都已翻译
- [ ] 没有硬编码颜色（已使用 CSS 变量）
- [ ] 导入使用了路径别名
- [ ] 没有 `any` 类型
- [ ] 对异步操作做了正确错误处理

### Reviewer 清单

**代码质量**：
- [ ] 遵循组件 / hook 规范
- [ ] 未使用禁止模式
- [ ] TypeScript 类型正确（无 `any`）
- [ ] 业务逻辑已抽取到 hooks 中
- [ ] 错误处理正确

**功能性**：
- [ ] 功能符合预期
- [ ] 边界情况已处理
- [ ] 具备 loading 状态
- [ ] 错误状态处理得当

**可访问性**：
- [ ] 使用语义化 HTML
- [ ] 在需要时使用 ARIA 属性
- [ ] 键盘可访问
- [ ] 对屏幕阅读器友好

**性能**：
- [ ] 没有不必要的重复渲染
- [ ] 在需要时做了正确 memoization
- [ ] useEffect 中完成清理
- [ ] 没有内存泄漏

**可维护性**：
- [ ] 代码可读、结构清晰
- [ ] 复杂逻辑有注释
- [ ] 与现有模式保持一致
- [ ] 没有重复代码

---

## 构建与类型检查

### 命令

```bash
# 类型检查
bun run typecheck

# 运行测试
bun run test

# 生产构建
bun run build

# 开发服务器
bun run dev
```

### 提交前要求

在提交前：
1. 运行 `bun run typecheck` - 必须通过
2. 运行 `bun run test` - 必须通过
3. 手动测试已变更功能
4. 浏览器控制台无错误

---

## 常见错误

- ❌ 使用 `any` 类型
- ❌ 忽略 TypeScript 错误
- ❌ 使用硬编码颜色而不是 CSS 变量
- ❌ 忘记翻译用户可见文本
- ❌ 使用默认导出
- ❌ 将业务逻辑放进组件中
- ❌ 使用相对导入
- ❌ 缺少可访问性属性
- ❌ 没有在 useEffect 中清理副作用
- ❌ 未处理 loading / error 状态
- ❌ 对 props 使用 `interface` 而不是 `type`
- ❌ 不测试关键路径

---

## 性能注意事项

### 优化指南

1. **懒加载路由** - 对路由使用代码分割
2. **记忆化昂贵计算** - 谨慎使用 `useMemo`
3. **避免不必要的重复渲染** - 对传给子组件的回调使用 `useCallback`
4. **优化图片** - 使用合适的格式与尺寸
5. **包体积** - 持续关注，并保持依赖最小化

### 何时不要优化

- 不要为廉价计算使用 `useMemo`
- 不要到处使用 `useCallback`（会增加额外开销）
- 不要在测量前优化（过早优化）

---

## 总结

**核心原则**：
1. 类型安全优先（严格 TypeScript）
2. 内建可访问性（不是事后补救）
3. 测试关键路径（务实测试）
4. 保持简单（KISS、YAGNI、DRY）
5. 遵循既有模式（保持一致性）
