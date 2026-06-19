#!/usr/bin/env node

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { userDb, codeDb, usageDb, cardMergeDb, initializeSampleData } = require("../lib/services/database");
const { DEFAULT_CONFIG_PATH, getServiceBaseUrl, loadUpstreamConfig } = require("../lib/config/upstream");
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
  "未激活": "unused",
  active: "active",
  "活跃": "active",
  "已激活": "active",
  used: "active",
  "已使用": "active",
  disabled: "disabled",
  blocked: "disabled",
  banned: "disabled",
  "已禁用": "disabled",
  "禁用": "disabled",
  expired: "expired",
  "已过期": "expired",
  merged: "merged",
  "已合并": "merged",
  "已注销": "merged",
};

const CODE_STATUS_LABEL_MAP = {
  unused: "未激活",
  active: "活跃",
  disabled: "已禁用",
  expired: "已过期",
  merged: "已注销",
};

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

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
  const normalizedStatus = rawStatus === undefined || rawStatus === null || rawStatus === ""
    ? "unused"
    : CODE_STATUS_MAP[String(rawStatus).trim().toLowerCase()] || "unused";

  if (["disabled", "merged"].includes(normalizedStatus)) {
    return normalizedStatus;
  }

  if (rawExpiresAt) {
    const expiry = new Date(rawExpiresAt);
    if (!Number.isNaN(expiry.getTime()) && expiry < new Date()) {
      return "expired";
    }
  }

  return normalizedStatus;
}

function getCodeStatusLabel(codeOrStatus, expiresAt) {
  return CODE_STATUS_LABEL_MAP[normalizeCodeStatus(codeOrStatus, expiresAt)] || "未激活";
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
    statusLabel: getCodeStatusLabel(code),
    isExpired: status === "expired",
  };
}

function getActivationPlatforms(serviceKey) {
  if (serviceKey === "codex") return ["codex-cli"];
  if (serviceKey === "claude") return ["claude-code"];
  return [];
}

function getPublicBaseUrl(req) {
  const forwardedHost = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').split(',')[0].trim();
  const publicHost = forwardedHost && !forwardedHost.includes('fogact.fogact.com')
    ? forwardedHost
    : 'cliproxy.fogidc.com';
  const isLocalHost = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?)(:\d+)?$/i.test(publicHost);
  const defaultProtocol = isLocalHost ? 'http' : 'https';
  const publicProtocol = String(req?.headers?.['x-forwarded-proto'] || defaultProtocol).split(',')[0].trim() || defaultProtocol;
  return trimTrailingSlash(process.env.FOGACT_PUBLIC_BASE_URL || `${publicProtocol}://${publicHost}`);
}

function getProxyBaseUrl(req, serviceKey) {
  const publicBaseUrl = getPublicBaseUrl(req);
  return serviceKey === "claude" ? publicBaseUrl : `${publicBaseUrl}/v1`;
}

function buildActivationData(serializedCode, req) {
  const serviceKey = serializedCode.serviceKey;
  const publicBaseUrl = getPublicBaseUrl(req);
  const baseUrl = getProxyBaseUrl(req, serviceKey);
  const apiKey = String(serializedCode.code || "").trim();

  return {
    code: serializedCode.code,
    service: serializedCode.service,
    serviceKey,
    services: [serviceKey],
    platforms: getActivationPlatforms(serviceKey),
    allowedModels: serializedCode.allowedModels,
    quota: serializedCode.quota,
    expiresAt: serializedCode.expiresAt,
    proxy: true,
    publicBaseUrl,
    baseUrl,
    apiKey,
  };
}

function normalizeCodeSpecPayload(payload = {}) {
  const quota = { ...(payload.quota || {}) };
  const billingType = normalizeBillingType({ ...payload, quota });
  const cycleType = normalizeCycleType({ ...payload, quota });
  const quotaUnit = normalizeQuotaUnit({ ...payload, quota });
  const resetTimezone = "Asia/Shanghai";
  const subServiceType = String(payload.subServiceType || payload.sub_service_type || payload.category || "标准运营").trim() || "标准运营";
  const durationDays = Number(payload.durationDays || payload.duration || payload.validity?.days || quota.periodDays || 0);

  quota.billingType = billingType;
  quota.cycleType = cycleType;
  quota.unit = quotaUnit;
  quota.resetTimezone = resetTimezone;
  if (quota.dailyQuota !== undefined && quota.dailyLimit === undefined) quota.dailyLimit = Number(quota.dailyQuota || 0);
  if (quota.dailyLimit !== undefined && quota.dailyQuota === undefined) quota.dailyQuota = Number(quota.dailyLimit || 0);
  if (quota.daily !== undefined && quota.dailyLimit === undefined) quota.dailyLimit = Number(quota.daily || 0);
  if (quota.dailyQuota !== undefined) quota.dailyQuota = Number(quota.dailyQuota || 0);
  if (quota.dailyLimit !== undefined) quota.dailyLimit = Number(quota.dailyLimit || 0);
  if (durationDays > 0) quota.periodDays = durationDays;
  if (billingType === "duration" && Number(quota.dailyQuota || quota.dailyLimit || 0) > 0 && durationDays > 0) {
    quota.total = Number(quota.dailyQuota || quota.dailyLimit || 0) * durationDays;
  } else if (quota.total !== undefined) {
    quota.total = Number(quota.total || 0);
  }

  return {
    billingType,
    cycleType,
    quotaUnit,
    resetTimezone,
    subServiceType,
    category: subServiceType,
    quota,
  };
}

function withCodeSpec(payload = {}) {
  const spec = normalizeCodeSpecPayload(payload);
  return {
    ...payload,
    ...spec,
    quota: spec.quota,
  };
}

function ensureProxyReady(res, serviceKey) {
  const upstream = loadUpstreamConfig({ configPath: getUpstreamConfigPath() });
  const upstreamUrl = getServiceBaseUrl(upstream, serviceKey) || upstream.baseUrl;
  if (upstreamUrl && upstream.apiKey) {
    return true;
  }

  res.writeHead(500, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    success: false,
    valid: false,
    message: '上游服务未配置完整，请先在管理面板设置 NewAPI Base URL 和 API Key'
  }));
  return false;
}

function getBearerToken(req) {
  const auth = String(req.headers.authorization || "");
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (match) return match[1].trim();
  const apiKey = req.headers["x-api-key"] || req.headers["api-key"];
  return apiKey ? String(apiKey).trim() : "";
}

function getProxyCode(token, body) {
  return String(
    token ||
    body?.fogact_code ||
    body?.activation_code ||
    ""
  ).trim();
}

function getRequestCode(req) {
  return String(getBearerToken(req) || "").trim();
}

function findCodeByRequest(req) {
  const token = getRequestCode(req);
  return token ? codeDb.getByCode(token) : null;
}

