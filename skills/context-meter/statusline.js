#!/usr/bin/env node
// claude-context-meter: a Claude Code status line showing context-window
// usage, plan quota remaining, prompt-cache state and session cost.
//
// Claude Code pipes session JSON to stdin; whatever this prints becomes the
// status line. It never throws: bad or missing data degrades to "--".
// Field reference: https://code.claude.com/docs/en/statusline
"use strict";

const fs = require("fs");
const path = require("path");

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

/** { pct, used, size } for the context window, or null when unknown. */
function contextStats(d) {
  const cw = d.context_window || {};
  const size = cw.context_window_size || 200000;
  let used = null;
  if (cw.current_usage) used = sumInput(cw.current_usage);
  else if (d.transcript_path) used = usedFromTranscript(d.transcript_path);

  let pct = typeof cw.used_percentage === "number" ? cw.used_percentage : null;
  if (pct == null && used != null) pct = (used / size) * 100;
  if (pct == null) return null;
  return { pct: Math.min(100, Math.round(pct)), used, size };
}

/** Save this session's usage so the Stop hook (notify.js) can alert on it. */
function saveState(d, dir = path.join(__dirname, "state")) {
  try {
    const sid = d && d.session_id;
    const stats = d && contextStats(d);
    if (!stats || !sid || !/^[A-Za-z0-9_-]{1,128}$/.test(sid)) return;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${sid}.json`), JSON.stringify(stats));
  } catch {
    // alerts are optional; never break the status line
  }
}

function contextPart(d) {
  const stats = contextStats(d);
  if (!stats) return "ctx --";
  const { pct, used, size } = stats;
  const tokens = used != null ? ` (${kTokens(used)}/${kTokens(size)})` : "";
  return `${colourFor(pct)}ctx ${bar(pct)} ${pct}%${tokens}${RESET}`;
}

/** Always-visible key so the bar colour never has to be remembered. */
const LEGEND =
  `${GREEN}●${RESET} ok ${YELLOW}●${RESET} compact soon ` + `${RED}●${RESET} /compact or /clear`;

/** "5h 77% left (2h10m)" per window, plus "low"/"very low" words; omitted for API-key users. */
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
    const word = used >= 75 ? " very low → cheaper /model" : used >= 50 ? " low" : "";
    out.push(`${colourFor(used)}${label} ${left}% left${reset}${word}${RESET}`);
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

const DEFAULTS = { legend: true, quota: false, cost: false };

/** Options from command-line flags: --quota, --cost, --no-legend. */
function parseFlags(argv) {
  return {
    legend: !argv.includes("--no-legend"),
    quota: argv.includes("--quota"),
    cost: argv.includes("--cost"),
  };
}

/** Build the full status line from Claude Code's session JSON. */
function render(d, nowMs = Date.now(), opts = DEFAULTS) {
  d = d && typeof d === "object" ? d : {};
  const parts = [d.model?.display_name || "Claude", contextPart(d)];
  if (opts.legend) parts.push(LEGEND);
  const quota = opts.quota ? quotaPart(d, nowMs) : null;
  if (quota) parts.push(quota);
  const cost = d.cost?.total_cost_usd;
  if (opts.cost && typeof cost === "number") parts.push(`${DIM}$${cost.toFixed(2)}${RESET}`);
  const cache = cachePart(d, nowMs);
  if (cache) parts.push(cache);
  return parts.join(" | ");
}

module.exports = { render, parseFlags, saveState, timeUntil, bar };

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
      process.stdout.write(render(d, Date.now(), parseFlags(process.argv.slice(2))));
      saveState(d);
    } catch {
      process.stdout.write("Claude | ctx --");
    }
  });
}
