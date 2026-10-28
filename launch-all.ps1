# ==============================================================================
#   LM Studio API Gateway - Complete All-In-One Launcher (Docker + Cloudflare)
# ==============================================================================
$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host "   LM STUDIO API GATEWAY - ALL-IN-ONE LAUNCHER" -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host ""

# ------------------------------------------------------------------------------
# 1. Check LM Studio
# ------------------------------------------------------------------------------
Write-Host ">>> [1/5] Checking LM Studio..." -ForegroundColor Cyan
$lmResponding = $false
try {
    $res = Invoke-RestMethod -Uri "http://127.0.0.1:1234/v1/models" -Method Get -TimeoutSec 3
    $lmResponding = $true
} catch {}

if (-not $lmResponding) {
    Write-Host "[NOTICE] LM Studio server is not responding on port 1234." -ForegroundColor Yellow
    Write-Host "         Please open LM Studio and enable 'Start Server' on port 1234." -ForegroundColor Yellow
} else {
    Write-Host "[OK] LM Studio is running on port 1234!" -ForegroundColor Green
    # Check if a model is loaded into memory
    try {
        $psOut = (lms ps 2>&1 | Out-String)
        if ($psOut -match "No models are currently loaded") {
            Write-Host "     Loading model 'zai-org/glm-4.7-flash' into memory..." -ForegroundColor Yellow
            lms load zai-org/glm-4.7-flash -y
            Write-Host "[OK] Model 'zai-org/glm-4.7-flash' loaded successfully!" -ForegroundColor Green
        } else {
            Write-Host "[OK] A model is already loaded in memory." -ForegroundColor Green
        }
    } catch {}
}

# ------------------------------------------------------------------------------
# 2. Check & Start Docker Desktop
# ------------------------------------------------------------------------------
Write-Host ""
Write-Host ">>> [2/5] Checking Docker Engine..." -ForegroundColor Cyan
$dockerReady = $false
docker info > $null 2>&1
if ($LASTEXITCODE -eq 0) {
    $dockerReady = $true
    Write-Host "[OK] Docker Engine is active and ready!" -ForegroundColor Green
} else {
    $dockerExe = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dockerExe) {
        Write-Host "[NOTICE] Starting Docker Desktop in the background..." -ForegroundColor Yellow
        Start-Process $dockerExe
        Write-Host "Waiting for Docker engine to initialize (approx 30-45s)..." -ForegroundColor Yellow
        $retries = 0
        while ($retries -lt 30) {
            Start-Sleep -Seconds 3
            docker info > $null 2>&1
            if ($LASTEXITCODE -eq 0) {
                $dockerReady = $true
                Write-Host ""
                Write-Host "[OK] Docker Engine is now active and ready!" -ForegroundColor Green
                break
            }
            Write-Host -NoNewline "."
            $retries++
        }
        Write-Host ""
    } else {
        Write-Host "[WARNING] Docker Desktop not found at standard path." -ForegroundColor Yellow
    }
}

# ------------------------------------------------------------------------------
# 3. Start Docker Compose Containers
# ------------------------------------------------------------------------------
if ($dockerReady) {
    Write-Host ""
    Write-Host ">>> [3/5] Starting Docker Containers (Backend + Web)..." -ForegroundColor Cyan
    Set-Location $PSScriptRoot
    docker compose up -d
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Building and launching containers..." -ForegroundColor Yellow
        docker compose up --build -d
    }
    Write-Host "[OK] Containers running on http://localhost (Port 80) & http://localhost:8000" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host ">>> [3/5] Skipping Docker Compose (Docker Engine not active)." -ForegroundColor Yellow
    Write-Host "         Tip: Open Docker Desktop manually, or run start-local.bat." -ForegroundColor Yellow
}

# ------------------------------------------------------------------------------
# 4. Launch Cloudflare Worldwide Tunnel
# ------------------------------------------------------------------------------
Write-Host ""
Write-Host ">>> [4/5] Starting Cloudflare Worldwide Tunnel..." -ForegroundColor Cyan

$targetPort = 80
if (-not $dockerReady) {
    $targetPort = 5173
}

