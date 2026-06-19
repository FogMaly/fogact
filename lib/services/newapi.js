"use strict";

const http = require("http");
const https = require("https");

function buildModelsUrl(baseUrl) {
  const normalized = String(baseUrl || "").replace(/\/+$/, "");
  if (!normalized) {
    throw new Error("NewAPI baseUrl is required");
  }
  return normalized.endsWith("/v1") ? `${normalized}/models` : `${normalized}/v1/models`;
}

function requestJson(urlString, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const isHttps = url.protocol === "https:";
    const client = isHttps ? https : http;
    const timeoutMs = options.timeoutMs || 10000;

    const req = client.request(
      {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: options.method || "GET",
        headers: options.headers || {},
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk.toString();
        });
        res.on("end", () => {
          let data = body;
          try {
            data = body ? JSON.parse(body) : null;
          } catch (err) {
            // Keep raw response body.
          }
          resolve({ status: res.statusCode, data });
        });
      }
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
    });
    req.on("error", reject);
    req.end();
  });
}

async function verifyNewApiKey(config, apiKey) {
  const modelsUrl = buildModelsUrl(config.baseUrl);
  const response = await requestJson(modelsUrl, {
    timeoutMs: config.timeoutMs,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "User-Agent": "fogact/1.1.4",
    },
  });

  if (response.status >= 200 && response.status < 300) {
    return {
      valid: true,
      status: response.status,
      modelsUrl,
      models: Array.isArray(response.data && response.data.data) ? response.data.data : [],
    };
  }

  return {
    valid: false,
    status: response.status,
    modelsUrl,
    error: typeof response.data === "object" && response.data
      ? response.data.error?.message || response.data.message || JSON.stringify(response.data)
      : String(response.data || `HTTP ${response.status}`),
  };
}

function maskKey(apiKey) {
  const value = String(apiKey || "");
  if (value.length <= 10) {
    return value ? "***" : "";
  }
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

module.exports = {
  buildModelsUrl,
  maskKey,
  requestJson,
  verifyNewApiKey,
};
