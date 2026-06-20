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
  const { selectBestNode, formatNodeResults, stabilityLabel } = require("../lib/services/node-service.js");

  const mockResults = [
    { url: "https://node1.example.com", available: true, latency: 150 },
    { url: "https://node2.example.com", available: true, latency: 80 },
    { url: "https://node3.example.com", available: false, latency: -1 },
  ];

  const best = selectBestNode(mockResults);

  const table = formatNodeResults([
    { name: "FogAct", url: "https://node2.example.com", available: true, avgLatency: 80, latencyStdDev: 4, score: 88, ping: { ok: true, latency: 20 }, tcp: { ok: true, latency: 30 }, http: { ok: true, latency: 80 } },
    { name: "Backup", url: "https://node3.example.com", available: false, avgLatency: -1, latencyStdDev: 0, score: 0, ping: { ok: false, latency: -1 }, tcp: { ok: false, latency: -1 }, http: { ok: false, latency: -1 } },
  ]);
  const colorTable = formatNodeResults([
    { name: "Fast", url: "https://fast.example.com", available: true, avgLatency: 49, latencyStdDev: 4, score: 90, ping: { ok: true, latency: 20 }, tcp: { ok: true, latency: 30 }, http: { ok: true, latency: 49 } },
    { name: "Mid", url: "https://mid.example.com", available: true, avgLatency: 99, latencyStdDev: 4, score: 80, ping: { ok: true, latency: 70 }, tcp: { ok: true, latency: 80 }, http: { ok: true, latency: 99 } },
    { name: "Slow", url: "https://slow.example.com", available: true, avgLatency: 199, latencyStdDev: 4, score: 70, ping: { ok: true, latency: 170 }, tcp: { ok: true, latency: 180 }, http: { ok: true, latency: 199 } },
    { name: "Down", url: "https://down.example.com", available: false, avgLatency: -1, latencyStdDev: 0, score: 0, ping: { ok: false, latency: -1 }, tcp: { ok: false, latency: -1 }, http: { ok: false, latency: -1 } },
  ], { color: true });

  if (
    best &&
    best.url === "https://node2.example.com" &&
    best.latency === 80 &&
    table.includes("节点测试结果") &&
    table.includes("★ 最优") &&
    table.includes("测试完成，共 2 个节点，1 个可用") &&
    table.includes("ping:20ms") &&
    table.includes("tcp:30ms") &&
    table.includes("http:80ms") &&
    !table.includes("推荐节点") &&
    !table.includes("状态 节点") &&
    colorTable.includes("\u001b[32m") &&
    colorTable.includes("\u001b[33m") &&
    colorTable.includes("\u001b[31m") &&
    colorTable.includes("\u001b[33m★ 最优\u001b[0m") &&
    colorTable.includes("\u001b[31m不可达\u001b[0m") &&
    stabilityLabel(40) === "波动"
  ) {
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
    clearScreen,
    disableMenuMouseCapture,
    enableMenuMouseCapture,
    enterFixedMenuScreen,
    leaveFixedMenuScreen,
    renderMenu,
    shouldUseFixedMenuScreen,
    waitForMenuReturn,
  } = require("../lib/index.js");
  const repeated = applyMenuInput("\u001b[B\u001b[B\u001b[A", 0, 4);
  const wheelIgnored = applyMenuInput("\u001b[<64;20;10M\u001b[<64;20;10m", 1, 4);
  const wrapped = applyMenuInput("\u001b[A", 0, 4);
  const numberSelect = applyMenuInput("3", 0, 4);
  const enter = applyMenuInput("\r", 2, 4);
  const menu = renderMenu(0);
  const writes = [];
  const fakeTty = { isTTY: true, write: (value) => writes.push(value) };
  enterFixedMenuScreen(fakeTty);
  enableMenuMouseCapture(fakeTty);
  clearScreen(fakeTty);
  disableMenuMouseCapture(fakeTty);
  leaveFixedMenuScreen(fakeTty);

  if (
    repeated.cursor !== 1 ||
    wheelIgnored.cursor !== 1 ||
    wheelIgnored.action !== null ||
    wrapped.cursor !== 3 ||
    numberSelect.cursor !== 2 ||
    numberSelect.action !== "submit" ||
    enter.action !== "submit" ||
    !shouldUseFixedMenuScreen({ TERM: "xterm-256color" }, fakeTty) ||
    shouldUseFixedMenuScreen({ TERM: "dumb" }, fakeTty) ||
    !writes[0].includes("\u001b[?1049h") ||
    !writes[1].includes("\u001b[H\u001b[2J\u001b[3J") ||
    !writes.some((value) => value.includes("\u001b[?1000h")) ||
    !writes.some((value) => value.includes("\u001b[?1000l")) ||
    !writes.some((value) => value.includes("\u001b[?1049l")) ||
    typeof waitForMenuReturn !== "function" ||
    !menu.includes("❯ \u001b[36m1. 激活服务\u001b[0m") ||
    menu.includes("\u001b[36m2. 测试节点\u001b[0m")
  ) {
    console.log("✗ Interactive menu key parsing failed");
    process.exit(1);
  }
  const secondMenu = renderMenu(1);
  if (!secondMenu.includes("❯ \u001b[36m2. 测试节点\u001b[0m") || secondMenu.includes("\u001b[36m1. 激活服务\u001b[0m")) {
    console.log("✗ Interactive menu selected highlight failed");
    process.exit(1);
  }
  console.log("✓ Interactive menu handles repeated arrows, shortcuts, cleanup, and selected highlight");
} catch (err) {
  console.log("✗ Interactive menu key parsing test failed:", err.message);
  process.exit(1);
}

