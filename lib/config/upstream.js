"use strict";

const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.join(__dirname, "..", "..");
const DEFAULT_CONFIG_PATH = path.join(PROJECT_ROOT, "config", "upstream.json");
const EXAMPLE_CONFIG_PATH = path.join(PROJECT_ROOT, "config", "upstream.example.json");

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    throw new Error(`Invalid upstream config JSON: ${filePath}`);
  }
}

function trimTrailingSlash(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function loadUpstreamConfig(options = {}) {
  const configPath = options.configPath || process.env.FOGACT_UPSTREAM_CONFIG || DEFAULT_CONFIG_PATH;
  const fileConfig = readJsonFile(configPath);
  const baseUrl = trimTrailingSlash(
    process.env.NEWAPI_BASE_URL ||
    process.env.UPSTREAM_BASE_URL ||
    fileConfig.baseUrl ||
    fileConfig.url
  );
  const apiKey = String(
    process.env.NEWAPI_API_KEY ||
    process.env.UPSTREAM_API_KEY ||
    fileConfig.apiKey ||
    fileConfig.key ||
    ""
  ).trim();
  const timeoutMs = parseInt(
    process.env.NEWAPI_TIMEOUT_MS || fileConfig.timeoutMs || "10000",
    10
  ) || 10000;

  return {
    provider: fileConfig.provider || "newapi",
    baseUrl,
    apiKey,
    services: fileConfig.services || {},
    timeoutMs,
    configPath,
    configured: Boolean(baseUrl && apiKey),
  };
}

function getServiceBaseUrl(config, service) {
  if (config && config.proxy === true && config.baseUrl) {
    return trimTrailingSlash(config.baseUrl);
  }
  const serviceConfig = (config.services && config.services[service]) || {};
  return trimTrailingSlash(serviceConfig.baseUrl || config.baseUrl);
}

function requireUpstreamConfig(options = {}) {
  const config = loadUpstreamConfig(options);
  if (!config.configured) {
    throw new Error(
      `Upstream NewAPI config is incomplete. Copy ${path.relative(PROJECT_ROOT, EXAMPLE_CONFIG_PATH)} to ${path.relative(PROJECT_ROOT, DEFAULT_CONFIG_PATH)} and set baseUrl/apiKey, or use NEWAPI_BASE_URL and NEWAPI_API_KEY.`
    );
  }
  return config;
}

module.exports = {
  DEFAULT_CONFIG_PATH,
  EXAMPLE_CONFIG_PATH,
  getServiceBaseUrl,
  loadUpstreamConfig,
  requireUpstreamConfig,
};
