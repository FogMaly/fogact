# FogIDC Activator

[简体中文](./README.zh-CN.md) | English

FogIDC Activator is a multi-platform activation helper for Codex, Claude Code, OpenCode and OpenClaw. It provides one-command VPS bootstrap, activation-code based setup, direct NewAPI key setup, config backup/restore, and a local Web UI.

## 🚀 One-command Install

Copy this command on a clean VPS. It can install Node.js automatically when missing, install the latest `fogidc-activator` npm package, and prepare the CLI without requiring git or npx.

```bash
curl -fsSL https://raw.githubusercontent.com/FogMaly/cliproxy-activator/main/install.sh | sh
```

Install and activate Codex with an activation code:

```bash
curl -fsSL https://raw.githubusercontent.com/FogMaly/cliproxy-activator/main/install.sh | sh -s -- \
  --service codex \
  --code YOUR_ACTIVATION_CODE \
  --cliproxy-api-base https://your-activator.example.com
```

Install and activate Claude Code with an activation code:

```bash
curl -fsSL https://raw.githubusercontent.com/FogMaly/cliproxy-activator/main/install.sh | sh -s -- \
  --service claude \
  --code YOUR_ACTIVATION_CODE \
  --cliproxy-api-base https://your-activator.example.com
```

Install and activate directly with a NewAPI key:

```bash
curl -fsSL https://raw.githubusercontent.com/FogMaly/cliproxy-activator/main/install.sh | sh -s -- \
  --service codex \
  --base-url https://newapi.example.com \
  --api-key sk-your-upstream-key
```

Start the local Web UI after install:

```bash
curl -fsSL https://raw.githubusercontent.com/FogMaly/cliproxy-activator/main/install.sh | sh -s -- --web
```

> Minimum bootstrap requirement: the machine needs `curl` or `wget` to download the script. The script handles Node.js/npm installation on common Linux distributions.

## What It Does

- Installs and exposes `fogidc-activator`, `cliproxy-activator`, `fogidc-web`, and `cliproxy-web` commands.
- Activates Codex CLI and Claude Code by writing their local config files.
- Optionally configures OpenCode, OpenClaw, VSCode Codex plugin, and Cursor Codex plugin when selected or detected.
- Reads activation-code capabilities so users only see supported services/platforms.
- Verifies direct NewAPI keys through `/v1/models` before writing config.
- Backs up existing config before writing changes.
- Provides a local Web UI for users, admin management, activation codes, and settings.

## Supported Targets

| Target | Service | Default behavior |
| --- | --- | --- |
| Codex CLI | Codex | Creates `~/.codex/config.toml` and `~/.codex/auth.json` |
| Claude Code | Claude | Creates `~/.claude/settings.json` and `~/.claude.json` |
| OpenCode | Codex / Claude | Configures when installed or selected with `--all` / `--platforms` |
| OpenClaw | Codex / Claude | Configures when installed or selected with `--all` / `--platforms` |
| VSCode Codex plugin | Codex | Patches only when compatible plugin files are detected |
| Cursor Codex plugin | Codex | Patches only when compatible plugin files are detected |

## Install Options

### npm

```bash
npm install -g fogidc-activator
fogidc-activator --help
```

### GitHub source

```bash
git clone https://github.com/FogMaly/cliproxy-activator.git
cd cliproxy-activator
npm install
node bin/cli.js --help
```

### GitHub bootstrap from source

The bootstrap installs from npm by default. To clone and run directly from GitHub source instead:

```bash
curl -fsSL https://raw.githubusercontent.com/FogMaly/cliproxy-activator/main/install.sh | sh -s -- --method github
```

## Activation Usage

### Activation code / CDK mode

```bash
export CLIPROXY_API_BASE="https://your-activator.example.com"
fogidc-activator wizard --code YOUR_ACTIVATION_CODE --yes
```

Activate a specific service:

```bash
fogidc-activator wizard --service codex --code YOUR_ACTIVATION_CODE --yes
fogidc-activator wizard --service claude --code YOUR_ACTIVATION_CODE --yes
```

Activate selected platforms only:

```bash
fogidc-activator wizard --service codex --platforms codex-cli,opencode --yes
```

### Direct NewAPI mode

```bash
export NEWAPI_BASE_URL="https://newapi.example.com"
export NEWAPI_API_KEY="sk-your-upstream-key"
fogidc-activator activate --service codex --yes
```

Skip upstream verification for local dry-runs:

```bash
fogidc-activator activate --service codex --api-key sk-test --yes --skip-verify
```

Legacy node-switching activation-code mode is still available:

```bash
fogidc-activator activate --service codex --code YOUR_ACTIVATION_CODE --legacy
```

## Web UI

Start the local Web UI:

```bash
fogidc-web
```

Or from this repository:

```bash
npm run web
```

Default endpoints:

- User UI: `http://localhost:34020/`
- Admin UI: `http://localhost:34020/admin/`

Useful environment variables:

- `PORT`: override the default port `34020`
- `ADMIN_PASSWORD`: override the default admin password `admin123`
- `SERVER_TIMEZONE`: override the default timezone `Asia/Shanghai`
- `NEWAPI_BASE_URL`: upstream NewAPI base URL for CLI activation
- `NEWAPI_API_KEY`: upstream NewAPI key for CLI activation
- `CLIPROXY_API_BASE`: activation-code backend URL for CLI code mode
- `CLIPROXY_UPSTREAM_CONFIG`: custom path for upstream config JSON
- `FOGIDC_BACKUP_DIR`: custom backup directory for activation config backups

## Commands

```text
fogidc-activator
fogidc-activator interactive
fogidc-activator wizard [--code <activation-code>] [--platforms <ids>]
fogidc-activator activate --service <claude|codex> [--api-key <key>] [--yes]
fogidc-activator activate --service <claude|codex> --code <activation-code> --legacy
fogidc-activator test
fogidc-activator restore --service <claude|codex>
fogidc-web
```

## Activation Code Capabilities

The wizard supports capability-scoped activation codes. The code verification API can return fields such as `service`, `services`, `platforms`, `targets`, or `capabilities`; the CLI normalizes them and filters activation choices automatically.

Examples:

```json
{ "service": "codex" }
```

```json
{ "capabilities": { "services": ["claude"], "platforms": ["claude-code", "opencode"] } }
```

Supported platform ids are `codex-cli`, `claude-code`, `opencode`, `openclaw`, `vscode-codex-plugin`, and `cursor-codex-plugin`.

## Config Paths

- Codex CLI: `~/.codex/config.toml` and `~/.codex/auth.json`
- Claude Code: `~/.claude/settings.json` and `~/.claude.json`
- OpenCode: `~/.config/opencode/opencode.json`
- OpenClaw: `~/.openclaw/openclaw.json`
- Backups: `~/.fogidc-activator/backups/`

## Development

```bash
npm install
npm test
npm run web
```

Project layout:

- `bin/`: CLI and web server entry points
- `lib/`: command, service, platform and config implementation
- `frontend/`: static frontend assets
- `install.sh`: clean VPS bootstrap installer
- `docs/`: implementation notes and delivery documents
- `scripts/`: helper scripts
- `test/`: lightweight test scripts
- `data/`: local runtime data, intentionally not committed

## License

MIT. See `LICENSE`.
