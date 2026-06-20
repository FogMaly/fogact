"use strict";

const prompts = require("prompts");
const { testNodes, selectBestNode, stabilityLabel } = require("./node-service");
const { detectPlatforms, getPlatforms } = require("../platforms");
const { createActivationBackup } = require("./backup-service");
const { getNodes, inspectActivationCode, testNode, verifyActivationCode } = require("./fogact-api");
const { maskKey } = require("./newapi");

const SUPPORTED_SERVICES = ["codex", "claude"];
const SERVICE_LABELS = {
  claude: "Claude Code",
  codex: "Codex",
};
const CREATABLE_PLATFORM_IDS = new Set(["claude-code", "codex-cli", "opencode", "openclaw"]);

function normalizeService(service) {
  const value = String(service || "").trim().toLowerCase();
  if (["claude", "claude-code", "claude code", "anthropic"].includes(value)) {
    return "claude";
  }
  if (["codex", "codex-cli", "codex cli", "openai", "gpt"].includes(value)) {
    return "codex";
  }
  if (value.includes("claude")) {
    return "claude";
  }
  if (value.includes("codex") || value.includes("openai") || value.includes("gpt")) {
    return "codex";
  }
  return value;
}

function getServiceLabel(service) {
  return SERVICE_LABELS[service] || service;
}

function flattenValues(values) {
  const result = [];
  for (const value of values) {
    if (Array.isArray(value)) {
      result.push(...flattenValues(value));
      continue;
    }
    if (value && typeof value === "object") {
      result.push(...flattenValues(Object.values(value)));
      continue;
    }
    if (typeof value === "string" && value.includes(",")) {
      result.push(...value.split(","));
      continue;
    }
    if (value !== undefined && value !== null && value !== "") {
      result.push(value);
    }
  }
  return result;
}

function normalizeServices(...values) {
  const services = [];
  for (const value of flattenValues(values)) {
    const normalized = normalizeService(value);
    if (SUPPORTED_SERVICES.includes(normalized) && !services.includes(normalized)) {
      services.push(normalized);
    }
  }
  return services;
}

function normalizePlatformIds(...values) {
  const ids = [];
  for (const value of flattenValues(values)) {
    const id = String(value).trim().toLowerCase().replace(/\s+/g, "-");
    if (id && !SUPPORTED_SERVICES.includes(id) && !ids.includes(id)) {
      ids.push(id);
    }
  }
  return ids;
}

function inferServicesFromPlatformIds(platformIds) {
  const ids = normalizePlatformIds(platformIds);
  if (!ids.length) {
    return [];
  }

  const platformServices = new Map(getPlatforms().map((platform) => [platform.id, platform.services]));
  let commonServices = null;

  for (const id of ids) {
    const services = platformServices.get(id);
    if (!services || !services.length) {
      continue;
    }
    commonServices = commonServices
      ? commonServices.filter((service) => services.includes(service))
      : [...services];
  }

  return commonServices || [];
}

function normalizeEntitlement(raw = {}, fallbackServices = []) {
  const source = raw && typeof raw === "object" ? raw : {};
  const data = source.data && typeof source.data === "object" ? source.data : source;
  const capabilities = data.capabilities || data.capability || data.entitlement || data.ability || {};
  const platforms = normalizePlatformIds(
    data.platforms,
    data.platform,
    data.targets,
    data.target,
    capabilities.platforms,
    capabilities.platform,
    capabilities.targets,
    capabilities.target
  );
  const services = normalizeServices(
    data.services,
    data.service,
    data.products,
    data.product,
    data.scopes,
    data.scope,
    data.abilities,
    data.provider,
    data.type,
    capabilities.services,
    capabilities.service,
    capabilities.products,
    capabilities.product,
    capabilities.scopes,
    capabilities.scope,
    capabilities.abilities,
    capabilities.provider,
    capabilities.type,
    fallbackServices,
    inferServicesFromPlatformIds(platforms)
  );

  return {
    services,
    platforms,
    planName: data.planName || data.plan || data.name || capabilities.planName || capabilities.name || null,
    raw: data,
  };
}

