# 组件规范

> 本项目中组件的构建方式。

---

## 概述

HAPI Web 使用 React 19 与 TypeScript。组件遵循函数式模式，具备清晰的 props 类型、使用 Tailwind CSS 进行样式处理，并内建可访问性支持。组件应保持小而专注，便于组合。

**关键库**：
- React 19 + hooks
- TanStack Router 用于路由
- `@assistant-ui/react` 用于 AI 聊天基元
- Tailwind CSS v4 用于样式
- class-variance-authority（CVA）用于变体样式
- 通过 `cn()` 工具使用 `clsx` + `tailwind-merge`

---

## 组件结构

### 标准组件模式

```typescript
// components/Spinner.tsx
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/use-translation'

type SpinnerProps = {
    size?: 'sm' | 'md' | 'lg'
    className?: string
    label?: string | null
}

export function Spinner({
    size = 'md',
    className,
    label
}: SpinnerProps) {
    const { t } = useTranslation()
    // ...
    return <svg ...>...</svg>
}
```

关键点：
1. 使用具名函数导出（不要 default）
2. Props 类型在本地使用 `type` 定义
3. 在函数参数解构中提供默认值
4. 使用 `cn()` 处理条件 className 合并
5. 所有面向用户的文本都使用 `useTranslation()`

### Context Provider 模式

功能级上下文使用 Provider 组件 + 类型化 hook：

```typescript
// components/AssistantChat/context.tsx
export type HappyChatContextValue = {
    api: ApiClient
    sessionId: string
    disabled: boolean
}

const HappyChatContext = createContext<HappyChatContextValue | null>(null)

export function HappyChatProvider(props: { value: HappyChatContextValue; children: ReactNode }) {
    return <HappyChatContext.Provider value={props.value}>{props.children}</HappyChatContext.Provider>
}

// 当 context 缺失时必须抛错，绝不返回 undefined
export function useHappyChatContext(): HappyChatContextValue {
    const ctx = useContext(HappyChatContext)
    if (!ctx) throw new Error('HappyChatContext is missing')
    return ctx
}
```

### 带变体的 UI 基元（CVA 模式）

对于可复用 UI 基元，使用 class-variance-authority：

```typescript
// components/ui/button.tsx
import { cva, type VariantProps } from 'class-variance-authority'

const buttonVariants = cva(
    'inline-flex items-center justify-center ...', // 基础 class
    {
        variants: {
            variant: {
                default: 'bg-[var(--app-button)] text-[var(--app-button-text)]',
                secondary: '...',
            },
            size: { default: 'h-9 px-4 py-2', sm: 'h-8 ...' }
        },
        defaultVariants: { variant: 'default', size: 'default' }
    }
)

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
        VariantProps<typeof buttonVariants> {
    asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, ...props }, ref) => {
        const Comp = asChild ? Slot : 'button'
        return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    }
)
Button.displayName = 'Button'
```

---

## Props 约定

### 类型定义

- 组件 props 使用 `type`，不要使用 `interface`
- props 类型命名为 `<ComponentName>Props`
- props 类型与组件定义放在同一文件中

```typescript
// 推荐
type SpinnerProps = {
    size?: 'sm' | 'md' | 'lg'
    className?: string
    label?: string | null
}

// 不推荐 - 简单 props 不要使用 interface
interface SpinnerProps {
    size?: string
}
```

### 可选与必选

- 当 props 具有合理默认值时，用 `?` 标记为可选
- 默认值始终放在解构参数中，而不是单独变量里
- 对于“有意为空”的场景，显式使用 `null`（例如 `label?: string | null`）

```typescript
// 推荐 - 在解构中给默认值
function Spinner({ size = 'md', className, label }: SpinnerProps) {}

// 不推荐 - 在其他地方补默认值
function Spinner(props: SpinnerProps) {
    const size = props.size ?? 'md'  // 不要这样做
}
```

### Children

- children 使用 `ReactNode` 类型
- 名称始终使用 `children`

```typescript
type MyComponentProps = {
    children: ReactNode
    className?: string
}
```

### 事件处理器

- 事件处理 props 统一使用 `on` 前缀（例如 `onRetry`、`onLoadMore`）
- 类型要尽量精确，不要笼统写成 `() => void`

```typescript
type ThreadProps = {
    onLoadMore: () => Promise<unknown>  // 推荐 - 返回类型明确
    onRetryMessage?: (localId: string) => void  // 推荐 - 参数类型明确
}
```

---