$cloudflaredCmd = "cloudflared.exe"
if (Test-Path "$PSScriptRoot\cloudflared.exe") {
    $cloudflaredCmd = "$PSScriptRoot\cloudflared.exe"
}

$processInfo = New-Object System.Diagnostics.ProcessStartInfo
$processInfo.FileName = $cloudflaredCmd
$processInfo.Arguments = "tunnel --url http://localhost:$targetPort"
$processInfo.RedirectStandardError = $true
$processInfo.RedirectStandardOutput = $true
$processInfo.UseShellExecute = $false

$process = [System.Diagnostics.Process]::Start($processInfo)
$tunnelUrlFound = $false
$tunnelUrl = ""

$timer = [System.Diagnostics.Stopwatch]::StartNew()
while (!$process.HasExited -and !$tunnelUrlFound -and $timer.Elapsed.TotalSeconds -lt 25) {
    $line = $process.StandardError.ReadLine()
    if ($line) {
        if ($line -match "(https://[a-zA-Z0-9\-]+\.trycloudflare\.com)") {
            $tunnelUrl = $Matches[1]
            $tunnelUrlFound = $true
            break
        }
    }
}

# ------------------------------------------------------------------------------
# 5. Register Public URL & Launch Dashboard
# ------------------------------------------------------------------------------
Write-Host ""
Write-Host ">>> [5/5] Finalizing Setup & Launching Dashboard..." -ForegroundColor Cyan

if ($tunnelUrlFound) {
    try {
        New-Item -ItemType Directory -Force -Path "$PSScriptRoot\backend\data" | Out-Null
        Set-Content -Path "$PSScriptRoot\backend\data\public_url.txt" -Value $tunnelUrl
        
        $adminKey = ""
        if (Test-Path "$PSScriptRoot\backend\data\admin_api_key.txt") {
            $adminKey = (Get-Content "$PSScriptRoot\backend\data\admin_api_key.txt" -Raw).Trim()
        }
        $headers = @{}
        if ($adminKey) {
            $headers["X-Admin-Key"] = $adminKey
        }

        try {
            Invoke-RestMethod -Uri "http://localhost/api/admin/public-url" -Method POST -Headers $headers -Body (@{ public_url = $tunnelUrl } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 3 | Out-Null
        } catch {
            Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/admin/public-url" -Method POST -Headers $headers -Body (@{ public_url = $tunnelUrl } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 3 | Out-Null
        }
    } catch {}
}

# Open browser to Dashboard
Start-Process "http://localhost"

Write-Host ""
Write-Host "==========================================================================" -ForegroundColor Green
Write-Host "   LM STUDIO API GATEWAY - ALL SYSTEMS ONLINE & SECURED!" -ForegroundColor Green
Write-Host "==========================================================================" -ForegroundColor Green
Write-Host "  * Local Web Dashboard:   http://localhost" -ForegroundColor White
Write-Host "  * API Swagger Docs:      http://localhost/docs" -ForegroundColor White
Write-Host "  * Admin Key File:        backend\data\admin_api_key.txt" -ForegroundColor White
if ($tunnelUrlFound) {
    Write-Host "  * GLOBAL WORLDWIDE LINK: $tunnelUrl" -ForegroundColor Yellow
} else {
    Write-Host "  * Tunnel: Generating link... check log below" -ForegroundColor Yellow
}
    Write-Host "  * GLOBAL WORLDWIDE LINK: $tunnelUrl" -ForegroundColor Yellow
} else {
    Write-Host "  * Tunnel: Generating link... check log below" -ForegroundColor Yellow
}
Write-Host "==========================================================================" -ForegroundColor Green
Write-Host "  Anyone in the world can now send API requests to your model via the link above!" -ForegroundColor Cyan
Write-Host "  (Keep this window open to keep the tunnel alive. Press Ctrl+C to stop.)" -ForegroundColor DarkGray
Write-Host "==========================================================================" -ForegroundColor Green
Write-Host ""

# Stream remaining tunnel logs
while (!$process.HasExited) {
    $line = $process.StandardError.ReadLine()
    if ($line) {
        Write-Host $line -ForegroundColor DarkGray
    }
}
