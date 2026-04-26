param(
  [Parameter(Mandatory = $false)]
  [string]$BaseUrl = "http://localhost:3001",

  [Parameter(Mandatory = $false)]
  [int]$TimeoutSec = 5
)

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptRoot
$readinessUrl = $BaseUrl.TrimEnd("/") + "/api/v1/health/readiness"

function Write-CheckSummary {
  param(
    [object]$Checks
  )

  if ($null -eq $Checks) {
    return
  }

  $problemChecks = @()

  foreach ($property in $Checks.PSObject.Properties) {
    $check = $property.Value
    if ($null -eq $check -or $null -eq $check.status) {
      continue
    }

    if ($check.status -ne "ok") {
      $issuesText = "sem detalhes"
      if ($null -ne $check.issues -and $check.issues.Count -gt 0) {
        $issuesText = ($check.issues -join " | ")
      }

      $problemChecks += ("- {0}: {1} :: {2}" -f $property.Name, $check.status, $issuesText)
    }
  }

  if ($problemChecks.Count -gt 0) {
    Write-Host "dependencyIssues:"
    foreach ($line in $problemChecks) {
      Write-Host $line
    }
  }
}

try {
  $response = Invoke-RestMethod -Method Get -Uri $readinessUrl -TimeoutSec $TimeoutSec
  $status = if ($null -ne $response.status) { "$($response.status)" } else { "unknown" }
  $agentStatus = if ($null -ne $response.checks -and $null -ne $response.checks.agent) { "$($response.checks.agent.status)" } else { "unknown" }

  Write-Host "API already reachable. Skipping duplicate start."
  Write-Host "URL: $readinessUrl"
  Write-Host "serviceStatus: $status"
  Write-Host "agentStatus: $agentStatus"
  Write-CheckSummary -Checks $response.checks
  exit 0
}
catch {
  Write-Host "API not reachable yet. Starting dev server..."
  Write-Host "Target URL: $readinessUrl"
}

Set-Location $repoRoot
& pnpm --filter @operaclinic/api start:dev
exit $LASTEXITCODE
