"use strict";

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const CODES_FILE = path.join(DATA_DIR, "codes.json");
const USAGE_FILE = path.join(DATA_DIR, "usage.json");
const CARD_MERGES_FILE = path.join(DATA_DIR, "card-merges.json");

// 确保数据目录存在
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// 读取 JSON 文件
function readJsonFile(filePath, defaultValue = []) {
  try {
    if (!fs.existsSync(filePath)) {
      return defaultValue;
    }
    const data = fs.readFileSync(filePath, "utf8");
    return JSON.parse(data);
  } catch (err) {
    console.error(`读取文件失败 ${filePath}:`, err.message);
    return defaultValue;
  }
}

// 写入 JSON 文件
function writeJsonFile(filePath, data) {
  try {
    ensureDataDir();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
    return true;
  } catch (err) {
    console.error(`写入文件失败 ${filePath}:`, err.message);
    return false;
  }
}

// 用户数据库操作
const userDb = {
  getAll() {
    return readJsonFile(USERS_FILE, []);
  },

  getById(id) {
    const users = this.getAll();
    return users.find((u) => u.id === id);
  },

  getByUsername(username) {
    const users = this.getAll();
    return users.find((u) => u.username === username);
  },

  create(userData) {
    const users = this.getAll();
    const newUser = {
      id: Date.now().toString(),
      username: userData.username,
      email: userData.email,
      service: userData.service || "Claude Code",
      status: userData.status || "待激活",
      registeredAt: new Date().toISOString(),
      ...userData,
    };
    users.push(newUser);
    writeJsonFile(USERS_FILE, users);
    return newUser;
  },

  update(id, updates) {
    const users = this.getAll();
    const index = users.findIndex((u) => u.id === id);
    if (index === -1) return null;

    users[index] = { ...users[index], ...updates, id };
    writeJsonFile(USERS_FILE, users);
    return users[index];
  },

  delete(id) {
    const users = this.getAll();
    const filtered = users.filter((u) => u.id !== id);
    if (filtered.length === users.length) return false;

    writeJsonFile(USERS_FILE, filtered);
    return true;
  },

  search(query) {
    const users = this.getAll();
    if (!query) return users;

    const lowerQuery = query.toLowerCase();
    return users.filter(
      (u) =>
        u.username.toLowerCase().includes(lowerQuery) ||
        u.email.toLowerCase().includes(lowerQuery) ||
        u.id.includes(lowerQuery)
    );
  },

  filterByStatus(status) {
    const users = this.getAll();
    if (!status || status === "all") return users;
    return users.filter((u) => u.status === status);
  },
};