## 样式模式

### 主题颜色使用 CSS Variables

所有主题相关颜色都应使用 CSS 自定义属性，不要写死颜色值：

```typescript
// 推荐 - 使用 CSS 变量
'bg-[var(--app-button)] text-[var(--app-button-text)]'
'bg-[var(--app-secondary-bg)]'
'text-[var(--app-fg)]'
'border-[var(--app-border)]'

// 不推荐 - 写死颜色，无法响应主题变化
'bg-blue-500 text-white'
```

可用 CSS 变量：
- `--app-bg` - 主背景
- `--app-fg` - 主前景/正文文本
- `--app-secondary-bg` - 次级背景
- `--app-subtle-bg` - 弱化背景（用于 hover 等状态）
- `--app-button` - 按钮背景
- `--app-button-text` - 按钮文字
- `--app-border` - 边框颜色
- `--app-link` - 链接/强调色
- `--app-hint` - 提示/弱化文字

### 状态语义颜色约定

对于“在线 / active / success / error / warning / thinking”这类**状态表达**，必须优先使用专用语义 token，不要复用正文、按钮或链接 token：

```typescript
// 推荐 - 状态点使用语义 token
const statusDotClass = s.active
    ? (s.thinking ? 'bg-[#007AFF]' : 'bg-[var(--app-badge-success-text)]')
    : 'bg-[var(--app-hint)]'

// 不推荐 - 复用正文/链接 token，主题切换后可能退化成黑/白实心点
const statusDotClass = s.active
    ? (s.thinking ? 'bg-[var(--app-link)]' : 'bg-[var(--app-badge-success-text)]')
    : 'bg-[var(--app-hint)]'
```

检查清单：
- 当颜色表达的是“状态”，先确认 token 语义是否真的是状态，而不是文本/按钮/链接。
- 修改颜色 token 前，先查看该 token 在明暗主题下的实际值，避免 light theme 中退化为黑色、dark theme 中退化为白色。
- 如果某个状态需要固定品牌色（例如 thinking 蓝点），优先抽成独立语义 token，而不是借用 `--app-link`。
- 对会话列表、详情页、badge 等多个消费者共享的状态颜色，改动前先回放最近相关 commit，确认不是历史回归修复。

### `cn()` 工具

组合 className 时始终使用 `cn()`：

```typescript
import { cn } from '@/lib/utils'

// 推荐
<div className={cn('base-classes', condition && 'conditional-class', className)} />

// 不推荐 - 直接拼接字符串
<div className={`base-classes ${condition ? 'conditional-class' : ''} ${className}`} />
```

### 响应式与条件类名

```typescript
// 条件 class
<div className={cn(
    'base px-3 py-2',
    isActive && 'bg-[var(--app-subtle-bg)]',
    isDisabled && 'opacity-50 pointer-events-none'
)} />
```

---

## 可访问性

### 必需模式

1. **加载态**：Spinner 使用 `role="status"` 与 `aria-label`
2. **隐藏的装饰内容**：使用 `aria-hidden="true"`
3. **仅供屏幕阅读器的文本**：使用 `sr-only` Tailwind class
4. **可交互元素**：确保所有可点击元素都支持键盘访问

```typescript
// Spinner 可访问性（来自 Spinner.tsx）
const accessibilityProps = effectiveLabel === null
    ? { 'aria-hidden': true }
    : { role: 'status', 'aria-label': effectiveLabel }
```

```typescript
// Skeleton 加载中的屏幕阅读器文本
<span className="sr-only">{t('misc.loadingMessages')}</span>
```

```typescript
// Button 加载状态
<Button aria-busy={isLoadingMoreMessages}>...</Button>
```

### 翻译

所有面向用户的文本都必须通过 `useTranslation()`：

```typescript
// 推荐
const { t } = useTranslation()
return <span>{t('misc.loading')}</span>

// 不推荐 - 写死字符串
return <span>Loading...</span>
```

---

## 场景：行导航与操作按钮冲突（触屏 + 指针）

### 1. 范围 / 触发条件
- 触发条件：一个可选中的列表行内部又嵌套了操作按钮（rename/archive/delete/more）。
- 范围：前端交互层（`web/src/components/*`），涉及共享的 press/click hooks。

### 2. 签名

```typescript
// 行级导航
onSelect: (sessionId: string) => void

// 内嵌操作按钮
onClick: (event: React.MouseEvent<HTMLButtonElement>) => void
```

