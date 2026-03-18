# Runner Docker 独立使用指南

本文档介绍如何使用 Docker 构建和运行主神 runner 镜像（`zs-runner`），以及如何与 `zs-hub` 通过 compose 协同运行。

## 构建镜像

从仓库根目录构建：

```bash
docker compose build zs-runner
```

或手动构建：

```bash
docker build -f Dockerfile.runner -t zs-runner:local .
```

## 运行方式

### 作为后台 Runner 服务

使用 Docker Compose 启动服务（需要提供必填环境变量）：

```bash
# 方式 1: 通过命令行提供环境变量
CLI_API_TOKEN=your-secret \
docker compose up -d --build zs-hub zs-runner

# 方式 2: 在项目根目录 .env 中写入 CLI_API_TOKEN
# 然后直接启动
docker compose up -d --build zs-hub zs-runner

# 查看日志
docker compose logs -f zs-hub zs-runner
```

`zs-runner` 默认以前台模式运行 `zs runner start-sync`，保持容器常驻并与 `zs-hub` 同步。

### 直接使用 docker run

```bash
docker run --rm -it \
  -e CLI_API_TOKEN=your-secret \
  -v nvm-data:/data/nvm \
  -v goenv-data:/data/goenv \
  -v runner-data:/data/runner \
  zs-runner:local \
  zs --help
```

如果你确实需要持久化 Claude / RTK 全局配置，请按**当前运行用户的 home** 下实际路径单独绑定，而不是把整个 home 目录当成公开接口。

推荐做法是先确认容器内实际路径，再按该路径挂载：

```bash
docker run --rm zs-runner:local /bin/sh -c 'printf "HOME=%s\nXDG_CONFIG_HOME=%s\n" "$HOME" "${XDG_CONFIG_HOME:-$HOME/.config}"'
```

确认路径后，再绑定对应目录。例如镜像默认以 root 用户运行时，通常会解析到 `/root`，可参考：

```bash
docker run --rm -it \
  -e CLI_API_TOKEN=your-secret \
  -v "$PWD/.docker-data/claude:/root/.claude" \
  -v "$PWD/.docker-data/claude-json:/root/.claude.json" \
  -v "$PWD/.docker-data/rtk:/root/.config/rtk" \
  -v "$PWD/.docker-data/nvm:/data/nvm" \
  -v "$PWD/.docker-data/goenv:/data/goenv" \
  -v "$PWD/.docker-data/runner:/data/runner" \
  zs-runner:local \
  claude --version
```

> 说明：上面的 `/root/...` 只是当前默认 root 运行方式下的示例，不是对外稳定契约；如果你改成非 root 用户运行，请把这些绑定路径替换为该用户 home 下的实际路径。

> 说明：`/root/.config/rtk` 的父目录会由 Docker 自动创建；如果你希望连同其他 XDG 工具状态一起持久化，再自行决定是否挂载整个用户 home 下的 `.config`。

## 环境变量

### 必填变量

| 变量 | 说明 |
|------|------|
| `CLI_API_TOKEN` | `zs-hub` 和 `zs-runner` 共用的认证密钥 |

### 可选变量（已有默认值）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `ZS_LISTEN_PORT` | `80` | hub 暴露端口（仅影响宿主机映射） |
| `ZS_PUBLIC_URL` | `http://localhost:80` | hub 公开访问地址 |
| `ZS_GO_VERSION` | `1.24.3` | 运行时 Go 版本（由 goenv 管理） |
| `ZS_NODE_VERSION` | `24` | 运行时 Node.js 版本（由 nvm 管理；镜像默认预装该版本） |
| `ZS_GIT_USER_NAME` | `zs runner` | runner 容器内 git user.name |
| `ZS_GIT_USER_EMAIL` | `zs-runner@local` | runner 容器内 git user.email |

说明：