function getActiveProxyCode(codeValue, serviceKey) {
  const code = codeDb.getByCode(String(codeValue || "").trim());
  if (!code) return { ok: false, status: 401, message: "激活码不存在或无效" };

  const serializedCode = serializeCode(code);
  if (!serviceMatches(serializedCode, serviceKey)) {
    return { ok: false, status: 403, message: `此激活码不支持 ${normalizeService(serviceKey)}` };
  }
  if (serializedCode.status === "disabled") {
    return { ok: false, status: 403, message: "此激活码已被禁用，无法访问中转" };
  }
  if (serializedCode.status === "expired") {
    return { ok: false, status: 403, message: "激活码已过期" };
  }
  if (serializedCode.status === "merged") {
    return { ok: false, status: 403, message: "此激活码已合并注销，无法继续使用" };
  }

  return { ok: true, code, serializedCode };
}

function getRemainingQuota(code) {
  const quota = code?.quota || {};
  const total = Number(quota.total || 0);
  const loggedUsed = aggregateUsageItems(getUsageItemsForCode(code)).tokens;
  const used = Math.max(loggedUsed, Number(quota.used || 0));
  if (!Number.isFinite(total) || total <= 0) return Infinity;
  return Math.max(total - (Number.isFinite(used) ? used : 0), 0);
}

function getRemainingDailyQuota(code) {
  const quota = code?.quota || {};
  const dailyLimit = Number(quota.dailyLimit || quota.daily || 0);
  const todayItems = getUsageItemsForCode(code).filter((item) => String(item.createdAt || '').startsWith(getTodayKey()));
  const todayStats = code?.usage?.dailyStats?.[getTodayKey()];
  const dailyUsed = aggregateUsageItems(todayItems).tokens || Number(todayStats?.tokens || 0);
  if (!Number.isFinite(dailyLimit) || dailyLimit <= 0) return Infinity;
  return Math.max(dailyLimit - (Number.isFinite(dailyUsed) ? dailyUsed : 0), 0);
}

function ensureQuotaAvailable(res, code) {
  if (getRemainingQuota(code) <= 0) {
    res.writeHead(402, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: "额度已用尽，请续费或更换可用激活码" } }));
    return false;
  }

  if (getRemainingDailyQuota(code) <= 0) {
    res.writeHead(429, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: "今日额度已用尽，请明日再试或联系管理员调整额度" } }));
    return false;
  }

  return true;
}

function getPeriodBuckets(period = "7d") {
  const normalized = String(period || "7d").toLowerCase();
  const hourly = normalized === "24h";
  const bucketCount = hourly ? 24 : Math.max(1, Math.min(90, parseInt(normalized, 10) || 7));
  const now = new Date();
  const buckets = [];

  for (let index = bucketCount - 1; index >= 0; index -= 1) {
    const date = new Date(now);
    if (hourly) {
      date.setMinutes(0, 0, 0);
      date.setHours(date.getHours() - index);
      buckets.push(date.toISOString().slice(0, 13));
    } else {
      date.setDate(date.getDate() - index);
      buckets.push(date.toISOString().slice(0, 10));
    }
  }

  return { period: normalized, hourly, buckets };
}

function getUsageBucketKey(createdAt, hourly) {
  const value = String(createdAt || "");
  return hourly ? value.slice(0, 13) : value.slice(0, 10);
}

function parseJsonBody(body) {
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch (_error) {
    return null;
  }
}

function extractRequestModel(rawBody) {
  const body = parseJsonBody(rawBody);
  return String(body?.model || body?.model_name || "unknown");
}

function extractUsageFromResponse(data) {
  const usage = data?.usage || data?.message?.usage || data?.response?.usage || data?.data?.usage || null;
  if (!usage || typeof usage !== "object") {
    return { inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0 };
  }

  const inputTokens = Number(
    usage.prompt_tokens ??
    usage.input_tokens ??
    usage.inputTokens ??
    usage.promptTokens ??
    0
  );
  const outputTokens = Number(
    usage.completion_tokens ??
    usage.output_tokens ??
    usage.outputTokens ??
    usage.completionTokens ??
    0
  );
  const explicitTotal = Number(
    usage.total_tokens ??
    usage.totalTokens ??
    usage.tokens ??
    0
  );
  const totalTokens = explicitTotal > 0
    ? explicitTotal
    : Math.max(inputTokens, 0) + Math.max(outputTokens, 0);
  const cost = Number(usage.cost ?? usage.total_cost ?? usage.quota ?? usage.used_quota ?? 0);

  return {
    inputTokens: Number.isFinite(inputTokens) ? Math.max(inputTokens, 0) : 0,
    outputTokens: Number.isFinite(outputTokens) ? Math.max(outputTokens, 0) : 0,
    totalTokens: Number.isFinite(totalTokens) ? Math.max(totalTokens, 0) : 0,
    cost: Number.isFinite(cost) ? Math.max(cost, 0) : 0,
  };
}

function extractModelFromResponse(data, fallbackModel) {
  return String(data?.model || data?.message?.model || data?.response?.model || data?.data?.model || fallbackModel || "unknown");
}

