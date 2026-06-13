param(
    [int]$ThrottleLimit = 4,
    [int]$Limit = 200,
    [string]$ReadyForAgentLabel = "ready-for-agent",
    [string]$ReadyForHumanLabel = "ready-for-human",
    [string]$ExcludeTitlePattern = "^PRD:",
    [string]$DispatchMarker = "<!-- ralph-loop:copilot-dispatched -->",
    [switch]$Once,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Invoke-GhJson {
    param([string[]]$Arguments)

    $output = & gh @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "gh $($Arguments -join ' ') failed: $output"
    }

    if ([string]::IsNullOrWhiteSpace($output)) {
        return $null
    }

    return $output | ConvertFrom-Json
}

function Get-BodyBlockedByText {
    param([string]$Body)

    if ([string]::IsNullOrWhiteSpace($Body)) {
        return ""
    }

    $match = [regex]::Match(
        $Body,
        "(?ims)^##\s+Blocked by\s*\r?\n(?<blocked>.*?)(?=^\s*##\s+|\z)"
    )

    if (-not $match.Success) {
        return ""
    }

    return $match.Groups["blocked"].Value.Trim()
}

function Get-ReferencedIssueNumbers {
    param([string]$Text)

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return @()
    }

    $matches = [regex]::Matches($Text, "(?:#|/issues/)(?<number>\d+)\b")
    return @($matches | ForEach-Object { [int]$_.Groups["number"].Value } | Sort-Object -Unique)
}

function Get-OpenBodyBlockers {
    param([string]$Body)

    $blockedByText = Get-BodyBlockedByText -Body $Body
    if ([string]::IsNullOrWhiteSpace($blockedByText)) {
        return @()
    }

    if ($blockedByText -match "(?im)^\s*(?:-\s*)?none\s*-?\s*can start immediately\s*$") {
        return @()
    }

    $blockerNumbers = Get-ReferencedIssueNumbers -Text $blockedByText
    if ($blockerNumbers.Count -eq 0) {
        return @([pscustomobject]@{
            Number = "unknown"
            State  = "OPEN"
            Title  = $blockedByText
        })
    }

    $openBlockers = @()
    foreach ($blockerNumber in $blockerNumbers) {
        $blocker = Invoke-GhJson -Arguments @(
            "issue",
            "view",
            "$blockerNumber",
            "--json",
            "number,state,title"
        )

        if ($blocker.state -ne "CLOSED") {
            $openBlockers += $blocker
        }
    }

    return $openBlockers
}

function Test-IsHitlIssue {
    param($Issue, [string]$ReadyForHumanLabel)

    $labelNames = @($Issue.labels | ForEach-Object { $_.name })
    if ($labelNames -contains $ReadyForHumanLabel) {
        return $true
    }

    $text = "$($Issue.title)`n$($Issue.body)"
    return $text -match "(?im)\bHITL\b|^\s*-\s*\*\*Type\*\*:\s*HITL\s*$|^\s*\*\*Type\*\*:\s*HITL\s*$"
}

function Test-HasLabel {
    param($Issue, [string]$Label)

    $labelNames = @($Issue.labels | ForEach-Object { $_.name })
    return $labelNames -contains $Label
}

function Test-IsDispatched {
    param($Issue, [string]$DispatchMarker)

    return @($Issue.comments | Where-Object { $_.body -like "*$DispatchMarker*" }).Count -gt 0
}

function Get-OpenIssuesByLabel {
    param([string]$Label, [int]$Limit)

    return @(Invoke-GhJson -Arguments @(
        "issue",
        "list",
        "--state",
        "open",
        "--label",
        $Label,
        "--limit",
        "$Limit",
        "--json",
        "number,title,body,labels,id,url,comments"
    ))
}

