$targetPort = 5173
if ((Get-NetTCPConnection -LocalPort 80 -State Listen -ErrorAction SilentlyContinue)) {
    $targetPort = 80
} elseif ((Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue)) {
    $targetPort = 5173
} elseif ((Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue)) {
    $targetPort = 8000
}

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host " Starting Cloudflare Global Tunnel to Port $targetPort" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan

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

# Read output asynchronously
while (!$process.HasExited) {
    $line = $process.StandardError.ReadLine()
    if ($line) {
        Write-Host $line
        if (!$tunnelUrlFound -and $line -match "(https://[a-zA-Z0-9\-]+\.trycloudflare\.com)") {
            $tunnelUrl = $Matches[1]
            $tunnelUrlFound = $true
            Write-Host "`n****************************************************************" -ForegroundColor Green
            Write-Host "  WORLDWIDE PUBLIC CLOUD URL DETECTED:" -ForegroundColor Green
            Write-Host "  $tunnelUrl" -ForegroundColor Yellow
            Write-Host "  Updating API Gateway links so everyone worldwide can use it!" -ForegroundColor Green
            Write-Host "****************************************************************`n" -ForegroundColor Green

            try {
                New-Item -ItemType Directory -Force -Path "$PSScriptRoot\backend\data" | Out-Null
                Set-Content -Path "$PSScriptRoot\backend\data\public_url.txt" -Value $tunnelUrl
                try {
                    Invoke-RestMethod -Uri "http://127.0.0.1:$targetPort/api/admin/public-url" -Method POST -Body (@{ public_url = $tunnelUrl } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 3 | Out-Null
                } catch {
                    Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/admin/public-url" -Method POST -Body (@{ public_url = $tunnelUrl } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 3 | Out-Null
                }
            } catch {}
        }
    }
}
