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
  [string]$OutputCsv = "agent-readiness-snapshots.csv"
)

$ErrorActionPreference = "Stop"

function Get-NumberOrDefault {
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

function Get-ReadinessSnapshot {
  param(
    [string]$Url,
    [string]$Token
  )

  $readinessUrl = "$Url/api/v1/health/readiness"
  $headers = @{}

  if (-not [string]::IsNullOrWhiteSpace($Token)) {
    $headers["Authorization"] = "Bearer $Token"
  }

  if ($headers.Count -gt 0) {
    return Invoke-RestMethod -Method Get -Uri $readinessUrl -Headers $headers -TimeoutSec 30
  }

  return Invoke-RestMethod -Method Get -Uri $readinessUrl -TimeoutSec 30
}

$iterations = [Math]::Ceiling(($DurationHours * 60) / $IntervalMinutes)
if ($iterations -lt 1) {
  $iterations = 1
}

$resolvedBaseUrl = $BaseUrl.TrimEnd("/")
$rows = @()
$outputDirectory = Split-Path -Parent $OutputCsv

if (-not [string]::IsNullOrWhiteSpace($outputDirectory) -and -not (Test-Path $outputDirectory)) {
  New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}

Write-Host "Starting readiness collection for $DurationHours hour(s) at $IntervalMinutes-minute interval(s)."
Write-Host "Target: $resolvedBaseUrl/api/v1/health/readiness"

for ($i = 1; $i -le $iterations; $i++) {
  $timestamp = (Get-Date).ToString("o")

  try {
    $response = Get-ReadinessSnapshot -Url $resolvedBaseUrl -Token $BearerToken

    $agentCheck = $response.checks.agent
    $metrics = $agentCheck.metrics

    $row = [PSCustomObject]@{
      timestamp = $timestamp
      serviceStatus = "$($response.status)"
      agentStatus = "$($agentCheck.status)"
      enabled = "$($agentCheck.enabled)"
      rolloutPercentage = Get-NumberOrDefault -Value $agentCheck.rolloutPercentage
      totalExecutions = Get-NumberOrDefault -Value $metrics.totalExecutions
      successCount = Get-NumberOrDefault -Value $metrics.successCount
      failureCount = Get-NumberOrDefault -Value $metrics.failureCount
      failureRate = Get-NumberOrDefault -Value $metrics.failureRate
      p95LatencyMs = Get-NumberOrDefault -Value $metrics.p95LatencyMs
      avgLatencyMs = Get-NumberOrDefault -Value $metrics.avgLatencyMs
      degradedByFailureRate = "$($agentCheck.alerts.failureRateBreached)"
      degradedByP95 = "$($agentCheck.alerts.p95Breached)"
      notes = "ok"
    }

    $rows += $row
    Write-Host "[$i/$iterations] $timestamp -> status=$($row.serviceStatus) agent=$($row.agentStatus) failureRate=$($row.failureRate) p95=$($row.p95LatencyMs)"
  }
  catch {
    $rows += [PSCustomObject]@{
      timestamp = $timestamp
      serviceStatus = "error"
      agentStatus = "unknown"
      enabled = "unknown"
      rolloutPercentage = 0
      totalExecutions = 0
      successCount = 0
      failureCount = 0
      failureRate = 0
      p95LatencyMs = 0
      avgLatencyMs = 0
      degradedByFailureRate = "unknown"
      degradedByP95 = "unknown"
      notes = $_.Exception.Message
    }

    Write-Host "[$i/$iterations] $timestamp -> request failed: $($_.Exception.Message)"
  }

  if ($i -lt $iterations) {
    Start-Sleep -Seconds ($IntervalMinutes * 60)
  }
}

$rows | Export-Csv -Path $OutputCsv -NoTypeInformation -Encoding UTF8
Write-Host "Collection finished. Output file: $OutputCsv"