function Get-OpenGraphQlBlockers {
    param([string]$IssueId)

    $query = @"
query(`$id: ID!) {
  node(id: `$id) {
    ... on Issue {
      blockedBy(first: 50) {
        nodes {
          ... on Issue {
            number
            state
            title
          }
        }
      }
    }
  }
}
"@

    $result = Invoke-GhJson -Arguments @(
        "api",
        "graphql",
        "-f",
        "id=$IssueId",
        "-f",
        "query=$query"
    )

    return @($result.data.node.blockedBy.nodes | Where-Object { $_.state -ne "CLOSED" })
}

function Get-CandidateIssues {
    param(
        [int]$Limit,
        [string]$ReadyForAgentLabel,
        [string]$ReadyForHumanLabel,
        [string]$ExcludeTitlePattern
    )

    $issues = Invoke-GhJson -Arguments @(
        "issue",
        "list",
        "--state",
        "open",
        "--label",
        $ReadyForAgentLabel,
        "--limit",
        "$Limit",
        "--json",
        "number,title,body,labels,id,url,comments"
    )
    $hitlIssues = Get-OpenIssuesByLabel -Label $ReadyForHumanLabel -Limit $Limit
    $issuesByNumber = @{}
    foreach ($issue in @($issues) + @($hitlIssues)) {
        $issuesByNumber[[int]$issue.number] = $issue
    }
    $issues = @($issuesByNumber.Values)

    $ready = @()
    $hitl = @()
    $skipped = @()

    foreach ($issue in @($issues)) {
        if (-not [string]::IsNullOrWhiteSpace($ExcludeTitlePattern) -and $issue.title -match $ExcludeTitlePattern) {
            $skipped += [pscustomobject]@{
                Number = $issue.number
                Reason = "Excluded by title pattern"
                Title  = $issue.title
            }
            continue
        }

        $openBodyBlockers = Get-OpenBodyBlockers -Body $issue.body
        if ($openBodyBlockers.Count -gt 0) {
            $skipped += [pscustomobject]@{
                Number = $issue.number
                Reason = "Blocked by issue body: $(@($openBodyBlockers | ForEach-Object { if ($_.Number -eq 'unknown') { 'unknown' } else { "#$($_.number)" } }) -join ', ')"
                Title  = $issue.title
            }
            continue
        }

        $openBlockers = Get-OpenGraphQlBlockers -IssueId $issue.id
        if ($openBlockers.Count -gt 0) {
            $skipped += [pscustomobject]@{
                Number = $issue.number
                Reason = "Blocked by open issue(s): $(@($openBlockers | ForEach-Object { "#$($_.number)" }) -join ', ')"
                Title  = $issue.title
            }
            continue
        }

        if (Test-IsHitlIssue -Issue $issue -ReadyForHumanLabel $ReadyForHumanLabel) {
            $hitl += $issue
            continue
        }

        if (-not (Test-HasLabel -Issue $issue -Label $ReadyForAgentLabel)) {
            $skipped += [pscustomobject]@{
                Number = $issue.number
                Reason = "Not labelled $ReadyForAgentLabel"
                Title  = $issue.title
            }
            continue
        }

        if (Test-IsDispatched -Issue $issue -DispatchMarker $DispatchMarker) {
            $skipped += [pscustomobject]@{
                Number = $issue.number
                Reason = "Already dispatched to Copilot"
                Title  = $issue.title
            }
            continue
        }

        $ready += $issue
    }

    return [pscustomobject]@{
        Ready   = @($ready | Sort-Object number)
        Hitl    = @($hitl | Sort-Object number)
        Skipped = @($skipped | Sort-Object Number)
    }
}

function Stop-ForHitl {
    param([object[]]$Issues)

    $orderedIssues = @($Issues | Sort-Object number)
    $nextIssue = $orderedIssues[0]
    $laterIssues = @($orderedIssues | Where-Object { $_.number -ne $nextIssue.number })

    [console]::Beep()
    Write-Host "`a"
    Write-Host "`nHITL REQUIRED - stopping Ralph loop." -ForegroundColor Yellow
    Write-Host "`nNext HITL gate:"
    @($nextIssue) | Format-Table number, title, url -AutoSize

    if ($laterIssues.Count -gt 0) {
        Write-Host "`nOther unblocked HITL gates:"
        $laterIssues | Format-Table number, title, url -AutoSize
    }

    Write-Host "Complete the next HITL issue or relabel it before rerunning Ralph." -ForegroundColor Yellow
    exit 2
}