function parseResponseUsagePayloads(responseBody) {
  const json = parseJsonBody(responseBody);
  if (json) return [json];

  return String(responseBody || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter((line) => line && line !== "[DONE]")
    .map((line) => parseJsonBody(line))
    .filter(Boolean);
}

function summarizeResponseUsage(responseBody, fallbackModel) {
  const payloads = parseResponseUsagePayloads(responseBody);
  let model = fallbackModel || "unknown";
  const totals = { inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0 };

  for (const payload of payloads) {
    model = extractModelFromResponse(payload, model);
    const usage = extractUsageFromResponse(payload);
    totals.inputTokens = Math.max(totals.inputTokens, usage.inputTokens);
    totals.outputTokens = Math.max(totals.outputTokens, usage.outputTokens);
    totals.totalTokens = Math.max(totals.totalTokens, usage.totalTokens);
    totals.cost = Math.max(totals.cost, usage.cost);
  }

  if (totals.totalTokens <= 0) {
    totals.totalTokens = totals.inputTokens + totals.outputTokens;
  }

  return { model, usage: totals };
}

function settleProxyUsage(code, serializedCode, serviceKey, requestPath, statusCode, rawBody, responseBody) {
  const requestModel = extractRequestModel(rawBody);
  const summary = summarizeResponseUsage(responseBody, requestModel);
  const model = summary.model;
  const usageTokens = summary.usage;
  const success = statusCode >= 200 && statusCode < 300;
  const now = new Date().toISOString();

  usageDb.create({
    codeId: code.id,
    code: code.code,
    service: serviceKey,
    model,
    inputTokens: usageTokens.inputTokens,
    outputTokens: usageTokens.outputTokens,
    totalTokens: usageTokens.totalTokens,
    cost: usageTokens.cost,
    statusCode,
    success,
    path: requestPath,
    createdAt: now,
  });

  const current = codeDb.getById(code.id) || code;
  const nextQuota = { ...(current.quota || {}) };
  const currentUsage = current.usage || {};
  const dailyStats = { ...(currentUsage.dailyStats || {}) };
  const modelStats = { ...(currentUsage.modelStats || {}) };
  const today = getTodayKey();
  const quotaDelta = success ? usageTokens.totalTokens : 0;

  if (quotaDelta > 0) {
    const totalLoggedUsage = aggregateUsageItems(getUsageItemsForCode(current)).tokens;
    nextQuota.used = Math.max(Number(nextQuota.used || 0) + quotaDelta, totalLoggedUsage);
    nextQuota.dailyUsed = Number(nextQuota.dailyUsed || 0) + quotaDelta;

    const day = dailyStats[today] || { requests: 0, tokens: 0, inputTokens: 0, outputTokens: 0 };
    dailyStats[today] = {
      requests: Number(day.requests || 0) + 1,
      tokens: Number(day.tokens || 0) + quotaDelta,
      inputTokens: Number(day.inputTokens || 0) + usageTokens.inputTokens,
      outputTokens: Number(day.outputTokens || 0) + usageTokens.outputTokens,
    };

    const modelEntry = modelStats[model] || { requests: 0, tokens: 0, inputTokens: 0, outputTokens: 0 };
    modelStats[model] = {
      requests: Number(modelEntry.requests || 0) + 1,
      tokens: Number(modelEntry.tokens || 0) + quotaDelta,
      inputTokens: Number(modelEntry.inputTokens || 0) + usageTokens.inputTokens,
      outputTokens: Number(modelEntry.outputTokens || 0) + usageTokens.outputTokens,
    };
  }

  codeDb.update(code.id, {
    status: "active",
    usedBy: current.usedBy || "proxy-user",
    lastUsedAt: now,
    activatedService: serializedCode.service,
    activatedServiceKey: serializedCode.serviceKey,
    quota: nextQuota,
    usage: {
      totalRequests: Number(currentUsage.totalRequests || 0) + (quotaDelta > 0 ? 1 : 0),
      totalTokens: Number(currentUsage.totalTokens || 0) + quotaDelta,
      inputTokens: Number(currentUsage.inputTokens || 0) + (quotaDelta > 0 ? usageTokens.inputTokens : 0),
      outputTokens: Number(currentUsage.outputTokens || 0) + (quotaDelta > 0 ? usageTokens.outputTokens : 0),
      lastModel: quotaDelta > 0 ? model : currentUsage.lastModel,
      lastUsedAt: now,
      dailyStats: trimUsageHistory(dailyStats),
      modelStats,
    },
  });
}

function buildProxyHeaders(req, upstreamApiKey, bodyLength) {
  const headers = {};
  for (const [name, value] of Object.entries(req.headers)) {
    const key = name.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(key)) continue;
    if (key === "authorization" || key === "x-api-key" || key === "api-key") continue;
    if (key === "accept-encoding") continue;
    headers[name] = value;
  }
  headers.authorization = `Bearer ${upstreamApiKey}`;
  headers["accept-encoding"] = "identity";
  if (bodyLength !== undefined) headers["content-length"] = Buffer.byteLength(bodyLength);
  return headers;
}

