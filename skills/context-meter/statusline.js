#!/usr/bin/env node
// claude-context-meter: a Claude Code status line showing context-window
// usage, plan quota remaining, prompt-cache state and session cost.
//
// Claude Code pipes session JSON to stdin; whatever this prints becomes the
// status line. It never throws: bad or missing data degrades to "--".
// Field reference: https://code.claude.com/docs/en/statusline
"use strict";

const fs = require("fs");

const RESET = "\x1b[0m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const DIM = "\x1b[2m";

/** Colour by how much is *used*: green < 50, yellow < 75, red >= 75. */
function colourFor(usedPct) {
  if (usedPct >= 75) return RED;
  if (usedPct >= 50) return YELLOW;
  return GREEN;
}

function kTokens(n) {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
}

function bar(pct, width = 10) {
  const filled = Math.max(0, Math.min(width, Math.round((pct / 100) * width)));
  return "█".repeat(filled) + "░".repeat(width - filled);
}

/** "2h10m", "45m", "3d4h" until an epoch-seconds timestamp. */
function timeUntil(epochSec, nowMs) {
  const mins = Math.max(0, Math.round((epochSec * 1000 - nowMs) / 60000));
  if (mins >= 1440) return `${Math.floor(mins / 1440)}d${Math.floor((mins % 1440) / 60)}h`;
  if (mins >= 60) return `${Math.floor(mins / 60)}h${mins % 60}m`;
  return `${mins}m`;
}

/** Input tokens of the latest assistant turn in a transcript (fallback only). */
function usedFromTranscript(path) {
  try {
    const lines = fs.readFileSync(path, "utf8").trim().split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const u = JSON.parse(lines[i])?.message?.usage;
        if (u && u.input_tokens != null) return sumInput(u);
      } catch {
        // skip malformed line
      }
    }
  } catch {
    // unreadable transcript: caller shows "--"
  }
  return null;
}

/** Same input-only formula Claude Code uses for used_percentage. */
function sumInput(u) {
  return (
    (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0)
  );
}

function contextPart(d) {
  const cw = d.context_window || {};
  const size = cw.context_window_size || 200000;
  let used = null;
  if (cw.current_usage) used = sumInput(cw.current_usage);
  else if (d.transcript_path) used = usedFromTranscript(d.transcript_path);

  let pct = typeof cw.used_percentage === "number" ? cw.used_percentage : null;
  if (pct == null && used != null) pct = (used / size) * 100;
  if (pct == null) return "ctx --";

  pct = Math.min(100, Math.round(pct));
  const tokens = used != null ? ` (${kTokens(used)}/${kTokens(size)})` : "";
  const hint = pct >= 75 ? " → /compact or /clear" : "";
  return `${colourFor(pct)}ctx ${bar(pct)} ${pct}%${tokens}${hint}${RESET}`;
}

/** "5h 77% left (2h10m)" per window; omitted for API-key users. */
function quotaPart(d, nowMs) {
  const rl = d.rate_limits;
  if (!rl) return null;
  const windows = [
    ["5h", rl.five_hour],
    ["7d", rl.seven_day],
  ];
  const out = [];
  for (const [label, w] of windows) {
    if (!w || typeof w.used_percentage !== "number") continue;
    const used = Math.min(100, Math.max(0, w.used_percentage));
    const left = Math.round(100 - used);
    const reset = typeof w.resets_at === "number" ? ` (${timeUntil(w.resets_at, nowMs)})` : "";
    out.push(`${colourFor(used)}${label} ${left}% left${reset}${RESET}`);
  }
  return out.length ? out.join(" ") : null;
}

/** Warn when the prompt cache has expired: next message re-reads everything at full price. */
function cachePart(d, nowMs) {
  const pc = d.prompt_cache;
  if (!pc || !pc.caching_observed) return null;
  const expired =
    pc.warm === false || (typeof pc.expires_at === "number" && pc.expires_at * 1000 <= nowMs);
  return expired ? `${YELLOW}cache cold → /compact or /clear${RESET}` : null;
}

/** Build the full status line from Claude Code's session JSON. */
function render(d, nowMs = Date.now()) {
  d = d && typeof d === "object" ? d : {};
  const parts = [d.model?.display_name || "Claude", contextPart(d)];
  const quota = quotaPart(d, nowMs);
  if (quota) parts.push(quota);
  const cost = d.cost?.total_cost_usd;
  if (typeof cost === "number") parts.push(`${DIM}$${cost.toFixed(2)}${RESET}`);
  const cache = cachePart(d, nowMs);
  if (cache) parts.push(cache);
  return parts.join(" | ");
}

module.exports = { render, timeUntil, bar };

if (require.main === module) {
  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => {
    let d = {};
    try {
      d = JSON.parse(raw);
    } catch {
      // not JSON: render defaults
    }
    try {
      process.stdout.write(render(d));
    } catch {
      process.stdout.write("Claude | ctx --");
    }
  });
}
