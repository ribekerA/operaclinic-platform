param(
  [Parameter(Mandatory = $true)]
  [string]$BaseUrl,

  [Parameter(Mandatory = $false)]
  [string]$BearerToken,

  [Parameter(Mandatory = $false)]
  [int]$IntervalMinutes = 15,

  [Parameter(Mandatory = $false)]
  [int]$DurationHours = 24,

  [Parameter(Mandatory = $false)]
  [double]$FailureRateThreshold = 0.05,

  [Parameter(Mandatory = $false)]
  [double]$P95ThresholdMs = 1500,

  [Parameter(Mandatory = $false)]
  [int]$MinSnapshots = 3,

  [Parameter(Mandatory = $false)]
  [string]$Environment = "staging",

  [Parameter(Mandatory = $false)]
  [string]$OutputCsv = "agent-readiness-staging-5pct.csv",

  [Parameter(Mandatory = $false)]
  [string]$OutputReport = "agent-gate-report-staging-5pct.md",

  [Parameter(Mandatory = $false)]
  [string]$ValidationDoc = "docs/AI_OPERATIONAL_VALIDATION_2026-04-03.md"
)

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptRoot

function Test-IsLocalEnvironment {
  param(
    [string]$Value
  )

  return $Value -match "^(local|dev-local|lab-local)"
}

function Resolve-RepoPath {
  param(
    [string]$PathValue
  )

  if ([System.IO.Path]::IsPathRooted($PathValue)) {
    return $PathValue
  }

  return [System.IO.Path]::GetFullPath((Join-Path $repoRoot $PathValue))
}

$collectScript = Join-Path $scriptRoot "collect-agent-readiness.ps1"
$evaluateScript = Join-Path $scriptRoot "evaluate-agent-gate.ps1"
$publishScript = Join-Path $scriptRoot "publish-agent-gate-result.ps1"
$isLocalEnvironment = Test-IsLocalEnvironment -Value $Environment

if ($isLocalEnvironment -and $ValidationDoc -eq "docs/AI_OPERATIONAL_VALIDATION_2026-04-03.md") {
  $ValidationDoc = "tmp/AGENT_GATE_LOCAL_VALIDATION.md"
}

if (-not $isLocalEnvironment) {
  if ($DurationHours -lt 1) {
    throw "Non-local environments require DurationHours >= 1 to avoid invalid gate decisions."
  }

  if ($MinSnapshots -lt 3) {
    throw "Non-local environments require MinSnapshots >= 3 for gate reliability."
  }

  if ($ValidationDoc -like "tmp/*") {
    throw "Non-local environments must publish to the official validation document, not tmp/*."
  }
}

$resolvedValidationDoc = Resolve-RepoPath -PathValue $ValidationDoc
$resolvedOutputCsv = Resolve-RepoPath -PathValue $OutputCsv
$resolvedOutputReport = Resolve-RepoPath -PathValue $OutputReport

Write-Host "[1/3] Collecting readiness snapshots..."
& $collectScript `
  -BaseUrl $BaseUrl `
  -BearerToken $BearerToken `
  -IntervalMinutes $IntervalMinutes `
  -DurationHours $DurationHours `
  -OutputCsv $resolvedOutputCsv

Write-Host "[2/3] Evaluating gate decision..."
& $evaluateScript `
  -InputCsv $resolvedOutputCsv `
  -FailureRateThreshold $FailureRateThreshold `
  -P95ThresholdMs $P95ThresholdMs `
  -MinSnapshots $MinSnapshots `
  -OutputMarkdown $resolvedOutputReport

Write-Host "[3/3] Publishing gate result..."
& $publishScript `
  -ReportMarkdown $resolvedOutputReport `
  -ValidationDoc $resolvedValidationDoc `
  -Environment $Environment `
  -EvidenceCsv $resolvedOutputCsv `
  -EvidenceReport $resolvedOutputReport

Write-Host "Agent gate pipeline finished successfully."
Write-Host "CSV: $resolvedOutputCsv"
Write-Host "Report: $resolvedOutputReport"
Write-Host "ValidationDoc: $resolvedValidationDoc"
