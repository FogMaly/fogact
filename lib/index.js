"use strict";

const { Command } = require("commander");
const prompts = require("prompts");
const packageJson = require("../package.json");
const { runActivateCommand } = require("./commands/activate");
const { runTestCommand } = require("./commands/test");
const { runRestoreCommand } = require("./commands/restore");
const { runActivationWizard } = require("./services/activation-orchestrator");

function printBanner() {
  const version = packageJson.version;
  const title = `FogAct 激活器 v${version}`;
  const displayWidth = (value) => Array.from(value).reduce((width, char) => {
    return width + (char.charCodeAt(0) > 0xff ? 2 : 1);
  }, 0);
  const padLine = (value, width) => {
    const padding = Math.max(0, width - displayWidth(value));
    const left = Math.floor(padding / 2);
    const right = padding - left;
    return `${" ".repeat(left)}${value}${" ".repeat(right)}`;
  };
  console.log("");
  console.log("  ╭─────────────────────────────────────╮");
  console.log(`  │${padLine(title, 37)}│`);
  console.log("  │    Claude Code / Codex 配置工具     │");
  console.log("  ╰─────────────────────────────────────╯");
  console.log("");
}

async function runInteractiveMenu() {
  await runActivationWizard();
}

async function runToolsMenu() {
  printBanner();

  const response = await prompts(
    {
      type: "select",
      name: "action",
      message: "请选择操作:",
      hint: "↑↓ 选择，回车确认",
      choices: [
        { title: "1. 激活服务", value: "activate" },
        { title: "2. 测试节点", value: "test" },
        { title: "3. 恢复备份", value: "restore" },
        { title: "4. 退出", value: "exit" },
      ],
      initial: 0,
    },
    { onCancel: () => false }
  );

  switch (response.action) {
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
  runCli,
  runInteractiveMenu,
  runToolsMenu,
  runWebServer,
};