// Test 6c: Activation profile formatting
console.log("Test 6c: Activation profile formatting...");
try {
  const { formatNodeChoice, formatQuotaValue, getQuotaInfo, progressBar } = require("../lib/services/activation-orchestrator.js");
  const quota = getQuotaInfo({ raw: { quota: { daily_quota: 260, daily_spent: 247.33, unit: "balance" } } });
  const nodeChoice = formatNodeChoice({ name: "CF国外节点1", available: true, avgLatency: 11, latencyStdDev: 475, score: 74 });
  if (
    quota.progress !== 95 ||
    formatQuotaValue(quota.daily, quota.unit) !== "$260.00" ||
    formatQuotaValue(quota.remaining, quota.unit) !== "$12.67" ||
    !progressBar(95).includes("95%") ||
    !nodeChoice.includes("CF国外节点1") ||
    !nodeChoice.includes("波动")
  ) {
    console.log("✗ Activation profile formatting failed");
    process.exit(1);
  }
  console.log("✓ Activation profile formatting matches yunyi-style quota summary");
} catch (err) {
  console.log("✗ Activation profile formatting test failed:", err.message);
  process.exit(1);
}

// Test 6d: Activation final summary formatting
console.log("Test 6d: Activation final summary formatting...");
try {
  const { printResultSummary } = require("../lib/services/activation-orchestrator.js");
  const originalLog = console.log;
  const lines = [];
  console.log = (value = "") => lines.push(String(value));
  try {
    printResultSummary("claude", null, [
      { platform: { id: "claude-code", name: "Claude Code" }, result: { success: true, files: ["/root/.claude/settings.json", "/root/.claude.json"] } },
      { platform: { id: "opencode", name: "OpenCode" }, result: { success: false, skipped: true } },
      { platform: { id: "openclaw", name: "OpenClaw" }, result: { success: false, skipped: true } },
    ]);
  } finally {
    console.log = originalLog;
  }
  const output = lines.join("\n");
  if (
    !output.includes("✓ Claude Code 已激活") ||
    !output.includes("配置: ") ||
    !output.includes("已跳过 OpenCode 配置") ||
    !output.includes("请重启 Claude Code 以应用新配置")
  ) {
    console.log("✗ Activation final summary formatting failed");
    process.exit(1);
  }
  console.log("✓ Activation final summary matches yunyi-style output");
} catch (err) {
  console.log("✗ Activation final summary formatting test failed:", err.message);
  process.exit(1);
}

// Test 6b: Backup display formatting
console.log("Test 6b: Backup display formatting...");
try {
  const { formatBackupTitle } = require("../lib/commands/restore.js");
  const title = formatBackupTitle({
    service: "codex",
    timestamp: "2026-06-19T12:00:00.000Z",
    files: [{ originalPath: "/tmp/config.toml" }, { originalPath: "/tmp/auth.json" }],
  });
  if (!title.includes("Codex") || !title.includes("2 个文件")) {
    console.log("✗ Backup display formatting failed");
    process.exit(1);
  }
  console.log("✓ Backup display formatting works correctly");
} catch (err) {
  console.log("✗ Backup display formatting test failed:", err.message);
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
  const { buildCodexConfig, FOGACT_MODEL } = require("../lib/config/codex.js");
  const config = buildCodexConfig('model = "old"\n[profiles.default]\nmodel = "keep"', 'https://cliproxy.fogidc.com/v1', 'FOGACT-TEST-CODE');
  if (
    config.includes('model_provider = "fogact"') &&
    config.includes(`model = "${FOGACT_MODEL}"`) &&
    FOGACT_MODEL === "gpt-5.5" &&
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

// Test 9b: Optional Codex platform models
console.log("Test 9b: Optional Codex platform models...");
try {
  const { FOGACT_MODEL } = require("../lib/config/codex.js");
  const { buildCodexConfig: buildOpenCodeCodexConfig } = require("../lib/platforms/opencode.js");
  const { buildCodexConfig: buildOpenClawCodexConfig } = require("../lib/platforms/openclaw.js");
  const openCodeConfig = buildOpenCodeCodexConfig({}, "https://cliproxy.fogidc.com/v1", "FOGACT-TEST-CODE");
  const openClawConfig = buildOpenClawCodexConfig({}, "https://cliproxy.fogidc.com/v1", "FOGACT-TEST-CODE");

  if (
    openCodeConfig.model !== `openai/${FOGACT_MODEL}` ||
    openClawConfig.models.providers["fogact-codex"].models[0].id !== FOGACT_MODEL ||
    openClawConfig.agents.defaults.model.primary !== `fogact-codex/${FOGACT_MODEL}`
  ) {
    console.log("✗ Optional Codex platform model defaults failed");
    process.exit(1);
  }
  console.log("✓ Optional Codex platform models use latest default");
} catch (err) {
  console.log("✗ Optional Codex platform model test failed:", err.message);
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
