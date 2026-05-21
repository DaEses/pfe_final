param()

$ErrorActionPreference = 'Continue'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidsPath = Join-Path $root '.runtime/pids.json'

if (Test-Path $pidsPath) {
  $pids = Get-Content $pidsPath | ConvertFrom-Json
  $targets = @(
    @{ Name='chatbot'; Pid=$pids.chatbotPid },
    @{ Name='emotion'; Pid=$pids.emotionPid },
    @{ Name='frontend'; Pid=$pids.frontendPid },
    @{ Name='backend'; Pid=$pids.backendPid },
    @{ Name='postgres'; Pid=$pids.postgresPid }
  )

  foreach ($t in $targets) {
    if ($t.Pid) {
      try {
        Stop-Process -Id $t.Pid -Force -ErrorAction Stop
        Write-Host "Stopped $($t.Name) (PID=$($t.Pid))"
      } catch {
        Write-Host "Could not stop $($t.Name) PID=$($t.Pid) (already closed?)"
      }
    }
  }
}

# Safety cleanup by command patterns
Get-CimInstance Win32_Process |
  Where-Object {
    $_.Name -eq 'node.exe' -and (
      $_.CommandLine -match 'nest start --watch' -or
      $_.CommandLine -match 'vite'
    )
  } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Get-CimInstance Win32_Process |
  Where-Object {
    $_.Name -eq 'python.exe' -and (
      $_.CommandLine -match 'hr_interview.py' -or
      $_.CommandLine -match 'interview_monitor.py'
    )
  } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Write-Host 'Stop complete.'
