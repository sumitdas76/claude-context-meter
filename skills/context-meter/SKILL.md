---
name: context-meter
description: Install, update or remove the claude-context-meter status line, which shows context-window usage with a green/yellow/red legend at the bottom of Claude Code, and optionally plan quota left (5-hour and weekly) and session cost. Use when the user asks to set up, install, update, fix, change or remove the context meter or a token/context/quota status line.
---

# Context meter

This skill installs a status line script; it does not change how Claude
behaves. The installer and script live in this skill's base directory.

## Install or update

1. Run: `node "<this skill's base directory>/install.js"`, adding any
   display flags the user asked for:
   - `--quota`: show 5-hour and 7-day plan quota left
   - `--cost`: show session cost
   - `--no-legend`: hide the colour key
2. If it exits with code 2, another status line is already configured. Show
   the user the existing command it printed and ask whether to replace it.
   Only with their yes, run again with `--force` (plus the same flags).
   `settings.json` is backed up to `settings.json.bak-claude-context-meter`
   before any change.
3. Tell the user it appears on the next status refresh, or after restarting
   Claude Code. To change flags later, re-run the installer.

## Remove

Run `node "<this skill's base directory>/install.js" --uninstall`. It only
removes the status line if it is this meter.

## What the user will see

`Opus | ctx ████░░░░░░ 39% (79k/200k) | ● ok ● compact soon ● /compact or /clear`

The three coloured dots are the legend for the bar colour:

- Green: under 50% of context used, ok.
- Yellow: 50–74% used, compact soon (finish the current step, then `/compact`).
- Red: 75%+ used, `/compact` or `/clear` now.

Also possible: yellow `cache cold → /compact or /clear` (prompt cache expired,
so the next message re-reads everything at full price), and `ctx --` (no
usage data yet). With `--quota`: `5h 42% left (53m) low`, where `low` means
26–50% left and `very low → cheaper /model` means 25% or less.

Requires Node.js 18 or later.
