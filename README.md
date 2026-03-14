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
npx @jlovec/zhushen hub --relay     # 启动 hub 并开启端到端加密中继
npx @jlovec/zhushen                 # 运行 claude code
```

终端会显示一个 URL 和二维码。用手机扫描二维码或在浏览器中打开该 URL 即可访问。

> 中继使用 WireGuard + TLS 进行端到端加密。你的数据从设备到机器全程加密。

如需自托管方案 (Cloudflare Tunnel、Tailscale)，请参阅[安装指南](docs/guide/installation.md)。

## Docker (zs-hub + zs-runner)

使用 Docker 将 hub 和 runner 作为独立服务运行。runner 镜像预装了常用开发/运维工具，并支持运行时切换 Go/Node.js 版本。

```bash
cp .env.example .env
mkdir -p ./.claude

# 编辑 .env，至少设置：
# - CLI_API_TOKEN
# - CLAUDE_CONFIG_DIR（必须是宿主机绝对路径）

bun run docker:check
docker compose up -d --build zs-hub zs-runner
docker compose logs -f zs-hub zs-runner
```

> `bun run docker:check` 现在会同时校验 `.env` 语义与 `docker compose config --quiet`，可以在真正启动前尽早发现配置错误。

### 配置

- `CLI_API_TOKEN`: zs-hub 和 zs-runner 共用的密钥
- `ZS_API_URL`: CLI 连接 hub 的 URL (compose 网络内为 `http://zs-hub:3006`)
- `CLAUDE_CONFIG_DIR`: 挂载到容器的 Claude Code 认证/会话配置的宿主机绝对路径（必填）
- `ZS_GO_VERSION`: 运行时 Go 版本（默认 `1.24.3`，由 goenv 管理）
- `ZS_NODE_VERSION`: 运行时 Node.js 主版本号（默认 `22`，由 nvm 管理）
- `ZCF_API_KEY`: 运行时注入 Claude API Key（仅在设置时触发覆盖，不能填 URL）
- `ZCF_API_URL`: 运行时注入 Claude API URL（仅在设置时触发覆盖，必须是 `http(s)://` URL）
- `ZCF_API_MODEL`: 运行时覆盖主模型
- `ZCF_API_HAIKU_MODEL`: 运行时覆盖 Haiku 模型
- `ZCF_API_SONNET_MODEL`: 运行时覆盖 Sonnet 模型
- `ZCF_API_OPUS_MODEL`: 运行时覆盖 Opus 模型
- `ZCF_DEFAULT_OUTPUT_STYLE`: 运行时覆盖默认输出样式
- `ZCF_ALL_LANG`: 运行时统一覆盖语言参数
- `ZCF_AI_OUTPUT_LANG`: 运行时覆盖 AI 输出语言

详细使用方法请参阅 [Runner Docker 独立使用指南](docs/guide/docker-runner.md)。

## 文档

- [快速开始](docs/guide/quick-start.md)
- [安装与部署](docs/guide/installation.md)
- [Runner Docker 使用](docs/guide/docker-runner.md)
- [工作原理](docs/guide/how-it-works.md)
- [应用](docs/guide/pwa.md)
- [Cursor Agent](docs/guide/cursor.md)
- [为什么选择主神](docs/guide/why-hapi.md)
- [常见问题](docs/guide/faq.md)

## 致谢

主神（zhushen）的灵感来源于《无限恐怖》中的"主神空间"。项目前身为 [HAPI](https://github.com/jlovec1024/hapi)，即"哈皮"，是 [Happy](https://github.com/slopus/happy) 的中文音译。感谢原项目 hapi 和 Happy 的贡献。
