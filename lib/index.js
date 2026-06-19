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
    const result = runLatestWithNpmExec(latestVersion, args, env);
    process.exit(result.status === null ? 1 : result.status);
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
    lines.push(`${index === cursor ? "❯" : " "} ${choice.title}`);
  });

  lines.push("");
  lines.push("↑↓ navigate • ⏎ select");
  return lines.join("\n");
}

function printBanner() {
  console.log(renderMenu(0));
}

async function runInteractiveMenu() {
  await runActivationWizard();
}

function selectMenuAction() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    printBanner();
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    let cursor = 0;
    let renderedLines = 0;
    const stdin = process.stdin;

    const render = () => {
      if (renderedLines > 0) {
        process.stdout.write(`\x1b[${renderedLines}A`);
        process.stdout.write("\x1b[J");
      }
      const output = renderMenu(cursor);
      renderedLines = output.split("\n").length;
      process.stdout.write(output);
    };

    const cleanup = () => {
      stdin.off("data", onData);
      if (stdin.isRaw) stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write("\x1b[?25h\n");
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
      const key = data.toString("utf8");
      if (key === "\u0003" || key === "\u001b") {
        cancel();
        return;
      }
      if (key === "\r" || key === "\n") {
        submit();
        return;
      }
      if (key === "\u001b[A") {
        cursor = cursor === 0 ? MENU_CHOICES.length - 1 : cursor - 1;
        render();
        return;
      }
      if (key === "\u001b[B") {
        cursor = cursor === MENU_CHOICES.length - 1 ? 0 : cursor + 1;
        render();
      }
    };

    process.stdout.write("\x1b[?25l");
    render();
    stdin.resume();
    stdin.setEncoding("utf8");
    stdin.setRawMode(true);
    stdin.on("data", onData);
  });
}

async function runToolsMenu() {
  const action = await selectMenuAction();

  switch (action) {
    case "activate":
      await runActivationWizard();
      break;
    case "test":
      await runTestCommand();
      break;
    case "restore":
      await runRestoreCommand();
      break;
    default:
      console.log("");
      console.log("再见。");
      console.log("");
      break;
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
    .option("-k, --api-key <apiKey>", "NewAPI key; defaults to config/upstream.json or NEWAPI_API_KEY")
    .option("-y, --yes", "auto-confirm activation plan")
    .option("--auto", "alias for --yes")
    .option("--all", "configure optional platforms even when their config files do not exist")
    .option("--platforms <ids>", "comma-separated platform ids to activate")
    .option("--skip-verify", "skip upstream /v1/models key verification")
    .option("--upstream-config <path>", "path to upstream config JSON")
    .option("-c, --code <code>", "activation / redeem code")
    .option("--legacy", "use legacy activation-code node switching flow")
    .option("--no-redeem", "do not mark activation code as redeemed after writing config")
    .action(runActivateCommand);

  program
    .command("wizard")
    .description("Open FogIDC-style activation wizard")
    .option("-s, --service <service>", "target service: claude or codex")
    .option("-k, --api-key <apiKey>", "NewAPI key")
    .option("-c, --code <code>", "activation / redeem code")
    .option("--platforms <ids>", "comma-separated platform ids to activate")
    .option("--all", "select all configurable platforms")
    .option("--yes", "auto-confirm activation plan")
    .option("--skip-verify", "skip upstream /v1/models key verification")
    .option("--upstream-config <path>", "path to upstream config JSON")
    .option("--no-redeem", "do not mark activation code as redeemed after writing config")
    .action(runActivationWizard);

  program
    .command("test")
    .description("Test CLIProxy nodes")
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
  buildProgram,
  ensureLatestVersion,
  isNewerVersion,
  runCli,
  runInteractiveMenu,
  runToolsMenu,
  runWebServer,
};
