"use strict";

const { testNode } = require("./cliproxy-api");

async function testNodes(nodes) {
  const results = [];

  for (const node of nodes) {
    const result = await testNode(node.url);
    results.push({
      ...node,
      ...result,
    });
  }

  return results;
}

function selectBestNode(testResults) {
  const available = testResults.filter((r) => r.available);

  if (available.length === 0) {
    return null;
  }

  available.sort((a, b) => a.latency - b.latency);

  return available[0];
}

function formatNodeResults(results) {
  const lines = [];

  for (const result of results) {
    const status = result.available ? "✓" : "✗";
    const latency = result.available ? `${result.latency}ms` : "N/A";
    const name = result.name || result.url;

    lines.push(`  ${status} ${name} - ${latency}`);
  }

  return lines.join("\n");
}

module.exports = {
  testNodes,
  selectBestNode,
  formatNodeResults,
};
