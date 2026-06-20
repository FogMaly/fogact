"use strict";

const https = require("https");
const { spawnSync } = require("child_process");
const { Command } = require("commander");
const prompts = require("prompts");
const packageJson = require("../package.json");
const { runActivateCommand } = require("./commands/activate");
const { runTestCommand } = require("./commands/test");
const { runRestoreCommand } = require("./commands/restore");
const { runActivationWizard } = require("./services/activation-orchestrator");

const MENU_CHOICES = [
  { title: "1. 激活服务", value: "activate" },
  { title: "2. 测试节点", value: "test" },
  { title: "3. 恢复备份", value: "restore" },
  { title: "4. 退出", value: "exit" },
];

const MENU_COLORS = {
  test: "\x1b[34m",
  exit: "\x1b[90m",
};
const ANSI_RESET = "\x1b[0m";

const UPDATE_TIMEOUT_MS = 2500;

function parseVersion(version) {
  return String(version || "")
    .split("-")[0]
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
}

function isNewerVersion(latest, current) {
  const latestParts = parseVersion(latest);
  const currentParts = parseVersion(current);
  const length = Math.max(latestParts.length, currentParts.length);
  for (let index = 0; index < length; index += 1) {
    const latestPart = latestParts[index] || 0;
    const currentPart = currentParts[index] || 0;
    if (latestPart > currentPart) return true;
    if (latestPart < currentPart) return false;
  }
  return false;
}

function fetchLatestVersion() {
  return new Promise((resolve) => {
    const request = https.get(
      "https://registry.npmjs.org/fogact/latest",
      {
        timeout: UPDATE_TIMEOUT_MS,
        headers: {
          Accept: "application/json",
          "User-Agent": `fogact/${packageJson.version}`,
        },
      },
      (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          resolve(null);
          return;
        }

        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          try {
            const metadata = JSON.parse(body);
            resolve(metadata.version || null);
          } catch (_error) {
            resolve(null);
          }
        });
      }
    );

    request.on("timeout", () => {
      request.destroy();
      resolve(null);
    });
    request.on("error", () => resolve(null));
  });
}

function isNpmExecRun() {
  const argvPath = process.argv[1] || "";
  const npmCommand = process.env.npm_command || "";
  const npmExecPath = process.env.npm_execpath || "";
  return argvPath.includes("/_npx/") || npmCommand === "exec" || npmCommand === "x" || npmExecPath.includes("npx-cli");
}

function runLatestWithNpmExec(latestVersion, args, env) {
  return spawnSync(
    "npm",
    ["exec", "--yes", "--package", `fogact@${latestVersion}`, "--", "fogact", ...args],
    { stdio: "inherit", env }
  );
}

function isLatestPackageRun() {
  const packageJsonPath = require.resolve("../package.json");
  const normalized = packageJsonPath.replace(/\\/g, "/");
  return /node_modules\/fogact\/package\.json$/.test(normalized) && !normalized.includes("/_npx/");
}

async function ensureLatestVersion(argv = process.argv) {
  if (process.env.FOGACT_SKIP_UPDATE === "1" || process.env.FOGACT_NO_UPDATE === "1") {
    return false;
  }

  const latestVersion = await fetchLatestVersion();
  if (!latestVersion || !isNewerVersion(latestVersion, packageJson.version)) {
    return false;
  }

  const args = argv.slice(2);
  const env = { ...process.env, FOGACT_SKIP_UPDATE: "1" };
  console.log(`检测到新版本 v${latestVersion}，正在自动更新...`);

  if (isNpmExecRun()) {
    return false;
  }

  if (isLatestPackageRun()) {
    console.log("检测到全局版本不是最新，正在自动更新...");
  }

  const update = spawnSync("npm", ["install", "-g", `fogact@${latestVersion}`], {
    stdio: "inherit",
    env,
  });

  if (update.status === 0) {
    console.log("更新完成，正在重新启动...");
    const restart = spawnSync(process.execPath, argv.slice(1), { stdio: "inherit", env });
    process.exit(restart.status === null ? 1 : restart.status);
  }

  console.log("自动更新失败，正在尝试直接运行最新版...");
  const result = runLatestWithNpmExec(latestVersion, args, env);
  process.exit(result.status === null ? 1 : result.status);
}

function displayWidth(value) {
  return Array.from(value).reduce((width, char) => {
    return width + (char.charCodeAt(0) > 0xff ? 2 : 1);
  }, 0);
}

function padLine(value, width) {
  const padding = Math.max(0, width - displayWidth(value));
  const left = Math.floor(padding / 2);
  const right = padding - left;
  return `${" ".repeat(left)}${value}${" ".repeat(right)}`;
}

