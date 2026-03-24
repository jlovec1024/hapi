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

### 本地测试环境启动脚本

如果只是为了拉起本地测试环境，而不希望自动执行测试命令，可在仓库根目录运行：

```bash
bun run start:local-test-env
```

该脚本会：

1. 优先读取当前环境中的 `ANTHROPIC_API_KEY` 与 `ANTHROPIC_BASE_URL`；
2. 若缺失，则回退读取 `~/.claude/settings.json` 中 `.env.ANTHROPIC_API_KEY` 与 `.env.ANTHROPIC_BASE_URL`；
3. 使用项目根目录 `docker-compose.yml`；
4. 固定 compose project name 为 `zhushen`；
5. 执行带 `--build` 的启动；
6. 只启动环境，不自动运行测试命令。

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
  -v claude-data:/data/claude \
  zs-runner:local \
  zs --help
```

如果你确实需要持久化 Claude 配置，推荐直接挂载 `/data/claude`，而不是手动挂载 home 下的 `~/.claude` 或 `~/.claude.json`。

例如：

```bash
docker run --rm -it \
  -e CLI_API_TOKEN=your-secret \
  -v "$PWD/.docker-data/claude:/data/claude" \
  -v "$PWD/.docker-data/rtk:/root/.config/rtk" \
  -v "$PWD/.docker-data/nvm:/data/nvm" \
  -v "$PWD/.docker-data/goenv:/data/goenv" \
  -v "$PWD/.docker-data/runner:/data/runner" \
  zs-runner:local \
  claude --version
```

> 说明：`/data/claude` 是 Claude 配置的稳定持久化根目录；入口脚本会在容器启动时自动把当前用户 home 下的 `~/.claude` 和 `~/.claude.json` 软链接到该目录中的对应文件。

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
| `ZS_RUNNER_LOG_DESTINATION` | `stdio` | runner 日志输出目标；镜像默认写到 stdout/stderr，可设为 `file` 恢复文件日志 |
| `CLAUDE_DATA_ROOT` | `/data/claude` | Claude 配置持久化根目录 |

说明：

- hub 默认监听端口为 `80`（容器内），通过 `ZS_LISTEN_PORT` 可以修改宿主机映射端口。
- `ZS_RUNNER_LOG_DESTINATION` 默认是 `stdio`，因此 `zs-runner` 容器中的 runner debug 日志会直接进入容器标准输出；如需恢复容器内文件日志，可显式设置为 `file`。
- hub 默认 `ZS_HOME=/data/hub`。
- Claude 配置默认持久化到 `/data/claude`；runner 会优先使用当前环境中的 `HOME`，若未设置则按当前运行用户解析 home，并在启动时自动把 home 下 Claude 入口软链接回 `/data/claude`。
- `claude` 在镜像构建时已预安装到 PATH，无需额外配置路径。
- runner 镜像构建时只预装 `goenv`，不预装具体 Go 版本；首次使用指定版本时会安装到 `/data/goenv`。
- Node.js 继续使用 `nvm`，其运行时数据目录已切换到 `/data/nvm`；镜像构建时仅预装默认版本 `24`，当指定其他版本且未安装时，会按现有逻辑自动安装。
- RTK 全局状态默认仍写入当前用户 home 下的 `.config/rtk`；如果需要持久化 RTK，请单独挂载对应的 XDG 配置目录。

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
2. 确保 `/data/claude`（或 `CLAUDE_DATA_ROOT` 指定目录）存在；
3. 将 `/opt/zhushen/claude-default/.claude/` 以“只补缺失文件”的方式增量同步到 `/data/claude/.claude/`；
4. 若 `/data/claude/.claude.json` 不存在，则复制模板文件；
5. 将 `<home>/.claude` 软链接到 `/data/claude/.claude`，并将 `<home>/.claude.json` 软链接到 `/data/claude/.claude.json`；
6. 若 home 下已存在真实目录、真实文件或错误软链接，会先移动到 `.bak`（必要时附加时间戳）后再建立正确软链接；
7. 保留 `<home>/.config` 作为 XDG 配置根，供 RTK 等工具写入自己的全局状态；
8. 保留 Claude Code 官方环境变量入口，不主动把 token / API 写入 `settings.json`。

模板是最小可维护骨架，不直接复制仓库根目录 `./.claude` 的开发者本地内容。

> 注意：当前策略已统一为“默认持久化到 `/data/claude`，再通过 home 软链接兼容读取入口”。

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

### Shell 交互体验增强

runner 镜像在交互式 Bash 中默认提供以下便捷能力：

- `ll`：等价于 `ls -alF --color=auto`
- `la`：等价于 `ls -A --color=auto`
- `l`：等价于 `ls -CF --color=auto`
- `ls`：默认启用彩色输出
- Bash completion：自动加载系统 `bash-completion`
- `less`：默认使用 `LESS=-FRX`

这些增强仅面向交互式 Bash 生效，不影响默认的 `zs runner start-sync` 非交互式启动流程。

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

```bash
docker run --rm -it zs-runner:local bash -ic 'alias ll && alias la && alias l && printf "%s\n" "$LESS" && ls --color=auto >/dev/null'
```

建议额外验证 Claude 配置初始化：

```bash
docker run --rm \
  -v "$PWD/.docker-data/claude:/data/claude" \
  zs-runner:local \
  /bin/sh -lc 'ls -la /data/claude && ls -la "$HOME" && readlink "$HOME/.claude" && readlink "$HOME/.claude.json"'
```

## 数据持久化

compose 配置使用命名卷持久化数据，并统一切到 `/data`：

- `hub-data` -> `/data/hub`
- `runner-data` -> `/data/runner`
- `goenv-data` -> `/data/goenv`
- `nvm-data` -> `/data/nvm`
- `claude-data` -> `/data/claude`

Claude 配置默认持久化到 `/data/claude`：

- `/data/claude/.claude`
- `/data/claude/.claude.json`

容器内 Claude 的兼容入口仍然是当前用户 home：

- `$HOME/.claude` -> `/data/claude/.claude`
- `$HOME/.claude.json` -> `/data/claude/.claude.json`
- `$HOME/.config/rtk`

这样可以将主神数据、语言运行时缓存与 Claude / RTK 全局配置按职责拆分：运行时缓存继续走 `/data` 卷，Claude 配置统一走 `/data/claude`，RTK 配置仅在明确需要时单独持久化。

如果你使用 `docker run --user ...` 或其他 rootless 方式运行容器，请确保当前用户拥有可解析且可写的 home；否则需要显式传入 `HOME`，或使用带有效 passwd 记录的用户。

若该用户 home 下原本已经存在 `~/.claude` / `~/.claude.json` 实体文件，首次启动会将其改名为 `.bak` 后再创建软链接；迁移时请先确认是否需要手动合并旧配置。
