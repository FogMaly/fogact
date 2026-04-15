"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

function getCodexConfigPath() {
  return path.join(os.homedir(), ".codex", "config.json");
}

function readCodexConfig() {
  const configPath = getCodexConfigPath();

  if (!fs.existsSync(configPath)) {
    return {};
  }

  try {
    const content = fs.readFileSync(configPath, "utf8");
    return JSON.parse(content);
  } catch (err) {
    return {};
  }
}

function writeCodexConfig(activationCode, nodeUrl) {
  const configPath = getCodexConfigPath();
  const configDir = path.dirname(configPath);

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  const config = readCodexConfig();

  config.apiKey = activationCode;
  config.apiUrl = nodeUrl;
  config.activatedAt = new Date().toISOString();
  config.activatedBy = "cliproxy-activator";

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  return configPath;
}

module.exports = {
  getCodexConfigPath,
  readCodexConfig,
  writeCodexConfig,
};