```typescript
// 绑定在操作区域 / 操作按钮上的 guard handlers
const preventRowSelectHandlers = {
  onPointerDownCapture: handleActionPointerDownCapture,
  onMouseDownCapture: handleActionPointerDownCapture,
  onTouchStartCapture: handleActionPointerDownCapture,
  onTouchEndCapture: handleActionPointerDownCapture,
}
```

### 3. 契约
- 点击操作按钮时**绝不能**触发行导航。
- 点击行主体区域时仍然必须触发行导航。
- 在触屏设备上，guard 逻辑必须同时覆盖 Touch Events 与 Pointer/Mouse Events。
- 如果行上使用了 long-press hook，那么内嵌操作区域必须在 capture 阶段设置 guard flag。

### 4. 校验与错误矩阵
- 桌面端鼠标点击操作按钮 -> 只打开操作弹窗 / 菜单。
- 移动端轻触操作按钮 -> 只打开操作弹窗 / 菜单。
- 轻触行的非操作区域 -> 跳转到详情页。
- 长按行的非操作区域 -> 打开行级上下文菜单。
- 在操作区域上长按 / 轻触 -> 不得打开行级上下文菜单，也不得触发导航。

### 5. 良好 / 基线 / 反例
- Good：操作按钮同时使用 `e.stopPropagation()` 与 pointer/mouse/touch 的 capture handlers。
- Base：只有从非操作区域点击时才触发行导航。
- Bad：只在按钮上通过 `onClick` 做 stopPropagation，而行监听的是 `onTouchStart/onTouchEnd`；结果移动端轻触仍然发生导航。

### 6. 必需测试
- 组件交互测试应覆盖：
  1. 点击/轻触操作按钮不会调用 `onSelect`，
  2. 点击/轻触行主体会调用 `onSelect`，
  3. touch 事件路径不会绕过行/操作区隔离逻辑。

### 7. 错误示例 vs 正确示例

```tsx
// Wrong: 只阻止 click 冒泡，但 touch 路径仍会触发行级 handler
<button onClick={(e) => { e.stopPropagation(); setDeleteOpen(true) }} />
```

```tsx
// Correct: 阻止 click 冒泡 + 为 touch/pointer/mouse 添加 capture guards
<button
  onClick={(e) => {
    e.stopPropagation()
    setDeleteOpen(true)
  }}
  onPointerDownCapture={handleActionPointerDownCapture}
  onMouseDownCapture={handleActionPointerDownCapture}
  onTouchStartCapture={handleActionPointerDownCapture}
  onTouchEndCapture={handleActionPointerDownCapture}
/>
```

---

### 场景：主机选择器与会话列表展示一致性

#### 1. 范围 / 触发条件
- 触发条件：同一个实体（如 machine / host）既出现在列表展示，也出现在表单选择器中。
- 范围：前端展示层（`web/src/components/*`），尤其是原生 `<select>` 与列表 badge 复用场景。

#### 2. 签名

```typescript
// 统一文本标签来源
function getMachineTitle(machine: Machine): string

// 列表 / 详情中的富展示
<HostBadge
  displayName={machine.metadata?.displayName}
  host={machine.metadata?.host}
  platform={machine.metadata?.platform}
  machineId={machine.id}
/>
```

#### 3. 契约
- 原生 `<option>` 只能保证文本展示，**不能把 `HostBadge` 的颜色/边框样式视为可移植契约**。
- 如果业务要求“下拉所有选项与列表 badge 完全同构（含颜色）”，则不得继续使用原生 `<select>`；必须改为自定义 listbox / combobox。
- 如果当前仍使用原生 `<select>`，则选中态下方**不得再额外重复渲染一份 HostBadge** 来“补偿”样式差异，避免信息重复。
- 列表页、头部、选择器中的主机文案必须来自同一套 label 计算逻辑（如 `getHostDisplayName` / `getMachineTitle`），避免文案漂移。

#### 4. 校验与错误矩阵
- 原生 `<select>` + 期望彩色 option -> 需求与平台能力冲突，必须升级为自定义选择器。
- 原生 `<select>` + 选中后额外 HostBadge -> 会造成重复信息展示，视为 UI 设计错误。
- 列表使用 HostBadge、选择器使用另一套 host 文案拼接 -> 会造成展示不一致，视为实现错误。

#### 5. 良好 / 基线 / 反例
- Good：原生 `<select>` 只显示统一文本标签；若需要彩色富展示，整体切到自定义 listbox。
- Base：列表和选择器都使用相同的文本生成逻辑，但不强求原生 option 样式一致。
- Bad：保留原生 `<select>`，同时在控件下方重复渲染一个彩色 HostBadge 来弥补 option 无法着色的问题。

