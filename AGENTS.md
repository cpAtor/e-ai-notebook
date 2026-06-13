# Agent Instructions

## Agent skills

### Issue tracker

Issues and PRDs are tracked in GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage uses the default Matt Pocock skills label vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repo: use the root `CONTEXT.md` and `docs/adr/` when they exist. See `docs/agents/domain.md`.

### Ralph loop

This repo uses the Matt Pocock workshop-style Ralph loop: a single durable prompt plus small runner scripts.

- One iteration: `powershell -NoProfile -ExecutionPolicy Bypass -File .\plans\once-copilot.ps1`
- AFK loop: `powershell -NoProfile -ExecutionPolicy Bypass -File .\plans\afk-copilot.ps1 -Iterations 10`

The Ralph prompt selects one unblocked `ready-for-agent` GitHub issue per run, skips `ready-for-human` and `PRD:` issues, commits with a `RALPH:` prefix, and closes the issue when complete.
