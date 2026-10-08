# usage-metrics

A Claude Code mod that keeps your context and rate-limit usage in view: a one-line band above the prompt, toasts when a limit is near, and a pane with the full breakdown.

```
◑ 67%  134.4k / 200k  ▂▃▅▆  ▲ +98.3k last turn  5h 24% ↻ 2h 14m (14:30)  7d 91% ↻ 4d 20h (Oct 9 09:05)  $1.84  MCP 2 · 14k
```

## The band

Segments appear in this order by default. Each is hidden when the session has no figure for it.

| Segment | Example | Meaning |
| --- | --- | --- |
| `context` | `◑ 67%` | How full the context window is. The icon and colour change at 25, 50, 75 and 90%. |
| `tokens` | `134.4k / 200k` | Tokens in the context, and the window's size. |
| `chart` | `▂▃▅▆` | Context fill after each of the last 12 turns. |
| `delta` | `▲ +98.3k last turn` | What the last turn added to the context. |
| `limits` | `5h 24% ↻ 2h 14m (14:30)` | One per rate-limit window: percentage used, time left until it resets, and the reset time. |
| `cost` | `$1.84` | Session cost so far. |
| `mcp` | `MCP 2 · 14k` | MCP servers providing tools, and the tokens their loaded tool schemas take up. |

A limit segment can carry two extra notes:

- `⚠ ~30m`: at the pace of the last hour, the window fills in about 30 minutes, which is before it resets. Needs at least 10 minutes of readings, and disappears after 30 minutes of inactivity.
- `· 1d 4h over pace`: on the 7-day window, your use is that far ahead of an even spread over the week. Shown only when at least an hour ahead.

Reset times are shown in the machine's local timezone, with the date only when the reset is not today. The countdown updates once a minute.

When the band is wider than the terminal, segments are first shortened (the reset time, the pace note and the `last turn` label are dropped). Segments that still don't fit are left out from the right.

## Toasts

- The context or a rate-limit window crosses the warning threshold (75%), and again at the critical threshold (90%).
- The context passes 85%, with a reminder that `/compact` frees room.
- The session's prompt-cache share of input falls below 50%.

Each fires once per crossing and is armed again after the figure drops back (a window reset, a `/clear`, a compaction).

## The pane

`/usage-metrics` opens the pane. Run it again, or press `Close` in the pane, to close it.

The pane shows:

- Context fill, session duration, cost, model and prompt-cache share.
- Subagent turns and their total tokens.
- Context fill per turn over the last 60 turns.
- Each day's peak of the 5-hour and 7-day windows over the last 30 days.
- The last five turns: duration, context added, cost and cache share.
- The tools that returned the most text, last turn and whole session.
- Context by category, as `/context` lists it.
- Tokens per MCP server, skill, custom agent and memory file.

Two buttons sit at the top: `Compact now` (hotkey `c`) and `Close` (hotkey `x`). The hotkeys work while the pane has focus. `Compact now` starts compaction immediately, without asking.

## Export

`/usage-metrics export` writes two files to the session's working directory:

- `usage-metrics-history.csv`: the daily peaks, one row per day.
- `usage-metrics-turns.csv`: this session's turns, with end time (UTC), duration, context tokens, tokens added, cost, input tokens and cache-read tokens.

## Options

Set these in `/config`, or in `settings.json` under `pluginConfigs["usage-metrics"].options`.

| Option | Default | Meaning |
| --- | --- | --- |
| `segments` | `context,tokens,chart,delta,limits,cost,mcp` | Which band segments show, in order, comma-separated. Unknown names are ignored. |
| `warnAt` | `75` | Percentage for the first toast. |
| `criticalAt` | `90` | Percentage for the second toast. |
| `toasts` | `true` | Turn all toasts on or off. |
| `cacheToast` | `true` | Turn the prompt-cache toast on or off. |

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install usage-metrics --marketplace limpep/claude-usage-metrics
```

Answer `y` to add the marketplace, then choose a scope. The user scope loads the mod in every session. The mod is active as soon as it is installed.

## What the figures are

- **MCP count** is the number of servers with at least one tool in the session. A server that failed, needs authentication or exposes no tools is not counted.
- **MCP weight** counts only tool schemas loaded into the context. Tools that load on demand weigh nothing until they are used.
- **Tool results** are estimates: the engine reports no token count for a tool result, so the mod divides the length of the returned text by four. They are marked with `≈`.
- **Cost per turn** is the rise in session cost between two turns, so it includes any subagent work that ran in between. The first turn after a `/clear` has no cost figure.
- **Subagent figures** are tokens only. The engine reports no cost per subagent.
- **History** is kept in the mod's own store, shared by all sessions on the machine, and holds the newest 30 days.

There is no sound alert: the engine's audio player only works on macOS.

## Development

Run the mod from a clone instead of installing it:

```sh
claude --plugin-dir /path/to/claude-usage-metrics
```

To load it in every session, name the folder in the `env` block of `~/.claude/settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "/path/to/claude-usage-metrics"
  }
}
```

In an interactive session the folder is watched, so an edit reloads the mod.

```sh
claude plugin test .       # run the tests
claude plugin validate .   # check the manifest and the hooks module as the engine reads them
npx -p typescript tsc -p . # type-check
```

The type-check reads type files that Claude Code writes into `.claude-plugin/types/` when it loads the mod. They are not in the repository, so load the mod once before type-checking a fresh clone.

| File | Holds |
| --- | --- |
| `hooks/register.tsx` | Every hook and every call on the engine. The engine does not allow its handle (`$`) to be passed into another file. |
| `hooks/band.ts` | The band's segments and how they are fitted to the width. |
| `hooks/pane.ts` | The pane's lines and the export rows. |
| `hooks/alerts.ts` | Which toasts a reading raises. |
| `hooks/pace.ts` | The pace samples, the fill projection and the weekly pacing. |
| `hooks/history.ts` | The daily peaks and how two histories merge. |
| `hooks/detail.ts` | The context breakdown, reduced to what the mod shows. |
| `hooks/options.ts` | Reading the options. |
| `hooks/format.ts` | Formatting of tokens, durations, times, charts and CSV. |
| `types/index.d.ts` | The shape of the state the mod keeps. |
| `tests/*.test.ts` | The tests, one file per area; `tests/helpers.ts` holds their shared fixtures. |
