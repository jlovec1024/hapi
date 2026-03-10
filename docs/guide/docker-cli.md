# CLI Docker 独立使用指南

本文档介绍如何使用 Docker 构建和运行主神 CLI 镜像，包括内置工具清单、运行时版本选择和常用命令。

## 构建镜像

从仓库根目录构建：

```bash
docker compose build cli-runner
```

或手动构建：

```bash
docker build -f Dockerfile.cli -t zhushen-cli:local .
```

## 运行方式

### 作为后台 Runner 服务

```bash
docker compose up -d hub cli-runner
```

`cli-runner` 默认以前台模式运行 `zs runner start-sync`，保持容器常驻并与 Hub 同步。

### 交互模式

```bash
docker compose --profile interactive run --rm cli
```

也可以覆盖命令：

```bash
docker compose --profile interactive run --rm cli --help
docker compose --profile interactive run --rm cli hub
```

### 直接使用 docker run

```bash
docker run --rm -it \
  -e ZCF_API_KEY=your-api-key \
  -e ZCF_API_URL=https://your-api-host \
  -v ~/.claude:/root/.claude \
  zhushen-cli:local \
  bun run --cwd cli src/index.ts --help
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `CLI_API_TOKEN` | - | Hub 和 CLI 共用的认证密钥 |
| `ZS_API_URL` | `http://hub:3006` | CLI 连接 Hub 的 URL |
| `ZS_CLAUDE_PATH` | `/usr/local/bin/claude` | Claude Code 二进制路径 |
| `CLAUDE_CONFIG_DIR` | - | 宿主机 Claude 配置目录（必须挂载） |
| `ZS_GO_VERSION` | `1.24.3` | 运行时 Go 版本（由 goenv 管理） |
| `ZS_NODE_VERSION` | `22` | 运行时 Node.js 版本（由 nvm 管理） |
| `ZCF_API_KEY` | - | 运行时注入 Claude API Key（仅在设置时触发覆盖） |
| `ZCF_API_URL` | - | 运行时注入 Claude API URL（仅在设置时触发覆盖） |
| `ZCF_API_MODEL` | - | 运行时覆盖主模型 |
| `ZCF_API_HAIKU_MODEL` | - | 运行时覆盖 Haiku 模型 |
| `ZCF_API_SONNET_MODEL` | - | 运行时覆盖 Sonnet 模型 |
| `ZCF_API_OPUS_MODEL` | - | 运行时覆盖 Opus 模型 |
| `ZCF_DEFAULT_OUTPUT_STYLE` | - | 运行时覆盖默认输出样式 |
| `ZCF_ALL_LANG` | - | 运行时统一覆盖语言参数 |
| `ZCF_AI_OUTPUT_LANG` | - | 运行时覆盖 AI 输出语言 |

本镜像的 Claude Code 配置采用混合模式：

- 构建期通过 zcf 生成默认配置（中文输出、默认 nekomata-engineer、MCP 为 Serena + Playwright）；
- 运行期仅在检测到 `ZCF_*` 覆盖变量时执行 `zcf init --config-action merge` 覆盖；
- 运行期不会重新安装 Claude Code。

## 运行时版本选择

容器启动时通过环境变量选择 Go 和 Node.js 版本。

本镜像采用**版本管理器方案**：

- Node.js 使用 `nvm` 管理；
- Go 使用 `goenv` 管理；
- 当指定版本未安装时，会通过对应管理器自动安装；
- 安装失败时会报错并退出（非 0）。

### 预装版本

镜像构建时预装以下版本：

- **Node.js**: 20 / 22（nvm）
- **Go**: 1.22.12 / 1.24.3（goenv）

### 切换示例

```bash
# 使用 Go 1.22.12 和 Node.js 20
docker compose run --rm \
  -e ZS_GO_VERSION=1.22.12 \
  -e ZS_NODE_VERSION=20 \
  cli go version

# 仅切换 Node.js 到 22
docker compose run --rm \
  -e ZS_NODE_VERSION=22 \
  cli node -v
```

### 自动安装示例

```bash
# 若容器内尚未安装该版本，会由 goenv 自动安装
docker compose run --rm -e ZS_GO_VERSION=1.23.6 cli go version
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
| `git` | apt | 版本控制 |
| `dstat` | apt | 系统资源监控工具 |
| `zs` | 本项目 | 主神 CLI 命令 |
| `claude` | zcf 初始化 | [Claude Code](https://docs.anthropic.com/en/docs/claude-code) - Anthropic AI 编程助手 |
| `mss` | pnpm 全局 | [MCP Swagger Server](https://github.com/zaizaizhao/mcp-swagger-server) - Swagger/OpenAPI MCP 服务 |
| `trellis` | pnpm 全局 | [Trellis](https://docs.trytrellis.app/) - AI 代码代理，支持多文件编辑 |
| `ux` | pnpm 全局 | 用户体验 CLI 工具 |

## 验证命令

构建完成后可在容器中逐一验证工具是否可用：

```bash
docker run --rm zhushen-cli:local zs --help
docker run --rm zhushen-cli:local claude --version
docker run --rm zhushen-cli:local bun --version
docker run --rm zhushen-cli:local node -v
docker run --rm zhushen-cli:local go version
docker run --rm zhushen-cli:local pnpm -v
docker run --rm zhushen-cli:local yarn -v
docker run --rm zhushen-cli:local curl --version
docker run --rm zhushen-cli:local git --version
docker run --rm zhushen-cli:local dstat --version
docker run --rm zhushen-cli:local mss --help
docker run --rm zhushen-cli:local trellis --help
```

## 数据持久化

compose 配置使用命名卷持久化数据：

- `cli-data` -> `/data/zhushen` (CLI 配置和状态)
- `hub-data` -> `/data/zhushen` (Hub 数据库和配置)

Claude Code 配置通过绑定挂载 `CLAUDE_CONFIG_DIR` 目录到 `/root/.claude`，使容器使用宿主机的 Claude 认证信息。
