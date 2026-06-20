"use strict";

const prompts = require("prompts");
const { listBackups, restoreBackup, clearBackups } = require("../services/backup-service");
const { boldGreen, boldRed, boldWhite, cyan, gray, green, magenta, red, white, yellow } = require("../utils/colors");

function getServiceLabel(service) {
  if (service === "codex") return "Codex";
  if (service === "claude") return "Claude Code";
  return service || "未知服务";
}

function getBackupFiles(backup) {
  if (Array.isArray(backup.files)) {
    return backup.files.map((file) => ({
      originalPath: file.originalPath,
      backupName: file.backupName || file.originalPath,
      size: file.size || 0,
    })).filter((file) => file.originalPath);
  }
  return [backup.originalPath].filter(Boolean).map((originalPath) => ({
    originalPath,
    backupName: originalPath,
    size: Buffer.byteLength(String(backup.content || ""), "utf8"),
  }));
}

function formatBackupTime(backup) {
  const date = backup.createdAt || backup.timestamp ? new Date(backup.createdAt || backup.timestamp) : null;
  if (!date || Number.isNaN(date.getTime())) return "未知时间";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatFileSize(size) {
  const value = Number(size || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function getBackupTotalSize(backup) {
  if (Number.isFinite(Number(backup.totalSize))) return Number(backup.totalSize);
  return getBackupFiles(backup).reduce((sum, file) => sum + (file.size || 0), 0);
}

function getBackupNodeLabel(backup) {
  return backup.nodeName || backup.metadata?.nodeName || backup.metadata?.node || backup.metadata?.nodeUrl || backup.nodeUrl || "(激活前原始状态)";
}

function getBackupFileLabel(backupName) {
  switch (backupName) {
    case "settings.json":
      return "settings.json";
    case ".claude.json":
      return ".claude.json";
    case "config.toml":
      return "config.toml";
    case "auth.json":
      return "auth.json";
    case "opencode.json":
      return "opencode.json";
    case "openclaw.json":
      return "openclaw.json";
    case "vscode_plugin":
      return "VSCode 插件";
    case "cursor_plugin":
      return "Cursor 插件";
    default:
      return String(backupName || "未知文件").replace(/^\d+-/, "");
  }
}

function formatBackupFilesSummary(backup) {
  return getBackupFiles(backup).map((file) => getBackupFileLabel(file.backupName)).join(", ") || "无文件";
}

function formatBackupTitle(backup) {
  return `${formatBackupTime(backup)}  ${getBackupNodeLabel(backup)}`;
}

function printBackupList(backups, service) {
  const serviceLabel = getServiceLabel(service);
  console.log("");
  console.log(boldWhite(`  ${serviceLabel} 备份列表`));
  console.log(gray("  ─────────────────────────────────────"));
  console.log("");

  if (!backups.length) {
    console.log(gray("  暂无备份"));
    console.log("");
    return;
  }

  backups.forEach((backup, index) => {
    const nodeLabel = getBackupNodeLabel(backup);
    const nodeText = nodeLabel === "(激活前原始状态)" ? gray(nodeLabel) : cyan(nodeLabel);
    console.log(`${gray(`  ${index + 1}. `)}${white(formatBackupTime(backup))}`);
    console.log(`${gray("     节点: ")}${nodeText}`);
    console.log(`${gray("     文件: ")}${white(formatBackupFilesSummary(backup))}`);
    console.log(`${gray("     大小: ")}${white(formatFileSize(getBackupTotalSize(backup)))}`);
    console.log("");
  });

  console.log(gray("  ─────────────────────────────────────"));
  console.log(gray(`  共 ${backups.length} 个备份`));
  console.log("");
}

function printBackupDetail(backup) {
  const nodeLabel = getBackupNodeLabel(backup);
  const nodeText = nodeLabel === "(激活前原始状态)" ? gray(nodeLabel) : cyan(nodeLabel);
  console.log("");
  console.log(boldWhite("  备份详情"));
  console.log(gray("  ─────────────────────────────────────"));
  console.log(`${gray("  时间:       ")}${white(formatBackupTime(backup))}`);
  console.log(`${gray("  服务类型:   ")}${magenta(getServiceLabel(backup.service))}`);
  console.log(`${gray("  节点:       ")}${nodeText}`);
  console.log(`${gray("  文件数量:   ")}${white(getBackupFiles(backup).length)}`);
  console.log(`${gray("  大小:       ")}${white(formatFileSize(getBackupTotalSize(backup)))}`);
  if (backup.path) console.log(`${gray("  备份位置:   ")}${cyan(backup.path)}`);
  console.log("");
  console.log(gray("  将恢复以下文件:"));
  for (const file of getBackupFiles(backup)) {
    console.log(`${gray("    ")}${white(file.originalPath)}`);
  }
  console.log("");
}

async function promptBackupService(defaultService) {
  if (defaultService) return defaultService;

  const response = await prompts({
    type: "select",
    name: "service",
    message: "请选择要恢复的服务:",
    choices: [
      { title: "Claude Code", value: "claude" },
      { title: "Codex", value: "codex" },
      { title: gray("返回主菜单"), value: null },
    ],
  }, { onCancel: () => false });

  return response.service;
}

async function promptBackup(backups, service) {
  printBackupList(backups, service);
  if (!backups.length) return "__empty__";

  const response = await prompts({
    type: "select",
    name: "backup",
    message: "请选择要恢复的备份:",
    choices: [
      ...backups.map((backup) => ({ title: formatBackupTitle(backup), value: backup.path })),
      { title: gray("──────────────────"), value: "__separator__" },
      { title: red("清理所有备份"), value: "__clear__" },
      { title: gray("返回上级"), value: null },
    ],
  }, { onCancel: () => false });

  return response.backup;
}

async function confirmRestore(backup) {
  printBackupDetail(backup);
  const response = await prompts({
    type: "confirm",
    name: "confirmed",
    message: "确认恢复此备份?",
    initial: true,
  }, { onCancel: () => false });
  return Boolean(response.confirmed);
}

function printRestoreResult(success, restoredPaths, service, error = null) {
  console.log("");
  if (success) {
    console.log(boldGreen("  ✓ 备份已恢复"));
    console.log("");
    console.log(gray("  已恢复文件:"));
    for (const restoredPath of restoredPaths) {
      console.log(`${gray("    ")}${white(restoredPath)}`);
    }
    console.log("");
    const tip = service === "claude"
      ? "请重启 Claude Code 以使配置生效"
      : "请重启 Codex / VSCode / Cursor / OpenCode 以使配置生效";
    console.log(yellow(`  ${tip}`));
    console.log("");
    return;
  }

  console.log(boldRed("  ✗ 恢复失败"));
  if (error) console.log(red(`  ${error}`));
  console.log("");
}

async function clearAllBackups(service) {
  const response = await prompts({
    type: "confirm",
    name: "confirmed",
    message: `确认清理所有 ${getServiceLabel(service)} 备份?`,
    initial: false,
  }, { onCancel: () => false });

  if (!response.confirmed) {
    console.log("");
    console.log(gray("  已取消"));
    console.log("");
    return;
  }

  const count = clearBackups(service);
  console.log("");
  console.log(green(`  ✓ 已清理 ${count} 个备份`));
  console.log("");
}

async function runRestoreCommand(options = {}) {
  let service = await promptBackupService(options.service);
  if (!service) return;

  while (service) {
    const backups = listBackups(service);
    const backupPath = await promptBackup(backups, service);

    if (backupPath === "__empty__") return;
    if (backupPath === "__separator__") continue;

    if (!backupPath) {
      if (options.service) return;
      service = await promptBackupService();
      continue;
    }

    if (backupPath === "__clear__") {
      await clearAllBackups(service);
      continue;
    }

    const backup = backups.find((item) => item.path === backupPath);
    if (!backup) {
      console.log(red("  备份不存在"));
      continue;
    }

    if (!await confirmRestore(backup)) {
      console.log(gray("  已取消恢复"));
      continue;
    }

    try {
      const restoredPaths = restoreBackup(backupPath);
      printRestoreResult(true, restoredPaths, backup.service);
    } catch (err) {
      printRestoreResult(false, [], backup.service, err.message);
    }
    return;
  }
}

module.exports = {
  formatBackupFilesSummary,
  formatBackupTitle,
  formatBackupTime,
  formatFileSize,
  getBackupNodeLabel,
  printBackupDetail,
  printBackupList,
  printRestoreResult,
  runRestoreCommand,
};