// 激活码数据库操作
const codeDb = {
  getAll() {
    return readJsonFile(CODES_FILE, []);
  },

  getById(id) {
    const codes = this.getAll();
    return codes.find((c) => c.id === id);
  },

  getByCode(code) {
    const codes = this.getAll();
    return codes.find((c) => c.code === code);
  },

  create(codeData) {
    const codes = this.getAll();
    const newCode = {
      id: Date.now().toString(),
      code: codeData.code || this.generateCode(),
      name: codeData.name || `Code-${Date.now()}`,
      service: codeData.service || "Claude Code",
      category: codeData.category || "标准运营",
      subServiceType: codeData.subServiceType || codeData.category || "标准运营",
      billingType: codeData.billingType || codeData.quota?.billingType || codeData.quota?.type || "quota",
      cycleType: codeData.cycleType || codeData.quota?.cycleType || codeData.quota?.type || "fixed",
      quotaUnit: codeData.quotaUnit || codeData.quota?.unit || "tokens",
      resetTimezone: codeData.resetTimezone || codeData.quota?.resetTimezone || "Asia/Shanghai",
      status: codeData.status || "未使用",
      enabled: codeData.enabled !== undefined ? codeData.enabled : true,
      usedBy: codeData.usedBy || null,
      createdAt: new Date().toISOString(),
      expiresAt: codeData.expiresAt || this.getDefaultExpiry(),
      lastUsedAt: codeData.lastUsedAt || null,
      batch: codeData.batch || null,
      // 配额管理
      quota: {
        total: codeData.quota?.total || 100000,
        used: codeData.quota?.used || 0,
        dailyLimit: codeData.quota?.dailyLimit || 5000,
        dailyQuota: codeData.quota?.dailyQuota || codeData.quota?.dailyLimit || 5000,
        dailyUsed: codeData.quota?.dailyUsed || 0,
        periodDays: codeData.quota?.periodDays || 30,
        periodLimit: codeData.quota?.periodLimit || 50000,
        billingType: codeData.billingType || codeData.quota?.billingType || codeData.quota?.type || "quota",
        cycleType: codeData.cycleType || codeData.quota?.cycleType || codeData.quota?.type || "fixed",
        unit: codeData.quotaUnit || codeData.quota?.unit || "tokens",
        resetTimezone: codeData.resetTimezone || codeData.quota?.resetTimezone || "Asia/Shanghai",
      },
      // 计费设置
      billing: {
        mode: codeData.billing?.mode || "预付费",
        balance: codeData.billing?.balance || 1000,
      },
      // 服务设置
      serviceConfig: {
        providerGroup: codeData.serviceConfig?.providerGroup || "全球一线节点",
        routingStrategy: codeData.serviceConfig?.routingStrategy || "延迟优化",
        autoFailover: codeData.serviceConfig?.autoFailover !== undefined ? codeData.serviceConfig.autoFailover : true,
      },
      // 有效期设置
      validity: {
        type: codeData.validity?.type || "固定天数",
        days: codeData.validity?.days || 90,
        activationCountdown: codeData.validity?.activationCountdown || 24,
      },
      // 风控管理
      riskControl: {
        maxDevices: codeData.riskControl?.maxDevices || 3,
        maxConcurrent: codeData.riskControl?.maxConcurrent || 5,
        geoLock: codeData.riskControl?.geoLock || ["CN"],
        ipBinding: codeData.riskControl?.ipBinding || false,
      },
      // 技术参数
      technical: {
        region: codeData.technical?.region || "华东 1 (杭州)",
        instanceId: codeData.technical?.instanceId || `ins-${Math.random().toString(36).substring(2, 10)}`,
      },
      ...codeData,
    };
    codes.push(newCode);
    writeJsonFile(CODES_FILE, codes);
    return newCode;
  },

  update(id, updates) {
    const codes = this.getAll();
    const index = codes.findIndex((c) => c.id === id);
    if (index === -1) return null;

    codes[index] = { ...codes[index], ...updates, id };
    writeJsonFile(CODES_FILE, codes);
    return codes[index];
  },

  delete(id) {
    const codes = this.getAll();
    const filtered = codes.filter((c) => c.id !== id);
    if (filtered.length === codes.length) return false;

    writeJsonFile(CODES_FILE, filtered);
    return true;
  },

  search(query) {
    const codes = this.getAll();
    if (!query) return codes;

    const lowerQuery = query.toLowerCase();
    return codes.filter(
      (c) =>
        c.code.toLowerCase().includes(lowerQuery) ||
        (c.usedBy && c.usedBy.toLowerCase().includes(lowerQuery)) ||
        c.id.includes(lowerQuery)
    );
  },

  filterByStatus(status) {
    const codes = this.getAll();
    if (!status || status === "all") return codes;
    return codes.filter((c) => c.status === status);
  },

  filterByService(service) {
    const codes = this.getAll();
    if (!service || service === "all") return codes;
    return codes.filter((c) => c.service === service);
  },

  generateCode() {
    // 格式: XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
    // 示例: VM2E8GPT-BBGN-P7MX-NQP7-SRY62GT3XU8D
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    const segments = [8, 4, 4, 4, 12];
    const parts = [];

    for (let i = 0; i < segments.length; i++) {
      let segment = "";
      for (let j = 0; j < segments[i]; j++) {
        segment += chars[Math.floor(Math.random() * chars.length)];
      }
      parts.push(segment);
    }

    return parts.join("-");
  },

  getDefaultExpiry() {
    const date = new Date();
    date.setFullYear(date.getFullYear() + 1); // 1年后过期
    return date.toISOString();
  },
};

