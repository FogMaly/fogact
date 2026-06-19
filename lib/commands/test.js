"use strict";

const { getNodes } = require("../services/fogact-api");
const { testNodes, formatNodeResults } = require("../services/node-service");

async function runTestCommand() {
  console.log("");
  console.log("=== Node Testing ===");
  console.log("");

  // Test Claude nodes
  console.log("Testing Claude Code nodes...");
  const claudeNodes = await getNodes("claude");

  if (claudeNodes.length > 0) {
    const claudeResults = await testNodes(claudeNodes);
    console.log("");
    console.log(formatNodeResults(claudeResults));
  } else {
    console.log("  No Claude nodes available");
  }

  console.log("");

  // Test Codex nodes
  console.log("Testing Codex nodes...");
  const codexNodes = await getNodes("codex");

  if (codexNodes.length > 0) {
    const codexResults = await testNodes(codexNodes);
    console.log("");
    console.log(formatNodeResults(codexResults));
  } else {
    console.log("  No Codex nodes available");
  }

  console.log("");
}

module.exports = { runTestCommand };
