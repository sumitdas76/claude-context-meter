"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { planInstall, planUninstall } = require("../skills/context-meter/install.js");

const INSTALLER = path.join(__dirname, "..", "skills", "context-meter", "install.js");

function run(dir, ...args) {
  return spawnSync(process.execPath, [INSTALLER, ...args], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: dir },
    encoding: "utf8",
  });
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "ccm-"));
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));

test("planInstall refuses to replace a foreign status line without force", () => {
  const s = { statusLine: { type: "command", command: "other.sh" } };
  assert.throws(
    () => planInstall(s, "node x/claude-context-meter/statusline.js", false),
    /--force/,
  );
  assert.equal(planInstall(s, "node new", true).statusLine.command, "node new");
});

test("planInstall keeps other settings", () => {
  const next = planInstall({ model: "opus" }, "node c", false);
  assert.deepEqual(next, { model: "opus", statusLine: { type: "command", command: "node c" } });
});

test("planUninstall only removes our own status line", () => {
  assert.equal(planUninstall({ statusLine: { command: "other.sh" } }), null);
  assert.deepEqual(
    planUninstall({ a: 1, statusLine: { command: "node claude-context-meter/s.js" } }),
    { a: 1 },
  );
});

test("install, reinstall, uninstall round trip in a temp config dir", () => {
  const dir = tmp();
  const settings = path.join(dir, "settings.json");
  fs.writeFileSync(settings, JSON.stringify({ model: "opus" }));

  let r = run(dir);
  assert.equal(r.status, 0, r.stderr);
  const cmd = readJson(settings).statusLine.command;
  assert.match(cmd, /claude-context-meter\/statusline\.js"$/);
  assert.ok(fs.existsSync(path.join(dir, "claude-context-meter", "statusline.js")));
  assert.ok(fs.existsSync(`${settings}.bak-claude-context-meter`));
  assert.equal(readJson(settings).model, "opus");

  assert.equal(run(dir).status, 0, "reinstall over our own line needs no --force");

  r = run(dir, "--uninstall");
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(readJson(settings), { model: "opus" });
  assert.ok(!fs.existsSync(path.join(dir, "claude-context-meter")));
});

test("install exits 2 and changes nothing when another status line exists", () => {
  const dir = tmp();
  const settings = path.join(dir, "settings.json");
  const original = JSON.stringify({ statusLine: { type: "command", command: "mine.sh" } });
  fs.writeFileSync(settings, original);
  const r = run(dir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /mine\.sh/);
  assert.equal(fs.readFileSync(settings, "utf8"), original);
  assert.ok(!fs.existsSync(path.join(dir, "claude-context-meter")));
});

test("install leaves invalid settings.json untouched", () => {
  const dir = tmp();
  const settings = path.join(dir, "settings.json");
  fs.writeFileSync(settings, "{ broken");
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not valid JSON/);
  assert.equal(fs.readFileSync(settings, "utf8"), "{ broken");
});

test("install works with no settings.json yet", () => {
  const dir = tmp();
  assert.equal(run(dir).status, 0);
  assert.ok(readJson(path.join(dir, "settings.json")).statusLine);
});

test("display flags pass through; unknown flags are dropped", () => {
  const dir = tmp();
  assert.equal(run(dir, "--quota", "--cost", "--evil;rm").status, 0);
  const cmd = readJson(path.join(dir, "settings.json")).statusLine.command;
  assert.match(cmd, /statusline\.js" --quota --cost$/);
});

test("alert hook: added once, keeps other hooks, removed on uninstall", () => {
  const dir = tmp();
  const settings = path.join(dir, "settings.json");
  const theirs = { hooks: [{ type: "command", command: "my-stop.sh" }] };
  const pre = { matcher: "Bash", hooks: [{ type: "command", command: "guard.sh" }] };
  fs.writeFileSync(settings, JSON.stringify({ hooks: { Stop: [theirs], PreToolUse: [pre] } }));

  assert.equal(run(dir).status, 0);
  assert.equal(run(dir).status, 0, "reinstall");
  let s = readJson(settings);
  assert.equal(s.hooks.Stop.length, 2, "ours added once, theirs kept");
  assert.deepEqual(s.hooks.Stop[0], theirs);
  assert.match(s.hooks.Stop[1].hooks[0].command, /claude-context-meter\/notify\.js"$/);
  assert.deepEqual(s.hooks.PreToolUse, [pre]);
  assert.ok(fs.existsSync(path.join(dir, "claude-context-meter", "notify.js")));

  assert.equal(run(dir, "--uninstall").status, 0);
  s = readJson(settings);
  assert.deepEqual(s, { hooks: { Stop: [theirs], PreToolUse: [pre] } });
});

test("--no-notify installs without the hook and removes an existing one", () => {
  const dir = tmp();
  const settings = path.join(dir, "settings.json");
  assert.equal(run(dir).status, 0);
  assert.ok(readJson(settings).hooks.Stop);
  assert.equal(run(dir, "--no-notify").status, 0);
  assert.equal(readJson(settings).hooks, undefined);
  assert.ok(readJson(settings).statusLine);
});
