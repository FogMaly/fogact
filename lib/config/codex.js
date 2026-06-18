"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

const YUNYI_PROVIDER = "yunyi";
const YUNYI_MODEL = "gpt-5.3-codex";
const BLOCK_START = "# >>> yunyi activator codex >>>";
const BLOCK_END = "# <<< yunyi activator codex <<<";

function getCodexDir() {
  return path.join(os.homedir(), ".codex");
}

function getCodexConfigPath() {
  return path.join(getCodexDir(), "config.toml");
}

function getCodexAuthPath() {
  return path.join(getCodexDir(), "auth.json");
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function readCodexConfig() {
  const configPath = getCodexConfigPath();
  if (!fs.existsSync(configPath)) {
    return "";
  }

  try {
    return fs.readFileSync(configPath, "utf8");
  } catch (err) {
    return "";
  }
}

function readCodexAuth() {
  const authPath = getCodexAuthPath();
  if (!fs.existsSync(authPath)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(authPath, "utf8"));
  } catch (err) {
    return {};
  }
}

function stripYunyiBlock(content) {
  const lines = String(content || "").split(/\r?\n/);
  const kept = [];
  let inBlock = false;
  let currentSection = null;
  let inYunyiProvider = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === BLOCK_START) {
      inBlock = true;
      continue;
    }
    if (trimmed === BLOCK_END) {
      inBlock = false;
      continue;
    }
    if (inBlock) {
      continue;
    }

    const section = trimmed.match(/^\[([^\]]+)\]$/);
    if (section) {
      currentSection = section[1].trim();
      inYunyiProvider = currentSection.toLowerCase().startsWith("model_providers.yunyi");
      if (inYunyiProvider) {
        continue;
      }
      kept.push(line);
      continue;
    }

    if (inYunyiProvider) {
      continue;
    }

    const isRootYunyiSetting =
      !currentSection &&
      (
        trimmed === "# 云驿 API 中转配置" ||
        /^#?\s*model_provider\s*=/.test(trimmed) ||
        /^#?\s*model\s*=/.test(trimmed) ||
        /^#?\s*model_reasoning_effort\s*=/.test(trimmed) ||
        /^#?\s*disable_response_storage\s*=/.test(trimmed) ||
        /^#?\s*preferred_auth_method\s*=/.test(trimmed)
      );

    if (!isRootYunyiSetting) {
      kept.push(line);
    }
  }

  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function buildCodexConfig(existingContent, baseUrl, apiKey) {
  const cleaned = stripYunyiBlock(existingContent);
  const yunyiConfig = [
    BLOCK_START,
    `model_provider = "${YUNYI_PROVIDER}"`,
    `model = "${YUNYI_MODEL}"`,
    'model_reasoning_effort = "high"',
    "disable_response_storage = true",
    'preferred_auth_method = "apikey"',
    "",
    `[model_providers.${YUNYI_PROVIDER}]`,
    `name = "${YUNYI_PROVIDER}"`,
    `base_url = "${baseUrl}"`,
    'wire_api = "responses"',
    `experimental_bearer_token = "${apiKey}"`,
    "requires_openai_auth = true",
    BLOCK_END,
  ].join("\n");

  const result = cleaned ? `${yunyiConfig}\n\n${cleaned}` : yunyiConfig;
  return result.endsWith("\n") ? result : `${result}\n`;
}

function writeCodexConfig(apiKey, baseUrl) {
  const configPath = getCodexConfigPath();
  const authPath = getCodexAuthPath();
  ensureDir(getCodexDir());

  const config = buildCodexConfig(readCodexConfig(), baseUrl, apiKey);
  fs.writeFileSync(configPath, config, "utf8");

  const { YUNYI_API_KEY, ...auth } = readCodexAuth();
  fs.writeFileSync(
    authPath,
    JSON.stringify({ ...auth, auth_mode: "apikey", OPENAI_API_KEY: apiKey }, null, 2),
    "utf8"
  );

  return configPath;
}

module.exports = {
  BLOCK_START,
  BLOCK_END,
  YUNYI_MODEL,
  getCodexDir,
  getCodexConfigPath,
  getCodexAuthPath,
  readCodexConfig,
  readCodexAuth,
  stripYunyiBlock,
  buildCodexConfig,
  writeCodexConfig,
};
