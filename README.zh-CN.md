# FogAct

FogAct 是一个简单的 Claude Code / Codex 激活工具。它的使用方式要和 `npx yunyi-activator` 一样：用户只运行一个命令，进入菜单，输入激活码或 API Key，然后自动写入本地配置。

[English](./README.md) | 简体中文

## 开始使用

```bash
npx fogact
```

这是给用户看的主命令。运行后会打开交互菜单：

```text
╭─────────────────────────────────────╮
│          FogAct 激活器              │
│    Claude Code / Codex 配置工具     │
╰─────────────────────────────────────╯

? 请选择操作:
  1. 激活服务
  2. 测试节点
  3. 恢复备份
  4. 退出
```

不要运行 `npm fogact`；npm 会把它当成 npm 子命令。正确方式是 `npx fogact`。

## 干净 VPS

如果机器还没有 Node.js/npm，先用 bootstrap 安装：

```bash
curl -fsSL https://raw.githubusercontent.com/FogMaly/fogact/main/install.sh | sh
```

安装完成后运行：

```bash
fogact
```

最低要求：机器需要有 `curl` 或 `wget`。安装脚本会在常见 Linux 发行版上自动安装 Node.js/npm。

## 用户操作流程

1. 运行 `npx fogact`。
2. 选择 `1. 激活服务`。
3. 根据提示选择 Claude Code 或 Codex。
4. 输入激活码或 API Key。
5. 确认激活计划，然后重启对应工具。

FogAct 写入新配置前会自动备份旧配置。

## 支持目标

| 目标 | 默认行为 |
| --- | --- |
| Codex CLI | 写入 `~/.codex/config.toml` 和 `~/.codex/auth.json` |
| Claude Code | 写入 `~/.claude/settings.json` 和 `~/.claude.json` |
| OpenCode | 已安装或由向导选择时配置 |
| OpenClaw | 已安装或由向导选择时配置 |
| VSCode / Cursor Codex 插件 | 仅在检测到兼容插件文件时修补 |

## 高级入口

普通用户只需要 `npx fogact`。管理员仍可使用：

```bash
fogact web
```

Web UI 默认地址是 `http://localhost:34020/`。需要时可以设置 `PORT`、`ADMIN_PASSWORD`、`NEWAPI_BASE_URL`、`NEWAPI_API_KEY`、`CLIPROXY_API_BASE` 或 `CLIPROXY_UPSTREAM_CONFIG`。

## 项目链接

- GitHub: https://github.com/FogMaly/fogact
- npm: https://www.npmjs.com/package/fogact
- 备份目录：`~/.fogact/backups/`

## 开发

```bash
npm install
npm test
npm run web
```
