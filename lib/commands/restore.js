"use strict";

const prompts = require("prompts");
const { listBackups, restoreBackup, clearBackups } = require("../services/backup-service");

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
  console.log("  恢复备份");
  console.log("  ─────────────────────────────────────");
}

function printBackupDetail(backup) {
  console.log("");
  console.log("  备份详情");
  console.log("  ─────────────────────────────────────");
  console.log(`  服务类型:   ${getServiceLabel(backup.service)}`);
  console.log(`  备份时间:   ${formatBackupTime(backup)}`);
  console.log(`  备份类型:   ${backup.kind === "manifest" ? "激活配置备份" : "单文件备份"}`);
  console.log(`  文件数量:   ${getBackupFiles(backup).length}`);
  if (backup.path) console.log(`  备份位置:   ${backup.path}`);
  console.log("");
  console.log("  将恢复文件:");
  for (const filePath of getBackupFiles(backup)) {
    console.log(`    ${filePath}`);
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
    console.log("  ✓ 备份已恢复");
    console.log("");
    console.log("  已恢复文件:");
    for (const restoredPath of restoredPaths) {
      console.log(`    ${restoredPath}`);
    }
    console.log("");
    const tip = service === "claude"
      ? "请重启 Claude Code 以使配置生效"
      : "请重启 Codex / VSCode / Cursor / OpenCode 以使配置生效";
    console.log(`  ${tip}`);
    console.log("");
    return;
  }

  console.log("  ✗ 恢复失败");
  if (error) console.log(`  ${error}`);
  console.log("");
}

async function runRestoreCommand(options = {}) {
  printRestoreHeader();

  const service = await promptBackupService(options.service);
  if (service === undefined) {
    console.log("");
    console.log("  已取消");
    console.log("");
    return;
  }

  const backups = listBackups(service);
  if (backups.length === 0) {
    console.log("");
    console.log("  ℹ 暂无可恢复备份");
    console.log("");
    return;
  }

  const backupPath = await promptBackup(backups);
  if (!backupPath) {
    console.log("");
    console.log("  已取消");
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
      console.log("  已取消");
      console.log("");
      return;
    }

    const count = clearBackups(service);
    console.log("");
    console.log(`  ✓ 已清理 ${count} 个备份`);
    console.log("");
    return;
  }

  const backup = backups.find((item) => item.path === backupPath);
  if (!backup) {
    console.log("");
    console.log("  ✗ 备份不存在");
    console.log("");
    return;
  }

  if (!await confirmRestore(backup)) {
    console.log("  已取消恢复");
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
