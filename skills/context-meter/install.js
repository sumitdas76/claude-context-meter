#!/usr/bin/env node
// Installs (or removes) the claude-context-meter status line.
//
//   node install.js              install; refuses to replace another status line
//   node install.js --force      install, replacing an existing status line
//   node install.js --uninstall  remove it (only if it is ours)
//
// Copies statusline.js to <claude dir>/claude-context-meter/ so plugin
// updates or cache cleanups can't break the path, backs up settings.json,
// and writes the new settings atomically. Honours CLAUDE_CONFIG_DIR.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const MARKER = "claude-context-meter";

class InstallError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
  }
}

function claudeDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
}

function readSettings(file) {
  if (!fs.existsSync(file)) return {};
  const text = fs.readFileSync(file, "utf8");
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new InstallError(
      `${file} is not valid JSON, so it was left untouched. Fix it and run the installer again.`,
    );
  }
}

function writeSettingsAtomic(file, settings) {
  if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak-${MARKER}`);
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2) + "\n");
  fs.renameSync(tmp, file);
}

/** Pure decision logic: returns the new settings object. */
function planInstall(settings, command, force) {
  const existing = settings.statusLine;
  const ours = existing && String(existing.command || "").includes(MARKER);
  if (existing && !ours && !force) {
    throw new InstallError(
      `A status line is already configured:\n  ${existing.command || JSON.stringify(existing)}\n` +
        "Nothing was changed. Re-run with --force to replace it (settings.json is backed up first).",
      2,
    );
  }
  return { ...settings, statusLine: { type: "command", command } };
}

function planUninstall(settings) {
  const existing = settings.statusLine;
  if (!existing || !String(existing.command || "").includes(MARKER)) return null;
  const next = { ...settings };
  delete next.statusLine;
  return next;
}

function install({ force = false } = {}) {
  const dir = claudeDir();
  const settingsFile = path.join(dir, "settings.json");
  const settings = readSettings(settingsFile); // validate before touching anything

  const targetDir = path.join(dir, MARKER);
  const target = path.join(targetDir, "statusline.js");
  const command = `node "${target.split(path.sep).join("/")}"`;
  const next = planInstall(settings, command, force);

  fs.mkdirSync(targetDir, { recursive: true });
  fs.copyFileSync(path.join(__dirname, "statusline.js"), target);
  writeSettingsAtomic(settingsFile, next);
  return `Installed. Status line: ${command}\nRestart Claude Code if it doesn't appear.`;
}

function uninstall() {
  const dir = claudeDir();
  const settingsFile = path.join(dir, "settings.json");
  const next = planUninstall(readSettings(settingsFile));
  if (next) writeSettingsAtomic(settingsFile, next);
  fs.rmSync(path.join(dir, MARKER), { recursive: true, force: true });
  return next
    ? "Removed the context meter status line."
    : "The context meter wasn't the configured status line; settings.json was left unchanged.";
}

module.exports = { planInstall, planUninstall, install, uninstall, InstallError };

if (require.main === module) {
  const args = process.argv.slice(2);
  try {
    const msg = args.includes("--uninstall")
      ? uninstall()
      : install({ force: args.includes("--force") });
    console.log(msg);
  } catch (err) {
    const known = err instanceof InstallError;
    console.error(known ? err.message : `Install failed: ${err.message}`);
    process.exit(known ? err.exitCode : 1);
  }
}
