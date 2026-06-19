# FogAct

FogAct 是一个多平台激活辅助工具，支持 Codex、Claude Code、OpenCode 和 OpenClaw。它提供全新 VPS 一键安装、激活码/CDK 激活、NewAPI Key 直连激活、配置备份/恢复，以及本地 Web 管理界面。

[English](./README.md) | 简体中文

## 🚀 一键安装

直接用 npx 拉起终端激活菜单：

```bash
npx fogact
```

不要使用 `npm fogact`；npm 会把它当作 npm 内置子命令。正确方式是 `npx fogact`。

如果是没有 Node.js/npm 的干净 VPS，再复制下面命令即可。脚本会在缺少 Node.js 时自动安装 Node.js，然后安装最新的 `fogact` npm 包；不要求机器预装 git 或 npx。

```bash
curl -fsSL https://raw.githubusercontent.com/FogMaly/cliproxy-activator/main/install.sh | sh
```

使用激活码安装并激活 Codex：

```bash
curl -fsSL https://raw.githubusercontent.com/FogMaly/cliproxy-activator/main/install.sh | sh -s -- \
  --service codex \
  --code YOUR_ACTIVATION_CODE \
  --cliproxy-api-base https://your-activator.example.com
```

使用激活码安装并激活 Claude Code：

```bash
curl -fsSL https://raw.githubusercontent.com/FogMaly/cliproxy-activator/main/install.sh | sh -s -- \
  --service claude \
  --code YOUR_ACTIVATION_CODE \
  --cliproxy-api-base https://your-activator.example.com
```

使用 NewAPI Key 直连安装并激活：

```bash
curl -fsSL https://raw.githubusercontent.com/FogMaly/cliproxy-activator/main/install.sh | sh -s -- \
  --service codex \
  --base-url https://newapi.example.com \
  --api-key sk-your-upstream-key
```

安装后启动本地 Web UI：

```bash
curl -fsSL https://raw.githubusercontent.com/FogMaly/cliproxy-activator/main/install.sh | sh -s -- --web
```

> 最低引导要求：机器至少需要 `curl` 或 `wget` 用来下载脚本。常见 Linux 发行版上的 Node.js/npm 安装会由脚本自动处理。

## 功能说明

- 安装并提供 `fogact`、`fogact-web` 命令，同时保留 `cliproxy-activator`、`cliproxy-web`、`fogidc-activator`、`fogidc-web` 兼容别名。
- 为 Codex CLI 和 Claude Code 写入本地配置文件完成激活。
- 可按需配置 OpenCode、OpenClaw、VSCode Codex 插件和 Cursor Codex 插件。
- 会读取激活码能力范围，只展示该激活码支持的服务和平台。
- NewAPI Key 直连模式会先通过 `/v1/models` 验证可用性。
- 写入配置前会自动备份已有配置。
- 提供本地 Web UI，用于用户页、管理后台、激活码和上游设置管理。

## 支持目标

| 目标 | 服务 | 默认行为 |
| --- | --- | --- |
| Codex CLI | Codex | 创建 `~/.codex/config.toml` 和 `~/.codex/auth.json` |
| Claude Code | Claude | 创建 `~/.claude/settings.json` 和 `~/.claude.json` |
| OpenCode | Codex / Claude | 已安装或通过 `--all` / `--platforms` 选择时配置 |
| OpenClaw | Codex / Claude | 已安装或通过 `--all` / `--platforms` 选择时配置 |
| VSCode Codex 插件 | Codex | 仅在检测到兼容插件文件时修补 |
| Cursor Codex 插件 | Codex | 仅在检测到兼容插件文件时修补 |

## 安装方式

### npx

直接运行激活器，操作方式对齐 `npx yunyi-activator`：

```bash
npx fogact
```

### npm 全局安装

```bash
npm install -g fogact
fogact
```

### GitHub 源码

```bash
git clone https://github.com/FogMaly/cliproxy-activator.git
cd cliproxy-activator
npm install
node bin/cli.js --help
```