// 用量日志数据库操作
const usageDb = {
  getAll() {
    return readJsonFile(USAGE_FILE, []);
  },

  create(usageData) {
    const items = this.getAll();
    const now = new Date().toISOString();
    const newItem = {
      id: usageData.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      codeId: usageData.codeId || null,
      code: usageData.code || null,
      service: usageData.service || "claude",
      model: usageData.model || "unknown",
      inputTokens: Number(usageData.inputTokens || 0),
      outputTokens: Number(usageData.outputTokens || 0),
      totalTokens: Number(usageData.totalTokens || 0),
      requests: Number(usageData.requests || 1),
      statusCode: usageData.statusCode || null,
      success: usageData.success !== false,
      cost: Number(usageData.cost || 0),
      path: usageData.path || null,
      createdAt: usageData.createdAt || now,
    };
    items.push(newItem);
    writeJsonFile(USAGE_FILE, items);
    return newItem;
  },

  getByCode(code) {
    const value = String(code || "").trim();
    if (!value) return [];
    return this.getAll().filter((item) => item.code === value);
  },

  getSince(code, since) {
    const sinceTime = since ? new Date(since).getTime() : 0;
    return this.getByCode(code).filter((item) => {
      const createdAt = new Date(item.createdAt || 0).getTime();
      return Number.isFinite(createdAt) && createdAt >= sinceTime;
    });
  },
};

// 叠卡合并记录数据库操作
const cardMergeDb = {
  getAll() {
    return readJsonFile(CARD_MERGES_FILE, []);
  },

  create(mergeData) {
    const items = this.getAll();
    const now = new Date().toISOString();
    const newItem = {
      id: mergeData.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      parentCodeId: mergeData.parentCodeId,
      parentCode: mergeData.parentCode,
      childCodeId: mergeData.childCodeId,
      childCode: mergeData.childCode,
      serviceType: mergeData.serviceType,
      subServiceType: mergeData.subServiceType || "",
      billingType: mergeData.billingType,
      cycleType: mergeData.cycleType,
      quotaUnit: mergeData.quotaUnit,
      timezone: mergeData.timezone || "Asia/Shanghai",
      mergeMode: mergeData.mergeMode,
      parentDailyQuota: Number(mergeData.parentDailyQuota || 0),
      childDailyQuota: Number(mergeData.childDailyQuota || 0),
      childDays: Number(mergeData.childDays || 0),
      childTotalValue: Number(mergeData.childTotalValue || 0),
      addedDays: Number(mergeData.addedDays || 0),
      addedQuota: Number(mergeData.addedQuota || 0),
      oldExpiresAt: mergeData.oldExpiresAt || null,
      newExpiresAt: mergeData.newExpiresAt || null,
      createdAt: mergeData.createdAt || now,
    };
    items.push(newItem);
    writeJsonFile(CARD_MERGES_FILE, items);
    return newItem;
  },

  getByParent(parentCodeId) {
    return this.getAll().filter((item) => item.parentCodeId === parentCodeId);
  },

  getByChild(childCodeId) {
    return this.getAll().filter((item) => item.childCodeId === childCodeId);
  },
};

