"use strict";

const { createClaudeCodePlatform } = require("./claude-code");
const { createCodexCliPlatform } = require("./codex-cli");
const { createOpenCodePlatform } = require("./opencode");
const { createOpenClawPlatform } = require("./openclaw");
const { createEditorCodexPlatform } = require("./editor-codex");

function getPlatforms() {
  return [
    createClaudeCodePlatform(),
    createCodexCliPlatform(),
    createOpenCodePlatform(),
    createOpenClawPlatform(),
    createEditorCodexPlatform("vscode"),
    createEditorCodexPlatform("cursor"),
  ];
}

function detectPlatforms(service) {
  return getPlatforms()
    .filter((platform) => platform.services.includes(service))
    .map((platform) => ({
      platform,
      detection: platform.detect(),
    }));
}

module.exports = {
  detectPlatforms,
  getPlatforms,
};
