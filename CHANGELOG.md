# Changelog

## 0.1.0

First release.

- Band above the prompt: context fill, tokens, per-turn chart, last turn's change, rate-limit windows with countdown and reset time, session cost, MCP servers and their weight.
- Pace notes on a limit: a warning when the window would fill before it resets, and how far the 7-day window runs ahead of an even pace.
- Toasts when the context or a limit crosses a threshold, when the context passes 85%, and when the prompt-cache share falls below 50%.
- `/usage-metrics` pane: session figures, turn chart, 30-day peaks, recent turns, tool results, context breakdown, MCP servers, skills, agents and memory files, with `Compact now` and `Close` buttons.
- `/usage-metrics export`: the history and the session's turns as CSV.
- Options for the band's segments, the thresholds and the toasts.
