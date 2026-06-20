"use strict";

const { execFile } = require("child_process");
const net = require("net");
const { testNode } = require("./fogact-api");

const PROBE_TIMEOUT_MS = 5000;
const ANSI = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
};

function shouldColorize(options = {}) {
  if (options.color === true || process.env.FORCE_COLOR) return true;
  if (options.color === false || process.env.NO_COLOR) return false;
  return Boolean(process.stdout.isTTY);
}

function colorize(value, color, enabled) {
  if (!enabled || !color) return String(value);
  return `${ANSI[color]}${value}${ANSI.reset}`;
}

function latencyColor(latency) {
  if (latency < 60) return "green";
  if (latency < 150) return "yellow";
  return "red";
}

function parseNodeUrl(nodeUrl) {
  const url = new URL(nodeUrl);
  return {
    hostname: url.hostname,
    port: Number(url.port || (url.protocol === "https:" ? 443 : 80)),
    protocol: url.protocol,
  };
}

function execPing(hostname) {
  return new Promise((resolve) => {
    const start = Date.now();
    const child = execFile("ping", ["-c", "1", "-W", "2", hostname], { timeout: 3000 }, (error, stdout) => {
      if (error) {
        resolve({ ok: false, latency: -1, error: error.message });
        return;
      }
      const match = String(stdout).match(/time[=<]([0-9.]+)\s*ms/i);
      resolve({ ok: true, latency: match ? Math.round(Number(match[1])) : Date.now() - start });
    });
    child.on("error", (error) => resolve({ ok: false, latency: -1, error: error.message }));
  });
}

function testTcp(hostname, port, timeout = PROBE_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = net.createConnection({ host: hostname, port });
    let settled = false;

    const done = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeout);
    socket.once("connect", () => done({ ok: true, latency: Date.now() - start }));
    socket.once("timeout", () => done({ ok: false, latency: -1, error: "TCP timeout" }));
    socket.once("error", (error) => done({ ok: false, latency: -1, error: error.message }));
  });
}

async function probeNode(node) {
  const { hostname, port } = parseNodeUrl(node.url);
  const [ping, tcp, http] = await Promise.all([
    execPing(hostname),
    testTcp(hostname, port),
    testNode(node.url),
  ]);

  return {
    ping,
    tcp,
    http: {
      ok: Boolean(http.available),
      latency: Number(http.latency || -1),
      error: http.error,
    },
  };
}

function getSuccessfulLatencies(probes) {
  return probes.flatMap((probe) => [probe.ping, probe.tcp, probe.http])
    .filter((entry) => entry && entry.ok && Number(entry.latency) >= 0)
    .map((entry) => Number(entry.latency));
}

function summarizeProbeResults(probes) {
  const last = probes[probes.length - 1] || {};
  const latencies = getSuccessfulLatencies(probes);
  const avgLatency = latencies.length
    ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
    : -1;
  const latencyStdDev = latencies.length
    ? Math.round(Math.sqrt(latencies.reduce((sum, value) => sum + Math.pow(value - avgLatency, 2), 0) / latencies.length))
    : 0;
  const successRate = probes.length
    ? probes.filter((probe) => probe.tcp?.ok && probe.http?.ok).length / probes.length
    : 0;
  const available = probes.some((probe) => probe.tcp?.ok && probe.http?.ok);

  return {
    available,
    reachable: available,
    latency: avgLatency,
    avgLatency,
    latencyStdDev,
    successRate,
    ping: last.ping || { ok: false, latency: -1 },
    tcp: last.tcp || { ok: false, latency: -1 },
    http: last.http || { ok: false, latency: -1 },
    error: available ? undefined : last.http?.error || last.tcp?.error || last.ping?.error || "节点不可达",
  };
}

async function testNodes(nodes, onProgress = null) {
  const results = [];

  for (const node of nodes) {
    const probes = [];
    for (let index = 0; index < 3; index += 1) {
      probes.push(await probeNode(node));
    }

    const summary = summarizeProbeResults(probes);
    results.push({
      ...node,
      ...summary,
      score: scoreNode(summary),
    });

    if (onProgress) onProgress(node, results.length, nodes.length);
  }

  return results;
}

