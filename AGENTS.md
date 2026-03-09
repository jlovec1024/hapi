# AGENTS.md

工作风格: 电报式; 名词短语可用; 精简语法;

AI 代理在此仓库中的简要指南。建议渐进式加载: 先读根目录 README，再按需读各包 README。

## 主神是什么?

本地优先平台，用于运行 AI 编码代理 (Claude Code、Codex、Gemini)，并通过 Web/手机进行远程控制。CLI 包装代理并连接 hub; hub 提供 Web 应用并处理实时同步。

## 仓库结构

```
cli/     - CLI 二进制文件、代理包装器、runner 守护进程
hub/     - HTTP API + Socket.IO + SSE + Telegram bot
web/     - React PWA，用于远程控制
shared/  - 公共类型、schema、工具函数
docs/    - VitePress 文档站点
website/ - 营销站点
```

Bun workspaces; `shared` 被 cli、hub、web 共同使用。

## 架构概览

```
+-----------+  Socket.IO   +-----------+   SSE/REST   +-----------+
|   CLI     | ------------ |   Hub     | ------------ |   Web     |
| (agent)   |              | (server)  |              |  (PWA)    |
+-----------+              +-----------+              +-----------+
     |                          |                          |
     +- 包装 Claude/Codex       +- SQLite 持久化           +- TanStack Query
     +- Socket.IO 客户端        +- 会话缓存                +- SSE 实时更新
     +- RPC 处理器              +- RPC 网关                +- assistant-ui
                                +- Telegram bot
```

**数据流:**
1. CLI 启动代理 (claude/codex/gemini)，通过 Socket.IO 连接 hub
2. 代理事件 -> CLI -> hub (socket `message` 事件) -> 数据库 + SSE 广播
3. Web 订阅 SSE `/api/events`，接收实时更新
4. 用户操作 -> Web -> hub REST API -> RPC 到 CLI -> 代理

## 参考文档

- `README.md` - 用户概览、快速开始
- `cli/README.md` - CLI 命令、配置、runner
- `hub/README.md` - Hub 配置、HTTP API、Socket.IO 事件
- `web/README.md` - 路由、组件、hooks
- `docs/guide/` - 用户指南 (安装、工作原理、FAQ)

## 通用规则

- 不保证向后兼容: 可自由破坏旧格式
- TypeScript strict; 不允许无类型代码
- Bun workspaces; 从仓库根目录运行 `bun` 命令
- 路径别名 `@/*` 映射到每个包的 `./src/*`
- 优先使用 4 空格缩进
- 使用 Zod 进行运行时验证 (schema 在 `shared/src/schemas.ts`)

## 常用命令 (仓库根目录)

```bash
bun typecheck           # 所有包类型检查
bun run test            # cli + hub 测试
bun run dev             # hub + web 并行开发
bun run build:single-exe # 构建一体化二进制文件
```

## 关键源码目录

### CLI (`cli/src/`)
- `api/` - Hub 通信 (Socket.IO 客户端、认证)
- `claude/` - Claude Code 集成
- `codex/` - Codex 模式集成
- `agent/` - 多代理支持 (Gemini via ACP)
- `runner/` - 后台守护进程
- `commands/` - CLI 子命令 (auth、runner、doctor)
- `modules/` - 工具实现 (ripgrep、difftastic、git)
- `ui/` - 终端 UI (Ink 组件)

### Hub (`hub/src/`)
- `web/routes/` - REST API 端点
- `socket/` - Socket.IO 配置
- `socket/handlers/cli/` - CLI 事件处理器 (session、terminal、machine、RPC)
- `sync/` - 核心逻辑 (sessionCache、messageService、rpcGateway)
- `store/` - SQLite 持久化 (better-sqlite3)
- `sse/` - Server-Sent Events 管理器
- `telegram/` - Bot 命令、回调
- `notifications/` - 推送 (VAPID) 和 Telegram 通知
- `config/` - 配置加载、token 生成
- `visibility/` - 客户端可见性追踪

### Web (`web/src/`)
- `routes/` - TanStack Router 页面
- `routes/sessions/` - 会话视图 (聊天、文件、终端)
- `components/` - 可复用 UI (SessionList、SessionChat、NewSession/)
- `hooks/queries/` - TanStack Query hooks
- `hooks/mutations/` - Mutation hooks
- `hooks/useSSE.ts` - SSE 订阅
- `api/client.ts` - API 客户端封装

### Shared (`shared/src/`)
- `types.ts` - 核心类型 (Session、Message、Machine)
- `schemas.ts` - Zod schema 验证
- `socket.ts` - Socket.IO 事件类型
- `messages.ts` - 消息解析工具
- `modes.ts` - 权限/模型模式定义

## 测试

- 测试框架: Vitest (通过 `bun run test`)
- 测试文件: `*.test.ts` 与源码同目录
- 运行: `bun run test` (从根目录) 或 `bun run test` (从包目录)
- Hub 测试: `hub/src/**/*.test.ts`
- CLI 测试: `cli/src/**/*.test.ts`
- Web 暂无测试

## 常见任务

| 任务 | 关键文件 |
|------|----------|
| 添加 CLI 命令 | `cli/src/commands/`、`cli/src/index.ts` |
| 添加 API 端点 | `hub/src/web/routes/`，在 `hub/src/web/index.ts` 中注册 |
| 添加 Socket.IO 事件 | `hub/src/socket/handlers/cli/`、`shared/src/socket.ts` |
| 添加 Web 路由 | `web/src/routes/`、`web/src/router.tsx` |
| 添加 Web 组件 | `web/src/components/` |
| 修改会话逻辑 | `hub/src/sync/sessionCache.ts`、`hub/src/sync/syncEngine.ts` |
| 修改消息处理 | `hub/src/sync/messageService.ts` |
| 添加通知类型 | `hub/src/notifications/` |
| 添加共享类型 | `shared/src/types.ts`、`shared/src/schemas.ts` |

## 重要模式

- **RPC**: CLI 注册处理器 (`rpc-register`)，hub 通过 `rpcGateway.ts` 路由请求
- **版本化更新**: CLI 发送带版本号的 `update-metadata`/`update-state`; hub 拒绝过期版本
- **会话模式**: `local` (终端) vs `remote` (Web 控制); 会话中可切换
- **权限模式**: `default`、`acceptEdits`、`bypassPermissions`、`plan`
- **命名空间 (Namespace)**: 通过 `CLI_API_TOKEN:<namespace>` 后缀实现多用户隔离

## 批判性思维

1. 修复根因 (不是打补丁)。
2. 不确定时: 多读代码; 仍不清楚则带简短选项询问。
3. 有冲突: 指出来; 选更安全的路径。
4. 不认识的改动: 假设是其他代理所为; 继续专注你的修改。如果造成问题，停下来问用户。
