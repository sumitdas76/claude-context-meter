"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { decide, levelFor } = require("../skills/context-meter/notify.js");
const { saveState } = require("../skills/context-meter/statusline.js");

const SRC = path.join(__dirname, "..", "skills", "context-meter");

test("levels: green < 50, yellow 50-74, red >= 75", () => {
  assert.equal(levelFor(49), 0);
  assert.equal(levelFor(50), 1);
  assert.equal(levelFor(74), 1);
  assert.equal(levelFor(75), 2);
});

test("alerts only when the level goes up", () => {
  assert.equal(decide(30, null, 200000, 0).message, null);
  assert.match(
    decide(52, 104000, 200000, 0).message,
    /^🟡 Context is 52% full \(104k\/200k\)\. Compact soon/,
  );
  assert.equal(decide(60, null, 200000, 1).message, null, "no repeat at same level");
  assert.match(
    decide(78, 156000, 200000, 1).message,
    /^🔴 Context is 78% full .*\/compact .* \/clear/,
  );
  assert.match(decide(80, null, 200000, 0).message, /^🔴/, "jumping straight to red shows red");
  assert.equal(decide(90, null, 200000, 2).message, null);
});

test("dropping a level resets, so alerts can fire again after /compact", () => {
  const after = decide(20, null, 200000, 2);
  assert.equal(after.message, null);
  assert.equal(after.nextLevel, 0);
  assert.match(decide(55, null, 200000, after.nextLevel).message, /^🟡/);
});

/** Run notify.js from a private copy so its state dir is isolated. */
function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ccm-notify-"));
  for (const f of ["notify.js", "statusline.js"]) {
    fs.copyFileSync(path.join(SRC, f), path.join(dir, f));
  }
  const hook = (input) =>
    spawnSync(process.execPath, [path.join(dir, "notify.js")], {
      input: typeof input === "string" ? input : JSON.stringify(input),
      encoding: "utf8",
    });
  return { dir, state: path.join(dir, "state"), hook };
}

test("end to end: status line state → one yellow, then one red, then reset", () => {
  const { state, hook } = sandbox();
  const sid = "sess-1";
  const statusAt = (pct) =>
    saveState(
      { session_id: sid, context_window: { context_window_size: 200000, used_percentage: pct } },
      state,
    );

  statusAt(40);
  assert.equal(hook({ session_id: sid }).stdout, "");

  statusAt(55);
  let r = hook({ session_id: sid });
  assert.equal(r.status, 0);
  assert.match(JSON.parse(r.stdout).systemMessage, /^🟡 Context is 55% full/);
  assert.equal(hook({ session_id: sid }).stdout, "", "shown once");

  statusAt(80);
  assert.match(JSON.parse(hook({ session_id: sid }).stdout).systemMessage, /^🔴/);
  assert.equal(hook({ session_id: sid }).stdout, "");

  statusAt(15); // after /compact
  assert.equal(hook({ session_id: sid }).stdout, "");
  statusAt(51);
  assert.match(JSON.parse(hook({ session_id: sid }).stdout).systemMessage, /^🟡/);
});

test("falls back to the transcript when no status line state exists", () => {
  const { dir, hook } = sandbox();
  const transcript = path.join(dir, "t.jsonl");
  const usage = { input_tokens: 2000, cache_read_input_tokens: 158000 };
  fs.writeFileSync(transcript, JSON.stringify({ message: { usage } }) + "\n");
  const r = hook({ session_id: "sess-2", transcript_path: transcript });
  assert.match(JSON.parse(r.stdout).systemMessage, /^🔴 Context is 80% full \(160k\/200k\)/);
});

test("never blocks or errors: garbage, unsafe ids, missing data", () => {
  const { hook } = sandbox();
  for (const input of ["not json", {}, { session_id: "../../etc/passwd" }, { session_id: "x" }]) {
    const r = hook(input);
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "");
  }
});
