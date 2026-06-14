param(
    [string]$PromptPath = "plans\prompt.md"
)

$ErrorActionPreference = "Stop"

$ralphCommits = git log --grep="RALPH" -n 10 --format="%h %ad %s" --date=short 2>$null
if ([string]::IsNullOrWhiteSpace($ralphCommits)) {
    $ralphCommits = "No RALPH commits found"
}

$prompt = @"
Read and follow @$PromptPath.

Previous RALPH commits:
$ralphCommits
"@

copilot -C (Get-Location).Path --allow-all --no-ask-user --autopilot -p $prompt
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
