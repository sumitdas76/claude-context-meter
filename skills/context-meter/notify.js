#!/usr/bin/env node
// claude-context-meter Stop hook: after Claude finishes a reply, shows a
// one-time message in the session when context usage first reaches yellow
// (50%) or red (75%). Resets when usage drops (e.g. after /compact).
//
// Reads the usage the status line saved for this session; falls back to the
// transcript. Never blocks Claude and never fails loudly: on any problem it
// prints nothing and exits 0.
"use strict";

const fs = require("fs");
const path = require("path");

const STATE_DIR = path.join(__dirname, "state");
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const WEEK_MS = 7 * 24 * 3600 * 1000;

function levelFor(pct) {
  if (pct >= 75) return 2;
  if (pct >= 50) return 1;
  return 0;
}

function kTokens(n) {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
}

/** Message for a newly reached level, or null when nothing should be shown. */
function messageFor(level, pct, used, size) {
  const amount = used != null ? ` (${kTokens(used)}/${kTokens(size)})` : "";
  if (level === 2) {
    return (
      `🔴 Context is ${pct}% full${amount}. Run /compact <what to keep> now, ` +
      "or /clear if this task is done. Past this point replies get slower, costlier and less accurate."
    );
  }
  if (level === 1) {
    return (
      `🟡 Context is ${pct}% full${amount}. Compact soon: finish the current step, ` +
      "then run /compact <what to keep>."
    );
  }
  return null;
}

/**
 * Pure decision: given current usage and the last level alerted, return
 * { message, nextLevel }. Alerts only when the level goes up.
 */
function decide(pct, used, size, lastLevel) {
  const level = levelFor(pct);
  const message = level > lastLevel ? messageFor(level, pct, used, size) : null;
  return { message, nextLevel: level };
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/** Latest input-token count from the transcript (fallback; may lag one turn). */
function usageFromTranscript(transcriptPath) {
  try {
    const lines = fs.readFileSync(transcriptPath, "utf8").trim().split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const u = JSON.parse(lines[i])?.message?.usage;
        if (u && u.input_tokens != null) {
          return (
            (u.input_tokens || 0) +
            (u.cache_creation_input_tokens || 0) +
            (u.cache_read_input_tokens || 0)
          );
        }
      } catch {
        // skip malformed line
      }
    }
  } catch {
    // unreadable
  }
  return null;
}

function pruneOldState(nowMs) {
  try {
    for (const f of fs.readdirSync(STATE_DIR)) {
      const p = path.join(STATE_DIR, f);
      if (nowMs - fs.statSync(p).mtimeMs > WEEK_MS) fs.rmSync(p, { force: true });
    }
  } catch {
    // nothing to prune
  }
}

function run(input, nowMs = Date.now()) {
  const sid = input && input.session_id;
  if (!sid || !SAFE_ID.test(sid)) return null;

  const saved = readJson(path.join(STATE_DIR, `${sid}.json`)) || {};
  const size = saved.size || 200000;
  let pct = typeof saved.pct === "number" ? saved.pct : null;
  let used = typeof saved.used === "number" ? saved.used : null;
  if (pct == null && input.transcript_path) {
    used = usageFromTranscript(input.transcript_path);
    if (used != null) pct = Math.round((used / size) * 100);
  }
  if (pct == null) return null;

  const alertFile = path.join(STATE_DIR, `${sid}.alert.json`);
  const last = readJson(alertFile)?.level || 0;
  const { message, nextLevel } = decide(pct, used, size, last);
  if (nextLevel !== last) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(alertFile, JSON.stringify({ level: nextLevel }));
  }
  pruneOldState(nowMs);
  return message;
}

module.exports = { decide, levelFor, messageFor, run, STATE_DIR };

if (require.main === module) {
  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => {
    try {
      const message = run(JSON.parse(raw));
      if (message) process.stdout.write(JSON.stringify({ systemMessage: message }));
    } catch {
      // stay silent: a context reminder must never disrupt the session
    }
    process.exit(0);
  });
}