function renderMenu(cursor = 0) {
  const version = packageJson.version;
  const title = `FogAct 激活器 v${version}`;
  const lines = [
    "",
    "  ╭─────────────────────────────────────╮",
    `  │${padLine(title, 37)}│`,
    "  │    Claude Code / Codex 配置工具     │",
    "  ╰─────────────────────────────────────╯",
    "",
    "? 请选择操作:",
  ];

  MENU_CHOICES.forEach((choice, index) => {
    const color = MENU_COLORS[choice.value] || "";
    const title = color ? `${color}${choice.title}${ANSI_RESET}` : choice.title;
    lines.push(`${index === cursor ? "❯" : " "} ${title}`);
  });

  lines.push("");
  lines.push("↑↓ navigate • ⏎ select");
  return lines.join("\n");
}

function printBanner() {
  console.log(renderMenu(0));
}

function shouldUseFixedMenuScreen(env = process.env, stdout = process.stdout) {
  if (!stdout.isTTY) return false;
  if (env.FOGACT_NO_FIXED_MENU === "1" || env.FOGACT_PLAIN_MENU === "1") return false;
  return String(env.TERM || "").toLowerCase() !== "dumb";
}

function enterFixedMenuScreen(stdout = process.stdout) {
  stdout.write("\x1b[?1049h\x1b[?25l\x1b[?7l");
}

function leaveFixedMenuScreen(stdout = process.stdout) {
  stdout.write("\x1b[?7h\x1b[?25h\x1b[?1049l");
}

function clearScreen(stdout = process.stdout) {
  if (!stdout.isTTY) return;
  stdout.write("\x1b[H\x1b[2J");
}

function showCursor(stdout = process.stdout) {
  if (!stdout.isTTY) return;
  stdout.write("\x1b[?25h");
}

function hideCursor(stdout = process.stdout) {
  if (!stdout.isTTY) return;
  stdout.write("\x1b[?25l");
}

function saveMenuCursor(stdout = process.stdout) {
  stdout.write("\x1b7\x1b[s\x1b[?25l");
}

function restoreMenuCursor(stdout = process.stdout) {
  stdout.write("\x1b8\x1b[u\x1b[J");
}

function moveMenuCursor(cursor, direction, total) {
  return (cursor + direction + total) % total;
}