function sanitizeProxyBody(req, rawBody) {
  if (!rawBody || !String(req.headers["content-type"] || "").includes("application/json")) {
    return rawBody;
  }

  try {
    const body = JSON.parse(rawBody);
    if (body && typeof body === "object" && !Array.isArray(body)) {
      delete body.fogact_code;
      delete body.activation_code;
      delete body.api_key;
      return JSON.stringify(body);
    }
  } catch (_error) {
    return rawBody;
  }

  return rawBody;
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function trimUsageHistory(history, limit = 90) {
  const entries = Object.entries(history || {}).sort(([a], [b]) => a.localeCompare(b));
  return Object.fromEntries(entries.slice(Math.max(0, entries.length - limit)));
}

function getUsageItemsForCode(code) {
  if (!code?.code) return [];
  return usageDb.getByCode(code.code).filter((item) => item.success !== false && Number(item.totalTokens || 0) > 0);
}

function aggregateUsageItems(items) {
  return items.reduce((totals, item) => {
    totals.requests += Number(item.requests || 1);
    totals.tokens += Number(item.totalTokens || 0);
    totals.inputTokens += Number(item.inputTokens || 0);
    totals.outputTokens += Number(item.outputTokens || 0);
    totals.cost += Number(item.cost || 0);
    return totals;
  }, { requests: 0, tokens: 0, inputTokens: 0, outputTokens: 0, cost: 0 });
}

function emptyUsageBucket(date) {
  return {
    date,
    requests: 0,
    total_tokens: 0,
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_create_tokens: 0,
    cost: 0,
  };
}

function getUsageHistoryForPeriod(code, period = "7d") {
  const { period: normalizedPeriod, hourly, buckets } = getPeriodBuckets(period);
  const items = getUsageItemsForCode(code);
  const byBucket = new Map(buckets.map((bucket) => [bucket, emptyUsageBucket(bucket)]));
  const bucketSet = new Set(buckets);

  for (const item of items) {
    const bucket = getUsageBucketKey(item.createdAt, hourly);
    if (!bucketSet.has(bucket)) continue;
    const current = byBucket.get(bucket) || emptyUsageBucket(bucket);
    current.requests += Number(item.requests || 1);
    current.total_tokens += Number(item.totalTokens || 0);
    current.input_tokens += Number(item.inputTokens || 0);
    current.output_tokens += Number(item.outputTokens || 0);
    current.cost += Number(item.cost || 0);
    byBucket.set(bucket, current);
  }

  return { period: normalizedPeriod, data: buckets.map((bucket) => byBucket.get(bucket) || emptyUsageBucket(bucket)) };
}

function getCodeUsagePayload(code, period = "7d") {
  const quota = code?.quota || {};
  const items = getUsageItemsForCode(code);
  const totals = aggregateUsageItems(items);
  const today = getTodayKey();
  const todayTotals = aggregateUsageItems(items.filter((item) => String(item.createdAt || '').startsWith(today)));
  const totalQuota = Number(quota.total || 0) > 0 ? Number(quota.total) : 100000;
  const history = getUsageHistoryForPeriod(code, period);

  return {
    period: history.period,
    data: history.data,
    total_requests: totals.requests,
    total_tokens: totals.tokens,
    input_tokens: totals.inputTokens,
    output_tokens: totals.outputTokens,
    today_requests: todayTotals.requests,
    today_tokens: todayTotals.tokens,
    quota: {
      total: totalQuota,
      used: totals.tokens,
      remaining: Math.max(0, totalQuota - totals.tokens),
      daily_limit: Number(quota.dailyLimit || quota.daily || 0),
      daily_used: todayTotals.tokens,
    },
    code_info: code ? {
      code: code.code,
      service: code.service,
      expires_at: code.expiresAt,
      status: code.status,
      last_used_at: code.lastUsedAt || null,
    } : null,
    daily_stats: history.data,
  };
}

function getCodeModelTrends(code, period = "7d") {
  const { period: normalizedPeriod, hourly, buckets } = getPeriodBuckets(period);
  const byBucket = new Map(buckets.map((bucket) => [bucket, new Map()]));
  const bucketSet = new Set(buckets);

  for (const item of getUsageItemsForCode(code)) {
    const bucket = getUsageBucketKey(item.createdAt, hourly);
    if (!bucketSet.has(bucket)) continue;
    const model = item.model || "unknown";
    const models = byBucket.get(bucket) || new Map();
    const current = models.get(model) || { model, requests: 0, total_tokens: 0, input_tokens: 0, output_tokens: 0, cost: 0 };
    current.requests += Number(item.requests || 1);
    current.total_tokens += Number(item.totalTokens || 0);
    current.input_tokens += Number(item.inputTokens || 0);
    current.output_tokens += Number(item.outputTokens || 0);
    current.cost += Number(item.cost || 0);
    models.set(model, current);
    byBucket.set(bucket, models);
  }

  return {
    period: normalizedPeriod,
    data: buckets.map((bucket) => ({
      date: bucket,
      models: [...(byBucket.get(bucket) || new Map()).values()].sort((a, b) => b.total_tokens - a.total_tokens),
    })),
  };
}

function getCodeUsageSummary(code) {
  const items = getUsageItemsForCode(code);
  const totals = aggregateUsageItems(items);
  const todayTotals = aggregateUsageItems(items.filter((item) => String(item.createdAt || '').startsWith(getTodayKey())));
  const legacyUsed = Number(code?.quota?.used || 0);

  if (totals.tokens <= 0 && legacyUsed > 0) {
    totals.tokens = legacyUsed;
    totals.totalTokens = legacyUsed;
    totals.requests = Number(code?.usage?.totalRequests || 0);
    totals.inputTokens = Number(code?.usage?.inputTokens || 0);
    totals.outputTokens = Number(code?.usage?.outputTokens || 0);
  }

  return { totals, todayTotals };
}

function serializeCodeForUserApi(code) {
  if (!code) return null;

  const serialized = serializeCode(code);
  const { totals, todayTotals } = getCodeUsageSummary(code);
  const quota = code.quota || {};
  const totalQuota = Number(quota.total || 0) > 0 ? Number(quota.total) : 100000;
  const usedQuota = totals.tokens;
  const dailyLimit = Number(quota.dailyLimit || quota.daily || 0);
  const status = serialized.status === "unused" ? "inactive" : serialized.status;
  const activatedAt = code.activatedAt || (status === "active" ? code.createdAt : null);

  return {
    id: code.id,
    key_preview: maskKey(code.code),
    service_type: serialized.serviceKey,
    sub_service_type_name: serialized.subServiceType || serialized.sub_service_type || serialized.category || "",
    billing_type: normalizeBillingType(code),
    cycle_type: normalizeCycleType(code),
    quota_unit: normalizeQuotaUnit(code),
    reset_timezone: serialized.resetTimezone || serialized.reset_timezone || quota.resetTimezone || SERVER_TIMEZONE,
    allowed_models: serialized.allowedModels,
    status,
    status_label: status === "inactive" ? "未激活" : serialized.statusLabel,
    is_bound: false,
    channel_group_id: code.channelGroupId || null,
    quota: {
      total_quota: totalQuota,
      used_quota: usedQuota,
      remaining_quota: Math.max(0, totalQuota - usedQuota),
      daily_quota: dailyLimit,
      daily_spent: todayTotals.tokens,
      daily_remaining: dailyLimit > 0 ? Math.max(0, dailyLimit - todayTotals.tokens) : 0,
      unit: normalizeQuotaUnit(code),
      reset_timezone: serialized.resetTimezone || serialized.reset_timezone || quota.resetTimezone || SERVER_TIMEZONE,
      next_reset_at: getNextResetAt(),
    },
    usage: {
      total_spent: totals.cost,
      daily_spent: todayTotals.cost,
      daily_total_spent: todayTotals.cost,
      request_count: totals.requests,
      daily_request_count: todayTotals.requests,
      input_tokens: totals.inputTokens,
      output_tokens: totals.outputTokens,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      total_tokens: totals.tokens,
    },
    timestamps: {
      activated_at: activatedAt,
      last_used_at: code.lastUsedAt || null,
      expires_at: code.expiresAt || null,
      validity_days: code.validity?.days || null,
    },
  };
}

function getNextResetAt() {
  const next = new Date();
  const serverTzDate = new Date(next.toLocaleString("en-US", { timeZone: SERVER_TIMEZONE }));
  const serverMidnight = new Date(serverTzDate);
  serverMidnight.setHours(24, 0, 0, 0);
  const delay = serverMidnight.getTime() - serverTzDate.getTime();
  return new Date(next.getTime() + Math.max(delay, 1000)).toISOString();
}

function resolveUserApiCode(req) {
  const code = findCodeByRequest(req);
  return code || null;
}

function sendUserApiUnauthorized(res, message = "请先添加有效的 FogAct Key") {
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: false, message }));
}

function normalizeBillingType(code) {
  const raw = String(code?.billingType || code?.billing_type || code?.quota?.billingType || code?.quota?.type || code?.type || "quota").toLowerCase();
  if (["monthly", "duration", "subscription"].includes(raw)) return "duration";
  if (["fixed", "quota", "balance"].includes(raw)) return "quota";
  if (["count", "request", "requests"].includes(raw)) return "count";
  return raw || "quota";
}

function normalizeCycleType(code) {
  const raw = String(code?.cycleType || code?.cycle_type || code?.quota?.cycleType || code?.quota?.cycle || code?.quota?.type || code?.type || "fixed").toLowerCase();
  if (["monthly", "month", "duration", "subscription"].includes(raw)) return "monthly";
  if (["daily", "day"].includes(raw)) return "daily";
  if (["fixed", "quota", "one-time", "onetime"].includes(raw)) return "fixed";
  return raw || "fixed";
}

function normalizeQuotaUnit(code) {
  return String(code?.quotaUnit || code?.quota_unit || code?.quota?.unit || "tokens").trim().toLowerCase() || "tokens";
}

function getCodeSubServiceType(code) {
  return String(code?.subServiceType || code?.sub_service_type || code?.category || "").trim();
}

function getDailyQuota(code) {
  return Number(code?.quota?.dailyQuota ?? code?.quota?.dailyLimit ?? code?.quota?.daily ?? 0);
}