function scoreNode(result) {
  if (!result.available) return 0;
  const latencyScore = Math.max(0, 100 - Math.round(result.avgLatency / 4));
  const stabilityScore = Math.max(0, 100 - result.latencyStdDev * 2);
  const reliabilityScore = Math.round((result.successRate || 0) * 100);
  const pingBonus = result.ping?.ok ? 5 : 0;
  const tcpBonus = result.tcp?.ok ? 5 : 0;
  return Math.min(100, Math.round(latencyScore * 0.6 + stabilityScore * 0.2 + reliabilityScore * 0.2 + pingBonus + tcpBonus));
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
      ping: result.ping,
      tcp: result.tcp,
    });
}

function selectBestNode(testResults) {
  const available = testResults.filter((result) => result.available);
  if (available.length === 0) return null;
  available.sort((left, right) => getResultScore(right) - getResultScore(left) || getResultLatency(left) - getResultLatency(right));
  return available[0];
}

function sortNodeResults(results) {
  return [...results].sort((left, right) => getResultScore(right) - getResultScore(left) || getResultLatency(left) - getResultLatency(right));
}

function stabilityLabel(stdDev) {
  if (stdDev <= 5) return "稳定";
  if (stdDev <= 15) return "良好";
  if (stdDev <= 30) return "一般";
  return "波动";
}

function padCell(value, width) {
  const text = String(value || "");
  const displayWidth = Array.from(text).reduce((sum, char) => sum + (char.charCodeAt(0) > 0xff ? 2 : 1), 0);
  return `${text}${" ".repeat(Math.max(0, width - displayWidth))}`;
}

function formatProbe(entry, colorEnabled) {
  if (!entry?.ok) return colorize("--", "red", colorEnabled);
  const value = `${entry.latency}ms`;
  return colorize(value, latencyColor(entry.latency), colorEnabled);
}

function formatNodeLine(result, best, colorEnabled) {
  const mark = colorize(result.available ? "✓" : "✗", result.available ? "green" : "red", colorEnabled);
  const name = padCell(result.name || result.url || "FogAct", 12);
  const ping = `ping:${formatProbe(result.ping, colorEnabled)}`;
  const tcp = `tcp:${formatProbe(result.tcp, colorEnabled)}`;
  const http = `http:${formatProbe(result.http, colorEnabled)}`;

  if (!result.available) {
    return `  ${mark} ${name} ${ping} ${tcp} ${http}  ${colorize("不可达", "red", colorEnabled)}`;
  }

  const latency = colorize(`${result.avgLatency}ms`, latencyColor(result.avgLatency), colorEnabled);
  const bestMark = best && best === result ? ` ${colorize("★ 最优", "yellow", colorEnabled)}` : "";
  return `  ${mark} ${name} ${ping} ${tcp} ${http}  ${latency} (±${result.latencyStdDev}ms)  ${stabilityLabel(result.latencyStdDev)}  ${getResultScore(result)}分${bestMark}`;
}

function formatNodeResults(results, options = {}) {
  const sorted = sortNodeResults(results);
  const best = sorted.find((result) => result.available);
  const availableCount = results.filter((result) => result.available).length;
  const lines = [];
  const title = options.title || "节点测试结果";
  const colorEnabled = shouldColorize(options);

  lines.push(`  ${title}`);
  lines.push("  ───────────────────────────────────────────────────");
  lines.push("");

  for (const result of sorted) {
    lines.push(formatNodeLine(result, best, colorEnabled));
  }

  lines.push("");
  lines.push("  ───────────────────────────────────────────────────");
  lines.push(`  测试完成，共 ${results.length} 个节点，${availableCount} 个可用`);
  return lines.join("\n");
}

module.exports = {
  testNodes,
  selectBestNode,
  formatNodeResults,
  sortNodeResults,
  stabilityLabel,
  probeNode,
  testTcp,
  shouldColorize,
};
