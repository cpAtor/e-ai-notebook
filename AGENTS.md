# Agent Instructions

## Agent skills

### Issue tracker

Issues and PRDs are tracked in GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage uses the default Matt Pocock skills label vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repo: use the root `CONTEXT.md` and `docs/adr/` when they exist. See `docs/agents/domain.md`.

### Foundational UI migrations

Do not replace foundational UI libraries by direct swaps in app composition files. First identify the deep module seam, define the small public interface, and preserve the native affordances of the new library.

For Drawing Screen canvas work, route integration through the Notebook Canvas module described in `CONTEXT.md` and `docs/adr/0008-excalidraw-native-canvas-foundation.md`. `App.tsx` should compose Notebook behavior; it should not know Excalidraw element formats, sync scheduling, native UI wiring, or persistence mapping.

Passing typecheck/build/unit tests is not enough for canvas/editor migrations. Before deployment, verify browser behavior on desktop and mobile viewports, including visible default colors in light/dark themes, text editing, selection/style controls, Notebook actions, persistence/reload, search/highlight, and console errors.

### Ralph loop

This repo uses the Matt Pocock workshop-style Ralph loop: a single durable prompt plus small runner scripts.

- One iteration: `powershell -NoProfile -ExecutionPolicy Bypass -File .\plans\once-copilot.ps1`
- AFK loop: `powershell -NoProfile -ExecutionPolicy Bypass -File .\plans\afk-copilot.ps1 -Iterations 10`

The Ralph prompt selects one unblocked `ready-for-agent` GitHub issue per run, skips `ready-for-human` and `PRD:` issues, commits with a `RALPH:` prefix, and closes the issue when complete.