function getTotalQuota(code) {
  return Number(code?.quota?.total ?? code?.quota?.totalQuota ?? 0);
}

function getCodeDurationDays(code) {
  const configured = Number(code?.durationDays ?? code?.validity?.days ?? code?.quota?.periodDays ?? 0);
  if (Number.isFinite(configured) && configured > 0) return configured;
  if (!code?.createdAt || !code?.expiresAt) return 0;

  const start = new Date(code.createdAt).getTime();
  const end = new Date(code.expiresAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return (end - start) / 86400000;
}

function getCardSpec(code) {
  const serialized = serializeCode(code);
  return {
    serviceType: serialized.serviceKey,
    billingType: normalizeBillingType(code),
    cycleType: normalizeCycleType(code),
    quotaUnit: normalizeQuotaUnit(code),
    resetTimezone: code?.resetTimezone || code?.reset_timezone || code?.quota?.resetTimezone || code?.quota?.reset_timezone || SERVER_TIMEZONE,
    subServiceType: getCodeSubServiceType(code),
    allowedModels: Array.isArray(serialized.allowedModels) ? serialized.allowedModels.map(String) : [],
    dailyQuota: getDailyQuota(code),
    totalQuota: getTotalQuota(code),
    durationDays: getCodeDurationDays(code),
  };
}

function isAllowedModelsCompatible(parentModels, childModels) {
  if (!childModels.length) return true;
  if (!parentModels.length) return false;
  const parentSet = new Set(parentModels);
  return childModels.every((model) => parentSet.has(model));
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 86400000);
}

function getMergeBaseDate(parentCode) {
  const expiresAt = parentCode?.expiresAt ? new Date(parentCode.expiresAt) : null;
  const now = new Date();
  if (expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt > now) return expiresAt;
  return now;
}

function validateCardMerge(parentCode, childCode) {
  if (!parentCode) return { ok: false, message: "当前父卡不存在" };
  if (!childCode) return { ok: false, message: "子卡不存在" };
  if (parentCode.id === childCode.id) return { ok: false, message: "不能合并自己" };

  const parentStatus = normalizeCodeStatus(parentCode);
  const childStatus = normalizeCodeStatus(childCode);
  if (parentStatus === "disabled") return { ok: false, message: "父卡已禁用，不能叠卡" };
  if (parentStatus === "merged") return { ok: false, message: "父卡已注销，不能叠卡" };
  if (!['active', 'expired'].includes(parentStatus)) return { ok: false, message: "父卡必须是活跃或已过期状态" };
  if (childStatus !== "unused") return { ok: false, message: "子卡必须是未激活状态，不能使用已激活/已过期/已禁用卡" };
  if (childCode.enabled === false) return { ok: false, message: "子卡已禁用，不能叠卡" };
  if (childCode.usedBy || childCode.activatedAt || childCode.mergedInto) return { ok: false, message: "子卡必须是未激活且未使用的卡" };

  const parentSpec = getCardSpec(parentCode);
  const childSpec = getCardSpec(childCode);
  const checks = [
    ["serviceType", "服务类型不一致，Codex 和 Claude 不能互通额度"],
    ["billingType", "计费类型不一致，时长/额度/次数不能混叠"],
    ["cycleType", "周期类型不一致，月卡/日包/固定有效期不能混叠"],
    ["quotaUnit", "额度单位不一致，token/次数/余额不能混用"],
    ["subServiceType", "套餐类型不一致，暂不支持跨套餐叠卡"],
  ];

  for (const [field, message] of checks) {
    if (parentSpec[field] !== childSpec[field]) return { ok: false, message };
  }

  if (parentSpec.resetTimezone !== "Asia/Shanghai" || childSpec.resetTimezone !== "Asia/Shanghai") {
    return { ok: false, message: "叠卡只支持北京时间刷新额度" };
  }

  if (!isAllowedModelsCompatible(parentSpec.allowedModels, childSpec.allowedModels)) {
    return { ok: false, message: "子卡模型权限不能超过父卡" };
  }

  return { ok: true, parentSpec, childSpec };
}

function previewCardMerge(parentCode, childCode) {
  const validation = validateCardMerge(parentCode, childCode);
  if (!validation.ok) return validation;

  const { parentSpec, childSpec } = validation;
  const oldExpiresAt = parentCode.expiresAt || null;
  let addedDays = 0;
  let addedQuota = 0;
  let childTotalValue = 0;
  let mergeMode = "quota_add";
  let newExpiresAt = oldExpiresAt;

  if (parentSpec.billingType === "duration") {
    if (parentSpec.dailyQuota <= 0 || childSpec.dailyQuota <= 0 || childSpec.durationDays <= 0) {
      return { ok: false, message: "周期卡必须配置每日额度和有效天数" };
    }
    childTotalValue = childSpec.dailyQuota * childSpec.durationDays;
    addedDays = childTotalValue / parentSpec.dailyQuota;
    mergeMode = parentSpec.dailyQuota === childSpec.dailyQuota ? "duration_equal" : "duration_value_convert";
    newExpiresAt = addDays(getMergeBaseDate(parentCode), addedDays).toISOString();
  } else if (parentSpec.billingType === "quota") {
    addedQuota = childSpec.totalQuota;
    addedDays = childSpec.durationDays;
    if (addedQuota <= 0) return { ok: false, message: "额度卡必须配置可叠加总额度" };
    if (addedDays > 0) newExpiresAt = addDays(getMergeBaseDate(parentCode), addedDays).toISOString();
  } else if (parentSpec.billingType === "count") {
    addedQuota = childSpec.totalQuota;
    addedDays = childSpec.durationDays;
    if (addedQuota <= 0) return { ok: false, message: "次数卡必须配置可叠加次数" };
    if (addedDays > 0) newExpiresAt = addDays(getMergeBaseDate(parentCode), addedDays).toISOString();
    mergeMode = "count_add";
  } else {
    return { ok: false, message: "暂不支持该计费类型叠卡" };
  }

  return {
    ok: true,
    parentSpec,
    childSpec,
    mergeMode,
    oldExpiresAt,
    newExpiresAt,
    addedDays,
    addedQuota,
    childTotalValue,
  };
}

function serializeMergeCode(code) {
  if (!code) return null;
  const data = serializeCodeForUserApi(code);
  return {
    id: code.id,
    code: code.code,
    key_preview: data?.key_preview || maskKey(code.code),
    service_type: data?.service_type || getServiceKey(code.service),
    sub_service_type_name: data?.sub_service_type_name || getCodeSubServiceType(code),
    billing_type: data?.billing_type || normalizeBillingType(code),
    cycle_type: normalizeCycleType(code),
    quota_unit: normalizeQuotaUnit(code),
    daily_quota: getDailyQuota(code),
    total_quota: getTotalQuota(code),
    status: data?.status || normalizeCodeStatus(code),
    status_label: data?.status_label || getCodeStatusLabel(code.status),
    expires_at: code.expiresAt || null,
  };
}

