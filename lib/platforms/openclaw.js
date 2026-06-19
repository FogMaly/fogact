"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { getServiceBaseUrl } = require("../config/upstream");
const { readJsonFile, writeJsonFile } = require("../utils/json-file");

function getOpenClawDir() {
  return path.join(os.homedir(), ".openclaw");
}

function getOpenClawConfigPath() {
  return path.join(getOpenClawDir(), "openclaw.json");
}

function buildClaudeConfig(existingConfig, baseUrl, apiKey) {
  const { models, agents, ...rest } = existingConfig || {};
  const { defaults, ...agentRest } = agents || {};
  return {
    ...rest,
    models: {
      mode: "merge",
      providers: {
        "fogact-claude": {
          baseUrl,
          apiKey,
          auth: "api-key",
          api: "anthropic-messages",
          headers: {},
          authHeader: false,
          models: [],
        },
      },
    },
    agents: {
      ...agentRest,
      defaults: {
        model: {
          primary: "fogact-claude/claude-opus-4-6",
        },
      },
    },
  };
}

function buildCodexConfig(existingConfig, baseUrl, apiKey) {
  const { models, agents, ...rest } = existingConfig || {};
  const { defaults, ...agentRest } = agents || {};
  return {
    ...rest,
    models: {
      mode: "merge",
      providers: {
        "fogact-codex": {
          baseUrl,
          apiKey,
          auth: "api-key",
          api: "openai-responses",
          headers: {},
          authHeader: false,
          models: [
            {
              id: "gpt-5.2",
              name: "GPT 5.2",
              reasoning: true,
              input: ["text", "image"],
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
              contextWindow: 128000,
              maxTokens: 32768,
            },
          ],
        },
      },
    },
    agents: {
      ...agentRest,
      defaults: {
        model: {
          primary: "fogact-codex/gpt-5.2",
        },
      },
    },
  };
}

function createOpenClawPlatform() {
  return {
    id: "openclaw",
    name: "OpenClaw",
    services: ["claude", "codex"],
    required: false,
    detect() {
      return {
        installed: fs.existsSync(getOpenClawConfigPath()),
        paths: [getOpenClawConfigPath()],
      };
    },
    activate(context) {
      const configPath = getOpenClawConfigPath();
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
  createOpenClawPlatform,
  getOpenClawConfigPath,
};
