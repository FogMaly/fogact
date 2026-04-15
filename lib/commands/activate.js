"use strict";

const prompts = require("prompts");
const { verifyActivationCode, getNodes } = require("../services/cliproxy-api");
const { testNodes, selectBestNode, formatNodeResults } = require("../services/node-service");
const { createBackup } = require("../services/backup-service");
const { writeClaudeConfig, getClaudeConfigPath } = require("../config/claude");
const { writeCodexConfig, getCodexConfigPath } = require("../config/codex");

async function runActivateCommand(options = {}) {
  console.log("");
  console.log("=== CLIProxy Activation ===");
  console.log("");

  // Step 1: Select service
  let service = options.service;
  if (!service) {
    const response = await prompts({
      type: "select",
      name: "service",
      message: "Select service to activate",
      choices: [
        { title: "Claude Code", value: "claude" },
        { title: "Codex", value: "codex" },
      ],
    });

    if (!response.service) {
      console.log("Activation cancelled.");
      return;
    }

    service = response.service;
  }

  // Step 2: Get activation code
  let code = options.code;
  if (!code) {
    const response = await prompts({
      type: "text",
      name: "code",
      message: "Enter activation code",
      validate: (value) => value.length > 0 || "Activation code is required",
    });

    if (!response.code) {
      console.log("Activation cancelled.");
      return;
    }

    code = response.code;
  }

  // Step 3: Verify activation code
  console.log("");
  console.log("Verifying activation code...");

  const verification = await verifyActivationCode(code, service);

  if (!verification.valid) {
    console.log("");
    console.log("✗ Activation failed:", verification.error);
    return;
  }

  console.log("✓ Activation code verified");

  // Step 4: Get and test nodes
  console.log("");
  console.log("Testing available nodes...");

  let nodes = verification.nodes;
  if (!nodes || nodes.length === 0) {
    nodes = await getNodes(service);
  }

  if (nodes.length === 0) {
    console.log("✗ No nodes available");
    return;
  }

  const testResults = await testNodes(nodes);
  console.log("");
  console.log(formatNodeResults(testResults));

  const bestNode = selectBestNode(testResults);

  if (!bestNode) {
    console.log("");
    console.log("✗ No available nodes found");
    return;
  }

  console.log("");
  console.log(`✓ Selected node: ${bestNode.name || bestNode.url} (${bestNode.latency}ms)`);

  // Step 5: Create backup
  const configPath = service === "claude" ? getClaudeConfigPath() : getCodexConfigPath();

  console.log("");
  console.log("Creating backup...");

  const backupPath = createBackup(service, configPath);

  if (backupPath) {
    console.log(`✓ Backup created: ${backupPath}`);
  } else {
    console.log("ℹ No existing config to backup");
  }

  // Step 6: Write configuration
  console.log("");
  console.log("Writing configuration...");

  let writtenPath;
  if (service === "claude") {
    writtenPath = writeClaudeConfig(code, bestNode.url);
  } else {
    writtenPath = writeCodexConfig(code, bestNode.url);
  }

  console.log(`✓ Configuration written: ${writtenPath}`);

  // Step 7: Success
  console.log("");
  console.log("=== Activation Complete ===");
  console.log("");
  console.log(`Service: ${service === "claude" ? "Claude Code" : "Codex"}`);
  console.log(`Node: ${bestNode.url}`);
  console.log(`Config: ${writtenPath}`);
  console.log("");
  console.log("Please restart your application to apply changes.");
  console.log("");
}

module.exports = { runActivateCommand };