function Get-CopilotDispatchBody {
    param($Issue, [string]$DispatchMarker)

    return @"
$DispatchMarker
@copilot please implement issue #$($Issue.number): $($Issue.title).

Before coding, read and follow `ralph/prompt.md` as the base instruction for this run.

Only work on issue #$($Issue.number). If this issue cannot be completed, leave a comment explaining the blocker instead of closing it.
"@
}

function Invoke-CopilotBatch {
    param(
        [object[]]$Issues,
        [int]$ThrottleLimit,
        [string]$DispatchMarker,
        [switch]$DryRun
    )

    $queue = [System.Collections.Queue]::new()
    foreach ($issue in @($Issues | Sort-Object number)) {
        $queue.Enqueue($issue)
    }

    $running = @()

    while ($queue.Count -gt 0 -or $running.Count -gt 0) {
        while ($queue.Count -gt 0 -and $running.Count -lt $ThrottleLimit) {
            $issue = $queue.Dequeue()
            $body = Get-CopilotDispatchBody -Issue $issue -DispatchMarker $DispatchMarker

            if ($DryRun) {
                Write-Host "DRY RUN dispatch issue #$($issue.number): @copilot implementation request"
                continue
            }

            Write-Host "Dispatching issue #$($issue.number) to Copilot: $($issue.title)"
            $running += Start-Job -Name "issue-$($issue.number)" -ArgumentList $body, $issue.number, (Get-Location).Path -ScriptBlock {
                param($Body, $IssueNumber, $RepositoryPath)

                Set-Location $RepositoryPath
                gh issue comment $IssueNumber --body $Body
                if ($LASTEXITCODE -ne 0) {
                    throw "Issue #$IssueNumber Copilot dispatch failed with exit code $LASTEXITCODE"
                }
                Write-Host "Dispatched issue #$IssueNumber to Copilot."
            }
        }

        if ($running.Count -eq 0) {
            continue
        }

        $completed = Wait-Job -Job $running -Any
        Receive-Job -Job $completed

        if ($completed.State -ne "Completed") {
            $failedName = $completed.Name
            Remove-Job -Job $running -Force
            throw "$failedName failed. Fix it before continuing the loop."
        }

        Remove-Job -Job $completed
        $running = @($running | Where-Object { $_.Id -ne $completed.Id })
    }
}

do {
    $batch = Get-CandidateIssues `
        -Limit $Limit `
        -ReadyForAgentLabel $ReadyForAgentLabel `
        -ReadyForHumanLabel $ReadyForHumanLabel `
        -ExcludeTitlePattern $ExcludeTitlePattern

    if ($batch.Skipped.Count -gt 0) {
        Write-Host "`nSkipped this round:"
        $batch.Skipped | Sort-Object Number | Format-Table -AutoSize
    }

    if ($batch.Hitl.Count -gt 0) {
        Stop-ForHitl -Issues @($batch.Hitl)
    }

    if ($batch.Ready.Count -eq 0) {
        Write-Host "`nNo unblocked AFK issues found."
        break
    }

    Write-Host "`nDispatching $($batch.Ready.Count) unblocked AFK issue(s) to Copilot:"
    $batch.Ready | Sort-Object number | Format-Table number, title, url -AutoSize

    Invoke-CopilotBatch `
        -Issues @($batch.Ready) `
        -ThrottleLimit $ThrottleLimit `
        -DispatchMarker $DispatchMarker `
        -DryRun:$DryRun

    if ($DryRun -or $Once) {
        break
    }
} while ($true)
