param(
  [ValidatePattern('^[a-zA-Z][a-zA-Z0-9_]*$')]
  [string]$DatabaseName = 'fsm_i3_baseline_test',

  [ValidatePattern('^[a-zA-Z][a-zA-Z0-9_]*$')]
  [string]$DatabaseUser = 'postgres',

  [string]$DatabasePassword = 'postgres',

  [ValidateRange(1024, 65535)]
  [int]$Port = 55432,

  [ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9_.-]*$')]
  [string]$ContainerName = 'finet-crm-i3-baseline-db',

  [switch]$WithSeed
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

function Invoke-NativeCommand {
  param(
    [Parameter(Mandatory = $true)][string]$Command,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments
  )

  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "El comando fallo ($LASTEXITCODE): $Command $($Arguments -join ' ')"
  }
}

$encodedUser = [Uri]::EscapeDataString($DatabaseUser)
$encodedPassword = [Uri]::EscapeDataString($DatabasePassword)
$databaseUrl = "postgresql://${encodedUser}:${encodedPassword}@127.0.0.1:${Port}/${DatabaseName}?schema=public"
$sanitizedUrl = "postgresql://${encodedUser}:***@127.0.0.1:${Port}/${DatabaseName}?schema=public"
$uri = [Uri]$databaseUrl

Write-Host "DATABASE_URL saneada: $sanitizedUrl"
if ($uri.Host -notin @('localhost', '127.0.0.1')) {
  throw "Bootstrap detenido: DATABASE_URL no apunta a PostgreSQL local"
}

Write-Host "Host verificado para escritura local: $($uri.Host)"

$existingContainers = & docker ps -a --format '{{.Names}}'
if ($LASTEXITCODE -ne 0) {
  throw 'No fue posible consultar Docker. Verifica que Docker Desktop este iniciado.'
}

if ($existingContainers -contains $ContainerName) {
  Write-Host "Eliminando contenedor local descartable anterior: $ContainerName"
  Invoke-NativeCommand docker rm -f $ContainerName
}

Write-Host "Creando PostgreSQL local limpio: $DatabaseName"
Invoke-NativeCommand docker run --detach `
  --name $ContainerName `
  --env "POSTGRES_DB=$DatabaseName" `
  --env "POSTGRES_USER=$DatabaseUser" `
  --env "POSTGRES_PASSWORD=$DatabasePassword" `
  --publish "127.0.0.1:${Port}:5432" `
  postgres:15-alpine

$ready = $false
for ($attempt = 1; $attempt -le 60; $attempt += 1) {
  & docker exec $ContainerName pg_isready -U $DatabaseUser -d $DatabaseName *> $null
  if ($LASTEXITCODE -eq 0) {
    $ready = $true
    break
  }
  Start-Sleep -Seconds 1
}

if (-not $ready) {
  throw "PostgreSQL local no quedo disponible en 60 segundos"
}

$env:DATABASE_URL = $databaseUrl
$schemaFiles = @(
  'db/init/01_schema.sql',
  'db/init/02_local_adjustments.sql',
  'db/init/08_schema_reunion_duenos_servicios_contratos.sql',
  'db/init/09_work_order_tracking_codes.sql',
  'db/init/10_prospect_external_contract_flow.sql',
  'db/init/11_customer_contract_workflow.sql',
  'db/init/12_crm_plan_changes.sql',
  'db/init/13_user_sessions.sql'
)

foreach ($file in $schemaFiles) {
  Write-Host "Aplicando SCHEMA: $file"
  Invoke-NativeCommand npx.cmd prisma db execute --file $file --schema backend/prisma/schema.prisma
}

Write-Host 'Aplicando y registrando migraciones Prisma vigentes sobre el esquema SQL base'
$migrationDirectories = Get-ChildItem -LiteralPath 'backend/prisma/migrations' -Directory | Sort-Object Name
foreach ($migrationDirectory in $migrationDirectories) {
  $migrationFile = Join-Path $migrationDirectory.FullName 'migration.sql'
  if (-not (Test-Path -LiteralPath $migrationFile)) {
    throw "La migracion $($migrationDirectory.Name) no contiene migration.sql"
  }

  Write-Host "Aplicando MIGRATION: $($migrationDirectory.Name)"
  Invoke-NativeCommand npx.cmd prisma db execute --file $migrationFile --schema backend/prisma/schema.prisma
  Invoke-NativeCommand npx.cmd prisma migrate resolve --applied $migrationDirectory.Name --schema backend/prisma/schema.prisma
}

Write-Host 'Comprobando que no quedan migraciones pendientes'
Invoke-NativeCommand npx.cmd prisma migrate deploy --schema backend/prisma/schema.prisma

if ($WithSeed) {
  $seedFiles = @(
    'db/init/03_seed.sql',
    'db/init/04_seed_demo.sql',
    'db/init/05_seed_cable_magico.sql',
    'db/init/06_seed_incremento2.sql',
    'db/init/07_seed_portal_monitoring_tvip.sql',
    'db/init/02_seed_local_adjustments.sql',
    'db/init/08_seed_reunion_duenos_servicios_contratos.sql',
    'db/init/09_seed_inventory_traceability.sql'
  )

  foreach ($file in $seedFiles) {
    Write-Host "Aplicando SEED/DEMO opcional: $file"
    Invoke-NativeCommand npx.cmd prisma db execute --file $file --schema backend/prisma/schema.prisma
  }
}

Write-Host 'Validando y generando Prisma'
Invoke-NativeCommand npx.cmd prisma validate --schema backend/prisma/schema.prisma
Invoke-NativeCommand npx.cmd prisma generate --schema backend/prisma/schema.prisma

Write-Host 'Verificando tablas, columnas, constraints y consulta Prisma'
Invoke-NativeCommand node scripts/verify-local-db.mjs

Write-Host "BOOTSTRAP_LOCAL_DB_OK database=$DatabaseName container=$ContainerName seed=$($WithSeed.IsPresent)"
