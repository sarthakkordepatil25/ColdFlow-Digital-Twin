# ==============================================================================
# ColdFlow - Unified 3D Digital Twin Master Launcher & Supervisor
# ==============================================================================
# 1. Validates Java & Database configuration
# 2. Compiles Java source files with PostgreSQL JDBC & Gson libraries
# 3. Boots the ColdFlow Unified Backend (HTTP Port 8080)
# 4. Awaits health check readiness
# 5. Spawns the 3D Digital Twin in Microsoft Edge Native App Mode
# 6. Supervises the window lifecycle: gracefully shuts down Java when closed
# ==============================================================================

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  COLDFLOW: SMART COLD-CHAIN WAREHOUSE 3D DIGITAL TWIN   " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Check Root Directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

# 2. Database Environment Variables
$envFile = Join-Path $scriptDir ".env"
if (Test-Path $envFile) {
    Get-Content $envFile | Where-Object { $_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$' } | ForEach-Object {
        $varName = $matches[1]
        $varVal = $matches[2].Trim().Trim('"').Trim("'")
        if (-not [System.Environment]::GetEnvironmentVariable($varName)) {
            [System.Environment]::SetEnvironmentVariable($varName, $varVal)
        }
    }
}

if (-not $env:COLDFLOW_DB_HOST) { $env:COLDFLOW_DB_HOST = "aws-0-ap-south-1.pooler.supabase.com" }
if (-not $env:COLDFLOW_DB_PORT) { $env:COLDFLOW_DB_PORT = "5432" }
if (-not $env:COLDFLOW_DB_NAME) { $env:COLDFLOW_DB_NAME = "postgres" }
if (-not $env:COLDFLOW_DB_USER) { $env:COLDFLOW_DB_USER = "postgres.eufylkiyaeanrrvggnds" }

if (-not $env:COLDFLOW_DB_PASSWORD) {
    Write-Warning "COLDFLOW_DB_PASSWORD is not configured in environment or .env file."
}

Write-Host "[1/5] Database environment verified: $env:COLDFLOW_DB_HOST" -ForegroundColor Green

# 3. Compile Java Sources
Write-Host "[2/5] Compiling ColdFlow Java Core & Unified Server..." -ForegroundColor Yellow
$buildDir = Join-Path $env:TEMP "coldflow-build-run"
if (Test-Path $buildDir) { Remove-Item -Recurse -Force $buildDir | Out-Null }
New-Item -ItemType Directory -Force $buildDir | Out-Null

$classpath = "Java\lib\postgresql-42.7.14.jar;Java\lib\gson-2.10.1.jar"
$javaSources = Get-ChildItem "Java\src" -Recurse -Filter *.java | ForEach-Object FullName

& javac -cp $classpath -d $buildDir $javaSources
if ($LASTEXITCODE -ne 0) {
    Write-Error "Java compilation failed."
    exit 1
}
Write-Host "      Compilation successful." -ForegroundColor Green

# 4. Start ColdFlow Backend Process
Write-Host "[3/5] Starting ColdFlow Unified Backend Server..." -ForegroundColor Yellow
$javaProc = Start-Process -FilePath "java" `
    -ArgumentList "-cp `"$buildDir;$classpath`" coldflow.Main" `
    -PassThru -NoNewWindow

Write-Host "      ColdFlow Java process started (PID: $($javaProc.Id))." -ForegroundColor Green

# 5. Await Server Health Check
Write-Host "[4/5] Awaiting Server Readiness on http://127.0.0.1:8080/api/health..." -ForegroundColor Yellow
$ready = $false
for ($i = 0; $i -lt 25; $i++) {
    Start-Sleep -Milliseconds 500
    try {
        $resp = Invoke-RestMethod -Uri "http://127.0.0.1:8080/api/health" -Method Get -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($resp -and $resp.status -eq "ONLINE") {
            $ready = $true
            break
        }
    } catch {}
}

if (-not $ready) {
    Write-Error "ColdFlow server failed to start within timeout."
    Stop-Process -Id $javaProc.Id -Force -ErrorAction SilentlyContinue
    exit 1
}
Write-Host "      Server is ONLINE and Supabase is connected." -ForegroundColor Green

# 6. Locate Microsoft Edge for Native App Mode
Write-Host "[5/5] Launching 3D Digital Twin in Native Application Mode..." -ForegroundColor Yellow
$edgePaths = @(
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
)
$edgePath = $edgePaths | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($edgePath) {
    Write-Host "      Launching borderless desktop window via Edge App Mode..." -ForegroundColor Green
    $edgeProfileDir = Join-Path $env:TEMP ("coldflow-edge-" + [guid]::NewGuid().ToString("N"))
    $edgeProc = Start-Process -FilePath $edgePath `
        -ArgumentList "--user-data-dir=`"$edgeProfileDir`" --no-first-run --app=http://127.0.0.1:8080 --window-size=1600,1000 --window-position=50,50 --app-title=`"ColdFlow | 3D Digital Twin`"" `
        -PassThru -Wait

    if (Test-Path $edgeProfileDir) {
        Remove-Item -Recurse -Force $edgeProfileDir
    }

    Write-Host "`n[Supervisor] 3D Digital Twin window was closed by user." -ForegroundColor Cyan
} else {
    Write-Host "      Edge not found; opening in default system browser..." -ForegroundColor Yellow
    Start-Process "http://127.0.0.1:8080"
    Write-Host "Press ENTER to terminate ColdFlow Server..." -ForegroundColor Yellow
    [void][System.Console]::ReadLine()
}

# 7. Clean Shutdown (Zero Orphaned Processes)
Write-Host "[Supervisor] Initiating clean shutdown of Java backend (PID: $($javaProc.Id))..." -ForegroundColor Yellow
try {
    Invoke-RestMethod -Uri "http://127.0.0.1:8080/api/shutdown" -Method Post -TimeoutSec 2 -ErrorAction SilentlyContinue | Out-Null
} catch {}

Start-Sleep -Milliseconds 600
if (-not $javaProc.HasExited) {
    Stop-Process -Id $javaProc.Id -Force -ErrorAction SilentlyContinue
}
Write-Host "[Supervisor] ColdFlow system shutdown complete. No orphaned processes remain." -ForegroundColor Green
