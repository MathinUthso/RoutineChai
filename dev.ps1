[CmdletBinding()]
param(
    [int]$BackendPort = 8000,
    [int]$FrontendPort = 3000,
    [switch]$Check
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSCommandPath
$backendDir = Join-Path $repoRoot "backend"
$frontendDir = Join-Path $repoRoot "frontend"
$uvicorn = Join-Path $repoRoot ".venv\Scripts\uvicorn.exe"

function Test-PortAvailable {
    param([int]$Port)

    $listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    if ($listeners.Count -gt 0) { return $false }

    $listener = [System.Net.Sockets.TcpListener]::new(
        [System.Net.IPAddress]::Loopback,
        $Port
    )

    try {
        $listener.Start()
        return $true
    }
    catch {
        return $false
    }
    finally {
        try { $listener.Stop() } catch { }
    }
}

function Resolve-Port {
    param(
        [int]$Requested,
        [string]$Name
    )

    if (Test-PortAvailable -Port $Requested) { return $Requested }

    for ($port = $Requested + 1; $port -le [Math]::Min($Requested + 20, 65535); $port++) {
        if (Test-PortAvailable -Port $port) {
            Write-Warning "$Name port $Requested is unavailable; using $port instead."
            return $port
        }
    }

    throw "No free $Name port was found near $Requested. Choose one with -$($Name)Port."
}

function Wait-ForHttp {
    param(
        [string]$Uri,
        [int]$TimeoutSeconds = 60
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $lastError = "no response yet"

    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 3
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
                return $response
            }
        }
        catch {
            $lastError = $_.Exception.Message
        }

        Start-Sleep -Milliseconds 500
    }

    throw "Timed out waiting for $Uri. Last error: $lastError"
}

function Stop-ProcessTree {
    param([int]$ProcessId)

    if ($ProcessId -le 0) { return }
    if (-not (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) { return }

    & taskkill.exe /PID $ProcessId /T /F *> $null
}

if (-not (Test-Path -LiteralPath $uvicorn)) {
    throw "Uvicorn was not found at $uvicorn. Create the venv and install backend\requirements.txt first."
}

$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) {
    throw "npm.cmd was not found on PATH. Install Node.js first."
}

$BackendPort = Resolve-Port -Requested $BackendPort -Name "Backend"
$FrontendPort = Resolve-Port -Requested $FrontendPort -Name "Frontend"

$backendUrl = "http://127.0.0.1:$BackendPort"
$frontendUrl = "http://localhost:$FrontendPort"
$frontendOrigin = "http://localhost:$FrontendPort"

$env:ALLOWED_ORIGINS = $frontendOrigin
$env:NEXT_PUBLIC_API_BASE_URL = $backendUrl

$backend = $null
$frontend = $null

try {
    Write-Host "Starting backend on $backendUrl ..."
    $backend = Start-Process `
        -FilePath $uvicorn `
        -ArgumentList @("app.main:app", "--host", "127.0.0.1", "--port", $BackendPort, "--reload") `
        -WorkingDirectory $backendDir `
        -PassThru `
        -NoNewWindow

    Write-Host "Starting frontend on $frontendUrl ..."
    $frontend = Start-Process `
        -FilePath $npm.Source `
        -ArgumentList @("run", "dev", "--", "-p", $FrontendPort) `
        -WorkingDirectory $frontendDir `
        -PassThru `
        -NoNewWindow

    $null = Wait-ForHttp -Uri "$backendUrl/health" -TimeoutSeconds 60
    $health = Invoke-RestMethod -Uri "$backendUrl/health" -TimeoutSec 5
    if ($health.status -ne "ok") {
        throw "Backend health check returned an unexpected payload."
    }

    $page = Wait-ForHttp -Uri $frontendUrl -TimeoutSeconds 90
    if ($page.Content -notmatch "UIU") {
        throw "Frontend responded, but the page did not contain the UIU application shell."
    }

    $corsResponse = Invoke-WebRequest `
        -Uri "$backendUrl/health" `
        -Headers @{ Origin = $frontendOrigin } `
        -UseBasicParsing `
        -TimeoutSec 5
    $allowedOrigin = [string]$corsResponse.Headers["Access-Control-Allow-Origin"]
    if ($allowedOrigin -ne $frontendOrigin) {
        throw "CORS check failed: backend did not allow $frontendOrigin."
    }

    Write-Host ""
    Write-Host "Backend:  $backendUrl/health  [ok]" -ForegroundColor Green
    Write-Host "Frontend: $frontendUrl  [ok]" -ForegroundColor Green
    Write-Host "CORS:     $frontendOrigin  [ok]" -ForegroundColor Green

    if ($Check) {
        Write-Host "Check passed. Stopping both services."
        return
    }

    Write-Host ""
    Write-Host "Both services are running. Press Ctrl+C to stop them."

    while ($true) {
        if ($backend.HasExited) {
            throw "Backend exited with code $($backend.ExitCode)."
        }
        if ($frontend.HasExited) {
            throw "Frontend exited with code $($frontend.ExitCode)."
        }

        Start-Sleep -Seconds 1
    }
}
finally {
    if ($frontend) { Stop-ProcessTree -ProcessId $frontend.Id }
    if ($backend) { Stop-ProcessTree -ProcessId $backend.Id }
}
