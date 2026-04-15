# CLIProxy Activator

One-command activator for CLIProxyAPI. It supports Codex and Claude Code activation, node testing, config backup and restore, and a local web UI for operations.

## Highlights

- Interactive CLI for common activation tasks
- Activation flow for Codex and Claude Code
- Node testing before switching config
- Backup and restore for local config files
- Local web UI for user actions and admin management
- Plain Node.js implementation with no framework lock-in

## Requirements

- Node.js 16 or newer

## Install

Clone the repository and install dependencies:

```bash
git clone https://github.com/FogMaly/cliproxy-activator.git
cd cliproxy-activator
npm install
```

If you want the CLI command globally on your machine:

```bash
npm link
```

## Quick Start

Open the interactive menu:

```bash
cliproxy-activator
```

Or run from the repo directly:

```bash
node bin/cli.js
```

Activate Codex:

```bash
cliproxy-activator activate --service codex --code YOUR_ACTIVATION_CODE
```

Activate Claude Code:

```bash
cliproxy-activator activate --service claude --code YOUR_ACTIVATION_CODE
```

Test nodes:

```bash
cliproxy-activator test
```

Restore a backup:

```bash
cliproxy-activator restore --service claude
```

## Web UI

Start the local web server:

```bash
npm run web
```

Default endpoints:

- User UI: `http://localhost:34010/`
- Admin UI: `http://localhost:34010/admin/`

Relevant environment variables:

- `PORT`: override the default port `34010`
- `ADMIN_PASSWORD`: override the default admin password `admin123`
- `SERVER_TIMEZONE`: override the default timezone `Asia/Shanghai`

## Commands

```text
cliproxy-activator
cliproxy-activator interactive
cliproxy-activator activate --service <claude|codex> --code <activation-code>
cliproxy-activator test
cliproxy-activator restore --service <claude|codex>
```

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
- Codex: `~/.codex/config.json`
- Backups: `~/.cliproxy-activator/backups/`

## Development

Run the included test script:

```bash
npm test
```

## License

MIT. See `LICENSE`.
