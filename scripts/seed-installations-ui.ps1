param(
  [ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9_.-]*$')][string]$ContainerName = 'finet-crm-db',
  [ValidatePattern('^[a-zA-Z][a-zA-Z0-9_]*$')][string]$DatabaseName = 'fsm_db'
)
$ErrorActionPreference = 'Stop'
# This fixture is intentionally opt-in and never part of a production migration.
$endpoint = & docker context inspect --format '{{.Endpoints.docker.Host}}'
if ($LASTEXITCODE -ne 0 -or $endpoint -notmatch '^(npipe|unix)://') {
  throw 'La seed solo se permite en Docker local, no en un servidor remoto.'
}
$sqlPath = Join-Path $PSScriptRoot '..\db\demo_seed_installations_ui.sql'
$OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Get-Content -LiteralPath $sqlPath -Raw -Encoding UTF8 | & docker exec -i $ContainerName psql -U postgres -d $DatabaseName -v ON_ERROR_STOP=1
if ($LASTEXITCODE -ne 0) { throw 'No se pudo cargar la seed local de instalaciones.' }
