"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

function getExtensionsDir(editor) {
  if (editor === "vscode") {
    return path.join(os.homedir(), ".vscode", "extensions");
  }
  if (editor === "cursor") {
    return path.join(os.homedir(), ".cursor", "extensions");
  }
  throw new Error(`Unsupported editor: ${editor}`);
}

function getEditorName(editor) {
  return editor === "vscode" ? "VSCode" : "Cursor";
}

function findCodexExtensionDir(editor) {
  const extensionsDir = getExtensionsDir(editor);
  if (!fs.existsSync(extensionsDir)) {
    return null;
  }

  const matches = fs.readdirSync(extensionsDir)
    .filter((name) => name.startsWith("openai.chatgpt-"))
    .sort();

  if (matches.length === 0) {
    return null;
  }

  return path.join(extensionsDir, matches[matches.length - 1]);
}

function findWebviewAsset(extensionDir) {
  const assetsDir = path.join(extensionDir, "webview", "assets");
  if (!fs.existsSync(assetsDir)) {
    return null;
  }

  const matches = fs.readdirSync(assetsDir)
    .filter((name) => /^index-[A-Za-z0-9_-]+\.js$/.test(name));

  if (matches.length === 0) {
    return null;
  }

  return path.join(assetsDir, matches[0]);
}

function isPatched(content) {
  return content.includes("email:'云驿YunYi'") || content.includes('email:"云驿YunYi"');
}

function patchCodexExtension(editor) {
  const editorName = getEditorName(editor);
  const extensionDir = findCodexExtensionDir(editor);
  if (!extensionDir) {
    return {
      success: false,
      skipped: true,
      message: `${editorName} Codex 插件未安装`,
    };
  }

  const assetPath = findWebviewAsset(extensionDir);
  if (!assetPath) {
    return {
      success: false,
      skipped: true,
      message: `${editorName} Codex 插件资源文件未找到`,
      files: [extensionDir],
    };
  }

  const content = fs.readFileSync(assetPath, "utf8");
  if (isPatched(content)) {
    return {
      success: true,
      message: `${editorName} Codex 插件已激活`,
      files: [assetPath],
    };
  }

  const pattern = /(\w+)=\{isLoading:(\w+),openAIAuth:(\w+),isCopilotApiAvailable:(\w+),authMethod:(\w+),requiresAuth:(\w+),userId:(\w+),accountId:(\w+),email:(\w+),planAtLogin:(\w+),setAuthMethod:(\w+)\}/;
  const replacement = "$1={isLoading:$2,openAIAuth:$3,isCopilotApiAvailable:$4,authMethod:'chatgpt',requiresAuth:$6,userId:$7,accountId:$8,email:'云驿YunYi',planAtLogin:$10,setAuthMethod:$11}";

  if (!pattern.test(content)) {
    return {
      success: false,
      skipped: true,
      message: `${editorName} Codex 插件版本不兼容`,
      files: [assetPath],
    };
  }

  fs.writeFileSync(assetPath, content.replace(pattern, replacement), "utf8");
  return {
    success: true,
    message: `${editorName} Codex 插件已激活`,
    files: [assetPath],
  };
}

function createEditorCodexPlatform(editor) {
  const editorName = getEditorName(editor);
  return {
    id: `${editor}-codex-plugin`,
    name: `${editorName} Codex 插件`,
    services: ["codex"],
    required: false,
    detect() {
      const extensionsDir = getExtensionsDir(editor);
      const extensionDir = findCodexExtensionDir(editor);
      return {
        installed: Boolean(extensionDir),
        paths: extensionDir ? [extensionDir] : [extensionsDir],
      };
    },
    activate() {
      const result = patchCodexExtension(editor);
      if (result.skipped) {
        return result;
      }
      return result;
    },
  };
}

module.exports = {
  createEditorCodexPlatform,
  findCodexExtensionDir,
  findWebviewAsset,
  patchCodexExtension,
};
