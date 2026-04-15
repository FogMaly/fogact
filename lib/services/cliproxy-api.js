"use strict";

const https = require("https");
const http = require("http");

// 支持环境变量配置 API 地址
const API_BASE = process.env.CLIPROXY_API_BASE || "http://localhost:34010";

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
        "User-Agent": "cliproxy-activator/1.0.0",
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
    // 调用本地激活 API
    const response = await makeRequest("/api/activate", {
      method: "POST",
      body: {
        code,
        service,
        username: process.env.USER || process.env.USERNAME || "cli-user"
      },
    });

    if (response.status === 200 && response.data.success) {
      return {
        valid: true,
        service: response.data.data.service,
        expiresAt: response.data.data.expiresAt,
        quota: response.data.data.quota,
        nodes: response.data.data.nodes || [],
      };
    }

    return { valid: false, error: response.data.message || "Invalid code" };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

async function getNodes(service) {
  try {
    const response = await makeRequest(`/api/nodes?service=${service}`);

    if (response.status === 200 && Array.isArray(response.data.nodes)) {
      return response.data.nodes;
    }

    // 返回默认节点
    return [
      { name: "Default Node", url: "https://yunyi.cfd", region: "Global" }
    ];
  } catch (err) {
    console.error("Failed to fetch nodes:", err.message);
    // 返回默认节点
    return [
      { name: "Default Node", url: "https://yunyi.cfd", region: "Global" }
    ];
  }
}

async function testNode(nodeUrl) {
  const start = Date.now();

  try {
    const url = new URL("/health", nodeUrl);
    const response = await makeRequest(url.pathname, {
      method: "GET",
      headers: { Host: url.hostname },
    });

    const latency = Date.now() - start;

    return {
      url: nodeUrl,
      available: response.status === 200,
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
  verifyActivationCode,
  getNodes,
  testNode,
};
