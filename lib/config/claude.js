"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

function getClaudeDir() {
  return path.join(os.homedir(), ".claude");
}

function getClaudeSettingsPath() {
  return path.join(getClaudeDir(), "settings.json");
}

function getClaudeStatePath() {
  return path.join(os.homedir(), ".claude.json");
}

function getClaudeConfigPath() {
  return getClaudeSettingsPath();
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function readJsonFile(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    return fallback;
  }
}

function writeJsonFile(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function readClaudeConfig() {
  return readJsonFile(getClaudeSettingsPath(), {});
}

function writeClaudeConfig(apiKey, baseUrl) {
  const settingsPath = getClaudeSettingsPath();
  const statePath = getClaudeStatePath();
  const settings = readJsonFile(settingsPath, {});
  const { ANTHROPIC_API_KEY, ...existingEnv } = settings.env || {};

  writeJsonFile(settingsPath, {
    ...settings,
    env: {
      ...existingEnv,
      ANTHROPIC_BASE_URL: baseUrl,
      ANTHROPIC_AUTH_TOKEN: apiKey,
    },
  });

  const state = readJsonFile(statePath, {});
  writeJsonFile(statePath, {
    ...state,
    hasCompletedOnboarding: true,
  });

  return settingsPath;
}

module.exports = {
  getClaudeDir,
  getClaudeConfigPath,
  getClaudeSettingsPath,
  getClaudeStatePath,
  readClaudeConfig,
  writeClaudeConfig,
};
