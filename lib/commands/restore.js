"use strict";

const prompts = require("prompts");
const { listBackups, restoreBackup, clearBackups } = require("../services/backup-service");

function formatBackupTitle(backup) {
  const service = backup.service === "codex" ? "Codex" : backup.service === "claude" ? "Claude Code" : backup.service;
  const time = backup.timestamp ? new Date(backup.timestamp).toLocaleString("zh-CN") : "未知时间";
  const count = Array.isArray(backup.files) ? ` · ${backup.files.length} 个文件` : "";
  return `${service || "未知服务"} · ${time}${count}`;
}

async function runRestoreCommand(options = {}) {
  console.log("");
  console.log("  恢复备份");
  console.log("  ─────────────────────────────────────");

  let service = options.service;
  if (!service) {
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

    if (response.service === undefined) {
      console.log("");
      console.log("  已取消");
      console.log("");
      return;
    }
    service = response.service;
  }

  const backups = listBackups(service);
  if (backups.length === 0) {
    console.log("");
    console.log("  ℹ 暂无可恢复备份");
    console.log("");
    return;
  }

  const response = await prompts({
    type: "select",
    name: "backup",
    message: "请选择要恢复的备份",
    choices: [
      ...backups.map((backup) => ({ title: formatBackupTitle(backup), value: backup.path })),
      { title: "清空当前筛选的备份", value: "__clear__" },
    ],
  }, { onCancel: () => false });

  if (!response.backup) {
    console.log("");
    console.log("  已取消");
    console.log("");
    return;
  }

  if (response.backup === "__clear__") {
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

  console.log("");
  console.log("  正在恢复备份...");
  try {
    const restoredPaths = restoreBackup(response.backup);
    console.log("  ✓ 备份已恢复");
    for (const restoredPath of restoredPaths) {
      console.log(`    ${restoredPath}`);
    }
    console.log("");
    console.log("  请重启相关工具以应用恢复后的配置");
    console.log("");
  } catch (err) {
    console.log(`  ✗ 恢复失败: ${err.message}`);
    console.log("");
  }
}

module.exports = { runRestoreCommand };
