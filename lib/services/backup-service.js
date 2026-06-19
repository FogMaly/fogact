"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

const BACKUP_DIR = process.env.CLIPROXY_BACKUP_DIR ||
  process.env.FOGIDC_BACKUP_DIR ||
  path.join(os.homedir(), ".cliproxy-activator", "backups");

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

function createBackup(service, configPath) {
  ensureBackupDir();

  if (!fs.existsSync(configPath)) {
    return null;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupName = `${service}-${timestamp}.json`;
  const backupPath = path.join(BACKUP_DIR, backupName);

  const content = fs.readFileSync(configPath, "utf8");

  const backup = {
    service,
    originalPath: configPath,
    timestamp: new Date().toISOString(),
    content,
  };

  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));

  return backupPath;
}

function copyRecursive(sourcePath, targetPath) {
  const stat = fs.statSync(sourcePath);
  if (stat.isDirectory()) {
    fs.mkdirSync(targetPath, { recursive: true });
    for (const entry of fs.readdirSync(sourcePath, { withFileTypes: true })) {
      copyRecursive(path.join(sourcePath, entry.name), path.join(targetPath, entry.name));
    }
    return;
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function createActivationBackup(service, filePaths, metadata = {}) {
  ensureBackupDir();

  const existingPaths = [...new Set(filePaths || [])]
    .filter(Boolean)
    .filter((filePath) => fs.existsSync(filePath));

  if (existingPaths.length === 0) {
    return null;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupRoot = path.join(BACKUP_DIR, `${service}-${timestamp}`);
  fs.mkdirSync(backupRoot, { recursive: true });

  const files = existingPaths.map((filePath, index) => {
    const stat = fs.statSync(filePath);
    const backupName = `${String(index + 1).padStart(2, "0")}-${path.basename(filePath)}`;
    const backupPath = path.join(backupRoot, backupName);
    copyRecursive(filePath, backupPath);
    return {
      originalPath: filePath,
      backupName,
      isDirectory: stat.isDirectory(),
      size: stat.size,
    };
  });

  const manifest = {
    version: 1,
    service,
    timestamp: new Date().toISOString(),
    metadata,
    files,
  };
  fs.writeFileSync(path.join(backupRoot, "manifest.json"), JSON.stringify(manifest, null, 2));

  return backupRoot;
}

function listBackups(service = null) {
  ensureBackupDir();

  const files = fs.readdirSync(BACKUP_DIR);
  const backups = [];

  for (const file of files) {
    if (!file.endsWith(".json")) continue;

    const filePath = path.join(BACKUP_DIR, file);

    try {
      const content = fs.readFileSync(filePath, "utf8");
      const backup = JSON.parse(content);

      if (!service || backup.service === service) {
        backups.push({
          file,
          path: filePath,
          ...backup,
        });
      }
    } catch (err) {
      // Skip invalid backup files
    }
  }

  backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return backups;
}

function restoreBackup(backupPath) {
  if (!fs.existsSync(backupPath)) {
    throw new Error("Backup file not found");
  }

  const content = fs.readFileSync(backupPath, "utf8");
  const backup = JSON.parse(content);

  const targetDir = path.dirname(backup.originalPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  fs.writeFileSync(backup.originalPath, backup.content);

  return backup.originalPath;
}

function clearBackups(service = null) {
  const backups = listBackups(service);

  for (const backup of backups) {
    fs.unlinkSync(backup.path);
  }

  return backups.length;
}

module.exports = {
  createActivationBackup,
  createBackup,
  listBackups,
  restoreBackup,
  clearBackups,
};
