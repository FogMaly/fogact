#!/usr/bin/env node

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { userDb, codeDb, initializeSampleData } = require("../lib/services/database");
const { DEFAULT_CONFIG_PATH, loadUpstreamConfig } = require("../lib/config/upstream");
const { readJsonFile, writeJsonFile } = require("../lib/utils/json-file");
const { maskKey, verifyNewApiKey } = require("../lib/services/newapi");

const PORT = process.env.PORT || 34020;
const FRONTEND_DIR = path.join(__dirname, "..", "frontend");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const SERVER_TIMEZONE = process.env.SERVER_TIMEZONE || "Asia/Shanghai";

const USER_STATUS_MAP = {
  active: "活跃",
  "活跃": "活跃",
  inactive: "待激活",
  pending: "待激活",
  "待激活": "待激活",
  disabled: "已禁用",
  blocked: "已禁用",
  banned: "已禁用",
  "已禁用": "已禁用",
};

const USER_STATUS_KEY_MAP = {
  "活跃": "active",
  "待激活": "inactive",
  "已禁用": "disabled",
};

const CODE_STATUS_MAP = {
  unused: "unused",
  "未使用": "unused",
  used: "used",
  "已使用": "used",
  expired: "expired",
  "已过期": "expired",
};

const CODE_STATUS_LABEL_MAP = {
  unused: "未使用",
  used: "已使用",
  expired: "已过期",
};

// 初始化示例数据
initializeSampleData();

// Simple session storage (in-memory)
const sessions = new Map();

function generateSessionId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function isAuthenticated(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const sessionId = cookies.session_id;

  if (!sessionId) return false;

  const session = sessions.get(sessionId);
  if (!session) return false;

  // Check if session is expired (24 hours)
  if (Date.now() - session.createdAt > 24 * 60 * 60 * 1000) {
    sessions.delete(sessionId);
    return false;
  }

  return session.authenticated;
}

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;

  cookieHeader.split(';').forEach(cookie => {
    const parts = cookie.trim().split('=');
    if (parts.length === 2) {
      cookies[parts[0]] = parts[1];
    }
  });

  return cookies;
}

function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function normalizeUserStatus(status) {
  if (status === undefined || status === null || status === "") {
    return "待激活";
  }

  const normalized = USER_STATUS_MAP[String(status).trim().toLowerCase()];
  return normalized || String(status).trim();
}

function getUserStatusKey(status) {
  return USER_STATUS_KEY_MAP[normalizeUserStatus(status)] || "inactive";
}

function normalizeService(service, fallback = "Claude Code") {
  if (!service) return fallback;

  const value = String(service).trim().toLowerCase();
  const serviceMap = {
    claude: "Claude Code",
    claudecode: "Claude Code",
    "claude-code": "Claude Code",
    "claude code": "Claude Code",
    codex: "Codex",
    gpt: "GPT",
    openai: "OpenAI",
    gemini: "Gemini",
    other: "其他",
  };

  return serviceMap[value] || String(service).trim();
}

function getServiceKey(service, fallback = "claude") {
  const normalized = normalizeService(service, fallback === "codex" ? "Codex" : "Claude Code");
  const value = String(normalized || "").trim().toLowerCase();
  if (value.includes("codex")) return "codex";
  if (value.includes("claude")) return "claude";
  return String(service || fallback || "").trim().toLowerCase().replace(/\s+/g, "-") || fallback;
}

function serviceMatches(item, service) {
  if (!service || service === "all") return true;
  return getServiceKey(item.service) === getServiceKey(service);
}

function normalizeCodeStatus(codeOrStatus, expiresAt) {
  const rawStatus =
    typeof codeOrStatus === "object" && codeOrStatus !== null
      ? codeOrStatus.status
      : codeOrStatus;
  const rawExpiresAt =
    typeof codeOrStatus === "object" && codeOrStatus !== null
      ? codeOrStatus.expiresAt
      : expiresAt;

  if (rawExpiresAt) {
    const expiry = new Date(rawExpiresAt);
    if (!Number.isNaN(expiry.getTime()) && expiry < new Date()) {
      return "expired";
    }
  }

  if (rawStatus === undefined || rawStatus === null || rawStatus === "") {
    return "unused";
  }

  return CODE_STATUS_MAP[String(rawStatus).trim().toLowerCase()] || "unused";
}

