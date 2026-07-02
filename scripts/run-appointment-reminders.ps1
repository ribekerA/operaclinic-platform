#!/usr/bin/env pwsh
# DEPRECATED: Use run-appointment-reminders.mjs (cross-platform Node.js) instead.
<#
.SYNOPSIS
    Executa o cron de lembretes de appointment 24h para todos os tenants ativos.

.DESCRIPTION
    Chama POST /internal/cron/appointment-reminders na API com autenticação por
    X-Cron-Token (shared secret). O endpoint itera todos os tenants ativos,
    encontra o template APPOINTMENT_REMINDER_24H de cada tenant e envia os
    lembretes de WhatsApp.

    Pré-requisito: A variável de ambiente CRON_SECRET deve estar configurada
    no ambiente onde este script executa, e deve ser idêntica ao CRON_SECRET
    configurado na API.

.PARAMETER ApiBaseUrl
    URL base da API (sem trailing slash). Default: $env:API_BASE_URL ou
    http://localhost:3001/api/v1

.PARAMETER DryRun
    Se $true, nenhum lembrete é enviado — apenas simula e retorna o resultado.
    Útil para validação antes de ativar o cron em produção.

.PARAMETER WindowMinutes
    Janela de tempo (em minutos) para considerar appointments elegíveis.
    Padrão do backend: 30 minutos.

.PARAMETER LimitPerTenant
    Máximo de appointments processados por tenant por execução. Default: 100.

.PARAMETER TemplateCode
    Código do template de WhatsApp usado para o lembrete.
    Default: APPOINTMENT_REMINDER_24H.

.PARAMETER TimeoutSec
    Timeout da requisição HTTP em segundos. Default: 120.

.EXAMPLE
    # Dry-run para validar antes de ativar
    .\run-appointment-reminders.ps1 -DryRun

.EXAMPLE
    # Execução real com URL customizada
    .\run-appointment-reminders.ps1 -ApiBaseUrl "https://api.operaclinic.com/api/v1"

.EXAMPLE
    # Agendado no Windows Task Scheduler ou chamado por Railway/Render cron job
    pwsh -File scripts/run-appointment-reminders.ps1
#>

param(
    [string] $ApiBaseUrl  = ($env:API_BASE_URL -or "http://localhost:3001/api/v1"),
    [switch] $DryRun      = $false,
    [int]    $WindowMinutes = 30,
    [int]    $LimitPerTenant = 100,
    [string] $TemplateCode = "APPOINTMENT_REMINDER_24H",
    [int]    $TimeoutSec  = 120
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

function Write-Log {
    param([string]$Level, [string]$Message)
    $timestamp = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
    Write-Host "[$timestamp][$Level] $Message"
}

function Exit-WithError {
    param([string]$Message, [int]$Code = 1)
    Write-Log "ERROR" $Message
    exit $Code
}

# ---------------------------------------------------------------------------
# Validação de pré-requisitos
# ---------------------------------------------------------------------------

$cronSecret = $env:CRON_SECRET
if (-not $cronSecret) {
    Exit-WithError "CRON_SECRET environment variable is not set. Aborting."
}

if ($cronSecret.Length -lt 16) {
    Exit-WithError "CRON_SECRET is too short (< 16 chars). Use a strong secret."
}

# Normalizar URL base (remover trailing slash)
$ApiBaseUrl = $ApiBaseUrl.TrimEnd("/")
$endpoint   = "$ApiBaseUrl/internal/cron/appointment-reminders"

Write-Log "INFO" "Starting appointment reminders cron"
Write-Log "INFO" "Endpoint:      $endpoint"
Write-Log "INFO" "DryRun:        $DryRun"
Write-Log "INFO" "WindowMinutes: $WindowMinutes"
Write-Log "INFO" "LimitPerTenant: $LimitPerTenant"
Write-Log "INFO" "TemplateCode:  $TemplateCode"

# ---------------------------------------------------------------------------
# Montar payload
# ---------------------------------------------------------------------------

$body = @{
    dryRun        = [bool]$DryRun
    windowMinutes = $WindowMinutes
    limitPerTenant = $LimitPerTenant
    templateCode  = $TemplateCode
} | ConvertTo-Json -Compress

$headers = @{
    "Content-Type" = "application/json"
    "X-Cron-Token" = $cronSecret
}

# ---------------------------------------------------------------------------
# Executar requisição
# ---------------------------------------------------------------------------

$startTime = Get-Date

try {
    $response = Invoke-RestMethod `
        -Uri         $endpoint `
        -Method      POST `
        -Headers     $headers `
        -Body        $body `
        -TimeoutSec  $TimeoutSec `
        -ErrorAction Stop
} catch [System.Net.WebException] {
    $statusCode = [int]$_.Exception.Response.StatusCode
    Exit-WithError "HTTP $statusCode calling $endpoint — $($_.Exception.Message)"
} catch {
    Exit-WithError "Unexpected error: $($_.Exception.Message)"
}

$elapsed = ((Get-Date) - $startTime).TotalSeconds

# ---------------------------------------------------------------------------
# Relatório de resultado
# ---------------------------------------------------------------------------

Write-Log "INFO" "Cron completed in ${elapsed}s"
Write-Log "INFO" "ranAt:            $($response.ranAt)"
Write-Log "INFO" "totalTenants:     $($response.totalTenants)"
Write-Log "INFO" "processedTenants: $($response.processedTenants)"
Write-Log "INFO" "skippedTenants:   $($response.skippedTenants)"

if ($response.dryRun) {
    Write-Log "WARN" "DRY RUN — no messages were actually sent."
}

# Detalhe por tenant (somente falhas ou summary relevante)
foreach ($item in $response.results) {
    if ($item.status -eq "skipped") {
        Write-Log "WARN" "Tenant $($item.tenantId) SKIPPED: $($item.skipReason)"
    } elseif ($item.summary.failedAppointments -gt 0) {
        Write-Log "WARN" "Tenant $($item.tenantId) — sent=$($item.summary.sentAppointments) failed=$($item.summary.failedAppointments)"
    } else {
        Write-Log "INFO" "Tenant $($item.tenantId) — sent=$($item.summary.sentAppointments)"
    }
}

# Retornar exit code 1 se qualquer tenant falhou (para alertas no scheduler)
$anyFailure = $response.results | Where-Object { $_.status -eq "skipped" -and $_.skipReason -like "Error:*" }
if ($anyFailure) {
    Write-Log "ERROR" "$(@($anyFailure).Count) tenant(s) failed with errors. Check logs above."
    exit 1
}

Write-Log "INFO" "Appointment reminders cron finished successfully."
exit 0
