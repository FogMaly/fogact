#!/usr/bin/env node

const { runCli } = require("../lib");

runCli().catch((error) => {
  const message = error && error.message ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