function getCodeStatusLabel(status) {
  return CODE_STATUS_LABEL_MAP[normalizeCodeStatus(status)] || "未使用";
}

function serializeUser(user) {
  const status = normalizeUserStatus(user.status);
  const service = normalizeService(user.service);
  return {
    ...user,
    service,
    serviceKey: getServiceKey(service),
    serviceLabel: service,
    status,
    statusLabel: status,
    statusKey: getUserStatusKey(status),
  };
}

function serializeCode(code) {
  const status = normalizeCodeStatus(code);
  const service = normalizeService(code.service);
  return {
    ...code,
    service,
    serviceKey: getServiceKey(service),
    serviceLabel: service,
    allowedModels: code.allowedModels || (getServiceKey(service) === "codex" ? ["codex"] : ["claude"]),
    status,
    statusLabel: getCodeStatusLabel(status),
    isExpired: status === "expired",
  };
}

function trimTrailingSlash(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function getUpstreamConfigPath() {
  return process.env.CLIPROXY_UPSTREAM_CONFIG || DEFAULT_CONFIG_PATH;
}

function readRawUpstreamConfig() {
  return readJsonFile(getUpstreamConfigPath(), {});
}

function serializeUpstreamConfig(config) {
  const services = config.services || {};
  const claude = services.claude || {};
  const codex = services.codex || {};
  return {
    provider: config.provider || "newapi",
    baseUrl: config.baseUrl || "",
    apiKey: "",
    apiKeyConfigured: Boolean(config.apiKey),
    apiKeyMasked: maskKey(config.apiKey || ""),
    timeoutMs: config.timeoutMs || 10000,
    claudeBaseUrl: claude.baseUrl || "",
    codexBaseUrl: codex.baseUrl || "",
    configPath: config.configPath || getUpstreamConfigPath(),
    configured: Boolean(config.baseUrl && config.apiKey),
  };
}

function buildUpstreamConfigFromPayload(payload = {}) {
  const currentRaw = readRawUpstreamConfig();
  const current = loadUpstreamConfig({ configPath: getUpstreamConfigPath() });
  const services = { ...(currentRaw.services || {}) };

  if (!services.claude) services.claude = {};
  if (!services.codex) services.codex = {};

  if (Object.prototype.hasOwnProperty.call(payload, "claudeBaseUrl")) {
    services.claude.baseUrl = trimTrailingSlash(payload.claudeBaseUrl);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "codexBaseUrl")) {
    services.codex.baseUrl = trimTrailingSlash(payload.codexBaseUrl);
  }

  const nextApiKey = typeof payload.apiKey === "string" && payload.apiKey.trim()
    ? payload.apiKey.trim()
    : (currentRaw.apiKey || current.apiKey || "");

  const timeoutMs = parseInt(payload.timeoutMs || currentRaw.timeoutMs || current.timeoutMs || "10000", 10) || 10000;

  return {
    ...currentRaw,
    provider: String(payload.provider || currentRaw.provider || "newapi").trim() || "newapi",
    baseUrl: trimTrailingSlash(payload.baseUrl ?? currentRaw.baseUrl ?? current.baseUrl),
    apiKey: nextApiKey,
    services,
    timeoutMs,
    updatedAt: new Date().toISOString(),
  };
}

function paginate(items, page, limit) {
  const safePage = Math.max(parseInt(page || "1", 10) || 1, 1);
  const safeLimit = Math.max(parseInt(limit || "50", 10) || 50, 1);
  const start = (safePage - 1) * safeLimit;
  return {
    items: items.slice(start, start + safeLimit),
    page: safePage,
    limit: safeLimit,
    total: items.length,
  };
}

// Get all network interfaces
function getNetworkAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }

  return addresses;
}

// MIME type mapping
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject'
};

