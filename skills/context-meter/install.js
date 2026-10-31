#!/usr/bin/env node
// Installs (or removes) the claude-context-meter status line.
//
//   node install.js              install; refuses to replace another status line
//   node install.js --force      install, replacing an existing status line
//   node install.js --uninstall  remove it (only if it is ours)
//
// Display flags are passed through to the status line command:
//   --quota (show 5h/7d quota left)  --cost (show session $)  --no-legend
// Also installs a Stop hook (notify.js) that shows a one-time message in the
// session at 50% and 75% context; --no-notify leaves it out.
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

const isOurs = (cmd) => String(cmd || "").includes(MARKER);

/** Remove our Stop hook entries, keeping every other hook untouched. */
function withoutOurHook(settings) {
  const next = JSON.parse(JSON.stringify(settings));
  const stop = next.hooks && next.hooks.Stop;
  if (!Array.isArray(stop)) return next;
  const kept = stop.filter((g) => !(g.hooks || []).some((h) => isOurs(h.command)));
  if (kept.length) next.hooks.Stop = kept;
  else delete next.hooks.Stop;
  if (Object.keys(next.hooks).length === 0) delete next.hooks;
  return next;
}

/** Pure decision logic: returns the new settings object. */
function planInstall(settings, command, force, hookCommand = null) {
  const existing = settings.statusLine;
  if (existing && !isOurs(existing.command) && !force) {
    throw new InstallError(
      `A status line is already configured:\n  ${existing.command || JSON.stringify(existing)}\n` +
        "Nothing was changed. Re-run with --force to replace it (settings.json is backed up first).",
      2,
    );
  }
  const next = withoutOurHook(settings);
  next.statusLine = { type: "command", command };
  if (hookCommand) {
    next.hooks = next.hooks || {};
    next.hooks.Stop = [
      ...(next.hooks.Stop || []),
      { hooks: [{ type: "command", command: hookCommand }] },
    ];
  }
  return next;
}

/** Returns new settings, or null when nothing of ours is configured. */
function planUninstall(settings) {
  const next = withoutOurHook(settings);
  if (next.statusLine && isOurs(next.statusLine.command)) delete next.statusLine;
  return JSON.stringify(next) === JSON.stringify(settings) ? null : next;
}

const DISPLAY_FLAGS = ["--quota", "--cost", "--no-legend"];

function install({ force = false, display = [], notify = true } = {}) {
  const dir = claudeDir();
  const settingsFile = path.join(dir, "settings.json");
  const settings = readSettings(settingsFile); // validate before touching anything

  const targetDir = path.join(dir, MARKER);
  const nodeCmd = (file) => `node "${path.join(targetDir, file).split(path.sep).join("/")}"`;
  const flags = DISPLAY_FLAGS.filter((f) => display.includes(f)); // whitelist only
  const command = [nodeCmd("statusline.js"), ...flags].join(" ");
  const hookCommand = notify ? nodeCmd("notify.js") : null;
  const next = planInstall(settings, command, force, hookCommand);

  fs.mkdirSync(targetDir, { recursive: true });
  for (const f of ["statusline.js", "notify.js"]) {
    fs.copyFileSync(path.join(__dirname, f), path.join(targetDir, f));
  }
  writeSettingsAtomic(settingsFile, next);
  return (
    `Installed. Status line: ${command}\n` +
    (notify ? "In-session alerts at 50% and 75% context: on (--no-notify to turn off)\n" : "") +
    "Restart Claude Code if it doesn't appear."
  );
}

function uninstall() {
  const dir = claudeDir();
  const settingsFile = path.join(dir, "settings.json");
  const next = planUninstall(readSettings(settingsFile));
  if (next) writeSettingsAtomic(settingsFile, next);
  fs.rmSync(path.join(dir, MARKER), { recursive: true, force: true });
  return next
    ? "Removed the context meter status line and alerts."
    : "The context meter wasn't configured; settings.json was left unchanged.";
}

module.exports = { planInstall, planUninstall, install, uninstall, InstallError };

if (require.main === module) {
  const args = process.argv.slice(2);
  try {
    const msg = args.includes("--uninstall")
      ? uninstall()
      : install({
          force: args.includes("--force"),
          display: args,
          notify: !args.includes("--no-notify"),
        });
    console.log(msg);
  } catch (err) {
    const known = err instanceof InstallError;
    console.error(known ? err.message : `Install failed: ${err.message}`);
    process.exit(known ? err.exitCode : 1);
  }
}
