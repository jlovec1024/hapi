# zhushen-web

用于监控与控制 zhushen 会话的 React Mini App / PWA。

## 功能概览

- 会话列表：显示状态、待审批数量、todo 与摘要。
- 聊天视图：支持流式更新与发送消息。
- 权限审批与拒绝工作流。
- 权限模式与模型选择。
- 机器列表与远程拉起会话。
- 文件浏览器与 Git 状态 / Diff 视图。
- PWA 安装提示与离线提示条。

## 运行行为

- 在浏览器中打开后，可使用 `CLI_API_TOKEN:<namespace>` 登录（默认 namespace 可直接用 `CLI_API_TOKEN`）。
- 登录页右上角有 Hub 选择器；若未设置，默认使用当前页面同源地址。
- 实时更新通过 Hub 的 SSE 推送。

## 路由

路由定义见 `src/router.tsx`。

- `/` - 重定向到 `/sessions`。
- `/sessions` - 会话列表。
- `/sessions/$sessionId` - 聊天界面。
- `/sessions/new` - 创建新会话。
- `/sessions/$sessionId/files` - 带 Git 状态的文件浏览器。
- `/sessions/$sessionId/file` - 支持 diff 的文件查看器。
- `/sessions/$sessionId/terminal` - 终端界面。
- `/settings` - 应用设置。

## 主要模块

### 会话列表（`src/components/SessionList.tsx`）

- 活跃 / 非活跃状态指示。
- 从名称、摘要或路径推导会话标题。
- Todo 进度显示。
- 待处理权限请求计数。
- Agent 类型标签（claude/codex/gemini）。
- 模型模式显示。

### 聊天界面（`src/components/SessionChat.tsx`）

- 支持无限滚动的消息线程。
- 消息发送输入框（composer）。
- 权限模式切换（default/acceptEdits/bypassPermissions/plan）。
- 模型选择（default/sonnet/opus）。
- 会话中止与模式切换控制。
- 上下文大小显示。

### 文件浏览器（`src/routes/sessions/files.tsx`）

- Git 状态视图（staged/unstaged）。
- 基于 ripgrep 的文件搜索。
- 跳转到文件查看器。

### 文件查看器（`src/routes/sessions/file.tsx`）

- 文件内容展示（含语法高亮）。
- staged/unstaged diff 视图。

### 终端（`src/routes/sessions/terminal.tsx`）

- 基于 xterm.js 的远程终端。
- 通过 Socket.IO 实时通信。
- 支持终端尺寸调整。

### 新建会话（`src/components/NewSession/`）

模块化会话创建能力：
- 机器选择器
- 带最近路径的目录输入
- Agent 类型选择
- 模型选择器
- 权限模式开关（YOLO mode）

## 认证

相关实现见 `src/hooks/useAuth.ts` 与 `src/hooks/useAuthSource.ts`。

- 浏览器端：使用登录输入的 CLI_API_TOKEN。
- JWT token 自动刷新。

## 数据获取

查询 hooks 见 `src/hooks/queries/`，变更 hooks 见 `src/hooks/mutations/`。

- 通过 TanStack Query 获取 sessions、messages、machines。
- 支持 Git 状态与文件操作。
- 发送消息使用乐观更新。

## 实时更新

实现见 `src/hooks/useSSE.ts`。

- 通过 `/api/events` 建立 SSE 连接。
- 接收会话 / message / machine 更新事件。
- 事件到达后自动触发缓存失效刷新。

## 技术栈

React 19 + Vite + TanStack Router/Query + Tailwind + @assistant-ui/react + xterm.js + socket.io-client + workbox + shiki。

## 源码结构

- `src/router.tsx` - 路由定义。
- `src/components/` - UI 组件。
- `src/hooks/` - 数据获取与状态 hooks。
- `src/api/client.ts` - API 客户端。
- `src/types/api.ts` - 类型定义。

## 开发

在仓库根目录执行：

```bash
bun install
bun run dev:web
```

## 构建

```bash
bun run build:web
```

构建产物位于 `web/dist`，由 zhushen Hub 提供静态服务。单可执行文件模式下可将其内嵌。

## 独立托管

可将 `web/dist` 部署到静态托管平台（如 GitHub Pages、Cloudflare Pages），并连接任意 zhushen Hub：

1. 构建 web app。若静态站点使用子路径，请设置 Vite base：

```bash
bun run build:web -- --base /<repo>/
```

2. 将 `web/dist` 部署到静态站点。
3. 在 Hub 端配置 CORS，允许该静态站点来源（`ZS_PUBLIC_URL` 或 `CORS_ORIGINS`）。
4. 打开静态站点，在登录页点击右上角 Hub 按钮，输入 zhushen Hub 的 origin。

在同一对话框中清空 Hub override，可恢复同源访问行为。
