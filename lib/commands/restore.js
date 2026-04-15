"use strict";

const prompts = require("prompts");
const { listBackups, restoreBackup, clearBackups } = require("../services/backup-service");

async function runRestoreCommand(options = {}) {
  console.log("");
  console.log("=== Restore Backup ===");
  console.log("");

  // Step 1: Select service
  let service = options.service;
  if (!service) {
    const response = await prompts({
      type: "select",
      name: "service",
      message: "Select service",
      choices: [
        { title: "Claude Code", value: "claude" },
        { title: "Codex", value: "codex" },
        { title: "All services", value: null },
      ],
    });

    if (response.service === undefined) {
      console.log("Restore cancelled.");
      return;
    }

    service = response.service;
  }

  // Step 2: List backups
  const backups = listBackups(service);

  if (backups.length === 0) {
    console.log("No backups found.");
    console.log("");
    return;
  }

  console.log(`Found ${backups.length} backup(s):`);
  console.log("");

  // Step 3: Select backup or clear all
  const choices = backups.map((backup, index) => ({
    title: `${backup.service} - ${new Date(backup.timestamp).toLocaleString()}`,
    value: backup.path,
  }));

  choices.push({ title: "Clear all backups", value: "__clear__" });

  const response = await prompts({
    type: "select",
    name: "backup",
    message: "Select backup to restore",
    choices,
  });

  if (!response.backup) {
    console.log("Restore cancelled.");
    return;
  }

  // Step 4: Handle clear all
  if (response.backup === "__clear__") {
    const confirm = await prompts({
      type: "confirm",
      name: "value",
      message: "Are you sure you want to clear all backups?",
      initial: false,
    });

    if (!confirm.value) {
      console.log("Clear cancelled.");
      return;
    }

    const count = clearBackups(service);
    console.log("");
    console.log(`✓ Cleared ${count} backup(s)`);
    console.log("");
    return;
  }

  // Step 5: Restore backup
  console.log("");
  console.log("Restoring backup...");

  try {
    const restoredPath = restoreBackup(response.backup);
    console.log(`✓ Backup restored: ${restoredPath}`);
    console.log("");
    console.log("Please restart your application to apply changes.");
    console.log("");
  } catch (err) {
    console.log(`✗ Restore failed: ${err.message}`);
    console.log("");
  }
}

module.exports = { runRestoreCommand };
