"use strict";

const { testNode } = require("./fogact-api");

async function testNodes(nodes, onProgress = null) {
  const results = [];

  for (const node of nodes) {
    if (onProgress) onProgress(node, results.length, nodes.length);
    const probes = [];
    for (let index = 0; index < 3; index += 1) {
      const result = await testNode(node.url);
      probes.push(result);
    }

    const availableProbes = probes.filter((probe) => probe.available);
    const latencies = availableProbes.map((probe) => probe.latency);
    const avgLatency = latencies.length
      ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
      : -1;
    const latencyStdDev = latencies.length
      ? Math.round(Math.sqrt(latencies.reduce((sum, value) => sum + Math.pow(value - avgLatency, 2), 0) / latencies.length))
      : 0;
    const successRate = availableProbes.length / probes.length;
    const available = successRate > 0 && avgLatency >= 0;

    results.push({
      ...node,
      available,
      reachable: available,
      latency: avgLatency,
      avgLatency,
      latencyStdDev,
      successRate,
      score: scoreNode({ available, avgLatency, latencyStdDev, successRate }),
      error: available ? undefined : probes.find((probe) => probe.error)?.error || "节点不可达",
    });
  }

  return results;
}

function scoreNode(result) {
  if (!result.available) return 0;
  const latencyScore = Math.max(0, 100 - Math.round(result.avgLatency / 4));
  const stabilityScore = Math.max(0, 100 - result.latencyStdDev * 2);
  const reliabilityScore = Math.round((result.successRate || 0) * 100);
  return Math.round(latencyScore * 0.7 + stabilityScore * 0.2 + reliabilityScore * 0.1);
}

function getResultLatency(result) {
  return typeof result.avgLatency === "number" && result.avgLatency >= 0
    ? result.avgLatency
    : result.latency;
}

function getResultScore(result) {
  return typeof result.score === "number"
    ? result.score
    : scoreNode({
      available: result.available,
      avgLatency: getResultLatency(result),
      latencyStdDev: result.latencyStdDev || 0,
      successRate: result.successRate || (result.available ? 1 : 0),
    });
}

function selectBestNode(testResults) {
  const available = testResults.filter((result) => result.available);
  if (available.length === 0) return null;
  available.sort((left, right) => getResultScore(right) - getResultScore(left) || getResultLatency(left) - getResultLatency(right));
  return available[0];
}

function latencyLabel(latency) {
  if (latency <= 50) return `${latency}ms`;
  if (latency <= 100) return `${latency}ms`;
  if (latency <= 300) return `${latency}ms`;
  return `${latency}ms`;
}

function stabilityLabel(stdDev) {
  if (stdDev <= 5) return "稳定";
  if (stdDev <= 15) return "良好";
  if (stdDev <= 30) return "一般";
  return "波动";
}

function formatNodeResults(results) {
  const sorted = [...results].sort((left, right) => right.score - left.score || left.avgLatency - right.avgLatency);
  const best = sorted.find((result) => result.available);
  const lines = [];

  lines.push("  节点测试结果");
  lines.push("  ───────────────────────────────────────────────────");
  lines.push("");

  for (const result of sorted) {
    const mark = result.available ? "✓" : "✗";
    const name = String(result.name || result.url).padEnd(10);
    if (!result.available) {
      lines.push(`  ${mark} ${name} 不可达`);
      continue;
    }
    const bestMark = best && best.url === result.url ? " ★ 最优" : "";
    lines.push(`  ${mark} ${name} ${latencyLabel(result.avgLatency)} (±${result.latencyStdDev}ms)  ${stabilityLabel(result.latencyStdDev)}  ${result.score}分${bestMark}`);
  }

  const availableCount = results.filter((result) => result.available).length;
  lines.push("");
  lines.push("  ───────────────────────────────────────────────────");
  lines.push(`  测试完成，共 ${results.length} 个节点，${availableCount} 个可用`);
  return lines.join("\n");
}

module.exports = {
  testNodes,
  selectBestNode,
  formatNodeResults,
};
