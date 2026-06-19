#!/usr/bin/env node

/**
 * Test script for fogact
 * This simulates the activation flow without making real API calls
 */

const path = require("path");
const fs = require("fs");

console.log("=== FogAct Test Suite ===");
console.log("");

// Test 1: Module loading
console.log("Test 1: Loading modules...");
try {
  const { buildProgram, runCli } = require("../lib/index.js");
  const { verifyActivationCode } = require("../lib/services/cliproxy-api.js");
  const { testNodes, selectBestNode } = require("../lib/services/node-service.js");
  const { createBackup, listBackups } = require("../lib/services/backup-service.js");
  const { writeClaudeConfig } = require("../lib/config/claude.js");
  const { writeCodexConfig } = require("../lib/config/codex.js");
  const { loadUpstreamConfig } = require("../lib/config/upstream.js");
  const { detectPlatforms } = require("../lib/platforms");
  console.log("✓ All modules loaded successfully");
} catch (err) {
  console.log("✗ Module loading failed:", err.message);
  process.exit(1);
}

console.log("");

// Test 2: Node selection logic
console.log("Test 2: Node selection logic...");
try {
  const { selectBestNode } = require("../lib/services/node-service.js");

  const mockResults = [
    { url: "https://node1.example.com", available: true, latency: 150 },
    { url: "https://node2.example.com", available: true, latency: 80 },
    { url: "https://node3.example.com", available: false, latency: -1 },
  ];

  const best = selectBestNode(mockResults);

  if (best && best.url === "https://node2.example.com" && best.latency === 80) {
    console.log("✓ Node selection works correctly");
  } else {
    console.log("✗ Node selection failed");
    process.exit(1);
  }
} catch (err) {
  console.log("✗ Node selection test failed:", err.message);
  process.exit(1);
}

console.log("");

// Test 3: Backup service
console.log("Test 3: Backup service...");
try {
  const { listBackups } = require("../lib/services/backup-service.js");

  const backups = listBackups();
  console.log(`✓ Backup service works (found ${backups.length} backups)`);
} catch (err) {
  console.log("✗ Backup service test failed:", err.message);
  process.exit(1);
}

console.log("");

// Test 4: Config paths
console.log("Test 4: Config path resolution...");
try {
  const { getClaudeConfigPath } = require("../lib/config/claude.js");
  const { getCodexConfigPath, getCodexAuthPath } = require("../lib/config/codex.js");

  const claudePath = getClaudeConfigPath();
  const codexPath = getCodexConfigPath();

  if (claudePath && codexPath) {
    console.log(`✓ Claude config path: ${claudePath}`);
    console.log(`✓ Codex config path: ${codexPath}`);
    console.log(`✓ Codex auth path: ${getCodexAuthPath()}`);
  } else {
    console.log("✗ Config path resolution failed");
    process.exit(1);
  }
} catch (err) {
  console.log("✗ Config path test failed:", err.message);
  process.exit(1);
}

console.log("");

// Test 5: CLI program structure
console.log("Test 5: CLI program structure...");
try {
  const { buildProgram, isNewerVersion } = require("../lib/index.js");

  const program = buildProgram();
  const commands = program.commands.map(cmd => cmd.name());

  const expectedCommands = ["activate", "test", "restore", "web", "interactive", "menu"];
  const hasAllCommands = expectedCommands.every(cmd => commands.includes(cmd));

  if (hasAllCommands) {
    console.log("✓ All CLI commands registered:", commands.join(", "));
    const activateCommand = program.commands.find(cmd => cmd.name() === "activate");
    const optionNames = activateCommand.options.map(option => option.long);
    if (!optionNames.includes("--api-key") || !optionNames.includes("--yes")) {
      console.log("✗ Missing NewAPI activation options");
      process.exit(1);
    }
    if (!isNewerVersion("1.1.7", "1.1.6") || isNewerVersion("1.1.6", "1.1.6") || isNewerVersion("1.1.5", "1.1.6")) {
      console.log("✗ Version comparison failed");
      process.exit(1);
    }
  } else {
    console.log("✗ Missing CLI commands");
    process.exit(1);
  }
} catch (err) {
  console.log("✗ CLI program test failed:", err.message);
  process.exit(1);
}

console.log("");

