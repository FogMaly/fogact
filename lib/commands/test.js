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

async function collectServiceNodes(services) {
  const allNodes = [];
  for (const service of services) {
    const nodes = await getNodes(service.key);
    for (const node of nodes) {
      allNodes.push({
        ...node,
        name: node.name || "FogAct",
        service: service.key,
        serviceLabel: service.label,
      });
    }
  }
  return allNodes;
}

async function runTestCommand() {
  console.log("");
  console.log("  正在测试所有节点...");

  const services = [
    { key: "claude", label: "Claude" },
    { key: "codex", label: "Codex" },
  ];
  const nodes = await collectServiceNodes(services);

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

module.exports = { runTestCommand };
