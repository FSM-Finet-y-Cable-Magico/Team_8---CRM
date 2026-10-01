[CmdletBinding()]
param(
  [string]$EnvFile = '.env.railway'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$resolvedEnvFile = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $EnvFile))
$resolvedRepoRoot = [System.IO.Path]::GetFullPath($repoRoot) + [System.IO.Path]::DirectorySeparatorChar

if (-not $resolvedEnvFile.StartsWith($resolvedRepoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'ENV_FILE_OUTSIDE_REPOSITORY'
}
if (-not (Test-Path -LiteralPath $resolvedEnvFile -PathType Leaf)) {
  throw 'ENV_FILE_NOT_FOUND'
}

$databaseLines = @(Get-Content -LiteralPath $resolvedEnvFile | Where-Object { $_ -match '^DATABASE_URL=' })
if ($databaseLines.Count -ne 1) {
  throw 'DATABASE_URL_MISSING_OR_DUPLICATED'
}

$databaseUrl = $databaseLines[0].Substring('DATABASE_URL='.Length).Trim()
if (-not $databaseUrl) {
  throw 'DATABASE_URL_EMPTY'
}

$env:DATABASE_URL = $databaseUrl
try {
  & node (Join-Path $PSScriptRoot 'verify-global-db.mjs')
  exit $LASTEXITCODE
} finally {
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
}