// Test 6: Frontend files
console.log("Test 6: Frontend files...");
try {
  const frontendPath = path.join(__dirname, "..", "frontend", "index.html");

  if (fs.existsSync(frontendPath)) {
    const content = fs.readFileSync(frontendPath, "utf8");
    if (
      content.includes("FogAct") &&
      content.includes('href="/user/"') &&
      content.includes('href="/admin/"') &&
      content.includes('href="/activate.html"')
    ) {
      console.log("✓ Frontend HTML exists and contains expected content");
    } else {
      console.log("✗ Frontend HTML missing expected content");
      process.exit(1);
    }
  } else {
    console.log("✗ Frontend HTML not found");
    process.exit(1);
  }
} catch (err) {
  console.log("✗ Frontend test failed:", err.message);
  process.exit(1);
}

console.log("");

// Test 7: NewAPI config loading
console.log("Test 7: NewAPI config loading...");
try {
  const { loadUpstreamConfig } = require("../lib/config/upstream.js");
  const config = loadUpstreamConfig({
    configPath: path.join(__dirname, "..", "config", "upstream.example.json"),
  });
  if (config.baseUrl && config.apiKey) {
    console.log(`✓ Upstream config loaded: ${config.baseUrl}`);
  } else {
    console.log("✗ Upstream config missing baseUrl/apiKey");
    process.exit(1);
  }
} catch (err) {
  console.log("✗ NewAPI config test failed:", err.message);
  process.exit(1);
}

console.log("");

// Test 8: Codex config generation
console.log("Test 8: Codex config generation...");
try {
  const { buildCodexConfig } = require("../lib/config/codex.js");
  const config = buildCodexConfig('model = "old"\n[profiles.default]\nmodel = "keep"', 'https://newapi.example.com/v1', 'sk-test');
  if (
    config.includes('model_provider = "yunyi"') &&
    config.includes('base_url = "https://newapi.example.com/v1"') &&
    config.includes('experimental_bearer_token = "sk-test"') &&
    config.includes('[profiles.default]')
  ) {
    console.log("✓ Codex config generation works correctly");
  } else {
    console.log("✗ Codex config generation failed");
    process.exit(1);
  }
} catch (err) {
  console.log("✗ Codex config generation test failed:", err.message);
  process.exit(1);
}

console.log("");

// Test 9: Platform detection
console.log("Test 9: Platform detection...");
try {
  const { detectPlatforms } = require("../lib/platforms");
  const claudePlatforms = detectPlatforms("claude");
  const codexPlatforms = detectPlatforms("codex");
  if (
    claudePlatforms.some(({ platform }) => platform.id === "claude-code") &&
    codexPlatforms.some(({ platform }) => platform.id === "codex-cli") &&
    codexPlatforms.some(({ platform }) => platform.id === "vscode-codex-plugin")
  ) {
    console.log("✓ Platform detection registry works correctly");
  } else {
    console.log("✗ Platform detection registry missing expected platforms");
    process.exit(1);
  }
} catch (err) {
  console.log("✗ Platform detection test failed:", err.message);
  process.exit(1);
}

console.log("");

// Test 10: Activation entitlement filtering
console.log("Test 10: Activation entitlement filtering...");
try {
  const { detectPlatforms } = require("../lib/platforms");
  const { isPlatformAllowed, normalizeEntitlement } = require("../lib/services/activation-orchestrator.js");

  const codexOnly = normalizeEntitlement({
    data: {
      capabilities: {
        services: ["codex"],
      },
    },
  });
  const claudeOnly = normalizeEntitlement({ service: "Claude Code" });
  const codexPlatforms = detectPlatforms("codex").filter((entry) => isPlatformAllowed(entry, codexOnly, "codex"));
  const blockedClaude = detectPlatforms("claude").filter((entry) => isPlatformAllowed(entry, codexOnly, "claude"));
  const claudePlatforms = detectPlatforms("claude").filter((entry) => isPlatformAllowed(entry, claudeOnly, "claude"));

  if (
    codexOnly.services.includes("codex") &&
    codexPlatforms.some(({ platform }) => platform.id === "codex-cli") &&
    blockedClaude.length === 0 &&
    claudePlatforms.some(({ platform }) => platform.id === "claude-code")
  ) {
    console.log("✓ Activation code capability filtering works correctly");
  } else {
    console.log("✗ Activation code capability filtering failed");
    process.exit(1);
  }
} catch (err) {
  console.log("✗ Activation entitlement test failed:", err.message);
  process.exit(1);
}

console.log("");
console.log("=== All Tests Passed ===");
console.log("");
console.log("You can now test the CLI with:");
console.log("  node bin/cli.js --help");
console.log("  node bin/cli.js");
console.log("");
console.log("Or start the web server with:");
console.log("  node bin/web-server.js");
console.log("");
