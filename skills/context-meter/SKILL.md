---
name: context-meter
description: Install, update or remove the claude-context-meter status line, which shows context-window usage, plan quota remaining (5-hour and weekly), prompt-cache state and session cost at the bottom of Claude Code. Use when the user asks to set up, install, update, fix or remove the context meter or a token/context/quota status line.
---

# Context meter

This skill installs a status line script; it does not change how Claude
behaves. The installer and script live in this skill's base directory.

## Install or update

1. Run: `node "<this skill's base directory>/install.js"`
2. If it exits with code 2, another status line is already configured. Show
   the user the existing command it printed and ask whether to replace it.
   Only with their yes, run again with `--force`. `settings.json` is backed
   up to `settings.json.bak-claude-context-meter` before any change.
3. Tell the user it appears on the next status refresh, or after restarting
   Claude Code.

## Remove

Run `node "<this skill's base directory>/install.js" --uninstall`. It only
removes the status line if it is this meter.

## What the user will see

`Opus | ctx ████░░░░░░ 39% (79k/200k) | 5h 77% left (2h10m) 7d 59% left (3d4h) | $1.23`

- Context bar: green under 50% used; yellow 50–74% (plan to `/compact` at
  the next break point); red 75%+ with a `→ /compact or /clear` hint (act now).
- Quota (`5h`/`7d`, shown as % left): green more than 50% left; yellow
  26–50% left (consider a cheaper `/model`); red 25% or less left (switch
  model or wait for the reset time shown). Pro, Max and Ultra plans only,
  after the first reply.
- Yellow `cache cold → /compact or /clear`: the prompt cache has expired, so
  the next message re-reads the whole conversation at full price.
- Grey `$1.23`: session cost. `ctx --`: no usage data yet.

Requires Node.js 18 or later.
