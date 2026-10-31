"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { render, timeUntil, bar } = require("../skills/context-meter/statusline.js");

const SCRIPT = path.join(__dirname, "..", "skills", "context-meter", "statusline.js");
// eslint-disable-next-line no-control-regex
const plain = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");
const NOW = 1_700_000_000_000;

test("context from used_percentage and current_usage", () => {
  const out = plain(
    render(
      {
        model: { display_name: "Opus 5.5" },
        context_window: {
          context_window_size: 200000,
          used_percentage: 39.4,
          current_usage: { input_tokens: 1000, cache_read_input_tokens: 78000 },
        },
        cost: { total_cost_usd: 1.234 },
      },
      NOW,
    ),
  );
  assert.equal(out, "Opus 5.5 | ctx ████░░░░░░ 39% (79k/200k) | $1.23");
});

test("hint appears at 75% and above", () => {
  const out = plain(render({ context_window: { used_percentage: 80 } }, NOW));
  assert.match(out, /ctx ████████░░ 80% → \/compact or \/clear/);
});

test("1M context window is respected", () => {
  const out = plain(
    render(
      {
        context_window: { context_window_size: 1000000, current_usage: { input_tokens: 250000 } },
      },
      NOW,
    ),
  );
  assert.match(out, /25% \(250k\/1000k\)/);
});

test("quota shows remaining and time to reset", () => {
  const out = plain(
    render(
      {
        context_window: { used_percentage: 10 },
        rate_limits: {
          five_hour: { used_percentage: 23.5, resets_at: NOW / 1000 + 130 * 60 },
          seven_day: { used_percentage: 41.2, resets_at: NOW / 1000 + (3 * 24 + 4) * 3600 },
        },
      },
      NOW,
    ),
  );
  assert.match(out, /5h 77% left \(2h10m\) 7d 59% left \(3d4h\)/);
});

test("quota omitted when absent (API-key users)", () => {
  const out = plain(render({ context_window: { used_percentage: 10 } }, NOW));
  assert.doesNotMatch(out, /left/);
});

test("cold cache warns; warm cache is silent", () => {
  const cold = { prompt_cache: { caching_observed: true, warm: true, expires_at: NOW / 1000 - 1 } };
  const warm = {
    prompt_cache: { caching_observed: true, warm: true, expires_at: NOW / 1000 + 60 },
  };
  assert.match(plain(render(cold, NOW)), /cache cold/);
  assert.doesNotMatch(plain(render(warm, NOW)), /cache cold/);
  assert.doesNotMatch(plain(render({ prompt_cache: { caching_observed: false } }, NOW)), /cache/);
});

test("missing or null data never throws", () => {
  assert.equal(plain(render(undefined, NOW)), "Claude | ctx --");
  assert.equal(
    plain(render({ context_window: { current_usage: null, used_percentage: null } }, NOW)),
    "Claude | ctx --",
  );
  assert.equal(plain(render({ transcript_path: "/no/such/file" }, NOW)), "Claude | ctx --");
});

test("helpers", () => {
  assert.equal(timeUntil(NOW / 1000 + 45 * 60, NOW), "45m");
  assert.equal(timeUntil(NOW / 1000 - 99, NOW), "0m");
  assert.equal(bar(0), "░░░░░░░░░░");
  assert.equal(bar(150), "██████████");
});

test("CLI handles garbage stdin", () => {
  const out = execFileSync(process.execPath, [SCRIPT], { input: "not json" }).toString();
  assert.equal(plain(out), "Claude | ctx --");
});
