"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { render, parseFlags, timeUntil, bar } = require("../skills/context-meter/statusline.js");

const SCRIPT = path.join(__dirname, "..", "skills", "context-meter", "statusline.js");
// eslint-disable-next-line no-control-regex
const plain = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");
const NOW = 1_700_000_000_000;
const LEGEND = "● ok ● compact soon ● /compact or /clear";
const ALL = { legend: true, quota: true, cost: true };

const sample = {
  model: { display_name: "Opus 5.5" },
  context_window: {
    context_window_size: 200000,
    used_percentage: 39.4,
    current_usage: { input_tokens: 1000, cache_read_input_tokens: 78000 },
  },
  rate_limits: { five_hour: { used_percentage: 58, resets_at: NOW / 1000 + 53 * 60 } },
  cost: { total_cost_usd: 2.69 },
};

test("default: context meter and legend; no quota, no cost", () => {
  assert.equal(plain(render(sample, NOW)), `Opus 5.5 | ctx ████░░░░░░ 39% (79k/200k) | ${LEGEND}`);
});

test("legend dots carry their colours", () => {
  const out = render(sample, NOW);
  assert.match(out, /\x1b\[32m●\x1b\[0m ok/); // eslint-disable-line no-control-regex
  assert.match(out, /\x1b\[33m●\x1b\[0m compact soon/); // eslint-disable-line no-control-regex
  assert.match(out, /\x1b\[31m●\x1b\[0m \/compact or \/clear/); // eslint-disable-line no-control-regex
});

test("context bar colour bands: green < 50, yellow < 75, red >= 75", () => {
  const ctx = (p) => render({ context_window: { used_percentage: p } }, NOW);
  assert.match(ctx(49), /\x1b\[32mctx .* 49%/); // eslint-disable-line no-control-regex
  assert.match(ctx(50), /\x1b\[33mctx .* 50%/); // eslint-disable-line no-control-regex
  assert.match(ctx(80), /\x1b\[31mctx ████████░░ 80%/); // eslint-disable-line no-control-regex
});

test("--quota and --cost bring those parts back", () => {
  const out = plain(render(sample, NOW, ALL));
  assert.match(out, /\| 5h 42% left \(53m\) low \| \$2\.69$/);
});

test("--no-legend hides the legend", () => {
  const out = plain(render(sample, NOW, { legend: false }));
  assert.equal(out, "Opus 5.5 | ctx ████░░░░░░ 39% (79k/200k)");
});

test("parseFlags", () => {
  assert.deepEqual(parseFlags([]), { legend: true, quota: false, cost: false });
  assert.deepEqual(parseFlags(["--quota", "--cost", "--no-legend"]), {
    legend: false,
    quota: true,
    cost: true,
  });
});

test("1M context window is respected", () => {
  const d = {
    context_window: { context_window_size: 1000000, current_usage: { input_tokens: 250000 } },
  };
  assert.match(plain(render(d, NOW)), /25% \(250k\/1000k\)/);
});

test("quota words and reset times", () => {
  const q = (used, resets) =>
    plain(
      render(
        { rate_limits: { five_hour: { used_percentage: used, resets_at: resets } } },
        NOW,
        ALL,
      ),
    );
  assert.match(q(30), /5h 70% left$/);
  assert.match(q(60), /5h 40% left low$/);
  assert.match(q(90, NOW / 1000 + 130 * 60), /5h 10% left \(2h10m\) very low → cheaper \/model$/);
});

test("quota omitted when absent (API-key users)", () => {
  assert.doesNotMatch(plain(render({ context_window: { used_percentage: 10 } }, NOW, ALL)), /left/);
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
  const none = { legend: false };
  assert.equal(plain(render(undefined, NOW, none)), "Claude | ctx --");
  assert.equal(
    plain(render({ context_window: { current_usage: null, used_percentage: null } }, NOW, none)),
    "Claude | ctx --",
  );
  assert.equal(plain(render({ transcript_path: "/no/such/file" }, NOW, none)), "Claude | ctx --");
});

test("helpers", () => {
  assert.equal(timeUntil(NOW / 1000 + 45 * 60, NOW), "45m");
  assert.equal(timeUntil(NOW / 1000 - 99, NOW), "0m");
  assert.equal(bar(0), "░░░░░░░░░░");
  assert.equal(bar(150), "██████████");
});

test("CLI: garbage stdin and flags", () => {
  const run = (...flags) =>
    plain(execFileSync(process.execPath, [SCRIPT, ...flags], { input: "not json" }).toString());
  assert.equal(run(), `Claude | ctx -- | ${LEGEND}`);
  assert.equal(run("--no-legend"), "Claude | ctx --");
});
