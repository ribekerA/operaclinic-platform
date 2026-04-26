param(
  [Parameter(Mandatory = $true)]
  [string]$ReportMarkdown,

  [Parameter(Mandatory = $true)]
  [string]$ValidationDoc,

  [Parameter(Mandatory = $false)]
  [string]$Environment = "staging",

  [Parameter(Mandatory = $false)]
  [string]$EvidenceCsv = "agent-readiness-staging-5pct.csv",

  [Parameter(Mandatory = $false)]
  [string]$EvidenceReport = "agent-gate-report-staging-5pct.md"
)

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptRoot
$officialDocName = "AI_OPERATIONAL_VALIDATION_2026-04-03.md"
$localValidationDoc = Join-Path $repoRoot "tmp\AGENT_GATE_LOCAL_VALIDATION.md"

function Test-IsLocalEnvironment {
  param(
    [string]$Value
  )

  return $Value -match "^(local|dev-local|lab-local)"
}

if (-not (Test-Path $ReportMarkdown)) {
  throw "Report file not found: $ReportMarkdown"
}

if ((Test-IsLocalEnvironment -Value $Environment) -and ([System.IO.Path]::GetFileName($ValidationDoc) -eq $officialDocName)) {
  Write-Host "Local environment detected. Redirecting publication to local validation log."
  $ValidationDoc = $localValidationDoc
}

if (-not (Test-IsLocalEnvironment -Value $Environment) -and ($ValidationDoc -like "*\tmp\*" -or $ValidationDoc -like "tmp/*")) {
  throw "Non-local environments must publish to the official validation document, not tmp/*."
}

if (-not (Test-Path $ValidationDoc)) {
  throw "Validation document not found: $ValidationDoc"
}

$reportContent = Get-Content -Path $ReportMarkdown -Raw
$decisionMatch = [regex]::Match($reportContent, "- Decision:\s*(.+)")
$reasonMatch = [regex]::Match($reportContent, "- Reason:\s*(.+)")
$maxFailureMatch = [regex]::Match($reportContent, "- Max failure rate:\s*(.+)")
$maxP95Match = [regex]::Match($reportContent, "- Max p95 latency ms:\s*(.+)")

if (-not $decisionMatch.Success) {
  throw "Could not parse decision from report: $ReportMarkdown"
}

$decision = $decisionMatch.Groups[1].Value.Trim()
$reason = if ($reasonMatch.Success) { $reasonMatch.Groups[1].Value.Trim() } else { "n/a" }
$maxFailure = if ($maxFailureMatch.Success) { $maxFailureMatch.Groups[1].Value.Trim() } else { "n/a" }
$maxP95 = if ($maxP95Match.Success) { $maxP95Match.Groups[1].Value.Trim() } else { "n/a" }

$now = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")

function ConvertTo-RegexLiteral {
  param(
    [string]$Value
  )

  return [regex]::Escape($Value)
}

$entry = @()
$entry += ""
$entry += "## Gate Update - $Environment"
$entry += ""
$entry += "- atualizado_em: $now"
$entry += "- ambiente: $Environment"
$entry += "- decisao_automatizada: $decision"
$entry += "- justificativa_curta: $reason"
$entry += "- max_failure_rate_observado: $maxFailure"
$entry += "- max_p95_ms_observado: $maxP95"
$entry += "- evidencia_csv: $EvidenceCsv"
$entry += "- evidencia_relatorio: $EvidenceReport"
$entry += ""
$entry += "Classificacao de confianca:"
$entry += "- fato: decisao extraida automaticamente do relatorio"
$entry += "- lacuna: validacao de incidentes cross-tenant e regressao funcional depende da operacao real"

$entryText = $entry -join [Environment]::NewLine
$validationContent = Get-Content -Path $ValidationDoc -Raw
$heading = "## Gate Update - $Environment"
$escapedHeading = ConvertTo-RegexLiteral -Value $heading
$pattern = "(?s)\r?\n?$escapedHeading\r?\n.*?(?=(\r?\n## Gate Update - )|\z)"

if ([regex]::IsMatch($validationContent, $pattern)) {
  $updatedContent = [regex]::Replace($validationContent, $pattern, [Environment]::NewLine + $entryText)
  Set-Content -Path $ValidationDoc -Value $updatedContent -Encoding UTF8
}
else {
  Add-Content -Path $ValidationDoc -Value $entryText
}

Write-Host "Gate result published to validation document."
Write-Host "Decision: $decision"
Write-Host "Validation doc: $ValidationDoc"
