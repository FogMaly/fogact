#!/usr/bin/env node

/**
 * Test script for cliproxy-activator
 * This simulates the activation flow without making real API calls
 */

const path = require("path");
const fs = require("fs");

console.log("=== CLIProxy Activator Test Suite ===");
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
  const { getCodexConfigPath } = require("../lib/config/codex.js");

  const claudePath = getClaudeConfigPath();
  const codexPath = getCodexConfigPath();

  if (claudePath && codexPath) {
    console.log(`✓ Claude config path: ${claudePath}`);
    console.log(`✓ Codex config path: ${codexPath}`);
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
  const { buildProgram } = require("../lib/index.js");

  const program = buildProgram();
  const commands = program.commands.map(cmd => cmd.name());

  const expectedCommands = ["activate", "test", "restore", "interactive"];
  const hasAllCommands = expectedCommands.every(cmd => commands.includes(cmd));

  if (hasAllCommands) {
    console.log("✓ All CLI commands registered:", commands.join(", "));
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
    if (content.includes("CLIProxy Activator") && content.includes("yunyi.cfd")) {
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
console.log("=== All Tests Passed ===");
console.log("");
console.log("You can now test the CLI with:");
console.log("  node bin/cli.js --help");
console.log("  node bin/cli.js");
console.log("");
console.log("Or start the web server with:");
console.log("  node bin/web-server.js");
console.log("");
