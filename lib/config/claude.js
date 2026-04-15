"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

function getClaudeConfigPath() {
  return path.join(os.homedir(), ".claude", "config.json");
}

function readClaudeConfig() {
  const configPath = getClaudeConfigPath();

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

function writeClaudeConfig(activationCode, nodeUrl) {
  const configPath = getClaudeConfigPath();
  const configDir = path.dirname(configPath);

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  const config = readClaudeConfig();

  config.apiKey = activationCode;
  config.apiUrl = nodeUrl;
  config.activatedAt = new Date().toISOString();
  config.activatedBy = "cliproxy-activator";

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  return configPath;
}

module.exports = {
  getClaudeConfigPath,
  readClaudeConfig,
  writeClaudeConfig,
};
