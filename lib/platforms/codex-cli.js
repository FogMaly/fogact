"use strict";

const fs = require("fs");
const { getServiceBaseUrl } = require("../config/upstream");
const {
  getCodexDir,
  getCodexConfigPath,
  getCodexAuthPath,
  writeCodexConfig,
} = require("../config/codex");

function createCodexCliPlatform() {
  return {
    id: "codex-cli",
    name: "Codex CLI",
    services: ["codex"],
    required: true,
    detect() {
      return {
        installed: fs.existsSync(getCodexDir()) || fs.existsSync(getCodexConfigPath()) || fs.existsSync(getCodexAuthPath()),
        paths: [getCodexConfigPath(), getCodexAuthPath()],
      };
    },
    activate(context) {
      const baseUrl = getServiceBaseUrl(context.upstream, "codex");
      const configPath = writeCodexConfig(context.apiKey, baseUrl);
      return {
        success: true,
        files: [configPath, getCodexAuthPath()],
      };
    },
  };
}

module.exports = { createCodexCliPlatform };
