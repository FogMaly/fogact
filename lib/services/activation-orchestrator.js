"use strict";

const prompts = require("prompts");
const { detectPlatforms } = require("../platforms");
const { loadUpstreamConfig } = require("../config/upstream");
const { createActivationBackup } = require("./backup-service");
const { inspectActivationCode, redeemActivationCode } = require("./cliproxy-api");
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

function normalizeEntitlement(raw = {}, fallbackServices = []) {
  const source = raw && typeof raw === "object" ? raw : {};
  const data = source.data && typeof source.data === "object" ? source.data : source;
  const capabilities = data.capabilities || data.capability || data.entitlement || data.ability || {};
  const services = normalizeServices(
    data.services,
    data.service,
    data.products,
    data.product,
    data.scopes,
    data.scope,
    data.abilities,
    capabilities.services,
    capabilities.service,
    capabilities.products,
    capabilities.product,
    capabilities.scopes,
    capabilities.scope,
    capabilities.abilities,
    fallbackServices
  );
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

async function promptService(defaultService, entitlement = normalizeEntitlement()) {
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

  const allowedServices = entitlement.services.length ? entitlement.services : SUPPORTED_SERVICES;
  if (allowedServices.length === 1) {
    console.log(`能力范围: ${getServiceLabel(allowedServices[0])}`);
    return allowedServices[0];
  }

  const response = await prompts({
    type: "select",
    name: "service",
    message: "请选择要激活的能力",
    hint: "↑↓ 选择，回车确认",
    choices: allowedServices.map((service) => ({ title: getServiceLabel(service), value: service })),
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
    type: "text",
    name: "code",
    message: "请输入激活码 / 兑换码",
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

async function confirmActivation(yes) {
  if (yes) {
    return true;
  }

  const response = await prompts({
    type: "confirm",
    name: "confirmed",
    message: "确认开始激活？",
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

function printBanner() {
  console.log("");
  console.log("╭────────────────────────────────────────╮");
  console.log("│        FogAct 激活向导                 │");
  console.log("│    Claude Code / Codex 配置工具        │");
  console.log("╰────────────────────────────────────────╯");
  console.log("");
}

function printDetection(service, detectedPlatforms, blockedPlatforms = []) {
  console.log("检测结果:");
  console.log(`  当前能力: ${getServiceLabel(service)}`);
  for (const { platform, detection } of detectedPlatforms) {
    const mark = canSelectPlatform(platform, detection) ? "✓" : "-";
    console.log(`  ${mark} ${platform.name}：${getStatusLabel(platform, detection)}`);
  }
  for (const { platform } of blockedPlatforms) {
    console.log(`  - ${platform.name}：当前激活码能力不包含`);
  }
  console.log("");
}

function printPlan(service, upstream, apiKey, targets, skipped = []) {
  console.log("激活计划:");
  console.log(`  能力: ${getServiceLabel(service)}`);
  console.log(`  上游: ${upstream.baseUrl}`);
  console.log(`  密钥: ${maskKey(apiKey)}`);
  console.log("  平台:");
  for (const { platform, detection } of targets) {
    console.log(`    ✓ ${platform.name} (${getStatusLabel(platform, detection)})`);
  }
  for (const { platform } of skipped) {
    console.log(`    - ${platform.name} (未选择)`);
  }
}

function printResultSummary(service, upstream, backupPath, results, redeemResult) {
  const succeeded = results.filter(({ result }) => result.success);
  const skipped = results.filter(({ result }) => !result.success && result.skipped);
  const failed = results.filter(({ result }) => !result.success && !result.skipped);

  console.log("");
  console.log("激活结果:");
  for (const { platform, result } of results) {
    if (result.success) {
      console.log(`  ✓ ${platform.name}`);
      for (const file of result.files || []) {
        console.log(`    ${file}`);
      }
    } else if (result.skipped) {
      console.log(`  - ${platform.name}: ${result.message || "已跳过"}`);
    } else {
      console.log(`  ✗ ${platform.name}: ${result.error || result.message || "失败"}`);
    }
  }

  console.log("");
  console.log("汇总:");
  console.log(`  能力: ${getServiceLabel(service)}`);
  console.log(`  上游: ${upstream.baseUrl}`);
  console.log(`  成功: ${succeeded.length}`);
  console.log(`  跳过: ${skipped.length}`);
  console.log(`  失败: ${failed.length}`);
  console.log(`  备份: ${backupPath || "无旧配置需要备份"}`);
  if (redeemResult) {
    console.log(`  兑换: ${redeemResult.valid ? "已完成" : `未完成（${redeemResult.error || "接口不可用"}）`}`);
  }
  console.log("  提示: 重启相关工具后生效");
  console.log("");
}

async function selectPlatforms(detectedPlatforms, options = {}) {
  if (options.platforms) {
    return getActivationTargets(detectedPlatforms, false, options.platforms);
  }
  if (options.yes || options.auto) {
    return getActivationTargets(detectedPlatforms, Boolean(options.all));
  }

  const choices = detectedPlatforms.map(({ platform, detection }) => {
    const selectable = canSelectPlatform(platform, detection);
    return {
      title: `${platform.name}（${getStatusLabel(platform, detection)}）`,
      value: platform.id,
      selected: platform.required || detection.installed,
      disabled: selectable ? false : "未安装，无法自动配置",
    };
  });

  const response = await prompts({
    type: "multiselect",
    name: "platformIds",
    message: "请选择要激活的平台",
    choices,
    min: 1,
    hint: "空格选择，回车确认",
  }, { onCancel: () => false });

  const selectedIds = response.platformIds || [];
  return getActivationTargets(detectedPlatforms, false, selectedIds);
}

async function resolveCodeCredential(options, upstream) {
  const code = await promptActivationCode(options.code);
  if (!code) {
    return { cancelled: true };
  }

  console.log("");
  console.log("正在读取激活码能力...");
  const inspection = await inspectActivationCode(code);
  if (!inspection.valid) {
    console.log(`⚠ 无法读取激活码能力: ${inspection.error || "接口未返回有效信息"}`);
    if (options.yes || options.auto) {
      return { cancelled: true };
    }
    const response = await prompts({
      type: "confirm",
      name: "fallback",
      message: "是否按手动能力选择继续？",
      initial: false,
    }, { onCancel: () => false });
    if (!response.fallback) {
      return { cancelled: true };
    }
  }

  const entitlement = normalizeEntitlement(inspection, options.service ? [options.service] : []);
  const apiKey = extractApiKeyFromEntitlement(entitlement, code);
  const entitlementBaseUrl = extractBaseUrlFromEntitlement(entitlement);
  return {
    activationCode: code,
    apiKey,
    entitlement,
    upstream: entitlementBaseUrl ? { ...upstream, baseUrl: entitlementBaseUrl } : upstream,
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
  console.log("");
  console.log("正在创建备份...");
  const backupPath = createActivationBackup(service, getBackupPaths(targets), {
    upstream: upstream.baseUrl,
    targets: targets.map(({ platform }) => platform.id),
  });
  if (backupPath) {
    console.log(`✓ 备份完成: ${backupPath}`);
  } else {
    console.log("ℹ 没有旧配置需要备份");
  }

  console.log("");
  console.log("正在激活平台...");
  const results = [];
  for (const { platform, detection } of targets) {
    try {
      const result = platform.activate({ service, upstream, apiKey, detection });
      results.push({ platform, result });
      if (result.success) {
        console.log(`✓ ${platform.name}`);
      } else {
        console.log(`⚠ ${platform.name}: ${result.message || "已跳过"}`);
      }
    } catch (err) {
      results.push({ platform, result: { success: false, error: err.message } });
      console.log(`✗ ${platform.name}: ${err.message}`);
    }
  }

  let redeemResult = null;
  const failures = results.filter(({ result }) => !result.success && !result.skipped);
  if (activationCode && failures.length === 0 && !options.noRedeem) {
    console.log("");
    console.log("正在完成兑换记录...");
    redeemResult = await redeemActivationCode(activationCode, service);
    if (redeemResult.valid) {
      console.log("✓ 兑换记录已完成");
    } else {
      console.log(`⚠ 兑换记录未完成: ${redeemResult.error || "接口不可用"}`);
    }
  }

  return { backupPath, results, redeemResult };
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
  const skipped = detectedPlatforms.filter((entry) => !targets.includes(entry));

  console.log("");
  printPlan(service, upstream, apiKey, targets, skipped);

  if (!(await confirmActivation(Boolean(options.yes || options.auto)))) {
    console.log("Activation cancelled.");
    return { success: false, cancelled: true };
  }

  const activation = await activateTargets({ service, upstream, apiKey, targets, options });
  const failures = activation.results.filter(({ result }) => !result.success && !result.skipped);
  printResultSummary(service, upstream, activation.backupPath, activation.results, activation.redeemResult);

  return {
    success: failures.length === 0,
    backupPath: activation.backupPath,
    results: activation.results,
  };
}

async function runActivationWizard(options = {}) {
  printBanner();
  const baseUpstream = loadUpstreamConfig({ configPath: options.upstreamConfig });

  const service = await promptService(options.service, normalizeEntitlement());
  if (!service) {
    console.log("已取消。");
    return { success: false, cancelled: true };
  }

  const initialDetectedPlatforms = detectPlatforms(service);
  console.log("");
  printDetection(service, initialDetectedPlatforms);

  const initialTargets = await selectPlatforms(initialDetectedPlatforms, options);
  if (initialTargets.length === 0) {
    console.log("没有选择任何平台，已取消。");
    return { success: false, cancelled: true };
  }

  const credentialType = await promptCredentialType(options, baseUpstream);
  if (!credentialType) {
    console.log("已取消。");
    return { success: false, cancelled: true };
  }

  const credential = credentialType === "code"
    ? await resolveCodeCredential(options, baseUpstream)
    : await resolveApiKeyCredential(options, baseUpstream);
  if (credential.cancelled) {
    console.log("已取消。");
    return { success: false, cancelled: true };
  }

  const upstream = { ...credential.upstream };
  upstream.baseUrl = await promptBaseUrl(upstream.baseUrl);
  if (!upstream.baseUrl) {
    console.log("已取消。");
    return { success: false, cancelled: true };
  }

  console.log("");
  if (credentialType === "api-key") {
    const verification = await verifyCredential(upstream, credential.apiKey, options);
    if (!verification.valid) {
      return { success: false, verification };
    }
  } else {
    console.log("✓ 已按激活码能力限制可选平台");
  }

  const allDetectedPlatforms = detectPlatforms(service);
  const allowedPlatforms = allDetectedPlatforms.filter((entry) => isPlatformAllowed(entry, credential.entitlement, service));
  const blockedPlatforms = allDetectedPlatforms.filter((entry) => !allowedPlatforms.includes(entry));
  const initialTargetIds = new Set(initialTargets.map(({ platform }) => platform.id));

  const targets = allowedPlatforms.filter((entry) => initialTargetIds.has(entry.platform.id));
  if (targets.length === 0) {
    console.log("当前激活能力不包含已选择的平台，已取消。");
    return { success: false, cancelled: true };
  }
  const skipped = allDetectedPlatforms.filter((entry) => !targets.includes(entry) || blockedPlatforms.includes(entry));

  printPlan(service, upstream, credential.apiKey, targets, skipped);
  if (!(await confirmActivation(Boolean(options.yes || options.auto)))) {
    console.log("已取消。");
    return { success: false, cancelled: true };
  }

  const activation = await activateTargets({
    service,
    upstream,
    apiKey: credential.apiKey,
    targets,
    activationCode: credential.activationCode,
    options,
  });
  const failures = activation.results.filter(({ result }) => !result.success && !result.skipped);
  printResultSummary(service, upstream, activation.backupPath, activation.results, activation.redeemResult);

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