### 通过 GitHub bootstrap 安装源码版

bootstrap 默认安装 npm 包。如果想直接克隆并运行 GitHub 源码版：

```bash
curl -fsSL https://raw.githubusercontent.com/FogMaly/cliproxy-activator/main/install.sh | sh -s -- --method github
```

## 激活用法

### 激活码 / CDK 模式

```bash
export CLIPROXY_API_BASE="https://your-activator.example.com"
fogact wizard --code YOUR_ACTIVATION_CODE --yes
```

指定服务：

```bash
fogact wizard --service codex --code YOUR_ACTIVATION_CODE --yes
fogact wizard --service claude --code YOUR_ACTIVATION_CODE --yes
```

只激活指定平台：

```bash
fogact wizard --service codex --platforms codex-cli,opencode --yes
```

### NewAPI Key 直连模式

```bash
export NEWAPI_BASE_URL="https://newapi.example.com"
export NEWAPI_API_KEY="sk-your-upstream-key"
fogact activate --service codex --yes
```

本地测试时跳过上游验证：

```bash
fogact activate --service codex --api-key sk-test --yes --skip-verify
```

旧版节点切换激活码模式仍然保留：

```bash
fogact activate --service codex --code YOUR_ACTIVATION_CODE --legacy
```

## Web UI

启动本地 Web UI：

```bash
fogact-web
```

或在源码仓库中运行：

```bash
npm run web
```

默认地址：

- 用户页面：`http://localhost:34020/`
- 管理后台：`http://localhost:34020/admin/`

常用环境变量：

- `PORT`：覆盖默认端口 `34020`
- `ADMIN_PASSWORD`：覆盖默认管理密码 `admin123`
- `SERVER_TIMEZONE`：覆盖默认时区 `Asia/Shanghai`
- `NEWAPI_BASE_URL`：CLI 激活使用的 NewAPI 上游地址
- `NEWAPI_API_KEY`：CLI 激活使用的 NewAPI Key
- `CLIPROXY_API_BASE`：激活码模式使用的激活后台地址
- `CLIPROXY_UPSTREAM_CONFIG`：自定义上游配置 JSON 路径
- `FOGIDC_BACKUP_DIR`：自定义激活配置备份目录

## 命令列表

```text
fogact
fogact web
fogact interactive
fogact wizard [--code <activation-code>] [--platforms <ids>]
fogact activate --service <claude|codex> [--api-key <key>] [--yes]
fogact activate --service <claude|codex> --code <activation-code> --legacy
fogact test
fogact restore --service <claude|codex>
fogact-web
```

## 激活码能力范围

向导支持按能力范围限制激活码。校验接口可返回 `service`、`services`、`platforms`、`targets` 或 `capabilities` 等字段；CLI 会自动归一化并过滤可选服务和平台。

示例：

```json
{ "service": "codex" }
```

```json
{ "capabilities": { "services": ["claude"], "platforms": ["claude-code", "opencode"] } }
```

支持的平台 ID：`codex-cli`、`claude-code`、`opencode`、`openclaw`、`vscode-codex-plugin`、`cursor-codex-plugin`。

## 配置路径

- Codex CLI：`~/.codex/config.toml` 和 `~/.codex/auth.json`
- Claude Code：`~/.claude/settings.json` 和 `~/.claude.json`
- OpenCode：`~/.config/opencode/opencode.json`
- OpenClaw：`~/.openclaw/openclaw.json`
- 备份目录：`~/.fogact/backups/`

## 开发

```bash
npm install
npm test
npm run web
```

项目结构：

- `bin/`：CLI 和 Web 服务入口
- `lib/`：命令、服务、平台和配置实现
- `frontend/`：静态前端资源
- `install.sh`：全新 VPS bootstrap 安装脚本
- `docs/`：实现说明和交付文档
- `scripts/`：辅助脚本
- `test/`：轻量测试脚本
- `data/`：本地运行数据，不提交仓库

## License

MIT. See `LICENSE`.