function applyMenuInput(input, cursor, total = MENU_CHOICES.length) {
  const text = String(input || "");
  const result = { cursor, action: null };
  const tokenPattern = /\u001b(?:\[[0-9;]*[AB]|O[AB])|\r|\n|\u0003|\u001b|[1-9jksw]/gi;
  let match;

  while ((match = tokenPattern.exec(text)) !== null) {
    const token = match[0];
    const lower = token.toLowerCase();

    if (token === "\u0003" || token === "\u001b") {
      result.action = "exit";
      break;
    }

    if (token === "\r" || token === "\n") {
      result.action = "submit";
      break;
    }

    if (/^\u001b(?:\[[0-9;]*A|OA)$/i.test(token) || lower === "k" || lower === "w") {
      result.cursor = moveMenuCursor(result.cursor, -1, total);
      continue;
    }

    if (/^\u001b(?:\[[0-9;]*B|OB)$/i.test(token) || lower === "j" || lower === "s") {
      result.cursor = moveMenuCursor(result.cursor, 1, total);
      continue;
    }

    if (/^[1-9]$/.test(token)) {
      const selected = Number(token) - 1;
      if (selected >= 0 && selected < total) {
        result.cursor = selected;
        result.action = "submit";
        break;
      }
    }
  }

  return result;
}

async function runInteractiveMenu() {
  await runToolsMenu();
}

function waitForMenuReturn(message = "按回车返回菜单...") {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const stdin = process.stdin;
    const wasRaw = Boolean(stdin.isRaw);
    let closed = false;

    const cleanup = () => {
      if (closed) return;
      closed = true;
      stdin.off("data", onData);
      if (stdin.isTTY && stdin.isRaw !== wasRaw) stdin.setRawMode(wasRaw);
      stdin.pause();
      process.stdout.write("\n");
      resolve();
    };

    const onData = (data) => {
      const value = String(data);
      if (value.includes("\u0003") || value.includes("\u001b") || value.includes("\r") || value.includes("\n")) {
        cleanup();
      }
    };

    process.stdout.write(`  ${message}`);
    stdin.setEncoding("utf8");
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

function selectMenuAction(options = {}) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    printBanner();
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    let cursor = 0;
    let closed = false;
    const stdin = process.stdin;
    const stdout = process.stdout;
    const useFixedScreen = options.fixedScreenActive || shouldUseFixedMenuScreen(process.env, stdout);
    const ownsFixedScreen = useFixedScreen && !options.fixedScreenActive;
    const wasRaw = Boolean(stdin.isRaw);

    const render = () => {
      if (useFixedScreen) {
        hideCursor(stdout);
        clearScreen(stdout);
      } else {
        restoreMenuCursor(stdout);
      }
      stdout.write(renderMenu(cursor));
    };

    const cleanup = () => {
      if (closed) return;
      closed = true;
      stdin.off("data", onData);
      if (stdin.isTTY && stdin.isRaw !== wasRaw) stdin.setRawMode(wasRaw);
      stdin.pause();
      if (useFixedScreen) {
        showCursor(stdout);
        if (ownsFixedScreen) leaveFixedMenuScreen(stdout);
      } else {
        restoreMenuCursor(stdout);
        showCursor(stdout);
      }
    };

    const submit = () => {
      const choice = MENU_CHOICES[cursor];
      cleanup();
      resolve(choice.value);
    };

    const cancel = () => {
      cleanup();
      resolve("exit");
    };

    const onData = (data) => {
      const next = applyMenuInput(String(data), cursor, MENU_CHOICES.length);
      const cursorChanged = next.cursor !== cursor;
      cursor = next.cursor;

      if (next.action === "exit") {
        cancel();
        return;
      }

      if (next.action === "submit") {
        submit();
        return;
      }

      if (cursorChanged) {
        render();
      }
    };

    stdin.setEncoding("utf8");
    stdin.setRawMode(true);
    stdin.resume();

    if (ownsFixedScreen) {
      enterFixedMenuScreen(stdout);
    } else if (useFixedScreen) {
      hideCursor(stdout);
    } else {
      saveMenuCursor(stdout);
    }
    render();
    stdin.on("data", onData);
  });
}

async function runToolsMenu() {
  const fixedScreenActive = shouldUseFixedMenuScreen(process.env, process.stdout);
  let shouldPrintGoodbye = false;
  let running = true;

  if (fixedScreenActive) {
    enterFixedMenuScreen(process.stdout);
  }

  try {
    while (running) {
      const action = await selectMenuAction({ fixedScreenActive });

      if (fixedScreenActive) {
        clearScreen(process.stdout);
        showCursor(process.stdout);
      }

      switch (action) {
        case "activate":
          await runActivationWizard();
          break;
        case "test":
          await runTestCommand();
          await waitForMenuReturn();
          break;
        case "restore":
          await runRestoreCommand();
          await waitForMenuReturn();
          break;
        default:
          shouldPrintGoodbye = true;
          running = false;
          if (fixedScreenActive) {
            clearScreen(process.stdout);
          }
          break;
      }
    }
  } finally {
    if (fixedScreenActive) {
      leaveFixedMenuScreen(process.stdout);
    }
  }

  if (shouldPrintGoodbye) {
    if (fixedScreenActive) {
      clearScreen(process.stdout);
    }
    console.log("");
    console.log("  再见！");
    console.log("");
  }
}

function runWebServer() {
  require("../bin/web-server");
}

function buildProgram() {
  const program = new Command();

  program
    .name("fogact")
    .description(packageJson.description)
    .version(packageJson.version)
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  npx fogact",
        "  fogact",
        "  fogact web",
      ].join("\n")
    );

  program
    .command("activate")
    .description("Open the multi-platform activation flow")
    .option("-s, --service <service>", "target service: claude or codex")
    .option("-y, --yes", "auto-confirm activation plan")
    .option("--auto", "alias for --yes")
    .option("--all", "configure optional platforms even when their config files do not exist")
    .option("--platforms <ids>", "comma-separated platform ids to activate")
    .option("-c, --code <code>", "activation / redeem code")
    .option("--no-redeem", "do not mark activation code as redeemed after writing config")
    .action(runActivateCommand);

  program
    .command("wizard")
    .description("Open FogAct activation wizard")
    .option("-s, --service <service>", "target service: claude or codex")
    .option("-c, --code <code>", "activation / redeem code")
    .option("--platforms <ids>", "comma-separated platform ids to activate")
    .option("--all", "select all configurable platforms")
    .option("--yes", "auto-confirm activation plan")
    .option("--no-redeem", "do not mark activation code as redeemed after writing config")
    .action(runActivationWizard);

  program
    .command("test")
    .description("Test FogAct nodes")
    .action(runTestCommand);

  program
    .command("restore")
    .description("Restore a previous backup")
    .option("-s, --service <service>", "target service: claude or codex")
    .action(runRestoreCommand);

  program
    .command("web")
    .description("Start the local Web UI")
    .action(runWebServer);

  program
    .command("interactive")
    .description("Open the activation wizard")
    .action(runInteractiveMenu);

  program
    .command("menu")
    .description("Open tools menu")
    .action(runToolsMenu);

  return program;
}

async function runCli(argv = process.argv) {
  await ensureLatestVersion(argv);

  const args = argv.slice(2).filter((arg) => arg !== "--help" && arg !== "-h");

  if (args.length === 0) {
    await runToolsMenu();
    return;
  }

  const program = buildProgram();
  await program.parseAsync(argv);
}

module.exports = {
  applyMenuInput,
  buildProgram,
  clearScreen,
  enterFixedMenuScreen,
  leaveFixedMenuScreen,
  renderMenu,
  shouldUseFixedMenuScreen,
  ensureLatestVersion,
  isLatestPackageRun,
  isNewerVersion,
  runCli,
  runInteractiveMenu,
  runToolsMenu,
  runWebServer,
  waitForMenuReturn,
};
