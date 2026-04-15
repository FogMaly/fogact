"use strict";

const { Command } = require("commander");
const prompts = require("prompts");
const packageJson = require("../package.json");
const { runActivateCommand } = require("./commands/activate");
const { runTestCommand } = require("./commands/test");
const { runRestoreCommand } = require("./commands/restore");

function printBanner() {
  console.log("CLIProxy Activator");
  console.log("One-command activator for CLIProxyAPI");
  console.log("");
}

async function runInteractiveMenu() {
  printBanner();

  const response = await prompts(
    {
      type: "select",
      name: "action",
      message: "Select an action",
      choices: [
        { title: "Activate service", value: "activate" },
        { title: "Test nodes", value: "test" },
        { title: "Restore backup", value: "restore" },
        { title: "Exit", value: "exit" },
      ],
      initial: 0,
    },
    { onCancel: () => false }
  );

  switch (response.action) {
    case "activate":
      await runActivateCommand();
      break;
    case "test":
      await runTestCommand();
      break;
    case "restore":
      await runRestoreCommand();
      break;
    default:
      console.log("Bye.");
      console.log("");
      break;
  }
}

function buildProgram() {
  const program = new Command();

  program
    .name("cliproxy-activator")
    .description(packageJson.description)
    .version(packageJson.version)
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  cliproxy-activator",
        "  cliproxy-activator activate --service codex --code K1DHPY3P-4B2W-F1A4-DC4P-Y74TCQZXPNYT",
        "  cliproxy-activator test",
        "  cliproxy-activator restore --service claude",
      ].join("\n")
    );

  program
    .command("activate")
    .description("Start the activation flow")
    .option("-s, --service <service>", "target service: claude or codex")
    .option("-c, --code <code>", "activation code")
    .action(runActivateCommand);

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
    .command("interactive")
    .description("Open the interactive menu")
    .action(runInteractiveMenu);

  return program;
}

async function runCli(argv = process.argv) {
  const args = argv.slice(2);

  if (args.length === 0) {
    await runInteractiveMenu();
    return;
  }

  const program = buildProgram();
  await program.parseAsync(argv);
}

module.exports = {
  buildProgram,
  runCli,
  runInteractiveMenu,
};
