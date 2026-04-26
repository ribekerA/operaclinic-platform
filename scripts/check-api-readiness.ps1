param(
  [Parameter(Mandatory = $false)]
  [string]$BaseUrl = "http://localhost:3001",

  [Parameter(Mandatory = $false)]
  [int]$TimeoutSec = 10,

  [Parameter(Mandatory = $false)]
  [switch]$RequireHealthy
)

$ErrorActionPreference = "Stop"

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

  Write-Host "API readiness reachable."
  Write-Host "URL: $readinessUrl"
  Write-Host "serviceStatus: $status"
  Write-Host "agentStatus: $agentStatus"
  Write-CheckSummary -Checks $response.checks

  if ($RequireHealthy -and $status -ne "ok") {
    Write-Host "strictMode: failed because serviceStatus is not ok."
    exit 1
  }

  exit 0
}
catch {
  Write-Host "API readiness unreachable."
  Write-Host "URL: $readinessUrl"
  Write-Host "error: $($_.Exception.Message)"
  exit 1
}
