param(
  [Parameter(Mandatory = $true)]
  [string]$InputCsv,

  [Parameter(Mandatory = $false)]
  [double]$FailureRateThreshold = 0.05,

  [Parameter(Mandatory = $false)]
  [double]$P95ThresholdMs = 1500,

  [Parameter(Mandatory = $false)]
  [int]$MinSnapshots = 3,

  [Parameter(Mandatory = $false)]
  [string]$OutputMarkdown = "agent-gate-report.md"
)

$ErrorActionPreference = "Stop"

function ConvertTo-Double {
  param(
    [object]$Value,
    [double]$Default = 0
  )

  if ($null -eq $Value) {
    return $Default
  }

  try {
    return [double]$Value
  }
  catch {
    return $Default
  }
}

if (-not (Test-Path $InputCsv)) {
  throw "Input CSV not found: $InputCsv"
}

$rows = @(Import-Csv -Path $InputCsv)
if ($rows.Count -eq 0) {
  throw "Input CSV is empty: $InputCsv"
}

$totalSnapshots = $rows.Count
$errorSnapshots = ($rows | Where-Object { $_.serviceStatus -eq "error" }).Count
$validRows = @($rows | Where-Object { $_.serviceStatus -ne "error" })

$failureRates = @($validRows | ForEach-Object { ConvertTo-Double -Value $_.failureRate })
$p95Values = @($validRows | ForEach-Object { ConvertTo-Double -Value $_.p95LatencyMs })

$maxFailureRate = if ($failureRates.Count -gt 0) { ($failureRates | Measure-Object -Maximum).Maximum } else { 0 }
$avgFailureRate = if ($failureRates.Count -gt 0) { ($failureRates | Measure-Object -Average).Average } else { 0 }
$maxP95 = if ($p95Values.Count -gt 0) { ($p95Values | Measure-Object -Maximum).Maximum } else { 0 }
$avgP95 = if ($p95Values.Count -gt 0) { ($p95Values | Measure-Object -Average).Average } else { 0 }

$failureRateBreaches = ($validRows | Where-Object { (ConvertTo-Double -Value $_.failureRate) -gt $FailureRateThreshold }).Count
$p95Breaches = ($validRows | Where-Object { (ConvertTo-Double -Value $_.p95LatencyMs) -gt $P95ThresholdMs }).Count

$degradedChecks = ($validRows | Where-Object {
  $_.agentStatus -eq "degraded" -or
  $_.degradedByFailureRate -eq "True" -or
  $_.degradedByP95 -eq "True"
}).Count

$hasEnoughSnapshots = $totalSnapshots -ge $MinSnapshots
$hasRequestErrors = $errorSnapshots -gt 0
$hasThresholdBreaches = ($failureRateBreaches -gt 0) -or ($p95Breaches -gt 0)
$hasDegradationSignals = $degradedChecks -gt 0

$decision = "ADVANCE_TO_25"
$decisionReason = "No threshold breaches or degradation signals detected."
$generatedAt = (Get-Date).ToString("o")

if (-not $hasEnoughSnapshots) {
  $decision = "HOLD_AT_5"
  $decisionReason = "Insufficient snapshots for a reliable 24h decision."
}
elseif ($hasRequestErrors -and ($errorSnapshots -ge [Math]::Ceiling($totalSnapshots / 3))) {
  $decision = "ROLLBACK_TO_0"
  $decisionReason = "High proportion of readiness request errors during observation window."
}
elseif ($hasThresholdBreaches -or $hasDegradationSignals) {
  $decision = "HOLD_AT_5"
  $decisionReason = "Threshold breaches or degraded agent signals detected."
}

$report = @()
$report += "# Agent Gate Evaluation Report"
$report += ""
$report += "GeneratedAt: $generatedAt"
$report += "InputCsv: $InputCsv"
$report += ""
$report += "## Decision"
$report += ""
$report += "- Decision: $decision"
$report += "- Reason: $decisionReason"
$report += ""
$report += "## Metrics Summary"
$report += ""
$report += "- Total snapshots: $totalSnapshots"
$report += "- Error snapshots: $errorSnapshots"
$report += "- Valid snapshots: $($validRows.Count)"
$report += "- Max failure rate: $([Math]::Round($maxFailureRate, 6))"
$report += "- Avg failure rate: $([Math]::Round($avgFailureRate, 6))"
$report += "- Max p95 latency ms: $([Math]::Round($maxP95, 2))"
$report += "- Avg p95 latency ms: $([Math]::Round($avgP95, 2))"
$report += "- Failure rate breaches: $failureRateBreaches (threshold: $FailureRateThreshold)"
$report += "- P95 breaches: $p95Breaches (threshold: $P95ThresholdMs)"
$report += "- Degraded signals: $degradedChecks"
$report += ""
$report += "## Gate Checklist Mapping"
$report += ""
$report += "- Failure rate within threshold: $([string](-not ($failureRateBreaches -gt 0)))"
$report += "- P95 within threshold: $([string](-not ($p95Breaches -gt 0)))"
$report += "- No degraded readiness signals: $([string](-not $hasDegradationSignals))"
$report += "- Sufficient snapshots: $([string]$hasEnoughSnapshots)"
$report += "- No request error concentration: $([string](-not ($hasRequestErrors -and ($errorSnapshots -ge [Math]::Ceiling($totalSnapshots / 3)))))"
$report += ""
$report += "## Notes"
$report += ""
$report += "- Cross-tenant incidents must still be validated operationally outside this CSV analysis."
$report += "- Scheduling/reception functional regressions must still be validated with incident review and frontline checks."

$report | Set-Content -Path $OutputMarkdown -Encoding UTF8
Write-Host "Gate evaluation complete. Output report: $OutputMarkdown"
Write-Host "Decision: $decision"
