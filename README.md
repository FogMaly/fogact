# FogIDC Activator

FogIDC multi-platform activator. It supports Codex, Claude Code, OpenCode and OpenClaw activation, node testing, config backup and restore, and a local web UI for operations.

## Highlights

- Interactive CLI for common activation tasks
- Activation flow for Codex and Claude Code
- Node testing before switching config
- Backup and restore for local config files
- Local web UI for user actions and admin management
- Plain Node.js implementation with no framework lock-in

## Requirements

- Node.js 16 or newer

## One-command VPS Install

For a clean VPS, run the GitHub bootstrap script. It installs Node.js when missing, installs the latest npm package, and can optionally activate a target platform.

Install only:

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

Install and activate with a direct NewAPI key:

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

If you want to install directly from GitHub source instead of npm, add `--method github`.

## Install

Clone the repository and install dependencies:

```bash
git clone https://github.com/FogMaly/cliproxy-activator.git
cd fogidc-activator
npm install
```

If you want the CLI command globally on your machine:

```bash
npm link
```

## Quick Start

Configure your upstream NewAPI endpoint first:

```bash
cp config/upstream.example.json config/upstream.json
```

Edit `config/upstream.json` and set:

- `baseUrl`: your upstream NewAPI base URL
- `apiKey`: your upstream NewAPI key

You can also use environment variables instead:

```bash
export NEWAPI_BASE_URL="https://newapi.example.com"
export NEWAPI_API_KEY="sk-your-upstream-key"
```

Open the FogIDC-style multi-platform activation wizard:

```bash
fogidc-activator
```

Or run from the repo directly:

```bash
node bin/cli.js
```

Activate Codex:

```bash
fogidc-activator activate --service codex --yes
```

Activate Claude Code:

```bash
fogidc-activator activate --service claude --yes
```

Activate selected platforms only:

```bash
fogidc-activator wizard --service codex --platforms codex-cli,opencode
```

Use an activation / redeem code. The wizard reads the code capability first and only shows the supported service and platforms:

```bash
fogidc-activator wizard --code YOUR_ACTIVATION_CODE
```

Skip upstream verification for local dry-runs:

```bash
fogidc-activator activate --service codex --api-key sk-test --yes --skip-verify
```

Legacy activation-code mode is still available:

```bash
fogidc-activator activate --service codex --code YOUR_ACTIVATION_CODE --legacy
```

Test nodes:

```bash
fogidc-activator test
```

Restore a backup:

```bash
fogidc-activator restore --service claude
```

## Web UI

Start the local web server:

```bash
npm run web
```

Default endpoints:

- User UI: `http://localhost:34020/`
- Admin UI: `http://localhost:34020/admin/`

Relevant environment variables:

- `PORT`: override the default port `34020`
- `ADMIN_PASSWORD`: override the default admin password `admin123`
- `SERVER_TIMEZONE`: override the default timezone `Asia/Shanghai`
- `NEWAPI_BASE_URL`: upstream NewAPI base URL for CLI activation
- `NEWAPI_API_KEY`: upstream NewAPI key for CLI activation
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
```

## Activation Code Capabilities

The wizard is ready for capability-scoped activation codes. A future code verification API can return fields such as `service`, `services`, `platforms`, `targets`, or `capabilities`; the CLI normalizes them and filters the activation choices automatically.

Examples:

```json
{ "service": "codex" }
```

```json
{ "capabilities": { "services": ["claude"], "platforms": ["claude-code", "opencode"] } }
```

Supported platform ids are `codex-cli`, `claude-code`, `opencode`, `openclaw`, `vscode-codex-plugin`, and `cursor-codex-plugin`.

## Project Layout

- `bin/`: CLI and web server entry points
- `lib/`: command and service implementation
- `frontend/`: static frontend assets
- `docs/`: implementation notes and delivery documents
- `scripts/`: helper scripts
- `test/`: lightweight test scripts
- `data/`: local runtime data, intentionally not committed

## Config Paths

- Claude Code: `~/.claude/config.json`
- Claude Code: `~/.claude/settings.json` and `~/.claude.json`
- Codex: `~/.codex/config.toml` and `~/.codex/auth.json`
- OpenCode: `~/.config/opencode/opencode.json` if already installed
- OpenClaw: `~/.openclaw/openclaw.json` if already installed
- Backups: `~/.fogidc-activator/backups/`

## Development

Run the included test script:

```bash
npm test
```

## License

MIT. See `LICENSE`.