function extractApiKeyFromEntitlement(entitlement, fallback) {
  const raw = entitlement && entitlement.raw ? entitlement.raw : {};
  const credential = raw.credential || raw.credentials || {};
  if (raw.proxy === true) {
    return String(raw.apiKey || raw.key || raw.token || fallback || "").trim();
  }
  return String(
    raw.apiKey ||
    raw.key ||
    raw.token ||
    raw.accessToken ||
    credential.apiKey ||
    credential.key ||
    credential.token ||
    fallback ||
    ""
  ).trim();
}

function extractBaseUrlFromEntitlement(entitlement) {
  const raw = entitlement && entitlement.raw ? entitlement.raw : {};
  const upstream = raw.upstream || raw.endpoint || {};
  return String(
    raw.baseUrl ||
    raw.baseURL ||
    raw.url ||
    upstream.baseUrl ||
    upstream.baseURL ||
    upstream.url ||
    ""
  ).trim().replace(/\/+$/, "");
}

function extractProxyBaseUrlFromEntitlement(entitlement) {
  const raw = entitlement && entitlement.raw ? entitlement.raw : {};
  const service = raw.serviceKey || (entitlement.services && entitlement.services[0]);
  return String(
    raw.baseUrl ||
    (raw.publicBaseUrl && service === "codex" ? `${String(raw.publicBaseUrl).replace(/\/+$/, "")}/v1` : raw.publicBaseUrl) ||
    ""
  ).trim().replace(/\/+$/, "");
}

function isServiceAllowed(entitlement, service) {
  return !entitlement.services.length || entitlement.services.includes(service);
}

function isPlatformAllowed(entry, entitlement, service) {
  if (!isServiceAllowed(entitlement, service)) {
    return false;
  }
  if (entitlement.platforms.length && !entitlement.platforms.includes(entry.platform.id)) {
    return false;
  }
  return entry.platform.services.includes(service);
}

function getStatusLabel(platform, detection) {
  if (detection.installed) {
    return "已检测到";
  }
  if (CREATABLE_PLATFORM_IDS.has(platform.id)) {
    return platform.required ? "将创建配置" : "未安装，可创建配置";
  }
  return "未安装，将跳过";
}

function canSelectPlatform(platform, detection) {
  return detection.installed || CREATABLE_PLATFORM_IDS.has(platform.id);
}

function parsePlatformIds(value) {
  return normalizePlatformIds(value);
}

async function promptService(defaultService, entitlement = normalizeEntitlement(), options = {}) {
  const allowPrompt = options.allowPrompt !== false;

  if (defaultService) {
    const normalized = normalizeService(defaultService);
    if (!SUPPORTED_SERVICES.includes(normalized)) {
      throw new Error("Service must be claude or codex");
    }
    if (!isServiceAllowed(entitlement, normalized)) {
      throw new Error(`当前激活码不支持 ${getServiceLabel(normalized)}`);
    }
    return normalized;
  }

  const allowedServices = entitlement.services.length ? entitlement.services : [];
  if (allowedServices.length === 1) {
    return allowedServices[0];
  }

  if (!allowPrompt) {
    if (allowedServices.length > 1) {
      const service = allowedServices[0];
      return service;
    }
    console.log("✗ 激活码没有返回 Codex / Claude 能力，无法自动识别。请联系管理员重新生成激活码。");
    return null;
  }

  const promptServices = allowedServices.length ? allowedServices : SUPPORTED_SERVICES;
  const response = await prompts({
    type: "select",
    name: "service",
    message: "请选择要激活的能力",
    hint: "↑↓ 选择，回车确认",
    choices: promptServices.map((service) => ({ title: getServiceLabel(service), value: service })),
    initial: 0,
  }, { onCancel: () => false });

  return response.service || null;
}

