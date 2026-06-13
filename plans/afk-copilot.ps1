param(
    [int]$Iterations = 10,
    [string]$PromptPath = "plans\prompt.md"
)

$ErrorActionPreference = "Stop"

if ($Iterations -lt 1) {
    throw "Iterations must be at least 1."
}

for ($i = 1; $i -le $Iterations; $i++) {
    Write-Host "------- RALPH ITERATION $i --------"

    $output = & powershell -NoProfile -ExecutionPolicy Bypass -File ".\plans\once-copilot.ps1" -PromptPath $PromptPath 2>&1
    $output | ForEach-Object { Write-Host $_ }

    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }

    $text = $output -join "`n"

    if ($text -match "<promise>NO_MORE_TASKS</promise>") {
        Write-Host "Ralph found no more AFK tasks after $i iteration(s)."
        exit 0
    }

    if ($text -match "<promise>HITL_REQUIRED</promise>") {
        Write-Host "Ralph stopped for HITL after $i iteration(s)."
        exit 2
    }

    if ($text -match "<promise>ABORT</promise>") {
        Write-Host "Ralph aborted after $i iteration(s)."
        exit 3
    }
}