function serveStaticFile(filePath, res) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404 Not Found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    // For admin panel files, always use no-cache to prevent stale content
    const isAdminFile = filePath.includes('admin-panel');

    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": (ext === '.html' || isAdminFile)
        ? 'no-cache, no-store, must-revalidate'
        : 'public, max-age=31536000',
      "Pragma": "no-cache",
      "Expires": "0"
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  // Add CORS headers for external access
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Parse URL and remove query string
  let urlPath = req.url.split('?')[0];

  // Handle login API
  if (urlPath === "/api/login" && req.method === "POST") {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (data.password === ADMIN_PASSWORD) {
          const sessionId = generateSessionId();
          sessions.set(sessionId, {
            authenticated: true,
            createdAt: Date.now()
          });

          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Set-Cookie': `session_id=${sessionId}; HttpOnly; Path=/; Max-Age=86400`
          });
          res.end(JSON.stringify({ success: true, message: '登录成功' }));
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: '密码错误' }));
        }
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: '请求格式错误' }));
      }
    });
    return;
  }

  // Handle logout API
  if (urlPath === "/api/logout" && req.method === "POST") {
    const cookies = parseCookies(req.headers.cookie || '');
    const sessionId = cookies.session_id;
    if (sessionId) {
      sessions.delete(sessionId);
    }
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': 'session_id=; HttpOnly; Path=/; Max-Age=0'
    });
    res.end(JSON.stringify({ success: true, message: '已退出登录' }));
    return;
  }

  // Handle check auth API
  if (urlPath === "/api/check-auth" && req.method === "GET") {
    const authenticated = isAuthenticated(req);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ authenticated }));
    return;
  }

  // Handle server-side settings API
  if (urlPath === "/api/settings" && req.method === "GET") {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: '未授权' }));
      return;
    }

    const upstream = loadUpstreamConfig({ configPath: getUpstreamConfigPath() });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      data: {
        upstream: serializeUpstreamConfig(upstream),
      },
    }));
    return;
  }

  if (urlPath === "/api/settings" && req.method === "PUT") {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: '未授权' }));
      return;
    }

    parseRequestBody(req).then((payload) => {
      const upstreamPayload = payload.upstream || {};
      const nextConfig = buildUpstreamConfigFromPayload(upstreamPayload);

      if (!nextConfig.baseUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: '请填写上游 API 地址' }));
        return;
      }

      if (!nextConfig.apiKey) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: '请填写上游 API Key' }));
        return;
      }

      writeJsonFile(getUpstreamConfigPath(), nextConfig);
      const saved = loadUpstreamConfig({ configPath: getUpstreamConfigPath() });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: '系统设置已保存',
        data: {
          upstream: serializeUpstreamConfig(saved),
        },
      }));
    }).catch((error) => {
      console.error('Save settings error:', error);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: '设置保存失败' }));
    });
    return;
  }

  if (urlPath === "/api/settings/upstream/test" && req.method === "POST") {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: '未授权' }));
      return;
    }

    parseRequestBody(req).then(async (payload) => {
      const upstreamPayload = payload.upstream || payload || {};
      const testConfig = buildUpstreamConfigFromPayload(upstreamPayload);
      const baseUrl = trimTrailingSlash(upstreamPayload.baseUrl || testConfig.baseUrl);
      const apiKey = String(upstreamPayload.apiKey || testConfig.apiKey || "").trim();

      if (!baseUrl || !apiKey) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: '请填写上游 API 地址和 API Key' }));
        return;
      }

      try {
        const result = await verifyNewApiKey({ ...testConfig, baseUrl }, apiKey);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: result.valid,
          message: result.valid ? '上游连接成功' : `上游验证失败：${result.error || result.status}`,
          data: {
            valid: result.valid,
            status: result.status,
            modelsUrl: result.modelsUrl,
            modelCount: Array.isArray(result.models) ? result.models.length : 0,
            apiKeyMasked: maskKey(apiKey),
          },
        }));
      } catch (error) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          message: `上游连接失败：${error.message}`,
          data: { valid: false },
        }));
      }
    }).catch((error) => {
      console.error('Test upstream error:', error);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: '上游测试失败' }));
    });
    return;
  }

  // Handle users API
  if (urlPath === "/api/users" && req.method === "GET") {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: '未授权' }));
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const query = (url.searchParams.get("q") || url.searchParams.get("search") || "").trim();
    const status = url.searchParams.get("status");
    const service = url.searchParams.get("service");
    const { items, page, limit, total } = paginate(
      userDb
        .getAll()
        .map(serializeUser)
        .filter((user) => {
          if (status && status !== "all" && getUserStatusKey(user.status) !== getUserStatusKey(status) && user.status !== normalizeUserStatus(status)) {
            return false;
          }

          if (!serviceMatches(user, service)) {
            return false;
          }

          if (!query) return true;
          const keyword = query.toLowerCase();
          return (
            String(user.username || "").toLowerCase().includes(keyword) ||
            String(user.email || "").toLowerCase().includes(keyword) ||
            String(user.id || "").toLowerCase().includes(keyword)
          );
        }),
      url.searchParams.get("page"),
      url.searchParams.get("limit")
    );

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: items, page, limit, total }));
    return;
  }

  if (urlPath === "/api/users" && req.method === "POST") {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: '未授权' }));
      return;
    }

    parseRequestBody(req).then((userData) => {
      if (!userData.username || !userData.email) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: '用户名和邮箱为必填项' }));
        return;
      }

      if (userDb.getByUsername(userData.username)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: '用户名已存在' }));
        return;
      }

      const service = normalizeService(userData.service);
      const newUser = userDb.create({
        ...userData,
        service,
        serviceKey: getServiceKey(service),
        status: normalizeUserStatus(userData.status),
      });

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: serializeUser(newUser) }));
    }).catch(() => {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: '请求格式错误' }));
    });
    return;
  }

  if (urlPath.startsWith("/api/users/") && req.method === "PUT") {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: '未授权' }));
      return;
    }

    const userId = urlPath.split('/')[3];
    parseRequestBody(req).then((updates) => {
      const payload = { ...updates };
      if (payload.status !== undefined) {
        payload.status = normalizeUserStatus(payload.status);
      }
      if (payload.service !== undefined) {
        payload.service = normalizeService(payload.service);
        payload.serviceKey = getServiceKey(payload.service);
      }

      const updatedUser = userDb.update(userId, payload);

      if (!updatedUser) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: '用户不存在' }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: serializeUser(updatedUser) }));
    }).catch(() => {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: '请求格式错误' }));
    });
    return;
  }

  if (urlPath.startsWith("/api/users/") && req.method === "DELETE") {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: '未授权' }));
      return;
    }

    const userId = urlPath.split('/')[3];
    const deleted = userDb.delete(userId);

    if (!deleted) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: '用户不存在' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: '删除成功' }));
    return;
  }

  // Handle codes API
  if (urlPath === "/api/codes" && req.method === "GET") {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: '未授权' }));
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const query = (url.searchParams.get("q") || url.searchParams.get("search") || "").trim();
    const status = url.searchParams.get("status");
    const service = url.searchParams.get("service");
    const { items, page, limit, total } = paginate(
      codeDb
        .getAll()
        .map(serializeCode)
        .filter((code) => {
          if (status && status !== "all" && code.status !== normalizeCodeStatus(status)) {
            return false;
          }

          if (!serviceMatches(code, service)) {
            return false;
          }

          if (!query) return true;
          const keyword = query.toLowerCase();
          return (
            String(code.code || "").toLowerCase().includes(keyword) ||
            String(code.usedBy || "").toLowerCase().includes(keyword) ||
            String(code.id || "").toLowerCase().includes(keyword)
          );
        }),
      url.searchParams.get("page"),
      url.searchParams.get("limit")
    );

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: items, page, limit, total }));
    return;
  }

  if (urlPath === "/api/codes" && req.method === "POST") {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: '未授权' }));
      return;
    }

    parseRequestBody(req).then((codeData) => {
      const count = Math.max(parseInt(codeData.count || "1", 10) || 1, 1);
      const requestedServices = Array.isArray(codeData.services) && codeData.services.length
        ? codeData.services
        : [codeData.service || codeData.platform || "Claude Code"];
      const services = requestedServices
        .map((service) => normalizeService(service))
        .filter((service, index, list) => service && list.indexOf(service) === index);
      const createdCodes = [];

      if (!services.length) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: '请至少选择一个服务渠道' }));
        return;
      }

      let expiresAt = codeData.expiresAt;
      if (codeData.duration) {
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + parseInt(codeData.duration, 10));
        expiresAt = expiry.toISOString();
      }

      for (const service of services) {
        for (let i = 0; i < count; i++) {
          const serviceKey = getServiceKey(service);
          const newCode = codeDb.create({
            ...(codeData.code && services.length === 1 && count === 1 ? { code: codeData.code } : {}),
            service,
            serviceKey,
            allowedModels: [serviceKey],
            quota: codeData.quota || { total: 1000000, used: 0 },
            expiresAt,
            notes: codeData.notes || codeData.note,
            status: "unused",
          });
          createdCodes.push(serializeCode(newCode));
        }
      }

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        data: count === 1 ? createdCodes[0] : createdCodes,
        message: count > 1 ? `成功生成 ${count} 个激活码` : '激活码创建成功'
      }));
    }).catch((error) => {
      console.error('Create code error:', error);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: '请求格式错误' }));
    });
    return;
  }

  if (urlPath.startsWith("/api/codes/") && req.method === "PUT") {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: '未授权' }));
      return;
    }

    const codeId = urlPath.split('/')[3];
    parseRequestBody(req).then((updates) => {
      const payload = { ...updates };
      if (payload.service !== undefined) {
        payload.service = normalizeService(payload.service);
        payload.serviceKey = getServiceKey(payload.service);
        payload.allowedModels = [payload.serviceKey];
      }
      if (payload.status !== undefined) {
        payload.status = normalizeCodeStatus(payload.status);
      }

      const updatedCode = codeDb.update(codeId, payload);
      if (!updatedCode) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: '激活码不存在' }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: serializeCode(updatedCode) }));
    }).catch(() => {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: '请求格式错误' }));
    });
    return;
  }

  if (urlPath.startsWith("/api/codes/") && req.method === "DELETE") {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: '未授权' }));
      return;
    }

    const codeId = urlPath.split('/')[3];
    const deleted = codeDb.delete(codeId);

    if (!deleted) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: '激活码不存在' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: '删除成功' }));
    return;
  }

  // CDK Activation API - User端激活激活码
  if (urlPath === "/api/activate" && req.method === "POST") {
    parseRequestBody(req).then((data) => {
      const { code: activationCode, userId, username, email } = data;
      const requestedService = data.service || data.platform || data.product || "";

      if (!activationCode || !activationCode.trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: '激活码不能为空' }));
        return;
      }

      // 查找激活码
      const code = codeDb.getAll().find(c => c.code === activationCode.trim());

      if (!code) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: '激活码不存在' }));
        return;
      }

      const serializedCode = serializeCode(code);
      if (requestedService && !serviceMatches(serializedCode, requestedService)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          message: `此激活码属于 ${serializedCode.serviceLabel}，不能用于 ${normalizeService(requestedService)}`
        }));
        return;
      }

      // 检查激活码状态
      if (normalizeCodeStatus(code) === 'used') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: '激活码已被使用' }));
        return;
      }

      // 检查是否过期
      if (code.expiresAt && new Date(code.expiresAt) < new Date()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: '激活码已过期' }));
        return;
      }

      // 更新激活码状态
      const updatedCode = codeDb.update(code.id, {
        status: 'used',
        usedBy: userId || username || email || 'unknown',
        lastUsedAt: new Date().toISOString(),
        activatedService: serializedCode.service,
        activatedServiceKey: serializedCode.serviceKey
      });

      if (!updatedCode) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: '激活失败' }));
        return;
      }

      // 返回激活成功信息
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: '激活成功',
        data: {
          code: updatedCode.code,
          service: serializeCode(updatedCode).service,
          serviceKey: serializeCode(updatedCode).serviceKey,
          allowedModels: serializeCode(updatedCode).allowedModels,
          quota: updatedCode.quota,
          expiresAt: updatedCode.expiresAt,
          activatedAt: updatedCode.lastUsedAt
        }
      }));
    }).catch((error) => {
      console.error('Activation error:', error);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: '请求格式错误' }));
    });
    return;
  }

  // CDK Quota Refresh API - 每日额度刷新
  if (urlPath === "/api/codes/refresh-quota" && req.method === "POST") {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: '未授权' }));
      return;
    }

    parseRequestBody(req).then((data) => {
      const { codeId } = data;

      if (!codeId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: '激活码ID不能为空' }));
        return;
      }

      const code = codeDb.getAll().find(c => c.id === codeId);

      if (!code) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: '激活码不存在' }));
        return;
      }

      // 检查是否需要刷新（每日刷新逻辑）
      const now = new Date();
      const lastRefresh = code.lastQuotaRefresh ? new Date(code.lastQuotaRefresh) : null;

      // 如果今天还没刷新过，则刷新
      const needsRefresh = !lastRefresh ||
        lastRefresh.toDateString() !== now.toDateString();

      if (!needsRefresh) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: '今日额度已刷新',
          data: serializeCode(code)
        }));
        return;
      }

      // 刷新额度
      const dailyQuota = code.quota?.daily || 100000;
      const updatedCode = codeDb.update(codeId, {
        quota: {
          ...code.quota,
          used: 0,
          daily: dailyQuota
        },
        lastQuotaRefresh: now.toISOString()
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: '额度刷新成功',
        data: serializeCode(updatedCode)
      }));
    }).catch((error) => {
      console.error('Quota refresh error:', error);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: '请求格式错误' }));
    });
    return;
  }

  // Handle stats API
  if (urlPath === "/api/stats" && req.method === "GET") {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: '未授权' }));
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const service = url.searchParams.get("service");
    const users = userDb.getAll().map(serializeUser).filter((user) => serviceMatches(user, service));
    const codes = codeDb.getAll().map(serializeCode).filter((code) => serviceMatches(code, service));

    const totalUsers = users.length;
    const activeUsers = users.filter(u => u.statusKey === 'active').length;
    const totalCodes = codes.length;
    const usedCodes = codes.filter(c => c.status === 'used').length;
    const unusedCodes = codes.filter(c => c.status === 'unused').length;
    const expiredCodes = codes.filter(c => c.status === 'expired').length;

    const stats = {
      totalUsers,
      activeUsers,
      totalCodes,
      usedCodes,
      unusedCodes,
      expiredCodes,
      systemStatus: '运行正常',
      uptime: Math.floor(process.uptime() / 86400) + ' 天'
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: stats }));
    return;
  }

  // Mock API for user frontend - usage data
  if (urlPath === "/api/user/usage" && req.method === "GET") {
    const mockUsageData = {
      success: true,
      data: {
        total_requests: 15234,
        total_tokens: 2456789,
        today_requests: 342,
        today_tokens: 45678,
        quota: {
          total: 10000000,
          used: 2456789,
          remaining: 7543211
        },
        daily_stats: [
          { date: '2026-03-30', requests: 234, tokens: 34567 },
          { date: '2026-03-31', requests: 289, tokens: 42345 },
          { date: '2026-04-01', requests: 312, tokens: 45678 },
          { date: '2026-04-02', requests: 298, tokens: 43210 },
          { date: '2026-04-03', requests: 276, tokens: 39876 },
          { date: '2026-04-04', requests: 301, tokens: 44321 },
          { date: '2026-04-05', requests: 342, tokens: 45678 }
        ]
      }
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(mockUsageData));
    return;
  }

  // Mock API for user frontend - user info
  if (urlPath === "/api/user/info" && req.method === "GET") {
    const mockUserInfo = {
      success: true,
      data: {
        username: 'test_user',
        email: 'test@example.com',
        service: 'Claude Code',
        status: 'active',
        created_at: '2026-03-15T00:00:00.000Z',
        api_key: 'sk-test-' + Math.random().toString(36).substring(2, 15)
      }
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(mockUserInfo));
    return;
  }

  // Activity API
  if (urlPath === "/api/activity" && req.method === "GET") {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: '未授权' }));
      return;
    }

    // Mock activity data
    const activities = [
      { timestamp: new Date().toISOString(), user: 'admin', action: '登录系统', status: 'success' },
      { timestamp: new Date(Date.now() - 300000).toISOString(), user: 'test_user', action: '创建激活码', status: 'success' },
      { timestamp: new Date(Date.now() - 600000).toISOString(), user: 'admin', action: '更新用户信息', status: 'success' },
      { timestamp: new Date(Date.now() - 900000).toISOString(), user: 'test_user', action: '查看统计数据', status: 'success' },
      { timestamp: new Date(Date.now() - 1200000).toISOString(), user: 'admin', action: '删除激活码', status: 'success' }
    ];

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: activities }));
    return;
  }

  // Verify API key or inspect activation code capability
  if (urlPath === "/api/verify" && req.method === "POST") {
    parseRequestBody(req).then((data) => {
      if (data.code) {
        const code = codeDb.getByCode(String(data.code).trim());
        if (!code) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, valid: false, message: '激活码不存在' }));
          return;
        }

        const serializedCode = serializeCode(code);
        if (serializedCode.status !== 'unused') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, valid: false, message: serializedCode.status === 'expired' ? '激活码已过期' : '激活码已被使用' }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          valid: true,
          message: '验证成功',
          data: {
            code: serializedCode.code,
            service: serializedCode.service,
            services: [serializedCode.serviceKey],
            platforms: serializedCode.serviceKey === 'codex' ? ['codex-cli'] : ['claude-code'],
            allowedModels: serializedCode.allowedModels,
            quota: serializedCode.quota,
            expiresAt: serializedCode.expiresAt
          }
        }));
        return;
      }

      if (data.api_key && data.api_key.startsWith('sk-test-')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          valid: true,
          message: '验证成功',
          data: {
            username: 'test_user',
            email: 'test@example.com',
            service: 'Claude Code'
          }
        }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        valid: false,
        message: '验证失败，请检查 API Key 是否正确'
      }));
    }).catch(() => {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: '请求格式错误' }));
    });
    return;
  }

  // User frontend API endpoints - /user/api/v1/*
  if (urlPath.startsWith("/user/api/v1/")) {
    const apiPath = urlPath.replace("/user/api/v1", "");

    // GET /user/api/v1/me - Get current user info
    if (apiPath === "/me" && req.method === "GET") {
      // 从 session 或 query 获取用户信息
      const username = req.headers['x-user-id'] || 'demo_user';
      const user = userDb.getByUsername(username) || userDb.getAll()[0];

      if (!user) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'User not found' }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        data: {
          id: user.id,
          username: user.username,
          email: user.email,
          service: user.service,
          status: user.status,
          created_at: user.registeredAt || user.createdAt,
          api_key: user.apiKey || 'sk-demo-' + user.id
        }
      }));
      return;
    }

    // GET /user/api/v1/usage/history - Get usage history
    if (apiPath.startsWith("/usage/history") && req.method === "GET") {
      const username = req.headers['x-user-id'] || 'demo_user';
      const user = userDb.getByUsername(username) || userDb.getAll()[0];

      // 查找用户对应的激活码（通过 usedBy 或 username）
      const codes = codeDb.getAll().filter(c =>
        c.usedBy === username ||
        c.usedBy === user?.username ||
        c.status === 'used'
      );
      const code = codes[0];

      // 计算真实额度数据
      const totalQuota = code?.quota?.total || 100000;
      const usedQuota = code?.quota?.used || 0;
      const dailyLimit = code?.quota?.dailyLimit || 5000;
      const dailyUsed = code?.quota?.dailyUsed || 0;

      // 生成最近7天的模拟数据（实际生产中应该记录真实使用数据）
      const today = new Date();
      const dailyStats = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const requests = Math.floor(Math.random() * 200) + 100;
        const tokens = requests * Math.floor(Math.random() * 150) + 100;
        dailyStats.push({
          date: date.toISOString().split('T')[0],
          requests,
          tokens
        });
      }

      const mockUsageData = {
        success: true,
        data: {
          total_requests: usedQuota,
          total_tokens: usedQuota * 12, // 估算 token 数量
          today_requests: dailyUsed,
          today_tokens: dailyUsed * 12,
          quota: {
            total: totalQuota,
            used: usedQuota,
            remaining: totalQuota - usedQuota,
            daily_limit: dailyLimit,
            daily_used: dailyUsed
          },
          code_info: code ? {
            code: code.code,
            service: code.service,
            expires_at: code.expiresAt,
            status: code.status
          } : null,
          daily_stats: dailyStats
        }
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(mockUsageData));
      return;
    }

    // GET /user/api/v1/usage/model-trends - Get model usage trends
    if (apiPath.startsWith("/usage/model-trends") && req.method === "GET") {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        data: {
          models: [
            { name: 'claude-opus-4-6', requests: 8234, tokens: 1456789 },
            { name: 'claude-sonnet-4-6', requests: 5000, tokens: 800000 },
            { name: 'claude-haiku-4-5', requests: 2000, tokens: 200000 }
          ]
        }
      }));
      return;
    }

    // GET /user/api/v1/announcements - Get announcements
    if (apiPath === "/announcements" && req.method === "GET") {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        data: []
      }));
      return;
    }

    // GET /user/api/v1/channel-groups - Get channel groups
    if (apiPath === "/channel-groups" && req.method === "GET") {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        data: []
      }));
      return;
    }

    // Default response for unhandled user API endpoints
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, message: 'API endpoint not found' }));
    return;
  }

  // Proxy requests to yunyi.cfd API for user frontend
  if (urlPath.startsWith("/proxy/")) {
    const targetPath = urlPath.replace("/proxy", "");
    const targetUrl = `https://yunyi.cfd${targetPath}`;

    const options = {
      method: req.method,
      headers: req.headers
    };

    const proxyReq = https.request(targetUrl, options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error('Proxy error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Proxy error' }));
    });

    req.pipe(proxyReq);
    return;
  }

  // Handle root path
  if (urlPath === "/") {
    urlPath = "/index.html";
  }

  // Handle /user or /user/ path - serve user dashboard
  if (urlPath === "/user" || urlPath === "/user/") {
    urlPath = "/user/index.html";
  }

  // Handle /admin or /admin/ path - serve admin dashboard
  if (urlPath === "/admin" || urlPath === "/admin/") {
    urlPath = "/admin/index.html";
  }

  // Handle /activate or /activate/ path - serve activation page
  if (urlPath === "/activate" || urlPath === "/activate/") {
    urlPath = "/activate.html";
  }

  // Construct file path
  let filePath = path.join(FRONTEND_DIR, urlPath);

  // Security check: prevent directory traversal
  if (!filePath.startsWith(FRONTEND_DIR)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  // Serve the file
  serveStaticFile(filePath, res);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use.`);
    console.error(`Try: PORT=34021 fogact web`);
    process.exit(1);
  }

  console.error(error.message || String(error));
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  const addresses = getNetworkAddresses();

  console.log("");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║                                                              ║");
  console.log("║           FogAct Web UI                                      ║");
  console.log("║                                                              ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log("Server running on port", PORT);
  console.log("");
  console.log("Access URLs:");
  console.log("─────────────────────────────────────────────────────────────");
  console.log(`  Local:      http://localhost:${PORT}/`);
  console.log(`  Local:      http://127.0.0.1:${PORT}/`);

  if (addresses.length > 0) {
    addresses.forEach(addr => {
      console.log(`  Network:    http://${addr}:${PORT}/`);
    });
  }

  console.log("─────────────────────────────────────────────────────────────");
  console.log("");
  console.log("Press Ctrl+C to stop");
  console.log("");

  // 时区感知的每日刷新定时任务 - 每天凌晨0点（服务器时区）执行
  function getServerDate() {
    return new Date().toLocaleDateString("en-CA", { timeZone: SERVER_TIMEZONE });
  }

  function getNextRefreshDelay() {
    const now = new Date();
    const serverTzDate = new Date(now.toLocaleString("en-US", { timeZone: SERVER_TIMEZONE }));
    const midnight = new Date(serverTzDate);
    midnight.setHours(24, 0, 0, 0);
    const diff = midnight.getTime() - serverTzDate.getTime();
    return Math.max(diff, 1000);
  }

  function runDailyQuotaRefresh() {
    const codes = codeDb.getAll();
    const serverDate = getServerDate();
    let refreshedCount = 0;

    for (const code of codes) {
      if (code.status !== 'used') continue;

      const lastRefresh = code.lastQuotaRefresh ? new Date(code.lastQuotaRefresh) : null;
      const lastRefreshDate = lastRefresh
        ? new Date(lastRefresh.toLocaleString("en-CA", { timeZone: SERVER_TIMEZONE }))
        : null;
      if (lastRefreshDate && lastRefreshDate.toISOString().split('T')[0] === serverDate) continue;

      const dailyQuota = code.quota?.daily || 100000;
      codeDb.update(code.id, {
        quota: {
          ...code.quota,
          used: 0,
          daily: dailyQuota
        },
        lastQuotaRefresh: new Date().toISOString()
      });
      refreshedCount++;
    }

    if (refreshedCount > 0) {
      console.log(`[${new Date().toISOString()}] [时区: ${SERVER_TIMEZONE}] 每日额度刷新完成: ${refreshedCount} 个激活码已刷新`);
    }
  }

  function scheduleNextRefresh() {
    const delay = getNextRefreshDelay();
    console.log(`[${new Date().toISOString()}] 下次额度刷新时间: ${new Date(Date.now() + delay).toLocaleString("zh-CN", { timeZone: SERVER_TIMEZONE })} (${SERVER_TIMEZONE})`);
    setTimeout(() => {
      runDailyQuotaRefresh();
      // 之后每24小时执行一次
      setInterval(runDailyQuotaRefresh, 24 * 60 * 60 * 1000);
    }, delay);
  }

  scheduleNextRefresh();
});
