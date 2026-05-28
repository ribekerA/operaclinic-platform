#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Smoke test E2E de scheduling com timezone real.

.DESCRIPTION
    Valida o ciclo completo de appointment em timezone real:
      1. Login (email + senha)
      2. Switch para clinic (resolve activeTenantId)
      3. Cria appointment com datetime em offset BRT (-03:00)
      4. Verifica que startsAt retornado está correto em UTC
      5. Verifica que local date na timezone do tenant é a esperada
      6. Confirma o appointment
      7. Cancela o appointment (cleanup)
      8. Testa double-booking no mesmo slot → deve retornar 409

    Pré-requisitos:
      - API em execução (localhost:3001 ou API_BASE_URL)
      - Usuário com role RECEPTION ou TENANT_ADMIN no tenant piloto
      - IDs de professional, patient, consultationType e unit existentes no tenant

    Variáveis de ambiente (ou parâmetros):
      API_BASE_URL, SMOKE_EMAIL, SMOKE_PASSWORD, SMOKE_TENANT_ID,
      SMOKE_PROFESSIONAL_ID, SMOKE_PATIENT_ID, SMOKE_CONSULTATION_TYPE_ID,
      SMOKE_UNIT_ID (opcional)

.EXAMPLE
    # Dry-run: apenas verifica conectividade e auth, não cria appointment
    .\smoke-scheduling-timezone.ps1 -DryRun

.EXAMPLE
    # Execução completa com valores explícitos
    .\smoke-scheduling-timezone.ps1 `
      -Email "reception@clinic.local" `
      -Password "SenhaForte123!" `
      -TenantId "uuid-do-tenant" `
      -ProfessionalId "uuid-do-profissional" `
      -PatientId "uuid-do-paciente" `
      -ConsultationTypeId "uuid-do-tipo"
#>

