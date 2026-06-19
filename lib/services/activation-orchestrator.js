"use strict";

const prompts = require("prompts");
const { detectPlatforms, getPlatforms } = require("../platforms");
const { loadUpstreamConfig } = require("../config/upstream");
const { createActivationBackup } = require("./backup-service");
const { getNodes, inspectActivationCode, testNode, verifyActivationCode } = require("./fogact-api");
const { maskKey, verifyNewApiKey } = require("./newapi");

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

async function promptApiKey(defaultApiKey) {
  if (defaultApiKey) {
    return defaultApiKey;
  }

  const response = await prompts({
    type: "password",
    name: "apiKey",
    message: "请输入 NewAPI API Key",
    validate: (value) => value && value.trim() ? true : "API Key 不能为空",
  }, { onCancel: () => false });

  return response.apiKey ? response.apiKey.trim() : null;
}

async function promptBaseUrl(defaultBaseUrl) {
  if (defaultBaseUrl) {
    return defaultBaseUrl;
  }

  const response = await prompts({
    type: "text",
    name: "baseUrl",
    message: "请输入 NewAPI Base URL",
    validate: (value) => value && value.trim() ? true : "Base URL 不能为空",
  }, { onCancel: () => false });

  return response.baseUrl ? response.baseUrl.trim().replace(/\/+$/, "") : null;
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

async function promptCredentialType(options, upstream) {
  if (options.code) {
    return "code";
  }
  if (options.apiKey || upstream.apiKey) {
    return "api-key";
  }

  const response = await prompts({
    type: "select",
    name: "credentialType",
    message: "请选择激活方式",
    hint: "↑↓ 选择，回车确认",
    choices: [
      { title: "输入激活码 / 兑换码", value: "code" },
      { title: "输入 NewAPI API Key", value: "api-key" },
    ],
    initial: 0,
  }, { onCancel: () => false });

  return response.credentialType || null;
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

function printBanner() {
  console.log("");
  console.log("╭────────────────────────────────────────╮");
  console.log("│        FogAct 激活向导                 │");
  console.log("│    Claude Code / Codex 配置工具        │");
  console.log("╰────────────────────────────────────────╯");
  console.log("");
}

function printCredentialProfile(service, upstream, apiKey, entitlement) {
  console.log("");
  console.log("  账号信息");
  console.log(divider());
  console.log(`  服务类型:   ${getServiceLabel(service)}`);
  console.log(`  接入地址:   ${upstream.baseUrl}`);
  console.log(`  激活码:     ${maskKey(apiKey)}`);
  if (entitlement.planName) {
    console.log(`  套餐名称:   ${entitlement.planName}`);
  }
  if (entitlement.raw && entitlement.raw.expiresAt) {
    console.log(`  到期时间:   ${entitlement.raw.expiresAt}`);
  }
  const quota = entitlement.raw && entitlement.raw.quota;
  if (quota && typeof quota === "object") {
    const total = quota.total ?? quota.total_quota ?? quota.dailyLimit ?? quota.daily;
    const used = quota.used ?? quota.used_quota ?? quota.dailyUsed;
    if (total !== undefined) console.log(`  总配额:     ${total}`);
    if (used !== undefined) console.log(`  已使用:     ${used}`);
  }
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

async function verifyPrimaryNode() {
  const nodes = await getNodes("codex");
  const primary = nodes[0];
  if (!primary) return null;

  console.log("");
  console.log("  正在验证节点...");
  const result = await testNode(primary.url);
  if (result.available) {
    console.log(`  ✓ ${primary.name || "FogAct"} 已连接`);
    console.log(`    延迟: ${result.latency}ms`);
    console.log(`    地址: ${primary.url}`);
    console.log("");
    return { node: primary, latency: result.latency };
  }

  console.log(`  ✗ ${primary.name || "FogAct"} 连接失败`);
  console.log(`    地址: ${primary.url}`);
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
  const entitlementBaseUrl = extractProxyBaseUrlFromEntitlement(entitlement) || extractBaseUrlFromEntitlement(entitlement);
  return {
    activationCode: code,
    apiKey,
    entitlement,
    upstream: entitlementBaseUrl ? { ...upstream, services: {}, baseUrl: entitlementBaseUrl, proxy: true } : upstream,
    inspection,
  };
}

async function resolveApiKeyCredential(options, upstream) {
  const apiKey = await promptApiKey(options.apiKey || upstream.apiKey);
  if (!apiKey) {
    return { cancelled: true };
  }
  return {
    apiKey,
    entitlement: normalizeEntitlement({}, options.service ? [options.service] : []),
    upstream,
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

async function verifyCredential(upstream, apiKey, options = {}) {
  if (options.skipVerify) {
    console.log("跳过 NewAPI 连通性验证。");
    return { valid: true, skipped: true };
  }

  console.log("正在验证 NewAPI Key...");
  const verification = await verifyNewApiKey(upstream, apiKey);
  if (!verification.valid) {
    console.log(`✗ NewAPI 验证失败: ${verification.error}`);
    return verification;
  }
  console.log(`✓ NewAPI 验证通过（可见 ${verification.models.length} 个模型）`);
  return verification;
}

async function runNewApiActivation(options = {}) {
  const baseUpstream = loadUpstreamConfig({ configPath: options.upstreamConfig });
  const upstream = { ...baseUpstream };
  upstream.baseUrl = await promptBaseUrl(upstream.baseUrl);
  if (!upstream.baseUrl) {
    console.log("Activation cancelled.");
    return { success: false, cancelled: true };
  }

  const apiKey = await promptApiKey(options.apiKey || upstream.apiKey);
  if (!apiKey) {
    console.log("Activation cancelled.");
    return { success: false, cancelled: true };
  }

  const entitlement = normalizeEntitlement({}, options.service ? [options.service] : []);
  const service = await promptService(options.service, entitlement);
  if (!service) {
    console.log("Activation cancelled.");
    return { success: false, cancelled: true };
  }

  console.log("");
  const verification = await verifyCredential(upstream, apiKey, options);
  if (!verification.valid) {
    return { success: false, verification };
  }

  const detectedPlatforms = detectPlatforms(service);
  const selectedPlatformIds = options.platforms ? parsePlatformIds(options.platforms) : null;
  const targets = getActivationTargets(detectedPlatforms, Boolean(options.all), selectedPlatformIds);

  printCredentialProfile(service, upstream, apiKey, entitlement);

  if (!(await confirmActivation(Boolean(options.yes || options.auto), service))) {
    console.log("");
    console.log("  已取消");
    console.log("");
    return { success: false, cancelled: true };
  }

  console.log("");
  console.log("  正在写入配置...");
  const activation = await activateTargets({ service, upstream, apiKey, targets, options });
  const failures = activation.results.filter(({ result }) => !result.success && !result.skipped);
  console.log("  配置完成");
  printResultSummary(service, activation.backupPath, activation.results, activation.redeemResult);

  return {
    success: failures.length === 0,
    backupPath: activation.backupPath,
    results: activation.results,
  };
}

async function runActivationWizard(options = {}) {
  if (!options.noNodeCheck) {
    const node = await verifyPrimaryNode();
    if (!node) {
      return { success: false, cancelled: true };
    }
  }

  const baseUpstream = loadUpstreamConfig({ configPath: options.upstreamConfig });
  const credentialType = !options.code && options.apiKey ? "api-key" : "code";

  const credential = credentialType === "code"
    ? await resolveCodeCredential(options, baseUpstream)
    : await resolveApiKeyCredential(options, baseUpstream);
  if (credential.cancelled) {
    console.log("已取消。");
    return { success: false, cancelled: true };
  }

  const upstream = { ...credential.upstream };
  upstream.baseUrl = credentialType === "code" ? upstream.baseUrl : await promptBaseUrl(upstream.baseUrl);
  if (!upstream.baseUrl) {
    console.log("已取消。");
    return { success: false, cancelled: true };
  }

  const service = await promptService(options.service, credential.entitlement, { allowPrompt: credentialType === "api-key" });
  if (!service) {
    console.log("已取消。");
    return { success: false, cancelled: true };
  }

  console.log("");
  if (credentialType === "api-key") {
    const verification = await verifyCredential(upstream, credential.apiKey, options);
    if (!verification.valid) {
      return { success: false, verification };
    }
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
  parsePlatformIds,
  runActivationWizard,
  runNewApiActivation,
};