- hub 默认监听端口为 `80`（容器内），通过 `ZS_LISTEN_PORT` 可以修改宿主机映射端口。
- runner 默认 `ZS_HOME=/data/runner`，`ZS_API_URL=http://zs-hub:80`（compose 网络内）。
- hub 默认 `ZS_HOME=/data/hub`。
- Claude Code 配置默认回归 `$HOME/.claude`；runner 会优先使用当前环境中的 `HOME`，若未设置则按当前运行用户解析 home（默认 root 用户时通常为 `/root/.claude`）。
- `claude` 在镜像构建时已预安装到 PATH，无需额外配置路径。
- runner 镜像构建时只预装 `goenv`，不预装具体 Go 版本；首次使用指定版本时会安装到 `/data/goenv`。
- Node.js 继续使用 `nvm`，其运行时数据目录已切换到 `/data/nvm`；镜像构建时仅预装默认版本 `24`，当指定其他版本且未安装时，会按现有逻辑自动安装。
- 如果需要持久化 Claude / RTK 配置，请按当前运行用户的实际 home 路径单独挂载（如默认 root 用户时的 `/root/.claude`、`/root/.claude.json`、`/root/.config/rtk`），不要默认公开整个用户 home。

## Claude 初始化行为

runner 镜像内置一份最小模板目录：`/opt/zhushen/claude-default`

当前模板目录结构如下：

```text
docker/claude-default/
├── .claude/
│   ├── output-styles/
│   │   ├── engineer-professional.md
│   │   ├── laowang-engineer.md
│   │   └── nekomata-engineer.md
│   └── settings.json
└── .claude.json
```

首次启动时入口脚本会执行以下初始化：

1. 先解析当前运行用户的 home：优先使用 `HOME`，若未设置则按当前 uid 对应的系统用户 home 解析；
2. 若 `<home>/.claude` 缺失默认文件，则增量补齐镜像内模板目录；
3. 若 `<home>/.claude.json` 不存在，则复制模板文件；
4. 保留 `<home>/.config` 作为 XDG 配置根，供 RTK 等工具写入自己的全局状态；
5. 保留 Claude Code 官方环境变量入口，不主动把 token / API 写入 `settings.json`。

模板是最小可维护骨架，不直接复制仓库根目录 `./.claude` 的开发者本地内容。

> 注意：当前策略是“默认回归 `$HOME/.claude`”，而不是继续维护 `/data/claude` 的兼容映射层。

### RTK 初始化

runner 启动时会自动执行非交互初始化：

```bash
RTK_NON_INTERACTIVE=true rtk init --global --auto-patch
```

若 `--auto-patch` 因版本差异失败，入口脚本会退回 `rtk init --global`。当前实现不会额外维护 runner 私有的 RTK 哨兵文件，而是依赖 RTK 自身的全局初始化行为保持幂等。

RTK 相关全局状态默认写入 `$XDG_CONFIG_HOME/rtk`（默认落在当前运行用户 home 下的 `.config/rtk`；root 用户时通常为 `/root/.config/rtk`）。

### Claude 认证与配置策略

runner 会优先复用 Claude Code 官方支持的配置入口。

支持的典型方式包括：

- 通过环境变量注入：`CLAUDE_CODE_OAUTH_TOKEN`、`ANTHROPIC_API_KEY`
- 通过 `$HOME/.claude/settings.json`
- 通过 `$HOME/.claude.json`（兼容入口）

当主神启动 Claude 会话时，会先检查上述认证配置是否存在；如果缺失，会直接给出明确提示，而不是静默写入或覆盖用户配置。

## 运行时版本选择

容器启动时通过环境变量选择 Go 和 Node.js 版本。

- Node.js 使用 `nvm` 管理；
- Go 使用 `goenv` 管理；
- 默认 `ZS_NODE_VERSION=24`，因此容器默认启动会直接命中镜像内预装版本；
- 当显式指定其他版本且未安装时，会通过对应管理器自动安装；
- 安装失败时会报错并退出（非 0）。

### 预装版本

镜像构建时预装以下版本：

- **Node.js**: 24（nvm）
- **Go**: 不预装具体版本，仅预装 goenv

### 切换示例

```bash
# 使用 Go 1.22.12 和 Node.js 20（首次使用时会安装到 /data/nvm）
docker compose run --rm \
  -e ZS_GO_VERSION=1.22.12 \
  -e ZS_NODE_VERSION=20 \
  zs-runner go version

# 默认 Node.js 24（命中镜像预装版本）
docker compose run --rm \
  zs-runner node -v

# 仅切换 Node.js 到 22（首次使用时会安装到 /data/nvm）
docker compose run --rm \
  -e ZS_NODE_VERSION=22 \
  zs-runner node -v
```

