# claude-context-meter

A small, dependency-free status line for [Claude Code](https://code.claude.com)
that shows how much of your context window and plan quota you've used, so you
know when to `/compact`, `/clear` or switch to a cheaper model.

```
Opus | ctx ████░░░░░░ 39% (79k/200k) | 5h 77% left (2h10m) 7d 59% left (3d4h) | $1.23
```

| Part         | What it means                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `ctx` bar    | Context window used, with a `→ /compact or /clear` hint from 75%. Handles 200k and 1M windows.                                             |
| `5h` / `7d`  | Plan quota **remaining** and time until it resets. Pro, Max and Ultra plans only; hidden for API-key users.                                |
| `$1.23`      | Session cost so far.                                                                                                                       |
| `cache cold` | The prompt cache has expired, so your next message re-reads the whole conversation at full price. A good moment to `/compact` or `/clear`. |

### What the colours mean

| Colour    | Context bar (`ctx`) | Quota (`5h` / `7d`) | What to do                                                                                                                                  |
| --------- | ------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 🟢 Green  | Under 50% used      | More than 50% left  | Nothing, keep working.                                                                                                                      |
| 🟡 Yellow | 50–74% used         | 26–50% left         | Plan a break point: finish the current step, then `/compact`. For quota, consider a cheaper `/model` for simple work.                       |
| 🔴 Red    | 75% or more used    | 25% or less left    | Context: `/compact <what to keep>` now, or `/clear` if the task is done. Quota: switch to a cheaper model or wait for the reset time shown. |

Other parts of the line:

- **🟡 `cache cold → /compact or /clear`** is always yellow. It appears only
  when the prompt cache has expired, typically after a long pause.
- **Grey `$1.23`** is the session cost, dimmed because it is information, not
  a warning.
- **`ctx --`** (no colour) means there is no usage data yet, for example
  before the first reply or right after `/compact`.

Colours use standard terminal colours, so the exact shade follows your
terminal theme.

Why another status line? It's one ~150-line Node file you can read in a
minute, has no dependencies, never breaks your status bar (bad data shows
`--`), and the installer won't overwrite a status line you already have.

## Install

Requires Node.js 18+.

**As a Claude Code plugin** (inside Claude Code):

```
/plugin marketplace add sumitdas76/claude-context-meter
/plugin install claude-context-meter@claude-context-meter
```

Then ask Claude: _"install the context meter"_. The bundled `context-meter`
skill runs the installer and asks before replacing an existing status line.

**Manually:**

```bash
git clone https://github.com/sumitdas76/claude-context-meter
node claude-context-meter/skills/context-meter/install.js
```

The installer copies `statusline.js` to `~/.claude/claude-context-meter/`,
backs up `settings.json` to `settings.json.bak-claude-context-meter`, and adds
the `statusLine` entry. It honours `CLAUDE_CONFIG_DIR`.

| Flag          | Effect                                                                               |
| ------------- | ------------------------------------------------------------------------------------ |
| _(none)_      | Install. Exits with code 2 and changes nothing if another status line is configured. |
| `--force`     | Replace an existing status line (after backing up).                                  |
| `--uninstall` | Remove it, only if the configured status line is this one.                           |

Restart Claude Code if the meter doesn't appear on the next refresh.

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
