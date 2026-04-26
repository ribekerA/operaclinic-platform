param(
  [Parameter(Mandatory = $false)]
  [string]$BaseUrl = "http://localhost:3002",

  [Parameter(Mandatory = $false)]
  [string]$Email = "recepcao@estetica-demo.local",

  [Parameter(Mandatory = $false)]
  [string]$Password = "Demo@123",

  [Parameter(Mandatory = $false)]
  [int]$DaysAhead = 0,

  [Parameter(Mandatory = $false)]
  [int]$MinimumLeadMinutes = 20
)

$ErrorActionPreference = "Stop"

function Invoke-JsonRequest {
  param(
    [string]$Method,
    [string]$Uri,
    [hashtable]$Headers,
    [object]$Body
  )

  $requestParams = @{
    Method      = $Method
    Uri         = $Uri
    ErrorAction = "Stop"
  }

  if ($Headers) {
    $requestParams.Headers = $Headers
  }

  if ($PSBoundParameters.ContainsKey("Body") -and $null -ne $Body) {
    $requestParams.ContentType = "application/json"
    $requestParams.Body = ($Body | ConvertTo-Json -Depth 8)
  }

  return Invoke-RestMethod @requestParams
}

$login = Invoke-JsonRequest -Method "Post" -Uri "$BaseUrl/api/v1/auth/login" -Body @{
  email = $Email
  password = $Password
  profile = "clinic"
}

$headers = @{ Authorization = "Bearer $($login.accessToken)" }

$professionals = Invoke-JsonRequest -Method "Get" -Uri "$BaseUrl/api/v1/professionals" -Headers $headers
$consultationTypes = Invoke-JsonRequest -Method "Get" -Uri "$BaseUrl/api/v1/consultation-types" -Headers $headers
$units = Invoke-JsonRequest -Method "Get" -Uri "$BaseUrl/api/v1/units" -Headers $headers
$patients = Invoke-JsonRequest -Method "Get" -Uri "$BaseUrl/api/v1/reception/patients?search=Paciente%20Smoke%20E2E&limit=5" -Headers $headers

$professional = $professionals | Where-Object { $_.professionalRegister -eq "ESTETICA-SMOKE-E2E" } | Select-Object -First 1
$consultationType = $consultationTypes | Where-Object { $_.name -eq "Avaliacao Estetica Smoke E2E" } | Select-Object -First 1
$unit = $units | Where-Object { $_.name -eq "Unidade Estetica Smoke E2E" } | Select-Object -First 1
$patient = $patients | Where-Object { $_.fullName -eq "Paciente Smoke E2E" } | Select-Object -First 1

Write-Host "Resolved resources:"
Write-Host (ConvertTo-Json @{
  professionalId = $professional.id
  consultationTypeId = $consultationType.id
  unitId = $unit.id
  patientId = $patient.id
} -Depth 4)

$targetDate = (Get-Date).AddDays($DaysAhead)
$dateKey = [System.TimeZoneInfo]::ConvertTimeBySystemTimeZoneId($targetDate, "E. South America Standard Time").ToString("yyyy-MM-dd")
$availabilityUri = "$BaseUrl/api/v1/reception/availability?professionalId=$($professional.id)&consultationTypeId=$($consultationType.id)&unitId=$($unit.id)&date=$dateKey"
$availability = Invoke-JsonRequest -Method "Get" -Uri $availabilityUri -Headers $headers
$minimumStartsAt = (Get-Date).AddMinutes($MinimumLeadMinutes)
$slot = $availability | Where-Object { [DateTime]::Parse($_.startsAt) -ge $minimumStartsAt } | Select-Object -First 1

if (-not $slot) {
  throw "No diagnostic slot found for $dateKey after $($minimumStartsAt.ToString("o"))."
}

Write-Host "Selected slot:"
Write-Host (ConvertTo-Json $slot -Depth 4)

$appointment = Invoke-JsonRequest -Method "Post" -Uri "$BaseUrl/api/v1/reception/appointments" -Headers $headers -Body @{
  patientId = $patient.id
  professionalId = $professional.id
  consultationTypeId = $consultationType.id
  unitId = $unit.id
  startsAt = $slot.startsAt
  room = "Sala Estetica Smoke"
  notes = "Atendimento estetico Smoke E2E"
  idempotencyKey = "diag-$([guid]::NewGuid().ToString())"
}

Write-Host "Appointment created:"
Write-Host (ConvertTo-Json $appointment -Depth 8)