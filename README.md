# 主神 (Zhushen)

在本地运行官方 Claude Code / Codex / Gemini / OpenCode 会话，并通过 Web / PWA 远程控制。

## 特性

- **无缝切换** - 在本地工作，需要时切换到远程，随时切换回来。无上下文丢失，无需重启会话。
- **原生优先** - 主神包装你的 AI 代理而非替代它。同样的终端、同样的体验、同样的操作习惯。
- **离开也不停** - 离开工位？在手机上一键批准 AI 请求。
- **自由选择 AI** - Claude Code、Codex、Cursor Agent、Gemini、OpenCode -- 不同模型，统一工作流。
- **随时随地终端** - 从手机或浏览器运行命令，直连工作机器。

## 快速开始

```bash
npx @jlovec/zhushen hub     # 启动 hub（本地访问）
npx @jlovec/zhushen         # 运行 claude code
```

终端会显示本地访问地址，可在浏览器或手机内网访问。

## Docker (zs-hub + zs-runner)

使用 Docker 将 hub 和 runner 作为独立服务运行。runner 镜像预装了常用开发/运维工具，支持运行时切换 Go/Node.js 版本，并以内置 `zs` 二进制作为默认入口。

```bash
# 启动服务（需要提供必填环境变量）
CLI_API_TOKEN=your-secret \
docker compose up -d --build zs-hub zs-runner

# 查看日志
docker compose logs -f zs-hub zs-runner
```

如需仅拉起本地测试环境（不自动执行测试命令），可运行：

```bash
bun run start:local-test-env
```

脚本会优先读取当前环境中的 `ANTHROPIC_API_KEY`、`ANTHROPIC_BASE_URL`；若缺失，则回退读取 `~/.claude/settings.json` 中的 `.env.ANTHROPIC_API_KEY`、`.env.ANTHROPIC_BASE_URL`，然后使用项目根目录 `docker-compose.yml` 以固定 compose project name `zhushen` 执行带 `--build` 的启动。

### 配置

必填环境变量（通过命令行 `-e` 或项目根目录 `.env` 提供）：

- `CLI_API_TOKEN`: zs-hub 和 zs-runner 共用的密钥

可选环境变量（已有默认值）：

- `ZS_LISTEN_PORT`: hub 暴露端口（默认 `80`）
- `ZS_PUBLIC_URL`: hub 公开访问地址（默认 `http://localhost:80`）
- `ZS_GO_VERSION`: runner 运行时 Go 版本（默认 `1.24.3`）
- `ZS_NODE_VERSION`: runner 运行时 Node.js 主版本号（默认 `24`，镜像仅预装该版本；指定其他版本时会在运行时安装）
- `ZS_GIT_USER_NAME`: runner 容器内 git user.name
- `ZS_GIT_USER_EMAIL`: runner 容器内 git user.email

### 数据目录与卷

compose 默认使用独立命名卷，并统一挂载到容器内 `/data` 体系：

- `hub-data` -> `/data/hub`
- `runner-data` -> `/data/runner`
- `goenv-data` -> `/data/goenv`
- `nvm-data` -> `/data/nvm`
- `claude-data` -> `/data/claude`

其中：

- hub 默认 `ZS_HOME=/data/hub`
- runner 默认 `ZS_HOME=/data/runner`
- `/data/claude` 是 Claude 配置的默认持久化根目录
- 启动时会将当前用户的 `~/.claude` 软链接到 `/data/claude/.claude`
- 启动时会将当前用户的 `~/.claude.json` 软链接到 `/data/claude/.claude.json`

首次启动 runner 时：

- 入口脚本会先确保 `/data/claude` 存在；
- 再将镜像内置模板 `/opt/zhushen/claude-default` 增量补齐到 `/data/claude`；
- 若当前用户 home 下已存在真实的 `~/.claude` 或 `~/.claude.json`，会先备份为 `.bak`（若重名则追加时间戳）后再改为软链接；
- 只建立 Claude 配置骨架，不会主动把 token / API 写入 `settings.json`。

模板目录位于 `docker/claude-default`，当前结构为：

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

主神优先复用 Claude Code 官方支持的认证入口，例如 `CLAUDE_CODE_OAUTH_TOKEN`、`ANTHROPIC_API_KEY`、`settings.json` 与 `.claude.json`；当检测到认证缺失时，会在启动 Claude 会话前直接提示用户补齐配置。

详细使用方法请参阅 [Runner Docker 独立使用指南](docs/guide/docker-runner.md)。

## 文档

- [快速开始](docs/guide/quick-start.md)
- [安装与部署](docs/guide/installation.md)
- [Runner Docker 使用](docs/guide/docker-runner.md)
- [工作原理](docs/guide/how-it-works.md)
- [应用](docs/guide/pwa.md)
- [Cursor Agent](docs/guide/cursor.md)
- [为什么选择主神](docs/guide/why-zhushen.md)
- [常见问题](docs/guide/faq.md)

## 致谢

主神（zhushen）的灵感来源于《无限恐怖》中的"主神空间"。项目长期围绕本地优先、自托管的 AI 代理协作体验持续演进，也感谢社区中相关开源项目带来的启发。
