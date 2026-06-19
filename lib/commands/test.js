"use strict";

const { getNodes } = require("../services/fogact-api");
const { testNodes, formatNodeResults } = require("../services/node-service");

async function runTestCommand() {
  console.log("");
  console.log("  测试节点");
  console.log("  ─────────────────────────────────────");

  const services = [
    { key: "claude", label: "Claude Code" },
    { key: "codex", label: "Codex" },
  ];

  for (const service of services) {
    console.log("");
    console.log(`  正在测试 ${service.label} 节点...`);
    const nodes = await getNodes(service.key);

    if (nodes.length === 0) {
      console.log("  ℹ 暂无可用节点");
      continue;
    }

    const results = await testNodes(nodes);
    console.log("");
    console.log(formatNodeResults(results));
  }

  console.log("");
}

module.exports = { runTestCommand };
