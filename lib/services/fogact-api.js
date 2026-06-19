"use strict";

const packageJson = require("../../package.json");
const https = require("https");
const http = require("http");

// 支持环境变量覆盖 API 地址；默认连接公网 FogAct 面板。
const DEFAULT_API_BASE = "https://cliproxy.fogidc.com";
const API_BASE = process.env.FOGACT_API_BASE || process.env.CLIPROXY_API_BASE || process.env.FOGACT_LEGACY_API_BASE || DEFAULT_API_BASE;

function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const isHttps = url.protocol === "https:";
    const client = isHttps ? https : http;

    const reqOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": `fogact/${packageJson.version}`,
        ...options.headers,
      },
    };

    const req = client.request(reqOptions, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (err) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on("error", (err) => {
      reject(err);
    });

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

async function verifyActivationCode(code, service) {
  try {
    const response = await makeRequest("/api/activate", {
      method: "POST",
      body: {
        code,
        service,
        username: process.env.USER || process.env.USERNAME || "cli-user"
      },
    });

    const normalized = normalizeActivationResponse(response);

    if (response.status >= 200 && response.status < 300 && normalized.valid) {
      return {
        valid: true,
        ...normalized.data,
        data: normalized.data,
        nodes: normalized.data.nodes || [],
      };
    }

    return { valid: false, error: normalized.message || "Invalid code" };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

function normalizeActivationResponse(response) {
  const payload = response && response.data && typeof response.data === "object" ? response.data : {};
  const data = payload.data && typeof payload.data === "object" ? payload.data : payload;
  return {
    valid: Boolean(payload.success || payload.valid),
    message: payload.message,
    data,
  };
}

async function inspectActivationCode(code) {
  try {
    const response = await makeRequest("/api/verify", {
      method: "POST",
      body: { code },
    });
    const normalized = normalizeActivationResponse(response);

    if (response.status >= 200 && response.status < 300 && normalized.valid) {
      return {
        valid: true,
        ...normalized.data,
        data: normalized.data,
      };
    }

    return { valid: false, error: normalized.message || "Invalid activation code" };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

async function redeemActivationCode(code, service) {
  const result = await inspectActivationCode(code);
  return result.valid
    ? { valid: true, service: result.service, expiresAt: result.expiresAt, quota: result.quota, nodes: result.nodes || [] }
    : result;
}

async function getNodes(service) {
  try {
    const response = await makeRequest(`/api/nodes?service=${encodeURIComponent(service || "")}`);

    if (response.status === 200 && Array.isArray(response.data.nodes)) {
      return response.data.nodes;
    }

    return [{ name: "FogAct", url: API_BASE, region: "Global" }];
  } catch (err) {
    return [{ name: "FogAct", url: API_BASE, region: "Global" }];
  }
}

function requestUrl(urlString, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const isHttps = url.protocol === "https:";
    const client = isHttps ? https : http;
    const req = client.request({
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: options.method || "GET",
      headers: { "User-Agent": `fogact/${packageJson.version}`, ...options.headers },
      timeout: options.timeout || 8000,
    }, (res) => {
      res.resume();
      res.on("end", () => resolve({ status: res.statusCode }));
    });
    req.on("timeout", () => req.destroy(new Error("Request timed out")));
    req.on("error", reject);
    req.end();
  });
}

async function testNode(nodeUrl) {
  const start = Date.now();

  try {
    const healthUrl = new URL("/health", nodeUrl).toString();
    const response = await requestUrl(healthUrl);
    const latency = Date.now() - start;

    return {
      url: nodeUrl,
      available: response.status >= 200 && response.status < 500,
      latency,
    };
  } catch (err) {
    return {
      url: nodeUrl,
      available: false,
      latency: -1,
      error: err.message,
    };
  }
}

module.exports = {
  inspectActivationCode,
  redeemActivationCode,
  verifyActivationCode,
  getNodes,
  testNode,
};
