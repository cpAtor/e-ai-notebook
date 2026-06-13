# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Set blocked-by relationships**: when an issue body has `## Blocked by` references, also set GitHub's first-class dependency relationship with GraphQL `addBlockedBy`.
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` - `gh` does this automatically when run inside a clone.

This directory does not currently have a Git remote configured. Configure a GitHub remote before using issue-tracker skills that call `gh`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant issue"

Run `gh issue view <number> --comments`.

## Blocked-by relationships

The `## Blocked by` section remains part of issue bodies for readability, but it is not enough on its own. For every blocker reference in that section, also add the GitHub issue dependency relationship:

```powershell
$issueId = gh issue view <blocked-issue-number> --json id --jq .id
$blockingIssueId = gh issue view <blocking-issue-number> --json id --jq .id
gh api graphql -f issueId=$issueId -f blockingIssueId=$blockingIssueId -f query='mutation($issueId:ID!, $blockingIssueId:ID!) { addBlockedBy(input:{issueId:$issueId, blockingIssueId:$blockingIssueId}) { issue { number } } }'
```

Before calling `addBlockedBy`, query `blockedBy` for the issue and skip relationships that already exist.
