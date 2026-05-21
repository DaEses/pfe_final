param()

# Vérifications préalables
if (-not (Test-Path "chatbot\.venv\Scripts\python.exe")) {
    Write-Warning "chatbot/.venv manquant. Lancer d'abord : cd chatbot && python -m venv .venv && .venv\Scripts\pip install -r requirements.txt"
}
if (-not (Test-Path "emotiondetection\.venv\Scripts\python.exe")) {
    Write-Warning "emotiondetection/.venv manquant. Lancer d'abord : cd emotiondetection && python -m venv .venv && .venv\Scripts\pip install -r requirements.txt"
}

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtimeDir = Join-Path $root '.runtime'
$pidsPath = Join-Path $runtimeDir 'pids.json'

New-Item -ItemType Directory -Force $runtimeDir | Out-Null

function Start-WindowProcess {
  param(
    [string]$Name,
    [string]$WorkingDir,
    [string]$Command
  )

  $proc = Start-Process -FilePath 'powershell.exe' `
    -ArgumentList @('-NoExit', '-Command', $Command) `
    -WorkingDirectory $WorkingDir `
    -PassThru

  Write-Host "Started $Name (PID=$($proc.Id))"
  return $proc.Id
}

# 1) PostgreSQL direct start (if nothing listens on 8080)
$pgListener = netstat -ano | Select-String ':8080\s+.*LISTENING'
$pgPid = $null
if (-not $pgListener) {
  $pgCommand = '& "C:\Program Files\PostgreSQL\18\bin\postgres.exe" -D "C:\Program Files\PostgreSQL\18\data" -p 8080'
  $pgPid = Start-WindowProcess -Name 'postgresql:8080' -WorkingDir $root -Command $pgCommand
} else {
  Write-Host 'PostgreSQL already listening on :8080'
}

# 2) Backend
$backendDir = Join-Path $root 'plateform/jobfinderportal-master/job-finder-backend'
$backendPid = Start-WindowProcess -Name 'backend' -WorkingDir $backendDir -Command '$env:DB_PORT="8080"; npm run start:dev'

# 3) Frontend
$frontendDir = Join-Path $root 'plateform/jobfinderportal-master/job-finder-frontend'
$frontendPid = Start-WindowProcess -Name 'frontend' -WorkingDir $frontendDir -Command 'npm run dev'

# Emotion monitor + standalone chatbot are NOT started here.
# Interviews run in the browser (/job-seeker/interview/:id); emotion runs headless at the end via the API.

@{
  startedAt = (Get-Date).ToString('o')
  postgresPid = $pgPid
  backendPid = $backendPid
  frontendPid = $frontendPid
  emotionPid = $null
  chatbotPid = $null
} | ConvertTo-Json | Set-Content -Encoding UTF8 $pidsPath

Write-Host ''
Write-Host 'All services launched.'
Write-Host 'Frontend: http://localhost:5173'
Write-Host 'Backend:  http://localhost:3000/api'
Write-Host 'PostgreSQL: localhost:8080'
