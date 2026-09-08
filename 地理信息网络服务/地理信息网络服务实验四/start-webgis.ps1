$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Test-PortOpen {
  param([int]$Port)
  try {
    $client = [System.Net.Sockets.TcpClient]::new()
    $task = $client.ConnectAsync("127.0.0.1", $Port)
    if (-not $task.Wait(300)) {
      $client.Dispose()
      return $false
    }
    $client.Dispose()
    return $true
  } catch {
    return $false
  }
}

function Test-WebGisProxy {
  param([int]$Port)
  $url = "http://127.0.0.1:$Port/geoserver/kjw/ows?service=WFS&version=1.1.0&request=GetFeature&typeName=kjw:jianzhu_Project&outputFormat=application/json&srsName=EPSG:3857&maxFeatures=1"
  try {
    $res = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
    return $res.StatusCode -eq 200 -and $res.Content.Contains("FeatureCollection")
  } catch {
    return $false
  }
}

function Test-WebGisPage {
  param([int]$Port)
  $url = "http://127.0.0.1:$Port/"
  try {
    $res = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
    return $res.StatusCode -eq 200 -and $res.Content.Contains("OpenLayers WebGIS")
  } catch {
    return $false
  }
}

function Open-WebGisPage {
  param([string]$Url)
  if ($env:WEBGIS_NO_OPEN -eq "1") {
    Write-Host "Browser auto-open skipped: $Url" -ForegroundColor Cyan
    return
  }
  Start-Process $Url
}

Write-Host "Starting OpenLayers WebGIS system..." -ForegroundColor Cyan

$node = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Host "node.exe was not found. Please install Node.js or add Node.js to PATH." -ForegroundColor Red
  exit 1
}

$geoServerBaseUrl = if ($env:GEOSERVER_URL) { $env:GEOSERVER_URL.TrimEnd("/") } else { "http://localhost:8338/geoserver" }
$geoServerUrl = "$geoServerBaseUrl/ows?service=WMS&request=GetCapabilities"
try {
  $geo = Invoke-WebRequest -Uri $geoServerUrl -UseBasicParsing -TimeoutSec 5
  Write-Host "GeoServer is reachable: $geoServerBaseUrl" -ForegroundColor Green
} catch {
  Write-Host "Warning: GeoServer is not reachable at $geoServerBaseUrl" -ForegroundColor Yellow
  Write-Host "Please start GeoServer, then refresh the page." -ForegroundColor Yellow
}

$port = 5500
if (Test-PortOpen -Port $port) {
  if (Test-WebGisPage -Port $port) {
    $url = "http://127.0.0.1:$port"
    Write-Host "WebGIS is already running: $url" -ForegroundColor Green
    Open-WebGisPage -Url $url
    if (Test-WebGisProxy -Port $port) {
      Write-Host "GeoServer proxy test passed." -ForegroundColor Green
    } else {
      Write-Host "The page is running, but the GeoServer proxy test did not pass." -ForegroundColor Yellow
      Write-Host "Please make sure GeoServer is still running at $geoServerBaseUrl." -ForegroundColor Yellow
    }
    exit 0
  }

  Write-Host "Port 5500 is occupied. Looking for another port..." -ForegroundColor Yellow
  $port = $null
  foreach ($candidate in 5501..5510) {
    if (-not (Test-PortOpen -Port $candidate)) {
      $port = $candidate
      break
    }
  }
  if (-not $port) {
    Write-Host "Ports 5500-5510 are all occupied. Cannot start the system." -ForegroundColor Red
    exit 1
  }
}

$psi = [System.Diagnostics.ProcessStartInfo]::new()
$psi.FileName = $node.Source
$psi.WorkingDirectory = $root
$psi.Arguments = "server.js"
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$null = $psi.Environment
$psi.Environment["PORT"] = [string]$port
$proc = [System.Diagnostics.Process]::Start($psi)

Start-Sleep -Milliseconds 900

if ($proc.HasExited) {
  Write-Host "The server exited immediately. Please check server.js or Node.js." -ForegroundColor Red
  exit 1
}

if (-not (Test-WebGisPage -Port $port)) {
  Write-Host "The server started, but the WebGIS page is not responding." -ForegroundColor Red
  exit 1
}

$url = "http://127.0.0.1:$port"
Write-Host "WebGIS started: $url" -ForegroundColor Green
Write-Host "If the browser does not open automatically, copy the URL above." -ForegroundColor Cyan
Open-WebGisPage -Url $url

Start-Sleep -Milliseconds 600
if (Test-WebGisProxy -Port $port) {
  Write-Host "GeoServer proxy test passed." -ForegroundColor Green
} else {
  Write-Host "The page opened, but the GeoServer proxy test did not pass." -ForegroundColor Yellow
  Write-Host "Please make sure GeoServer is still running at $geoServerBaseUrl." -ForegroundColor Yellow
}
