# CLIProxy Activator

`cliproxy-activator` is a CLI tool for activating Claude Code and Codex against CLIProxyAPI.

## Features

- ✅ Activation code verification
- ✅ Node testing and selection
- ✅ Configuration backup and restore
- ✅ Support for Claude Code and Codex
- ✅ Interactive menu
- ✅ Web UI interface

## Installation

```bash
npm install -g cliproxy-activator
```

## Usage

### Interactive Mode

```bash
cliproxy-activator
```

### Command Line Mode

Activate a service:
```bash
cliproxy-activator activate --service claude --code YOUR_ACTIVATION_CODE
cliproxy-activator activate --service codex --code YOUR_ACTIVATION_CODE
```

Test nodes:
```bash
cliproxy-activator test
```

Restore backup:
```bash
cliproxy-activator restore --service claude
```

### Web UI

Open `frontend/index.html` in your browser for a graphical interface.

Start the web server:
```bash
npm run web
```

Then visit: http://localhost:34010

## Project Layout

- `bin/` - CLI and Web server entry points
- `lib/` - Core command, config, and service logic
- `frontend/` - Static frontend files
- `data/` - Local JSON data
- `test/` - Test scripts
- `docs/` - Guides, delivery notes, and reports
- `scripts/` - Utility scripts for demo, startup, restart, and diagnostics
- `artifacts/` - Generated package artifacts

## Example Activation Codes

- Codex: `K1DHPY3P-4B2W-F1A4-DC4P-Y74TCQZXPNYT`
- Claude: `N6P3BDX4-VCGH-T7MT-EX6J-3SYHEC8RXYX7`

## Configuration Paths

- Claude Code: `~/.claude/config.json`
- Codex: `~/.codex/config.json`
- Backups: `~/.cliproxy-activator/backups/`

## API Integration

This tool integrates with https://yunyi.cfd/user/ for activation code verification and node management.