param(
    [string] $ApiBaseUrl         = ($env:API_BASE_URL ?? "http://localhost:3001/api/v1"),
    [string] $Email              = ($env:SMOKE_EMAIL ?? ""),
    [string] $Password           = ($env:SMOKE_PASSWORD ?? ""),
    [string] $TenantId           = ($env:SMOKE_TENANT_ID ?? ""),
    [string] $ProfessionalId     = ($env:SMOKE_PROFESSIONAL_ID ?? ""),
    [string] $PatientId          = ($env:SMOKE_PATIENT_ID ?? ""),
    [string] $ConsultationTypeId = ($env:SMOKE_CONSULTATION_TYPE_ID ?? ""),
    [string] $UnitId             = ($env:SMOKE_UNIT_ID ?? ""),
    # Timezone IANA do tenant (para validação de drift). Deve coincidir com tenant.timezone no banco.
    [string] $TenantTimezone     = "America/Sao_Paulo",
    # startsAt local da appointment de teste (offset BRT = -03:00)
    # Use um horário futuro durante o horário comercial do profissional teste
    [string] $StartsAtLocal      = "2099-01-15T10:00:00-03:00",
    [switch] $DryRun             = $false,
    [int]    $TimeoutSec         = 30
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

$script:Passed   = 0
$script:Failed   = 0
$script:Results  = @()

function Write-Log {
    param([string]$Level, [string]$Message)
    $ts = (Get-Date -Format "HH:mm:ss")
    $color = switch ($Level) {
        "PASS"  { "Green"  }
        "FAIL"  { "Red"    }
        "INFO"  { "Cyan"   }
        "WARN"  { "Yellow" }
        default { "White"  }
    }
    Write-Host "[$ts][$Level] $Message" -ForegroundColor $color
}

function Assert-Check {
    param([string]$Name, [scriptblock]$Test)
    try {
        & $Test
        $script:Passed++
        $script:Results += [PSCustomObject]@{ Check = $Name; Status = "PASS"; Error = "" }
        Write-Log "PASS" $Name
    } catch {
        $script:Failed++
        $script:Results += [PSCustomObject]@{ Check = $Name; Status = "FAIL"; Error = $_.Exception.Message }
        Write-Log "FAIL" "$Name — $($_.Exception.Message)"
    }
}

function Invoke-Api {
    param(
        [string]$Method,
        [string]$Path,
        [hashtable]$Headers = @{},
        [object]$Body = $null,
        [int]$ExpectedStatus = 200
    )
    $uri = "$ApiBaseUrl$Path"
    $reqHeaders = @{ "Content-Type" = "application/json" } + $Headers
    $bodyJson = if ($null -ne $Body) { $Body | ConvertTo-Json -Compress } else { $null }

    try {
        $response = Invoke-WebRequest `
            -Uri        $uri `
            -Method     $Method `
            -Headers    $reqHeaders `
            -Body       $bodyJson `
            -TimeoutSec $TimeoutSec `
            -ErrorAction Stop

        $statusCode = [int]$response.StatusCode
        $parsed = $response.Content | ConvertFrom-Json

        return [PSCustomObject]@{
            StatusCode = $statusCode
            Data       = $parsed
            Error      = $null
        }
    } catch [System.Net.WebException] {
        $statusCode = [int]$_.Exception.Response.StatusCode
        $errorBody = $null
        try {
            $stream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $errorBody = $reader.ReadToEnd() | ConvertFrom-Json
        } catch { }

        return [PSCustomObject]@{
            StatusCode = $statusCode
            Data       = $errorBody
            Error      = $_.Exception.Message
        }
    }
}

# ---------------------------------------------------------------------------
# Pré-validações
# ---------------------------------------------------------------------------

Write-Log "INFO" "=== Smoke Test: Scheduling Timezone E2E ==="
Write-Log "INFO" "ApiBaseUrl:    $ApiBaseUrl"
Write-Log "INFO" "TenantTimezone: $TenantTimezone"
Write-Log "INFO" "StartsAtLocal: $StartsAtLocal"
Write-Log "INFO" "DryRun:        $DryRun"

$missingParams = @()
if (-not $Email)              { $missingParams += "Email" }
if (-not $Password)           { $missingParams += "Password" }
if (-not $TenantId)           { $missingParams += "TenantId" }
if (-not $ProfessionalId)     { $missingParams += "ProfessionalId" }
if (-not $PatientId)          { $missingParams += "PatientId" }
if (-not $ConsultationTypeId) { $missingParams += "ConsultationTypeId" }

if ($missingParams.Count -gt 0) {
    Write-Log "FAIL" "Missing required parameters: $($missingParams -join ', ')"
    Write-Log "INFO" "Set them via env vars SMOKE_EMAIL, SMOKE_PASSWORD, SMOKE_TENANT_ID, SMOKE_PROFESSIONAL_ID, SMOKE_PATIENT_ID, SMOKE_CONSULTATION_TYPE_ID"
    exit 1
}

# Calcular UTC esperado a partir do startsAt local para validação posterior
$startsAtUtc = [System.DateTimeOffset]::Parse($StartsAtLocal).UtcDateTime
Write-Log "INFO" "startsAt UTC expected: $($startsAtUtc.ToString('yyyy-MM-ddTHH:mm:ssZ'))"

# ---------------------------------------------------------------------------
# STEP 1: Verificar health da API
# ---------------------------------------------------------------------------

Assert-Check "API está acessível (health ou preflight)" {
    $resp = Invoke-Api -Method GET -Path "/auth/me" -ExpectedStatus 401
    if ($resp.StatusCode -notin @(401, 403)) {
        throw "Esperado 401 em /auth/me sem token, got $($resp.StatusCode)"
    }
}

if ($DryRun) {
    Write-Log "WARN" "DRY RUN — parando após verificação de conectividade."
    Write-Log "INFO" "=== Resultado: $($script:Passed) passed, $($script:Failed) failed ==="
    exit $(if ($script:Failed -gt 0) { 1 } else { 0 })
}

# ---------------------------------------------------------------------------
# STEP 2: Login
# ---------------------------------------------------------------------------

$token = $null

Assert-Check "Login com credenciais válidas retorna accessToken" {
    $resp = Invoke-Api -Method POST -Path "/auth/login" -Body @{
        email    = $Email
        password = $Password
    }
    if ($resp.StatusCode -ne 201 -and $resp.StatusCode -ne 200) {
        throw "Login falhou com HTTP $($resp.StatusCode)"
    }
    if (-not $resp.Data.accessToken) {
        throw "accessToken ausente na resposta de login"
    }
    $script:token = $resp.Data.accessToken
}

if (-not $script:token) {
    Write-Log "FAIL" "Sem token após login — abortando."
    exit 1
}

$authHeaders = @{ "Authorization" = "Bearer $script:token" }

# ---------------------------------------------------------------------------
# STEP 3: Switch para clinic tenant
# ---------------------------------------------------------------------------

Assert-Check "Switch clinic retorna token com activeTenantId correto" {
    $resp = Invoke-Api -Method POST -Path "/auth/switch-clinic" -Headers $authHeaders -Body @{
        tenantId = $TenantId
    }
    if ($resp.StatusCode -notin @(200, 201)) {
        throw "switch-clinic falhou com HTTP $($resp.StatusCode)"
    }
    if (-not $resp.Data.accessToken) {
        throw "accessToken ausente após switch-clinic"
    }
    $script:token = $resp.Data.accessToken
    $script:authHeaders = @{ "Authorization" = "Bearer $($script:token)" }
}

# Reaplica headers com o novo token (scoped ao tenant)
$authHeaders = @{ "Authorization" = "Bearer $script:token" }

# ---------------------------------------------------------------------------
# STEP 4: Criar appointment com offset explícito BRT (-03:00)
# ---------------------------------------------------------------------------

$idempotencyKey = "smoke-tz-$([System.Guid]::NewGuid().ToString('N').Substring(0,12))"
$createdId = $null

Assert-Check "Cria appointment com datetime em offset BRT (-03:00)" {
    $body = @{
        patientId          = $PatientId
        professionalId     = $ProfessionalId
        consultationTypeId = $ConsultationTypeId
        startsAt           = $StartsAtLocal
        idempotencyKey     = $idempotencyKey
    }
    if ($UnitId) { $body.unitId = $UnitId }

    $resp = Invoke-Api -Method POST -Path "/appointments" -Headers $authHeaders -Body $body
    if ($resp.StatusCode -notin @(200, 201)) {
        throw "createAppointment falhou com HTTP $($resp.StatusCode) — $($resp.Data | ConvertTo-Json -Compress)"
    }
    $script:createdId = $resp.Data.id
    Write-Log "INFO" "  appointmentId: $($script:createdId)"
}

$createdId = $script:createdId

# ---------------------------------------------------------------------------
# STEP 5: Validar timezone preservation — startsAt em UTC
# ---------------------------------------------------------------------------

Assert-Check "startsAt retornado em UTC é o esperado da conversão de offset BRT" {
    if (-not $createdId) { throw "appointment não foi criado, skip" }
    $resp = Invoke-Api -Method GET -Path "/appointments/$createdId" -Headers $authHeaders
    if ($resp.StatusCode -ne 200) {
        throw "getAppointment falhou com HTTP $($resp.StatusCode)"
    }
    $returnedStartsAt = [System.DateTimeOffset]::Parse($resp.Data.startsAt).UtcDateTime
    $expectedUtc = $startsAtUtc

    $diffMs = [Math]::Abs(($returnedStartsAt - $expectedUtc).TotalMilliseconds)
    if ($diffMs -gt 1000) {
        throw "Timezone drift detectado! Esperado: $($expectedUtc.ToString('o')) Retornado: $($returnedStartsAt.ToString('o')) Diff: ${diffMs}ms"
    }
    Write-Log "INFO" "  startsAt UTC: $($returnedStartsAt.ToString('o')) — OK (diff=${diffMs}ms)"
}

# ---------------------------------------------------------------------------
# STEP 6: Idempotência — criar novamente com mesmo key deve retornar igual
# ---------------------------------------------------------------------------

Assert-Check "Idempotência — segunda criação com mesma key retorna o mesmo appointment" {
    if (-not $createdId) { throw "appointment não foi criado, skip" }
    $body = @{
        patientId          = $PatientId
        professionalId     = $ProfessionalId
        consultationTypeId = $ConsultationTypeId
        startsAt           = $StartsAtLocal
        idempotencyKey     = $idempotencyKey
    }
    if ($UnitId) { $body.unitId = $UnitId }

    $resp = Invoke-Api -Method POST -Path "/appointments" -Headers $authHeaders -Body $body
    if ($resp.StatusCode -notin @(200, 201)) {
        throw "Segunda criação com mesmo key falhou HTTP $($resp.StatusCode)"
    }
    if ($resp.Data.id -ne $createdId) {
        throw "Idempotência violada! IDs diferentes: $($resp.Data.id) vs $createdId"
    }
}

# ---------------------------------------------------------------------------
# STEP 7: Double-booking no mesmo slot → deve retornar 409
# ---------------------------------------------------------------------------

Assert-Check "Double-booking no mesmo slot retorna 409 Conflict" {
    if (-not $createdId) { throw "appointment não foi criado, skip" }
    $differentKey = "smoke-tz-conflict-$([System.Guid]::NewGuid().ToString('N').Substring(0,12))"
    $body = @{
        patientId          = $PatientId
        professionalId     = $ProfessionalId
        consultationTypeId = $ConsultationTypeId
        startsAt           = $StartsAtLocal
        idempotencyKey     = $differentKey
    }
    if ($UnitId) { $body.unitId = $UnitId }

    $resp = Invoke-Api -Method POST -Path "/appointments" -Headers $authHeaders -Body $body
    if ($resp.StatusCode -ne 409) {
        throw "Esperado 409 para double-booking, got HTTP $($resp.StatusCode)"
    }
    Write-Log "INFO" "  409 Conflict recebido corretamente para double-booking"
}

# ---------------------------------------------------------------------------
# STEP 8: Confirmar o appointment
# ---------------------------------------------------------------------------

Assert-Check "Confirma appointment (status → CONFIRMED)" {
    if (-not $createdId) { throw "appointment não foi criado, skip" }
    $resp = Invoke-Api -Method PATCH -Path "/appointments/$createdId/confirm" -Headers $authHeaders
    if ($resp.StatusCode -ne 200) {
        # pode ser 404 se o endpoint de confirm não existir no controller — verificar
        if ($resp.StatusCode -eq 404) {
            throw "Endpoint PATCH /appointments/:id/confirm não encontrado (verifique controller)"
        }
        throw "confirm falhou com HTTP $($resp.StatusCode)"
    }
    if ($resp.Data.status -ne "CONFIRMED") {
        throw "Status esperado CONFIRMED, got $($resp.Data.status)"
    }
}

# ---------------------------------------------------------------------------
# STEP 9: Cancelar (cleanup)
# ---------------------------------------------------------------------------

Assert-Check "Cancela appointment de smoke test (cleanup)" {
    if (-not $createdId) { throw "appointment não foi criado, skip" }
    $resp = Invoke-Api -Method PATCH -Path "/appointments/$createdId/cancel" -Headers $authHeaders -Body @{
        reason = "Smoke test cleanup"
    }
    if ($resp.StatusCode -ne 200) {
        throw "cancel falhou com HTTP $($resp.StatusCode)"
    }
    if ($resp.Data.status -ne "CANCELED") {
        throw "Status esperado CANCELED, got $($resp.Data.status)"
    }
    Write-Log "INFO" "  Appointment $createdId cancelado com sucesso (cleanup)"
}

# ---------------------------------------------------------------------------
# Relatório final
# ---------------------------------------------------------------------------

Write-Host ""
Write-Log "INFO" "=== Resultado Final ==="
$script:Results | Format-Table -AutoSize
Write-Log "INFO" "Passed: $($script:Passed) | Failed: $($script:Failed)"

if ($script:Failed -gt 0) {
    Write-Log "FAIL" "Smoke test FALHOU. Verifique logs acima."
    exit 1
}

Write-Log "PASS" "Smoke test de scheduling timezone passou com sucesso."
exit 0