function serializeMergeRecord(record) {
  return {
    id: record.id,
    key_preview: maskKey(record.childCode),
    child_code_id: record.childCodeId,
    child_code: record.childCode,
    status: "merged",
    status_label: "已合并",
    billing_type: record.billingType,
    cycle_type: record.cycleType,
    quota_unit: record.quotaUnit,
    daily_quota: record.childDailyQuota,
    total_quota: record.childTotalValue || record.addedQuota,
    added_days: record.addedDays,
    added_quota: record.addedQuota,
    merge_mode: record.mergeMode,
    created_at: record.createdAt,
    expires_at: record.newExpiresAt,
  };
}

function getCardMergeInfo(parentCode) {
  const records = parentCode ? cardMergeDb.getByParent(parentCode.id) : [];
  return {
    success: true,
    data: {
      parent: serializeMergeCode(parentCode),
      children: records.map(serializeMergeRecord).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)),
      mode: "merge",
      description: "子卡合并后会注销，额度或时长一次性转入当前卡。",
    },
  };
}

function mergeChildIntoParent(parentCode, childCode) {
  const preview = previewCardMerge(parentCode, childCode);
  if (!preview.ok) return preview;

  const parentQuota = { ...(parentCode.quota || {}) };
  const childQuota = { ...(childCode.quota || {}) };
  const parentUpdates = {
    status: normalizeCodeStatus(parentCode) === "expired" ? "active" : parentCode.status,
    lastMergedAt: new Date().toISOString(),
  };

  if (preview.parentSpec.billingType === "duration") {
    const parentDurationDays = Number(parentCode.durationDays || parentQuota.periodDays || 0);
    parentQuota.total = Number(parentQuota.total || 0) + preview.childTotalValue;
    parentQuota.periodDays = parentDurationDays + preview.addedDays;
    parentUpdates.expiresAt = preview.newExpiresAt;
    parentUpdates.durationDays = parentDurationDays + preview.addedDays;
    parentUpdates.quota = parentQuota;
  } else {
    parentQuota.total = Number(parentQuota.total || 0) + preview.addedQuota;
    parentUpdates.quota = parentQuota;
    if (preview.newExpiresAt) parentUpdates.expiresAt = preview.newExpiresAt;
  }

  const updatedParent = codeDb.update(parentCode.id, parentUpdates);
  const updatedChild = codeDb.update(childCode.id, {
    status: "merged",
    enabled: false,
    mergedInto: parentCode.id,
    mergedAt: new Date().toISOString(),
    quota: {
      ...childQuota,
      used: Number(childQuota.total || 0),
      merged: true,
    },
  });

  const record = cardMergeDb.create({
    parentCodeId: parentCode.id,
    parentCode: parentCode.code,
    childCodeId: childCode.id,
    childCode: childCode.code,
    serviceType: preview.parentSpec.serviceType,
    subServiceType: preview.parentSpec.subServiceType,
    billingType: preview.parentSpec.billingType,
    cycleType: preview.parentSpec.cycleType,
    quotaUnit: preview.parentSpec.quotaUnit,
    timezone: "Asia/Shanghai",
    mergeMode: preview.mergeMode,
    parentDailyQuota: preview.parentSpec.dailyQuota,
    childDailyQuota: preview.childSpec.dailyQuota,
    childDays: preview.childSpec.durationDays,
    childTotalValue: preview.childTotalValue,
    addedDays: preview.addedDays,
    addedQuota: preview.addedQuota,
    oldExpiresAt: preview.oldExpiresAt,
    newExpiresAt: preview.newExpiresAt,
  });

  return { ok: true, parent: updatedParent, child: updatedChild, record, preview };
}

function getCodeUsageRank(code) {
  const items = getUsageItemsForCode(code);
  const totals = aggregateUsageItems(items);
  const latestUsageAt = items.reduce((latest, item) => {
    const createdAt = new Date(item.createdAt || 0).getTime();
    return Number.isFinite(createdAt) ? Math.max(latest, createdAt) : latest;
  }, 0);
  const lastUsedAt = new Date(code?.lastUsedAt || 0).getTime();

  return {
    tokens: totals.tokens,
    requests: totals.requests,
    latestAt: Math.max(
      Number.isFinite(latestUsageAt) ? latestUsageAt : 0,
      Number.isFinite(lastUsedAt) ? lastUsedAt : 0
    ),
  };
}

function sortCodesByUsageActivity(codes) {
  return [...codes].sort((a, b) => {
    const left = getCodeUsageRank(a);
    const right = getCodeUsageRank(b);
    if (right.tokens !== left.tokens) return right.tokens - left.tokens;
    if (right.requests !== left.requests) return right.requests - left.requests;
    return right.latestAt - left.latestAt;
  });
}

function findUsageCode(username, user) {
  const codes = codeDb.getAll();
  const requestedUser = String(username || '').trim();
  const candidateValues = [requestedUser];
  if (!requestedUser || user?.username === requestedUser) {
    candidateValues.push(user?.username, user?.email, user?.id);
  }
  const candidates = new Set(candidateValues.filter(Boolean).map(String));
  const matchedCodes = codes.filter((code) => candidates.has(String(code.usedBy || '')));

  return sortCodesByUsageActivity(matchedCodes)[0] ||
    sortCodesByUsageActivity(codes.filter((code) => normalizeCodeStatus(code) === 'active'))[0] ||
    null;
}


function proxyUpstreamRequest(req, res, serviceKey, code, rawBody) {
  const upstream = loadUpstreamConfig({ configPath: getUpstreamConfigPath() });
  const upstreamUrl = getServiceBaseUrl(upstream, serviceKey) || upstream.baseUrl;
  const upstreamApiKey = upstream.apiKey;
  if (!upstreamUrl || !upstreamApiKey) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, error: { message: "上游服务未配置完整" } }));
    return;
  }

  const upstreamBase = trimTrailingSlash(upstreamUrl);
  const requestPath = req.url.split("?")[0];
  const query = req.url.includes("?") ? `?${req.url.split("?").slice(1).join("?")}` : "";
  const upstreamPath = serviceKey === "claude"
    ? requestPath
    : requestPath.replace(/^\/v1(?=\/|$)/, "") || "/";
  const target = new URL(`${upstreamBase}${upstreamPath}${query}`);
  const client = target.protocol === "https:" ? https : http;
  const upstreamBody = sanitizeProxyBody(req, rawBody);
  const headers = buildProxyHeaders(req, upstreamApiKey, upstreamBody);

  const proxyReq = client.request({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port || (target.protocol === "https:" ? 443 : 80),
    path: `${target.pathname}${target.search}`,
    method: req.method,
    headers,
  }, (proxyRes) => {
    const responseHeaders = { ...proxyRes.headers };
    delete responseHeaders["transfer-encoding"];
    delete responseHeaders.connection;
    res.writeHead(proxyRes.statusCode || 502, responseHeaders);

    const chunks = [];
    proxyRes.on("data", (chunk) => {
      chunks.push(chunk);
      res.write(chunk);
    });
    proxyRes.on("end", () => {
      res.end();
      const rawResponseBody = Buffer.concat(chunks).toString("utf8");
      settleProxyUsage(code, code.serializedCode || serializeCode(code), serviceKey, requestPath, proxyRes.statusCode || 502, upstreamBody, rawResponseBody);
    });
  });

  proxyReq.on("error", (error) => {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, error: { message: error.message } }));
  });

  if (upstreamBody) proxyReq.write(upstreamBody);
  proxyReq.end();

}

