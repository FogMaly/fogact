"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

const BACKUP_DIR = process.env.FOGACT_BACKUP_DIR ||
  path.join(os.homedir(), ".fogact", "backups");
const MAX_BACKUPS_PER_SERVICE = Number(process.env.FOGACT_MAX_BACKUPS || 5);

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

function getPathSize(targetPath) {
  try {
    const stat = fs.statSync(targetPath);
    if (!stat.isDirectory()) return stat.size;
    return fs.readdirSync(targetPath, { withFileTypes: true })
      .reduce((total, entry) => total + getPathSize(path.join(targetPath, entry.name)), 0);
  } catch (_error) {
    return 0;
  }
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
      size: getPathSize(filePath),
    };
  });

  const totalSize = files.reduce((sum, file) => sum + (file.size || 0), 0);

  const manifest = {
    version: 1,
    id: path.basename(backupRoot),
    service,
    timestamp: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    nodeName: metadata.nodeName || null,
    nodeUrl: metadata.nodeUrl || metadata.upstream || null,
    metadata,
    files,
    totalSize,
  };
  fs.writeFileSync(path.join(backupRoot, "manifest.json"), JSON.stringify(manifest, null, 2));

  pruneBackups(service, MAX_BACKUPS_PER_SERVICE);

  return backupRoot;
}

function restoreManifestBackup(backupRoot) {
  const manifestPath = path.join(backupRoot, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error("Backup manifest not found");
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const restored = [];
  for (const file of manifest.files || []) {
    const backupPath = path.join(backupRoot, file.backupName);
    if (!fs.existsSync(backupPath)) continue;
    fs.mkdirSync(path.dirname(file.originalPath), { recursive: true });
    if (file.isDirectory) {
      if (fs.existsSync(file.originalPath)) {
        fs.rmSync(file.originalPath, { recursive: true, force: true });
      }
      copyRecursive(backupPath, file.originalPath);
    } else {
      fs.copyFileSync(backupPath, file.originalPath);
    }
    restored.push(file.originalPath);
  }

  return restored;
}

function listBackups(service = null) {
  ensureBackupDir();

  const entries = fs.readdirSync(BACKUP_DIR, { withFileTypes: true });
  const backups = [];

  for (const entry of entries) {
    const entryPath = path.join(BACKUP_DIR, entry.name);

    if (entry.isDirectory()) {
      const manifestPath = path.join(entryPath, "manifest.json");
      if (!fs.existsSync(manifestPath)) continue;
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        if (!service || manifest.service === service) {
          backups.push({
            file: entry.name,
            path: entryPath,
            kind: "manifest",
            originalPath: (manifest.files || []).map((file) => file.originalPath).join(", "),
            totalSize: manifest.totalSize || (manifest.files || []).reduce((sum, file) => sum + (file.size || 0), 0),
            ...manifest,
          });
        }
      } catch (err) {
        // Skip invalid backup folders.
      }
      continue;
    }

    if (!entry.name.endsWith(".json")) continue;
    try {
      const backup = JSON.parse(fs.readFileSync(entryPath, "utf8"));
      if (!service || backup.service === service) {
        backups.push({
          file: entry.name,
          path: entryPath,
          kind: "single",
          ...backup,
        });
      }
    } catch (err) {
      // Skip invalid backup files.
    }
  }

  backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return backups;
}

function restoreBackup(backupPath) {
  if (!fs.existsSync(backupPath)) {
    throw new Error("Backup file not found");
  }

  if (fs.statSync(backupPath).isDirectory()) {
    return restoreManifestBackup(backupPath);
  }

  const content = fs.readFileSync(backupPath, "utf8");
  const backup = JSON.parse(content);

  const targetDir = path.dirname(backup.originalPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  fs.writeFileSync(backup.originalPath, backup.content);

  return [backup.originalPath];
}

function clearBackups(service = null) {
  const backups = listBackups(service);

  for (const backup of backups) {
    if (fs.existsSync(backup.path) && fs.statSync(backup.path).isDirectory()) {
      fs.rmSync(backup.path, { recursive: true, force: true });
    } else if (fs.existsSync(backup.path)) {
      fs.unlinkSync(backup.path);
    }
  }

  return backups.length;
}

function pruneBackups(service, maxBackups = MAX_BACKUPS_PER_SERVICE) {
  if (!maxBackups || maxBackups < 1) return 0;
  const backups = listBackups(service);
  const stale = backups.slice(maxBackups);
  for (const backup of stale) {
    if (fs.existsSync(backup.path) && fs.statSync(backup.path).isDirectory()) {
      fs.rmSync(backup.path, { recursive: true, force: true });
    } else if (fs.existsSync(backup.path)) {
      fs.unlinkSync(backup.path);
    }
  }
  return stale.length;
}

module.exports = {
  MAX_BACKUPS_PER_SERVICE,
  createActivationBackup,
  createBackup,
  listBackups,
  restoreBackup,
  clearBackups,
  getPathSize,
  pruneBackups,
};
