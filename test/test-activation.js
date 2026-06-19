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
  const { buildProgram, runCli, applyMenuInput } = require("../lib/index.js");
  const { verifyActivationCode } = require("../lib/services/fogact-api.js");
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
    const wizardCommand = program.commands.find(cmd => cmd.name() === "wizard");
    const activateOptions = activateCommand.options.map(option => option.long);
    const wizardOptions = wizardCommand.options.map(option => option.long);
    if (!activateOptions.includes("--code") || !activateOptions.includes("--yes")) {
      console.log("✗ Missing activation code options");
      process.exit(1);
    }
    const blockedUserOptions = ["--api-key", "--upstream-config", "--skip-verify"];
    if (blockedUserOptions.some(option => activateOptions.includes(option) || wizardOptions.includes(option))) {
      console.log("✗ User CLI still exposes upstream credential options");
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

// Test 6: Interactive menu key parsing
console.log("Test 6: Interactive menu key parsing...");
try {
  const {
    applyMenuInput,
    enterFixedMenuScreen,
    leaveFixedMenuScreen,
    shouldUseFixedMenuScreen,
  } = require("../lib/index.js");
  const repeated = applyMenuInput("\u001b[B\u001b[B\u001b[A", 0, 4);
  const wrapped = applyMenuInput("\u001b[A", 0, 4);
  const numberSelect = applyMenuInput("3", 0, 4);
  const enter = applyMenuInput("\r", 2, 4);
  const writes = [];
  const fakeTty = { isTTY: true, write: (value) => writes.push(value) };
  enterFixedMenuScreen(fakeTty);
  leaveFixedMenuScreen(fakeTty);

  if (
    repeated.cursor !== 1 ||
    wrapped.cursor !== 3 ||
    numberSelect.cursor !== 2 ||
    numberSelect.action !== "submit" ||
    enter.action !== "submit" ||
    !shouldUseFixedMenuScreen({ TERM: "xterm-256color" }, fakeTty) ||
    shouldUseFixedMenuScreen({ TERM: "dumb" }, fakeTty) ||
    !writes[0].includes("\u001b[?1049h") ||
    !writes[1].includes("\u001b[?1049l")
  ) {
    console.log("✗ Interactive menu key parsing failed");
    process.exit(1);
  }
  console.log("✓ Interactive menu handles repeated arrows and shortcuts");
} catch (err) {
  console.log("✗ Interactive menu key parsing test failed:", err.message);
  process.exit(1);
}

// Test 7: Frontend files
console.log("Test 7: Frontend files...");
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

// Test 8: NewAPI config loading
console.log("Test 8: NewAPI config loading...");
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

// Test 9: Codex proxy config generation
console.log("Test 9: Codex proxy config generation...");
try {
  const { buildCodexConfig } = require("../lib/config/codex.js");
  const config = buildCodexConfig('model = "old"\n[profiles.default]\nmodel = "keep"', 'https://cliproxy.fogidc.com/v1', 'FOGACT-TEST-CODE');
  if (
    config.includes('model_provider = "fogact"') &&
    config.includes('base_url = "https://cliproxy.fogidc.com/v1"') &&
    config.includes('experimental_bearer_token = "FOGACT-TEST-CODE"') &&
    config.includes('[profiles.default]')
  ) {
    console.log("✓ Codex proxy config generation works correctly");
  } else {
    console.log("✗ Codex proxy config generation failed");
    process.exit(1);
  }
} catch (err) {
  console.log("✗ Codex proxy config generation test failed:", err.message);
  process.exit(1);
}

console.log("");

// Test 10: Platform detection
console.log("Test 10: Platform detection...");
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

// Test 11: Activation entitlement filtering
console.log("Test 11: Activation entitlement filtering...");
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

// Test 11: Reusable activation code response handling
console.log("Test 12: Reusable activation semantics...");
try {
  const { normalizeEntitlement } = require("../lib/services/activation-orchestrator.js");

  const entitlement = normalizeEntitlement({
    success: true,
    valid: true,
    data: {
      service: "Codex",
      status: "active",
      proxy: true,
      publicBaseUrl: "https://cliproxy.fogidc.com",
      baseUrl: "https://cliproxy.fogidc.com/v1",
      apiKey: "FOGACT-TEST-CODE",
      quota: { total: 1000, used: 0 },
    },
  });

  if (!entitlement.services.includes("codex")) {
    console.log("✗ Active activation code was not treated as reusable");
    process.exit(1);
  }
  console.log("✓ Active activation code can be reused for configuration");
} catch (err) {
  console.log("✗ Reusable activation semantic test failed:", err.message);
  process.exit(1);
}

// Test 12: Proxy entitlement does not expose upstream configuration
console.log("Test 13: Proxy entitlement isolation...");
try {
  const { normalizeEntitlement } = require("../lib/services/activation-orchestrator.js");

  const entitlement = normalizeEntitlement({
    success: true,
    valid: true,
    data: {
      service: "Codex",
      proxy: true,
      publicBaseUrl: "https://cliproxy.fogidc.com",
      baseUrl: "https://cliproxy.fogidc.com/v1",
      apiKey: "FOGACT-TEST-CODE",
    },
  });
  const serialized = JSON.stringify(entitlement);

  if (
    !serialized.includes("https://cliproxy.fogidc.com/v1") ||
    !serialized.includes("FOGACT-TEST-CODE") ||
    serialized.includes("upstream.internal.invalid") ||
    serialized.includes("newapi.example.com") ||
    serialized.includes("PRIVATE_UPSTREAM_KEY")
  ) {
    console.log("✗ Proxy entitlement leaked or missed critical activation data");
    process.exit(1);
  }
  console.log("✓ Proxy entitlement only carries FogAct endpoint and activation code");
} catch (err) {
  console.log("✗ Proxy entitlement isolation test failed:", err.message);
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