function trimTrailingSlash(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function getUpstreamConfigPath() {
  return process.env.FOGACT_UPSTREAM_CONFIG || DEFAULT_CONFIG_PATH;
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
    const isUserAsset = filePath.includes(`${path.sep}user${path.sep}assets${path.sep}`);

    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": (ext === '.html' || isAdminFile || isUserAsset)
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, API-Key');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Parse URL and remove query string
  let urlPath = req.url.split('?')[0];

  const isCodexProxyPath = urlPath === "/v1" || urlPath.startsWith("/v1/");
  const isClaudeProxyPath = urlPath.startsWith("/anthropic/") || urlPath === "/v1/messages" || urlPath.startsWith("/v1/messages/");
  if (req.method !== "OPTIONS" && (isCodexProxyPath || isClaudeProxyPath)) {
    const serviceKey = isClaudeProxyPath ? "claude" : "codex";
    let rawBody = "";
    req.on("data", (chunk) => {
      rawBody += chunk.toString();
    });
    req.on("end", () => {
      let body = null;
      if (rawBody && String(req.headers["content-type"] || "").includes("application/json")) {
        try {
          body = JSON.parse(rawBody);
        } catch (_error) {
          body = null;
        }
      }

      const token = getBearerToken(req);
      const codeValue = getProxyCode(token, body);
      const codeCheck = getActiveProxyCode(codeValue, serviceKey);
      if (!codeCheck.ok) {
        res.writeHead(codeCheck.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: codeCheck.message } }));
        return;
      }

      if (!ensureQuotaAvailable(res, codeCheck.code)) {
        return;
      }

      proxyUpstreamRequest(req, res, serviceKey, codeCheck.code, rawBody);
    });
    req.on("error", () => {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "请求读取失败" } }));
    });
    return;
  }

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

  if (urlPath === "/health" && req.method === "GET") {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, status: 'ok', service: 'fogact' }));
    return;
  }

  if (urlPath === "/api/nodes" && req.method === "GET") {
    const publicUrl = getPublicBaseUrl(req);
    const nodes = [
      { name: "FogAct", url: publicUrl, region: "Global" },
    ];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, nodes }));
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
          const newCode = codeDb.create(withCodeSpec({
            ...(codeData.code && services.length === 1 && count === 1 ? { code: codeData.code } : {}),
            service,
            serviceKey,
            allowedModels: [serviceKey],
            quota: codeData.quota || { total: 1000000, used: 0 },
            expiresAt,
            notes: codeData.notes || codeData.note,
            status: "unused",
            type: codeData.type,
            billingType: codeData.billingType,
            cycleType: codeData.cycleType,
            quotaUnit: codeData.quotaUnit,
            resetTimezone: "Asia/Shanghai",
            subServiceType: codeData.subServiceType,
            category: codeData.category,
            durationDays: codeData.duration,
          }));
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
      const existingCode = codeDb.getById(codeId);
      if (!existingCode) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: '激活码不存在' }));
        return;
      }

      const payload = { ...updates };
      if (payload.service !== undefined) {
        payload.service = normalizeService(payload.service);
        payload.serviceKey = getServiceKey(payload.service);
        payload.allowedModels = [payload.serviceKey];
      }
      if (payload.status !== undefined) {
        payload.status = normalizeCodeStatus(payload.status);
      }
      const normalized = withCodeSpec({
        ...existingCode,
        ...payload,
        quota: { ...(existingCode.quota || {}), ...(payload.quota || {}) },
      });
      Object.assign(payload, {
        billingType: normalized.billingType,
        cycleType: normalized.cycleType,
        quotaUnit: normalized.quotaUnit,
        resetTimezone: normalized.resetTimezone,
        subServiceType: normalized.subServiceType,
        category: normalized.category,
        quota: normalized.quota,
      });

      const updatedCode = codeDb.update(codeId, payload);

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

      const statusKey = normalizeCodeStatus(code);
      if (statusKey === 'disabled') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: '此激活码已被禁用，无法激活配置' }));
        return;
      }
      if (statusKey === 'expired') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: '激活码已过期' }));
        return;
      }
      if (statusKey === 'merged') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: '此激活码已合并注销，无法激活配置' }));
        return;
      }

      // 检查是否过期
      if (code.expiresAt && new Date(code.expiresAt) < new Date()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: '激活码已过期' }));
        return;
      }

      const activationData = buildActivationData(serializedCode, req);
      if (!ensureProxyReady(res, serializedCode.serviceKey)) {
        return;
      }

      // 记录最近一次配置时间；不消费激活码，允许同一个 Key 反复自动配置。
      const updatedCode = codeDb.update(code.id, {
        status: 'active',
        usedBy: userId || username || email || code.usedBy || 'unknown',
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
          ...buildActivationData(serializeCode(updatedCode), req),
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
      const dailyQuota = code.quota?.dailyLimit || code.quota?.daily || 100000;
      const updatedCode = codeDb.update(codeId, {
        quota: {
          ...code.quota,
          dailyUsed: 0,
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
    const usedCodes = codes.filter(c => normalizeCodeStatus(c) === 'active').length;
    const unusedCodes = codes.filter(c => normalizeCodeStatus(c) === 'unused').length;
    const expiredCodes = codes.filter(c => normalizeCodeStatus(c) === 'expired').length;
    const mergedCodes = codes.filter(c => normalizeCodeStatus(c) === 'merged').length;

    const stats = {
      totalUsers,
      activeUsers,
      totalCodes,
      usedCodes,
      unusedCodes,
      expiredCodes,
      mergedCodes,
      systemStatus: '运行正常',
      uptime: Math.floor(process.uptime() / 86400) + ' 天'
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: stats }));
    return;
  }

  // Legacy user usage endpoint kept for older clients; backed by the real activation code usage log.
  if (urlPath === "/api/user/usage" && req.method === "GET") {
    const code = resolveUserApiCode(req);
    if (!code) {
      sendUserApiUnauthorized(res, "FogAct Key 不存在或已失效");
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const period = url.searchParams.get("period") || "7d";
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: getCodeUsagePayload(code, period) }));
    return;
  }

  // Legacy user info endpoint kept for older clients; backed by the real activation code.
  if (urlPath === "/api/user/info" && req.method === "GET") {
    const data = serializeCodeForUserApi(resolveUserApiCode(req));
    if (!data) {
      sendUserApiUnauthorized(res, "FogAct Key 不存在或已失效");
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, data }));
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
        if (serializedCode.status === 'expired') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, valid: false, message: '激活码已过期' }));
          return;
        }
        if (serializedCode.status === 'disabled') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, valid: false, message: '此激活码已被禁用，无法激活配置' }));
          return;
        }
        if (serializedCode.status === 'merged') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, valid: false, message: '此激活码已合并注销，无法激活配置' }));
          return;
        }

        const activationData = buildActivationData(serializedCode, req);
        if (!ensureProxyReady(res, serializedCode.serviceKey)) {
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          valid: true,
          message: '验证成功',
          data: activationData
        }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        valid: false,
        message: '请使用 FogAct 激活码验证'
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
      const code = resolveUserApiCode(req);
      const data = serializeCodeForUserApi(code);

      if (!data) {
        sendUserApiUnauthorized(res, "FogAct Key 不存在或已失效");
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }

    // GET /user/api/v1/usage/history - Get usage history
    if (apiPath.startsWith("/usage/history") && req.method === "GET") {
      const code = resolveUserApiCode(req);
      if (!code) {
        sendUserApiUnauthorized(res, "FogAct Key 不存在或已失效");
        return;
      }

      const url = new URL(req.url, `http://${req.headers.host}`);
      const period = url.searchParams.get("period") || "7d";
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getCodeUsagePayload(code, period)));
      return;
    }

    // GET /user/api/v1/usage/model-trends - Get model usage trends
    if (apiPath.startsWith("/usage/model-trends") && req.method === "GET") {
      const code = resolveUserApiCode(req);
      if (!code) {
        sendUserApiUnauthorized(res, "FogAct Key 不存在或已失效");
        return;
      }

      const url = new URL(req.url, `http://${req.headers.host}`);
      const period = url.searchParams.get("period") || "7d";
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getCodeModelTrends(code, period)));
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


    // POST /user/api/v1/batch-info - Validate multiple saved keys
    if (apiPath === "/batch-info" && req.method === "POST") {
      parseRequestBody(req).then((data) => {
        const keys = Array.isArray(data.keys) ? data.keys : [];
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          results: keys.map((key) => serializeCodeForUserApi(codeDb.getByCode(String(key || '').trim()))),
        }));
      }).catch(() => {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: '请求格式错误' }));
      });
      return;
    }

    // Card merge APIs: child cards are merged into the current parent card and then disabled.
    if (apiPath === "/card-bind/info" && req.method === "GET") {
      const code = resolveUserApiCode(req);
      if (!code) {
        sendUserApiUnauthorized(res, "FogAct Key 不存在或已失效");
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getCardMergeInfo(code)));
      return;
    }

    if (apiPath === "/card-bind/bind" && req.method === "POST") {
      const parentCode = resolveUserApiCode(req);
      if (!parentCode) {
        sendUserApiUnauthorized(res, "FogAct Key 不存在或已失效");
        return;
      }

      parseRequestBody(req).then((data) => {
        const childKeys = Array.isArray(data.child_keys) ? data.child_keys : [];
        if (!childKeys.length) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: '请输入要合并的子卡' }));
          return;
        }

        const uniqueChildKeys = [...new Set(childKeys.map((key) => String(key || '').trim()).filter(Boolean))];
        if (uniqueChildKeys.length !== childKeys.length) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: '子卡列表不能包含空值或重复卡' }));
          return;
        }

        let previewParent = codeDb.getById(parentCode.id) || parentCode;
        const childCodes = [];
        for (const childKey of uniqueChildKeys) {
          const childCode = codeDb.getByCode(childKey);
          const preview = previewCardMerge(previewParent, childCode);
          if (!preview.ok) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: preview.message }));
            return;
          }
          childCodes.push(childCode);
          previewParent = {
            ...previewParent,
            expiresAt: preview.newExpiresAt || previewParent.expiresAt,
            quota: preview.parentSpec.billingType === "duration"
              ? previewParent.quota
              : { ...(previewParent.quota || {}), total: Number(previewParent.quota?.total || 0) + preview.addedQuota },
            status: normalizeCodeStatus(previewParent) === "expired" ? "active" : previewParent.status,
          };
        }

        const merged = [];
        for (const childCode of childCodes) {
          const result = mergeChildIntoParent(codeDb.getById(parentCode.id) || parentCode, childCode);
          if (!result.ok) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: result.message }));
            return;
          }
          merged.push(serializeMergeRecord(result.record));
        }

        const latestParent = codeDb.getById(parentCode.id);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: `成功合并 ${merged.length} 张子卡`,
          data: {
            parent: serializeCodeForUserApi(latestParent),
            children: merged,
          },
        }));
      }).catch(() => {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: '请求格式错误' }));
      });
      return;
    }

    if (["/card-bind/unbind", "/card-bind/unbind-self", "/card-bind/reorder"].includes(apiPath)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: '叠卡合并后子卡会注销，不支持解绑或排序' }));
      return;
    }

    if (["/renew/preview", "/renew/execute", "/quota-pack/redeem-preview", "/quota-pack/redeem"].includes(apiPath)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: null, message: '操作已提交' }));
      return;
    }

    if (apiPath === "/channel-group" && req.method === "PUT") {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      return;
    }

    // Default response for unhandled user API endpoints
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, message: '接口不存在' }));
    return;
  }

  // Handle root path
  if (urlPath === "/") {
    urlPath = "/index.html";
  }

  // Handle user frontend routes - serve SPA entry for direct navigation.
  if (
    urlPath === "/user" ||
    urlPath === "/user/" ||
    (urlPath.startsWith("/user/") && !urlPath.startsWith("/user/assets/"))
  ) {
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
      if (normalizeCodeStatus(code) !== 'active') continue;

      const lastRefresh = code.lastQuotaRefresh ? new Date(code.lastQuotaRefresh) : null;
      const lastRefreshDate = lastRefresh
        ? new Date(lastRefresh.toLocaleString("en-CA", { timeZone: SERVER_TIMEZONE }))
        : null;
      if (lastRefreshDate && lastRefreshDate.toISOString().split('T')[0] === serverDate) continue;

      const dailyQuota = code.quota?.daily || code.quota?.dailyLimit || 100000;
      codeDb.update(code.id, {
        quota: {
          ...code.quota,
          daily: dailyQuota,
          dailyUsed: 0
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