async function promptActivationCode(defaultCode) {
  if (defaultCode) {
    return defaultCode;
  }

  const response = await prompts({
    type: "password",
    name: "code",
    message: "请输入激活码:",
    validate: (value) => value && value.trim() ? true : "激活码不能为空",
  }, { onCancel: () => false });

  return response.code ? response.code.trim() : null;
}

async function confirmActivation(yes, service) {
  if (yes) {
    return true;
  }

  const response = await prompts({
    type: "confirm",
    name: "confirmed",
    message: `确认激活 ${getServiceLabel(service)} 配置?`,
    initial: true,
  }, { onCancel: () => false });

  return Boolean(response.confirmed);
}

function getActivationTargets(detectedPlatforms, includeAll = false, selectedPlatformIds = null) {
  const selectedIds = selectedPlatformIds ? parsePlatformIds(selectedPlatformIds) : [];
  return detectedPlatforms.filter(({ platform, detection }) => {
    if (selectedIds.length) {
      return selectedIds.includes(platform.id);
    }
    if (platform.required) {
      return true;
    }
    return detection.installed || (includeAll && canSelectPlatform(platform, detection));
  });
}

function getBackupPaths(targets) {
  return targets.flatMap(({ detection }) => detection.paths || []);
}

function divider(width = 37) {
  return `  ${"─".repeat(width)}`;
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatQuotaValue(value, unit = "tokens") {
  if (value === undefined || value === null || value === "") return "-";
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  if (["balance", "money", "usd"].includes(String(unit).toLowerCase())) return `$${number.toFixed(2)}`;
  if (String(unit).toLowerCase() === "requests") return `${number.toLocaleString("zh-CN")} 次`;
  return `${number.toLocaleString("zh-CN")} tokens`;
}

function getQuotaInfo(entitlement = {}) {
  const raw = entitlement.raw || {};
  const quota = raw.quota && typeof raw.quota === "object" ? raw.quota : {};
  const unit = raw.quotaUnit || raw.quota_unit || quota.unit || "tokens";
  const daily = quota.dailyLimit ?? quota.daily_limit ?? quota.dailyQuota ?? quota.daily_quota ?? quota.daily ?? raw.dailyLimit ?? raw.dailyQuota;
  const used = quota.dailyUsed ?? quota.daily_used ?? quota.dailySpent ?? quota.daily_spent ?? quota.usedToday ?? quota.todayUsed ?? raw.dailyUsed;
  const total = quota.total ?? quota.total_quota ?? quota.totalQuota ?? raw.totalQuota;
  const totalUsed = quota.used ?? quota.used_quota ?? quota.usedQuota ?? raw.usedQuota;
  const effectiveDaily = daily ?? total;
  const effectiveUsed = used ?? totalUsed;
  const remaining = Number(effectiveDaily) - Number(effectiveUsed);
  const progress = Number(effectiveDaily) > 0 && Number(effectiveUsed) >= 0
    ? Math.max(0, Math.min(100, Math.round((Number(effectiveUsed) / Number(effectiveDaily)) * 100)))
    : null;
  return {
    unit,
    daily: effectiveDaily,
    used: effectiveUsed,
    remaining: Number.isFinite(remaining) ? Math.max(remaining, 0) : null,
    progress,
  };
}

function progressBar(percent, width = 20) {
  if (percent === null || percent === undefined) return "-";
  const filled = Math.max(0, Math.min(width, Math.round((percent / 100) * width)));
  return `${"█".repeat(filled)}${"░".repeat(width - filled)} ${percent}%`;
}

function printBanner() {
  console.log("");
  console.log("╭────────────────────────────────────────╮");
  console.log("│        FogAct 激活向导                 │");
  console.log("│    Claude Code / Codex 配置工具        │");
  console.log("╰────────────────────────────────────────╯");
  console.log("");
}

function printCredentialProfile(service, upstream, apiKey, entitlement) {
  const raw = entitlement.raw || {};
  const quota = getQuotaInfo(entitlement);
  console.log("");
  console.log("  API Key 信息");
  console.log(divider());
  console.log(`  密钥:       ${maskKey(apiKey)}`);
  console.log(`  服务类型:   ${getServiceLabel(service)}`);
  console.log(`  状态:       ${raw.statusLabel || raw.status_label || raw.status || "正常"}`);
  console.log(`  计费模式:   ${raw.billingMode || raw.billing_mode || raw.billingType || raw.billing_type || raw.planName || entitlement.planName || "按额度计费"}`);
  console.log("");
  console.log("  配额信息");
  console.log(divider());
  console.log(`  每日配额:   ${formatQuotaValue(quota.daily, quota.unit)}`);
  console.log(`  今日已用:   ${formatQuotaValue(quota.used, quota.unit)}`);
  console.log(`  今日剩余:   ${formatQuotaValue(quota.remaining, quota.unit)}`);
  console.log(`  使用进度:   ${progressBar(quota.progress)}`);
  console.log("");
  console.log("  有效期");
  console.log(divider());
  console.log(`  激活时间:   ${formatDateTime(raw.activatedAt || raw.activated_at || raw.createdAt || raw.created_at)}`);
  console.log(`  到期时间:   ${formatDateTime(raw.expiresAt || raw.expires_at)}`);
  console.log(`  最后使用:   ${formatDateTime(raw.lastUsedAt || raw.last_used_at)}`);
  if (upstream.baseUrl) console.log(`  接入地址:   ${upstream.baseUrl}`);
  console.log("");
}

function printResultSummary(service, backupPath, results, redeemResult) {
  const succeeded = results.filter(({ result }) => result.success);
  const skipped = results.filter(({ result }) => !result.success && result.skipped);
  const failed = results.filter(({ result }) => !result.success && !result.skipped);
  const byId = new Map(results.map((entry) => [entry.platform.id, entry]));

  console.log("");
  if (backupPath) {
    console.log("  ✓ 备份已创建");
    console.log(`    位置: ${backupPath}`);
  }

  const printConfigured = (entry, label) => {
    if (!entry) return false;
    if (entry.result.success) {
      console.log(`  ✓ ${label} 已激活`);
      const files = entry.result.files || [];
      if (files.length) console.log(`    配置: ${files.join(", ")}`);
      return true;
    }
    if (!entry.result.skipped) {
      console.log(`  ✗ ${label} 激活失败: ${entry.result.error || entry.result.message || "未知错误"}`);
      return true;
    }
    return false;
  };

  if (service === "codex") {
    printConfigured(byId.get("codex-cli"), "Codex CLI");
  } else {
    printConfigured(byId.get("claude-code"), "Claude Code");
  }

  const opencode = byId.get("opencode");
  if (!printConfigured(opencode, "OpenCode")) {
    console.log("");
    console.log("  ℹ 已跳过 OpenCode 配置（未检测到安装）");
    console.log("    如需使用，请先运行一次 opencode 初始化后重新激活");
  }

  const openclaw = byId.get("openclaw");
  if (!printConfigured(openclaw, "OpenClaw")) {
    console.log("");
    console.log("  ℹ 已跳过 OpenClaw 配置（未检测到安装）");
    console.log("    如需使用，请先运行一次 openclaw 初始化后重新激活");
  }

  const extensionResults = [byId.get("vscode-codex-plugin"), byId.get("cursor-codex-plugin")]
    .filter(Boolean)
    .filter((entry) => entry.result.success || !entry.result.skipped);
  if (extensionResults.length) {
    for (const entry of extensionResults) {
      if (entry.result.success) {
        console.log("");
        console.log(`  ✓ ${entry.platform.name} 已激活`);
        for (const file of entry.result.files || []) console.log(`    目录: ${file}`);
      } else {
        console.log("");
        console.log(`  ⚠ ${entry.platform.name}: ${entry.result.error || entry.result.message || "无法激活"}`);
      }
    }
  } else if (service === "codex") {
    console.log("");
    console.log("  ℹ 已跳过编辑器插件配置（未检测到 Codex 插件）");
  }

  console.log("");
  if (failed.length) {
    console.log(`  激活完成：${succeeded.length} 成功，${failed.length} 失败，${skipped.length} 跳过`);
  }
  if (service === "claude") {
    const tools = ["Claude Code"];
    if (byId.get("opencode")?.result.success) tools.push("OpenCode");
    if (byId.get("openclaw")?.result.success) tools.push("OpenClaw");
    console.log(`  请重启相关工具（${tools.join("/")}）以应用新配置`);
  } else {
    const tools = ["Codex", "VSCode", "Cursor"];
    if (byId.get("opencode")?.result.success) tools.push("OpenCode");
    if (byId.get("openclaw")?.result.success) tools.push("OpenClaw");
    console.log(`  请重启相关工具（${tools.join("/")}）以应用新配置`);
  }
  console.log("");
}

async function selectPlatforms(detectedPlatforms, options = {}) {
  if (options.platforms) {
    return getActivationTargets(detectedPlatforms, false, options.platforms);
  }
  return getActivationTargets(detectedPlatforms, Boolean(options.all));
}

function formatNodeChoice(result) {
  const latency = result.available ? `${result.avgLatency ?? result.latency ?? "-"}ms` : "不可达";
  const jitter = result.available ? `(±${result.latencyStdDev || 0}ms)` : "";
  const label = result.available ? stabilityLabel(result.latencyStdDev || 0) : "";
  const score = result.available ? `${result.score || 0}分` : "";
  return `${result.name || "FogAct"}    ${latency} ${jitter}  ${label}  ${score}`.replace(/\s+$/g, "");
}

async function selectAndVerifyNode(service = "codex", options = {}) {
  const nodes = await getNodes(service);
  if (!nodes.length) return null;

  console.log("");
  console.log("  正在测试所有节点...");
  const results = await testNodes(nodes);
  const available = results.filter((result) => result.available);
  if (!available.length) {
    console.log("  ✗ 没有可用节点");
    console.log("");
    return null;
  }

  const best = selectBestNode(results);
  const initial = Math.max(0, available.findIndex((result) => result === best));
  const autoSelect = options.yes || options.auto || available.length === 1;
  const selected = autoSelect
    ? (best || available[0])
    : (await prompts({
      type: "select",
      name: "node",
      message: "请选择节点:",
      choices: available.map((result) => ({
        title: `${formatNodeChoice(result)}${result === best ? " ★ 推荐" : ""}`,
        value: result,
      })),
      initial,
    }, { onCancel: () => false })).node;

  if (!selected) return null;
  if (autoSelect) {
    console.log(`✔ 请选择节点: ${formatNodeChoice(selected)}${selected === best ? " ★ 推荐" : ""}`);
  }

  console.log("");
  console.log("  正在验证节点...");
  const result = await testNode(selected.url);
  const latency = result.available ? result.latency : selected.avgLatency;
  if (result.available || selected.available) {
    console.log(`  ✓ ${selected.name || "FogAct"} 已连接`);
    console.log(`    延迟: ${latency}ms`);
    console.log(`    地址: ${selected.url}`);
    console.log("");
    return { node: selected, latency };
  }

  console.log(`  ✗ ${selected.name || "FogAct"} 连接失败`);
  console.log(`    地址: ${selected.url}`);
  console.log("");
  return null;
}

async function resolveCodeCredential(options, upstream) {
  const code = await promptActivationCode(options.code);
  if (!code) {
    return { cancelled: true };
  }

  console.log("");
  console.log("正在验证激活码...");
  const inspection = await inspectActivationCode(code);
  if (!inspection.valid) {
    console.log(`✗ 无法读取激活码能力: ${inspection.error || "接口未返回有效信息"}`);
    return { cancelled: true };
  }

  const entitlement = normalizeEntitlement(inspection, options.service ? [options.service] : []);
  const apiKey = extractApiKeyFromEntitlement(entitlement, code);
  const entitlementBaseUrl = extractProxyBaseUrlFromEntitlement(entitlement);
  if (!apiKey || !entitlementBaseUrl || entitlement.raw.proxy !== true) {
    console.log("✗ 激活接口没有返回 FogAct 中转配置，请联系管理员检查服务端代理设置。");
    return { cancelled: true };
  }
  console.log("✔ 验证成功");
  return {
    activationCode: code,
    apiKey,
    entitlement,
    upstream: { services: {}, baseUrl: entitlementBaseUrl, proxy: true },
    inspection,
  };
}

async function activateTargets({ service, upstream, apiKey, targets, activationCode, options = {} }) {
  const backupPath = createActivationBackup(service, getBackupPaths(targets), {
    upstream: upstream.baseUrl,
    targets: targets.map(({ platform }) => platform.id),
  });

  const results = [];
  for (const { platform, detection } of targets) {
    if (!canSelectPlatform(platform, detection)) {
      results.push({ platform, result: { success: false, skipped: true, message: "未安装" } });
      continue;
    }
    try {
      const result = platform.activate({ service, upstream, apiKey, options, detection });
      results.push({ platform, result });
    } catch (err) {
      results.push({ platform, result: { success: false, error: err.message } });
    }
  }

  let activationRecord = null;
  const failures = results.filter(({ result }) => !result.success && !result.skipped);
  if (activationCode && failures.length === 0) {
    activationRecord = await verifyActivationCode(activationCode, service);
  }

  return { backupPath, results, redeemResult: null, activationRecord };
}


async function runActivationWizard(options = {}) {
  printBanner();
  if (!options.noNodeCheck) {
    const node = await selectAndVerifyNode(options.service || "codex", options);
    if (!node) {
      return { success: false, cancelled: true };
    }
  }

  const credential = await resolveCodeCredential(options, {});
  if (credential.cancelled) {
    console.log("已取消。");
    return { success: false, cancelled: true };
  }

  const upstream = { ...credential.upstream };
  if (!upstream.baseUrl) {
    console.log("已取消。");
    return { success: false, cancelled: true };
  }

  const service = await promptService(options.service, credential.entitlement, { allowPrompt: false });
  if (!service) {
    console.log("已取消。");
    return { success: false, cancelled: true };
  }


  const allDetectedPlatforms = detectPlatforms(service);
  const allowedPlatforms = allDetectedPlatforms.filter((entry) => isPlatformAllowed(entry, credential.entitlement, service));

  const targets = await selectPlatforms(allowedPlatforms, options);
  if (targets.length === 0) {
    console.log("");
    console.log("  ✗ 当前环境没有可激活目标");
    console.log("");
    return { success: false, cancelled: true };
  }

  printCredentialProfile(service, upstream, credential.apiKey, credential.entitlement);
  if (!(await confirmActivation(Boolean(options.yes || options.auto), service))) {
    console.log("");
    console.log("  已取消");
    console.log("");
    return { success: false, cancelled: true };
  }

  console.log("");
  console.log("  正在写入配置...");
  const activation = await activateTargets({
    service,
    upstream,
    apiKey: credential.apiKey,
    targets,
    activationCode: credential.activationCode,
    options,
  });
  const failures = activation.results.filter(({ result }) => !result.success && !result.skipped);
  console.log("  配置完成");
  printResultSummary(service, activation.backupPath, activation.results, activation.redeemResult);

  return {
    success: failures.length === 0,
    backupPath: activation.backupPath,
    results: activation.results,
    redeemResult: activation.redeemResult,
  };
}

module.exports = {
  getActivationTargets,
  isPlatformAllowed,
  normalizeEntitlement,
  normalizeService,
  normalizeServices,
  formatNodeChoice,
  formatQuotaValue,
  getQuotaInfo,
  parsePlatformIds,
  progressBar,
  runActivationWizard,
};