## 内置工具清单

| 工具 | 来源 | 说明 |
|------|------|------|
| `bun` | 基础镜像 | JavaScript/TypeScript 运行时和包管理器 |
| `node` / `npm` | nvm | Node.js 运行时 |
| `pnpm` | npm 全局 | 高性能 Node.js 包管理器 |
| `yarn` | npm 全局 | Node.js 包管理器 |
| `go` | goenv | Go 编程语言工具链 |
| `curl` | apt | HTTP 客户端 |
| `wget` | apt | 下载工具 |
| `git` | apt | 版本控制 |
| `gh` | apt | GitHub CLI |
| `docker` | apt | Docker CLI |
| `mysql` | apt | MySQL 客户端 |
| `redis-cli` | apt | Redis 客户端 |
| `psql` | apt | PostgreSQL 客户端 |
| `jq` | apt | JSON 处理工具 |
| `zs` | 本项目 | 主神 CLI 命令 |
| `claude` | npm 全局（`@anthropic-ai/claude-code`） | [Claude Code](https://docs.anthropic.com/en/docs/claude-code) - Anthropic AI 编程助手 |
| `mss` | pnpm 全局 | [MCP Swagger Server](https://github.com/zaizaizhao/mcp-swagger-server) - Swagger/OpenAPI MCP 服务 |
| `trellis` | pnpm 全局 | [Trellis](https://docs.trytrellis.app/) - AI 代码代理，支持多文件编辑 |
| `ux` | pnpm 全局 | 用户体验 CLI 工具 |

### 依赖闭包说明

runner 运行时镜像已经切换为直接调用编译后的 `zs` 可执行文件作为默认入口（`CMD ["zs", "runner", "start-sync"]`），不再依赖此前的 shell wrapper 来执行 `bun run --cwd /app/cli src/index.ts`。

出于运行时兼容性考虑，镜像仍保留 Bun 基础环境、版本管理器与全局工具链；但主神 CLI 的主入口已经是构建阶段产出的独立二进制。

## 验证命令

在 compose 模式下：

```bash
CLI_API_TOKEN=test docker compose up -d zs-hub zs-runner
docker compose ps
docker compose logs --tail=100 zs-hub zs-runner
```

Runner 单镜像验证：

```bash
docker run --rm zs-runner:local zs --help
docker run --rm zs-runner:local claude --version
docker run --rm zs-runner:local bun --version
docker run --rm zs-runner:local node -v
docker run --rm zs-runner:local go version
docker run --rm zs-runner:local pnpm -v
docker run --rm zs-runner:local yarn -v
docker run --rm zs-runner:local curl --version
docker run --rm zs-runner:local wget --version
docker run --rm zs-runner:local git --version
docker run --rm zs-runner:local gh --version
docker run --rm zs-runner:local docker --version
docker run --rm zs-runner:local jq --version
docker run --rm -e ZS_NODE_VERSION=20 zs-runner:local node -v
docker run --rm -e ZS_GO_VERSION=1.22.12 zs-runner:local go version
docker run --rm zs-runner:local mss --help
docker run --rm zs-runner:local trellis --help
```

## 数据持久化

compose 配置使用命名卷持久化数据，并统一切到 `/data`：

- `hub-data` -> `/data/hub`
- `runner-data` -> `/data/runner`
- `goenv-data` -> `/data/goenv`
- `nvm-data` -> `/data/nvm`

Claude / RTK 的全局配置默认回到容器家目录：

- `$HOME/.claude`
- `$HOME/.claude.json`
- `$HOME/.config/rtk`

需要注意的是：当前 `docker-compose.yml` 默认**不会**持久化这些 `$HOME` 路径；compose 默认只持久化 `/data/*` 运行时数据。如果你需要保留 Claude / RTK 全局配置，请额外绑定上述实际路径。

这样可以将主神数据、语言运行时缓存与 Claude / RTK 全局配置按职责拆分：运行时缓存继续走 `/data` 卷，Claude / RTK 配置仅在明确需要时单独持久化。

如果你使用 `docker run --user ...` 或其他 rootless 方式运行容器，请确保当前用户拥有可解析且可写的 home；否则需要显式传入 `HOME`，或使用带有效 passwd 记录的用户。