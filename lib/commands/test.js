"use strict";

const { getNodes } = require("../services/fogact-api");
const { testNodes, formatNodeResults } = require("../services/node-service");

function updateProgress(message) {
  if (process.stdout.isTTY) {
    process.stdout.write(`\r  ${message}${" ".repeat(20)}`);
    return;
  }
  console.log(`  ${message}`);
}

function normalizeNodeUrl(value) {
  try {
    const url = new URL(value);
    return url.origin;
  } catch (_error) {
    return String(value || "").replace(/\/$/, "");
  }
}

async function collectUniqueNodes() {
  const services = ["claude", "codex"];
  const byUrl = new Map();

  for (const service of services) {
    const nodes = await getNodes(service);
    for (const node of nodes) {
      const url = normalizeNodeUrl(node.url);
      if (!url || byUrl.has(url)) continue;
      byUrl.set(url, {
        ...node,
        url,
        name: node.name || new URL(url).hostname,
      });
    }
  }

  return [...byUrl.values()];
}

async function runTestCommand() {
  console.log("");
  console.log("  正在测试所有节点...");

  const nodes = await collectUniqueNodes();

  if (nodes.length === 0) {
    console.log("");
    console.log("  ℹ 暂无可用节点");
    console.log("");
    return;
  }

  updateProgress(`测试中... (0/${nodes.length} 完成)`);
  const results = await testNodes(nodes, (_node, done, total) => {
    updateProgress(`测试中... (${done}/${total} 完成)`);
  });

  if (process.stdout.isTTY) {
    process.stdout.write("\r" + " ".repeat(60) + "\r");
  }
  console.log("");
  console.log(formatNodeResults(results));
  console.log("");
}

module.exports = { collectUniqueNodes, runTestCommand };
