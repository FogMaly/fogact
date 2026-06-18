"use strict";

const fs = require("fs");
const { getServiceBaseUrl } = require("../config/upstream");
const {
  getClaudeDir,
  getClaudeSettingsPath,
  getClaudeStatePath,
  writeClaudeConfig,
} = require("../config/claude");

function createClaudeCodePlatform() {
  return {
    id: "claude-code",
    name: "Claude Code",
    services: ["claude"],
    required: true,
    detect() {
      return {
        installed: fs.existsSync(getClaudeDir()) || fs.existsSync(getClaudeSettingsPath()),
        paths: [getClaudeSettingsPath(), getClaudeStatePath()],
      };
    },
    activate(context) {
      const baseUrl = getServiceBaseUrl(context.upstream, "claude");
      const settingsPath = writeClaudeConfig(context.apiKey, baseUrl);
      return {
        success: true,
        files: [settingsPath, getClaudeStatePath()],
      };
    },
  };
}

module.exports = { createClaudeCodePlatform };
