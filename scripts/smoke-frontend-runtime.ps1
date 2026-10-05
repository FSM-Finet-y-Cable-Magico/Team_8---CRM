$ErrorActionPreference = 'Stop'
Get-Command docker -ErrorAction Stop | Out-Null
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$name = 'i3-frontend-runtime-' + [Guid]::NewGuid().ToString('N').Substring(0,8)
$image = $name + ':qa'
# Fixed local image/container names; no env files, secrets or backend traffic.
try {
  & docker build --target prod --build-arg VITE_API_URL=https://api.example.invalid/api -t $image (Join-Path $root 'frontend')
  if ($LASTEXITCODE -ne 0) { throw 'FRONTEND_DOCKER_BUILD_FAILED' }
  & docker run -d --name $name -p '127.0.0.1::8080' $image
  if ($LASTEXITCODE -ne 0) { throw 'FRONTEND_DOCKER_START_FAILED' }
  $mapping = (& docker port $name '8080/tcp').Trim()
  if ($mapping -notmatch '^127\.0\.0\.1:(\d+)$') { throw 'UNEXPECTED_PORT_MAPPING' }
  $base = 'http://127.0.0.1:' + $matches[1]
  $healthy = $false
  for ($i=0; $i -lt 20; $i++) {
    try { $health = Invoke-WebRequest -UseBasicParsing -Uri "$base/health"; $healthy = $health.StatusCode -eq 200 -and $health.Content.Trim() -eq 'ok' } catch {}
    if ($healthy) { break }; Start-Sleep -Milliseconds 500
  }
  if (!$healthy) { throw 'FRONTEND_HEALTH_FAILED' }
  $home = Invoke-WebRequest -UseBasicParsing -Uri "$base/"
  $spa = Invoke-WebRequest -UseBasicParsing -Uri "$base/clientes"
  if ($home.Content -ne $spa.Content) { throw 'SPA_FALLBACK_FAILED' }
  if ($home.Content -notmatch 'src="(/assets/[^" ]+\.js)"') { throw 'ASSET_NOT_FOUND' }
  $asset = Invoke-WebRequest -UseBasicParsing -Uri ($base + $matches[1])
  if ($asset.Headers['Cache-Control'] -notmatch 'immutable') { throw 'ASSET_CACHE_FAILED' }
  $missing = $false
  try { Invoke-WebRequest -UseBasicParsing -Uri "$base/assets/missing-qa.js" | Out-Null } catch { $missing = [int]$_.Exception.Response.StatusCode -eq 404 }
  if (!$missing) { throw 'ASSET_404_FAILED' }
  @{environment='LOCAL_NGINX';status='PASS';health=$true;spa=$true;asset=$true;missingAsset404=$true} | ConvertTo-Json
} finally {
  & docker rm -f $name 2>$null | Out-Null
  & docker image rm $image 2>$null | Out-Null
}
