# ISSUES

Issues JSON is provided at start of context. Parse it to get open issues with their bodies, labels, and comments.

Work on AFK issues only. AFK issues are labelled `ready-for-agent`. HITL issues are labelled `ready-for-human` or explicitly marked `HITL`.

AFK means the user is not present. Continue working without asking questions or waiting for routine confirmation until either the selected issue is complete or a real human-in-the-loop decision/action is required.

If the next unblocked task is HITL, do not implement around it. Output `<promise>HITL_REQUIRED</promise>` and include the issue number, title, and the decision or human action needed.

You've also been passed recent `RALPH:` commits. Review these to understand what work has already been done.

Closed, unmerged PRs linked from an issue are prior attempts only. Do not treat them as completion. Use them for context if helpful, then implement the issue from the current `main` state.

This is a local AFK loop. Do not dispatch to Copilot cloud, comment `@copilot`, or ask another agent to take over. Implement in the local working tree, validate, commit, and update the issue yourself.

Make reasonable implementation decisions from the issue, `CONTEXT.md`, and ADRs. Do not stop for preference questions, routine tradeoffs, or missing non-critical detail; choose the safest behavior-compatible default and record the decision in the commit message or issue comment.

# TASK SELECTION

Pick exactly one unblocked AFK issue.

Do not work on:

- Issues labelled `ready-for-human`
- Issues marked `HITL`
- Issues with open blockers in `## Blocked by`
- Parent PRD issues
- More than one issue in a single run

If all AFK tasks are complete and no HITL issue is currently unblocked, output `<promise>NO MORE TASKS</promise>`.

# EXPLORATION

Explore the repo and fill your context window with relevant information that will allow you to complete the task.

Use the domain language in `CONTEXT.md` and respect ADRs in `docs/adr/`.

# IMPLEMENTATION

Complete the selected issue end-to-end.

Prefer a red-green-refactor loop where practical:

1. Write a focused failing test or check.
2. Implement the smallest change that makes it pass.
3. Refactor without changing behavior.

If the selected issue is larger than expected, reduce scope to the smallest useful vertical slice and leave a GitHub issue comment explaining what remains.

Only stop early when blocked by a real external dependency, missing credential, required manual product review, or HITL issue. In that case, leave a GitHub issue comment that names the blocker and the exact human action needed.

# FEEDBACK LOOPS

Before committing, run the smallest relevant feedback loops available in the repo.

Use this repo's standard validation commands when available:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

# COMMIT

Make a git commit. The commit message must:

1. Start with `RALPH:` prefix.
2. Include the issue number and completed task.
3. Include key decisions made.
4. Include files changed.
5. Include blockers or notes for the next iteration.

Keep it concise.

# THE ISSUE

If the issue is complete, close the original GitHub issue.

If the issue is not complete, leave a comment on the GitHub issue with what was done and what remains.

# FINAL RULES

ONLY WORK ON A SINGLE TASK.
