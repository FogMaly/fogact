"use strict";

const prompts = require("prompts");
const { verifyActivationCode, getNodes } = require("../services/fogact-api");
const { testNodes, selectBestNode, formatNodeResults } = require("../services/node-service");
const { createBackup } = require("../services/backup-service");
const { writeClaudeConfig, getClaudeConfigPath } = require("../config/claude");
const { writeCodexConfig, getCodexConfigPath } = require("../config/codex");
const { runActivationWizard } = require("../services/activation-orchestrator");

async function runLegacyCodeActivation(options = {}) {
  console.log("");
  console.log("=== FogAct Activation (Code Mode) ===");
  console.log("");

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

  console.log("");
  console.log("Verifying activation code...");

  const verification = await verifyActivationCode(code, service);

  if (!verification.valid) {
    console.log("");
    console.log("✗ Activation failed:", verification.error);
    return;
  }

  console.log("✓ Activation code verified");
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

  const configPath = service === "claude" ? getClaudeConfigPath() : getCodexConfigPath();

  console.log("");
  console.log("Creating backup...");

  const backupPath = createBackup(service, configPath);

  if (backupPath) {
    console.log(`✓ Backup created: ${backupPath}`);
  } else {
    console.log("ℹ No existing config to backup");
  }

  console.log("");
  console.log("Writing configuration...");

  let writtenPath;
  if (service === "claude") {
    writtenPath = writeClaudeConfig(code, bestNode.url);
  } else {
    writtenPath = writeCodexConfig(code, bestNode.url);
  }

  console.log(`✓ Configuration written: ${writtenPath}`);
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

async function runActivateCommand(options = {}) {
  if (options.legacy && options.code) {
    await runLegacyCodeActivation(options);
    return;
  }

  await runActivationWizard(options);
}

module.exports = { runActivateCommand, runLegacyCodeActivation };
