# FogAct

[简体中文](./README.zh-CN.md) | English

FogAct is a simple activation helper for Claude Code and Codex. It is designed to be used like `npx fogact`: run one command, choose from the menu, paste your activation code, and let FogAct auto-detect the Codex / Claude entitlement before writing local config.

## Start

```bash
npx fogact
```

That is the user-facing command. Running it opens the interactive menu:

```text
╭─────────────────────────────────────╮
│          FogAct Activator           │
│    Claude Code / Codex Config Tool  │
╰─────────────────────────────────────╯

? Select an action:
  1. Activate service
  2. Test nodes
  3. Restore backup
  4. Exit
```

Do not run `npm fogact`; npm treats that as an npm subcommand. Use `npx fogact`.

FogAct checks npm for the latest version before opening the menu. If an older installed version is detected, it updates first and then continues. Activation codes use the public panel `https://cliproxy.fogidc.com` by default; set `FOGACT_API_BASE` to use another backend. Set `FOGACT_SKIP_UPDATE=1` to skip the update check.

## Clean VPS

If the machine does not have Node.js/npm yet, use the bootstrap installer first:

```bash
curl -fsSL https://raw.githubusercontent.com/FogMaly/fogact/main/install.sh | sh
```

After installation, run:

```bash
fogact
```

Minimum bootstrap requirement: the machine needs `curl` or `wget`. The installer can install Node.js/npm on common Linux distributions.

## What Users Do

1. Run `npx fogact`.
2. Choose `1. Activate service`.
3. Enter the activation / redeem code.
4. FogAct auto-detects the Codex / Claude entitlement and shows only supported targets.
5. Confirm the plan and restart the target tool.

FogAct backs up existing configuration before writing new files.

## Supported Targets

| Target | Default behavior |
| --- | --- |
| Codex CLI | Writes `~/.codex/config.toml` and `~/.codex/auth.json` |
| Claude Code | Writes `~/.claude/settings.json` and `~/.claude.json` |
| OpenCode | Configures when installed or selected by the wizard |
| OpenClaw | Configures when installed or selected by the wizard |
| VSCode / Cursor Codex plugin | Patches only when compatible plugin files are detected |

## Advanced

Most users only need `npx fogact`. Advanced operators can still use:

```bash
fogact web
```

The Web UI defaults to `http://localhost:34020/`. You can set `PORT`, `ADMIN_PASSWORD`, `NEWAPI_BASE_URL`, `NEWAPI_API_KEY`, `FOGACT_API_BASE`, or `FOGACT_UPSTREAM_CONFIG` when needed.

## Repository

- GitHub: https://github.com/FogMaly/fogact
- npm: https://www.npmjs.com/package/fogact
- Backups: `~/.fogact/backups/`

## Development

```bash
npm install
npm test
npm run web
```
