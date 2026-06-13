# INPUTS

Use GitHub Issues as the task source for this repository.

You have been passed the last 10 `RALPH:` commits, if any. Review them to understand what work has already been done and avoid repeating prior attempts.

# TASK QUEUE

AFK issues are open issues labelled `ready-for-agent`.

HITL issues are open issues labelled `ready-for-human` or explicitly marked `HITL`.

Parent PRDs are issues whose title starts with `PRD:`.

# TASK SELECTION

Pick exactly one unblocked AFK issue.

Use `gh` to read the issue body, comments, labels, and current state before coding.

Do not work on:

- Issues labelled `ready-for-human`
- Issues marked `HITL`
- Issues with open blockers in their `## Blocked by` section
- Parent PRD issues
- More than one issue in a single run

If a HITL issue is blocked by open AFK issues, keep working on the unblocked AFK issue that can unblock it.

If the next unblocked task is HITL, do not implement around it. Output `<promise>HITL_REQUIRED</promise>` and include the issue number, title, and the decision or human action needed.

If all AFK tasks are complete and no HITL issue is currently unblocked, output `<promise>NO_MORE_TASKS</promise>`.

# EXPLORATION

Explore the repo and fill your context window with relevant information that will allow you to complete the selected issue.

Use the domain language in `CONTEXT.md` and respect ADRs in `docs\adr\`.

# EXECUTION

Complete the selected issue end-to-end.

Make reasonable implementation decisions from the issue, `CONTEXT.md`, and ADRs. Do not stop for preference questions, routine tradeoffs, or missing non-critical detail; choose the safest behavior-compatible default and record the decision in the commit message or issue comment.

If the selected issue is larger than expected, reduce scope to the smallest useful vertical slice and leave a GitHub issue comment explaining what remains.

Only stop early when blocked by a real external dependency, missing credential, required manual product review, or HITL issue. In that case, leave a GitHub issue comment that names the blocker and the exact human action needed, then output `<promise>ABORT</promise>`.

# FEEDBACK LOOPS

Before committing, run the smallest relevant feedback loops available in the repo.

Use this repo's standard validation commands when available:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

# COMMIT

Make a git commit. The commit message must:

1. Start with `RALPH:` prefix
2. Include the issue number and completed task
3. Include key decisions made
4. Include files changed
5. Include blockers or notes for the next iteration

Keep it concise.

# ISSUE UPDATE

If the issue is complete, close the original GitHub issue.

If the issue is not complete, leave a comment on the GitHub issue with what was done and what remains.

# FINAL RULES

Only work on a single task.
