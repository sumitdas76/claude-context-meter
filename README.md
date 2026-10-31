# claude-context-meter

A small, dependency-free status line for [Claude Code](https://code.claude.com)
that shows how full your context window is, with a colour key right beside
it, so you know when to `/compact` or `/clear`.

```
Opus | ctx ████░░░░░░ 39% (79k/200k) | ● ok ● compact soon ● /compact or /clear
```

The three dots are a built-in legend (green, yellow, red), so you never need
to remember what the bar colour means.

## What the colours mean

| Bar colour | Context used | What to do                                                                                |
| ---------- | ------------ | ----------------------------------------------------------------------------------------- |
| 🟢 Green   | Under 50%    | **ok**: keep working.                                                                     |
| 🟡 Yellow  | 50–74%       | **compact soon**: finish the current step, then `/compact`.                               |
| 🔴 Red     | 75% or more  | **/compact or /clear** now: `/clear` if the task is done, else `/compact <what to keep>`. |

Other things that can appear:

- **🟡 `cache cold → /compact or /clear`** appears only when the prompt cache
  has expired, typically after a long pause: your next message re-reads the
  whole conversation at full price.
- **`ctx --`** means there's no usage data yet, for example before the first
  reply or right after `/compact`.

The meter handles 200k and 1M context windows. Colours follow your terminal
theme.

### In-session alerts

The status bar is easy to miss, so when the bar changes colour you also get
a message in the conversation itself, right after Claude's reply:

> 🟡 Context is 52% full (104k/200k). Compact soon: finish the current step,
> then run /compact <what to keep>.

> 🔴 Context is 78% full (156k/200k). Run /compact <what to keep> now, or
> /clear if this task is done. Past this point replies get slower, costlier
> and less accurate.

Each message appears **once per level per session**, not after every reply.
When usage drops (after `/compact`), the alerts reset and can fire again.
This uses a Claude Code `Stop` hook (`notify.js`) that never blocks Claude
and stays silent on any error. Turn it off with `--no-notify`.

### Optional parts

Turn these on with flags (see [Install](#install)):

| Flag          | Adds                                                                                                                                                                                                      |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--quota`     | Plan quota **left** for the 5-hour and 7-day windows with reset time, e.g. `5h 42% left (53m) low`. Words: `low` (26–50% left), `very low → cheaper /model` (25% or less). Pro, Max and Ultra plans only. |
| `--cost`      | Session cost so far, e.g. `$2.69`.                                                                                                                                                                        |
| `--no-legend` | Hides the colour key.                                                                                                                                                                                     |

Why another status line? It's two small Node files (~170 and ~140 lines) you can read in a few
minutes, has no dependencies, never breaks your status bar (bad data shows
`--`), and the installer won't overwrite a status line you already have.

## Install

Requires Node.js 18+.

**As a Claude Code plugin** (inside Claude Code):

```
/plugin marketplace add sumitdas76/claude-context-meter
/plugin install claude-context-meter@claude-context-meter
```

Then ask Claude: _"install the context meter"_ (optionally _"with quota and
cost"_). The bundled `context-meter` skill runs the installer and asks before
replacing an existing status line.

**Manually:**

```bash
git clone https://github.com/sumitdas76/claude-context-meter
node claude-context-meter/skills/context-meter/install.js
```

The installer copies `statusline.js` and `notify.js` to
`~/.claude/claude-context-meter/`, backs up `settings.json` to
`settings.json.bak-claude-context-meter`, and adds the `statusLine` entry and
a `Stop` hook. Your other hooks are kept as they are. It honours
`CLAUDE_CONFIG_DIR`.

| Installer flag                     | Effect                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| _(none)_                           | Install. Exits with code 2 and changes nothing if another status line is configured. |
| `--force`                          | Replace an existing status line (after backing up).                                  |
| `--uninstall`                      | Remove the status line (only if it is this one) and the alert hook.                  |
| `--no-notify`                      | Install without the [in-session alerts](#in-session-alerts).                         |
| `--quota`, `--cost`, `--no-legend` | Passed through to the status line (see [Optional parts](#optional-parts)).           |

Re-run the installer to change flags. Restart Claude Code if the meter doesn't
appear on the next refresh.

## Develop

```bash
npm ci
npm test       # node:test, no extra dependencies
npm run lint   # ESLint + Prettier
```

CI runs lint and tests on Linux, macOS and Windows with Node 18 and 22.
Data fields come from the
[status line docs](https://code.claude.com/docs/en/statusline).

## Privacy

Runs locally only. No network calls, no telemetry.

## License

MIT