#### 6. 必需检查
- [ ] 先确认当前控件是原生 `<select>` 还是自定义 listbox / combobox。
- [ ] 如果是原生 `<select>`，不要对 option 样式能力做浏览器不保证的假设。
- [ ] 同一实体在列表与表单中是否复用了同一份 label 生成逻辑。
- [ ] 是否为了“补样式”而在控件附近重复渲染选中项摘要。

---

## 移动端事件处理

### 触摸事件透传陷阱

**问题**：移动端浏览器在 `touchend` 后会合成 `click` 事件，如果不阻止默认行为，合成的 click 会冒泡到下层元素。

**症状**：
- 点击列表项进入详情页后，立即又跳转到详情页的某个 tab
- 点击按钮后，下层的另一个按钮也被触发
- 用户感觉"点了一次，触发了两个操作"

**根因**：
```typescript
// ❌ 错误：只对长按阻止默认行为
const onTouchEnd = (e) => {
  if (isLongPress) {
    e.preventDefault()  // 只在长按时阻止
  }
  handleClick()  // 普通点击时，浏览器会合成 click 事件
}
```

**事件序列**（移动端）：
```
用户点击元素 A
  ↓
1. touchstart → 启动计时器
  ↓
2. touchend → 触发 onClick，导航到页面 B
  ↓
3. 浏览器合成 click 事件（300ms 延迟或立即）
  ↓
4. 合成的 click 冒泡到页面 B 的元素 C
  ↓
5. 元素 C 的 onClick 触发，执行意外操作
```

**修复**：
```typescript
// ✅ 正确：对所有 touchend 都阻止默认行为
const onTouchEnd = (e) => {
  e.preventDefault()  // 阻止合成 click 事件
  if (isLongPress) {
    handleLongPress()
  } else {
    handleClick()
  }
}
```

### 移动端事件处理检查清单

当组件涉及触摸交互时：

- [ ] 是否在 `onTouchEnd` 中调用了 `e.preventDefault()`？
- [ ] 是否同时处理了 `onTouchStart`、`onTouchEnd`、`onTouchMove`？
- [ ] 是否考虑了触摸事件与鼠标事件的共存？
- [ ] 是否测试了移动端的点击透传场景？
- [ ] 如果使用了自定义 touch hook，是否阻止了浏览器合成 click？

### 常见场景

**场景 1：列表项点击 + 内嵌按钮**
- 列表项使用 touch 事件处理导航
- 内嵌按钮需要阻止事件冒泡
- 必须在 capture 阶段设置 flag + 在 touchend 中 preventDefault

**场景 2：长按菜单 + 普通点击**
- 长按打开菜单，普通点击执行操作
- 必须在 touchend 中 preventDefault，否则会触发两次
- 必须区分 touchmove（滚动）和静止触摸

**场景 3：可拖拽元素**
- 拖拽时不应触发点击
- 必须在 touchmove 中设置 flag
- 必须在 touchend 中根据 flag 决定是否执行点击

---

## 本地子组件

对于只在单个文件内使用的子组件，应定义在同文件内，并位于主导出组件之前：

```typescript
// 推荐 - 本地辅助组件与主组件放在同一文件
function NewMessagesIndicator(props: { count: number; onClick: () => void }) {
    if (props.count === 0) return null
    return <button onClick={props.onClick}>...</button>
}

function MessageSkeleton() {
    return <div className="space-y-3 animate-pulse">...</div>
}

// 主导出组件
export function HappyThread(props: HappyThreadProps) {
    return (
        // 使用本地子组件
        <NewMessagesIndicator ... />
    )
}
```

---

## 常见错误

- ❌ 对 props 使用 `interface` 而不是 `type`
- ❌ 使用写死颜色而不是 CSS 变量
- ❌ 留下未翻译的面向用户字符串
- ❌ 在加载态/交互元素上缺少 `aria-*` 属性
- ❌ 使用 `default export`（应使用具名导出）
- ❌ 直接在组件体中编写业务逻辑（应抽到 hooks）
- ❌ 使用相对导入而不是 `@/` 别名
- ❌ 直接修改 props
- ❌ 在 props 定义中使用 `any`
- ❌ 移动端 `onTouchEnd` 不调用 `e.preventDefault()`，导致合成 click 透传