// 初始化示例数据
function initializeSampleData() {
  ensureDataDir();

  // 初始化用户数据
  if (!fs.existsSync(USERS_FILE)) {
    const sampleUsers = [
      {
        id: "1001",
        username: "user_001",
        email: "user001@example.com",
        service: "Claude Code",
        status: "活跃",
        registeredAt: "2026-04-01T00:00:00.000Z",
      },
      {
        id: "1002",
        username: "user_002",
        email: "user002@example.com",
        service: "Codex",
        status: "活跃",
        registeredAt: "2026-04-02T00:00:00.000Z",
      },
      {
        id: "1003",
        username: "user_003",
        email: "user003@example.com",
        service: "Claude Code",
        status: "待激活",
        registeredAt: "2026-04-03T00:00:00.000Z",
      },
      {
        id: "1004",
        username: "user_004",
        email: "user004@example.com",
        service: "Codex",
        status: "已禁用",
        registeredAt: "2026-04-04T00:00:00.000Z",
      },
      {
        id: "1005",
        username: "user_005",
        email: "user005@example.com",
        service: "Claude Code",
        status: "活跃",
        registeredAt: "2026-04-05T00:00:00.000Z",
      },
    ];
    writeJsonFile(USERS_FILE, sampleUsers);
  }

  // 初始化激活码数据
  if (!fs.existsSync(CODES_FILE)) {
    const sampleCodes = [
      {
        id: "2001",
        code: "CP-9821-XQ-001",
        name: "Alpha Node Premium",
        service: "Claude Code",
        category: "高级版",
        status: "已使用",
        enabled: true,
        usedBy: "user_001",
        createdAt: "2026-03-15T00:00:00.000Z",
        expiresAt: "2026-08-30T00:00:00.000Z",
        lastUsedAt: "2026-04-06T14:20:00.000Z",
        batch: "B2309-X",
        quota: {
          total: 80000,
          used: 67600,
          dailyLimit: 1200,
          dailyUsed: 1200,
          periodDays: 30,
          periodLimit: 50000,
        },
        billing: {
          mode: "预付费",
          balance: 850,
        },
        serviceConfig: {
          providerGroup: "全球一线节点",
          routingStrategy: "延迟优化",
          autoFailover: true,
        },
        validity: {
          type: "固定天数",
          days: 142,
          activationCountdown: 24,
        },
        riskControl: {
          maxDevices: 3,
          maxConcurrent: 5,
          geoLock: ["CN"],
          ipBinding: false,
        },
        technical: {
          region: "华东 1 (杭州)",
          instanceId: "ins-88219-xa",
        },
      },
      {
        id: "2002",
        code: "CP-1104-LT-992",
        name: "Beta Storage Instance",
        service: "Codex",
        category: "企业版",
        status: "未使用",
        enabled: false,
        usedBy: null,
        createdAt: "2026-04-01T00:00:00.000Z",
        expiresAt: "2026-04-06T00:00:00.000Z",
        lastUsedAt: "2023-10-01T09:12:00.000Z",
        batch: "B2310-Z",
        quota: {
          total: 100000,
          used: 0,
          dailyLimit: 5000,
          dailyUsed: 0,
          periodDays: 30,
          periodLimit: 50000,
        },
        billing: {
          mode: "预付费",
          balance: 0,
        },
        serviceConfig: {
          providerGroup: "全球一线节点",
          routingStrategy: "延迟优化",
          autoFailover: true,
        },
        validity: {
          type: "固定天数",
          days: 0,
          activationCountdown: 24,
        },
        riskControl: {
          maxDevices: 3,
          maxConcurrent: 5,
          geoLock: ["CN"],
          ipBinding: false,
        },
        technical: {
          region: "华东 1 (杭州)",
          instanceId: "ins-11049-lt",
        },
      },
      {
        id: "2003",
        code: "VIP-992-CLAUDE",
        name: "VIP Claude Premium",
        service: "Claude Code",
        category: "高级版",
        status: "已使用",
        enabled: true,
        usedBy: "user_002",
        createdAt: "2026-03-20T00:00:00.000Z",
        expiresAt: "2027-03-20T00:00:00.000Z",
        lastUsedAt: "2026-04-06T10:30:00.000Z",
        batch: "B2309-X",
        quota: {
          total: 500000,
          used: 440000,
          dailyLimit: 10000,
          dailyUsed: 8500,
          periodDays: 30,
          periodLimit: 200000,
        },
        billing: {
          mode: "预付费",
          balance: 412.50,
        },
        serviceConfig: {
          providerGroup: "全球一线节点",
          routingStrategy: "延迟优化",
          autoFailover: true,
        },
        validity: {
          type: "固定天数",
          days: 348,
          activationCountdown: 24,
        },
        riskControl: {
          maxDevices: 5,
          maxConcurrent: 10,
          geoLock: ["CN"],
          ipBinding: false,
        },
        technical: {
          region: "华东 1 (杭州)",
          instanceId: "ins-vip992",
        },
      },
    ];
    writeJsonFile(CODES_FILE, sampleCodes);
  }
}

module.exports = {
  userDb,
  codeDb,
  usageDb,
  cardMergeDb,
  initializeSampleData,
};
