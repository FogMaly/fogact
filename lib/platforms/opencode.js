"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { getServiceBaseUrl } = require("../config/upstream");
const { readJsonFile, writeJsonFile } = require("../utils/json-file");

function getOpenCodeDir() {
  return path.join(os.homedir(), ".config", "opencode");
}

function getOpenCodeConfigPath() {
  return path.join(getOpenCodeDir(), "opencode.json");
}

function buildClaudeConfig(existingConfig, baseUrl, apiKey) {
  const { model, small_model, ...rest } = existingConfig || {};
  const provider = rest.provider || {};
  provider.anthropic = {
    name: "fogact-claude",
    npm: "@ai-sdk/anthropic",
    options: {
      baseURL: baseUrl.replace(/\/+$/, ""),
      apiKey,
    },
  };

  return {
    $schema: "https://opencode.ai/config.json",
    ...rest,
    model: "anthropic/claude-opus-4-6",
    provider,
  };
}

function buildCodexConfig(existingConfig, baseUrl, apiKey) {
  const { model, small_model, ...rest } = existingConfig || {};
  const provider = rest.provider || {};
  provider.openai = {
    name: "fogact-codex",
    npm: "@ai-sdk/openai",
    api: "responses",
    options: {
      baseURL: baseUrl,
      apiKey,
    },
  };

  return {
    $schema: "https://opencode.ai/config.json",
    ...rest,
    model: "openai/gpt-5.3-codex",
    provider,
  };
}

function createOpenCodePlatform() {
  return {
    id: "opencode",
    name: "OpenCode",
    services: ["claude", "codex"],
    required: false,
    detect() {
      return {
        installed: fs.existsSync(getOpenCodeConfigPath()),
        paths: [getOpenCodeConfigPath()],
      };
    },
    activate(context) {
      const configPath = getOpenCodeConfigPath();
      const existingConfig = readJsonFile(configPath, {});
      const baseUrl = getServiceBaseUrl(context.upstream, context.service);
      const nextConfig = context.service === "claude"
        ? buildClaudeConfig(existingConfig, baseUrl, context.apiKey)
        : buildCodexConfig(existingConfig, baseUrl, context.apiKey);

      writeJsonFile(configPath, nextConfig);
      return { success: true, files: [configPath] };
    },
  };
}

module.exports = {
  buildClaudeConfig,
  buildCodexConfig,
  createOpenCodePlatform,
  getOpenCodeConfigPath,
};
