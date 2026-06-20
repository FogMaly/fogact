"use strict";

const prompts = require("prompts");
const { listBackups, restoreBackup, clearBackups } = require("../services/backup-service");
const { boldGreen, cyan, gray, green, red } = require("../utils/colors");

function getServiceLabel(service) {
  if (service === "codex") return "Codex";
  if (service === "claude") return "Claude Code";
  return service || "未知服务";
}

function getBackupFiles(backup) {
  if (Array.isArray(backup.files)) {
    return backup.files.map((file) => file.originalPath).filter(Boolean);
  }
  return [backup.originalPath].filter(Boolean);
}

function formatBackupTime(backup) {
  const date = backup.timestamp ? new Date(backup.timestamp) : null;
  if (!date || Number.isNaN(date.getTime())) return "未知时间";
  return date.toLocaleString("zh-CN");
}

function formatBackupTitle(backup) {
  const fileCount = getBackupFiles(backup).length;
  return `${getServiceLabel(backup.service)} · ${formatBackupTime(backup)} · ${fileCount} 个文件`;
}

function printRestoreHeader() {
  console.log("");
  console.log(gray("  恢复备份"));
  console.log(gray("  ─────────────────────────────────────"));
}

function printBackupDetail(backup) {
  console.log("");
  console.log(gray("  备份详情"));
  console.log(gray("  ─────────────────────────────────────"));
  console.log(`${gray("  服务类型:   ")}${cyan(getServiceLabel(backup.service))}`);
  console.log(`${gray("  备份时间:   ")}${formatBackupTime(backup)}`);
  console.log(`${gray("  备份类型:   ")}${backup.kind === "manifest" ? "激活配置备份" : "单文件备份"}`);
  console.log(`${gray("  文件数量:   ")}${getBackupFiles(backup).length}`);
  if (backup.path) console.log(`${gray("  备份位置:   ")}${cyan(backup.path)}`);
  console.log("");
  console.log(gray("  将恢复文件:"));
  for (const filePath of getBackupFiles(backup)) {
    console.log(`    ${cyan(filePath)}`);
  }
  console.log("");
}

async function promptBackupService(defaultService) {
  if (defaultService) return defaultService;

  const response = await prompts({
    type: "select",
    name: "service",
    message: "请选择要查看的备份",
    choices: [
      { title: "Claude Code", value: "claude" },
      { title: "Codex", value: "codex" },
      { title: "全部备份", value: null },
    ],
    initial: 2,
  }, { onCancel: () => false });

  return response.service;
}

async function promptBackup(backups) {
  const response = await prompts({
    type: "select",
    name: "backup",
    message: "请选择要恢复的备份",
    choices: [
      ...backups.map((backup) => ({ title: formatBackupTitle(backup), value: backup.path })),
      { title: "清空当前筛选的备份", value: "__clear__" },
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
      console.log(`    ${cyan(restoredPath)}`);
    }
    console.log("");
    const tip = service === "claude"
      ? "请重启 Claude Code 以使配置生效"
      : "请重启 Codex / VSCode / Cursor / OpenCode 以使配置生效";
    console.log(gray(`  ${tip}`));
    console.log("");
    return;
  }

  console.log(red("  ✗ 恢复失败"));
  if (error) console.log(red(`  ${error}`));
  console.log("");
}

async function runRestoreCommand(options = {}) {
  printRestoreHeader();

  const service = await promptBackupService(options.service);
  if (service === undefined) {
    console.log("");
    console.log(gray("  已取消"));
    console.log("");
    return;
  }

  const backups = listBackups(service);
  if (backups.length === 0) {
    console.log("");
    console.log(gray("  ℹ 暂无可恢复备份"));
    console.log("");
    return;
  }

  const backupPath = await promptBackup(backups);
  if (!backupPath) {
    console.log("");
    console.log(gray("  已取消"));
    console.log("");
    return;
  }

  if (backupPath === "__clear__") {
    const confirm = await prompts({
      type: "confirm",
      name: "value",
      message: "确认清空这些备份?",
      initial: false,
    }, { onCancel: () => false });

    if (!confirm.value) {
      console.log("");
      console.log(gray("  已取消"));
      console.log("");
      return;
    }

    const count = clearBackups(service);
    console.log("");
    console.log(green(`  ✓ 已清理 ${count} 个备份`));
    console.log("");
    return;
  }

  const backup = backups.find((item) => item.path === backupPath);
  if (!backup) {
    console.log("");
    console.log(red("  ✗ 备份不存在"));
    console.log("");
    return;
  }

  if (!await confirmRestore(backup)) {
    console.log(gray("  已取消恢复"));
    console.log("");
    return;
  }

  try {
    const restoredPaths = restoreBackup(backupPath);
    printRestoreResult(true, restoredPaths, backup.service);
  } catch (err) {
    printRestoreResult(false, [], backup.service, err.message);
  }
}

module.exports = {
  formatBackupTitle,
  printBackupDetail,
  runRestoreCommand,
};
