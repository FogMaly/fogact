"use strict";

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
};

function shouldColorize(options = {}) {
  if (options.color === true || process.env.FORCE_COLOR) return true;
  if (options.color === false || process.env.NO_COLOR) return false;
  if (!process.stdout.isTTY) return false;
  if (process.env.TERM && String(process.env.TERM).toLowerCase() === "dumb") return false;
  return true;
}

function color(value, name, options = {}) {
  if (!shouldColorize(options) || !ANSI[name]) return String(value);
  return `${ANSI[name]}${value}${ANSI.reset}`;
}

function chain(value, names, options = {}) {
  const text = String(value);
  if (!shouldColorize(options)) return text;
  const open = names.map((name) => ANSI[name]).filter(Boolean).join("");
  return open ? `${open}${text}${ANSI.reset}` : text;
}

function bold(value, options = {}) {
  return chain(value, ["bold"], options);
}

function dim(value, options = {}) {
  return chain(value, ["dim"], options);
}

function boldGreen(value, options = {}) {
  return chain(value, ["green", "bold"], options);
}

function boldRed(value, options = {}) {
  return chain(value, ["red", "bold"], options);
}

function boldWhite(value, options = {}) {
  return chain(value, ["white", "bold"], options);
}

function green(value, options = {}) {
  return color(value, "green", options);
}

function yellow(value, options = {}) {
  return color(value, "yellow", options);
}

function red(value, options = {}) {
  return color(value, "red", options);
}

function cyan(value, options = {}) {
  return color(value, "cyan", options);
}

function magenta(value, options = {}) {
  return color(value, "magenta", options);
}

function white(value, options = {}) {
  return color(value, "white", options);
}

function blue(value, options = {}) {
  return color(value, "blue", options);
}

function gray(value, options = {}) {
  return color(value, "gray", options);
}

module.exports = {
  ANSI,
  blue,
  bold,
  boldGreen,
  boldRed,
  boldWhite,
  chain,
  color,
  cyan,
  dim,
  gray,
  green,
  magenta,
  red,
  shouldColorize,
  white,
  yellow,
};
