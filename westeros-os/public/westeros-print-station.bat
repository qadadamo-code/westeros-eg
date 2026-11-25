@echo off
rem Westeros OS - print station. Run once: it starts now and every time Windows starts.
rem It listens on this PC only (http://localhost:17777) and passes print jobs from the
rem Westeros screen (open in Chrome) to network printers by IP (port 9100).
title Westeros Print Station
set "WS_SELF=%~f0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=[IO.File]::ReadAllText('%~f0'); $i=$s.LastIndexOf('#' + 'PS1'); iex $s.Substring($i)"
exit /b

#PS1
$ErrorActionPreference = 'Stop'
# start with Windows: copy this file into the Startup folder (once)
try {
  $startup = [Environment]::GetFolderPath('Startup')
  $dest = Join-Path $startup 'westeros-print-station.bat'
  if ($env:WS_SELF -and ($env:WS_SELF -ne $dest)) { Copy-Item -LiteralPath $env:WS_SELF -Destination $dest -Force; Write-Host "Starts with Windows: $dest" }
} catch { Write-Host "Could not add to Windows startup: $($_.Exception.Message)" }

$port = 17777
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
try { $listener.Start() } catch {
  Write-Host "The print station is already running (or port $port is busy)."
  Start-Sleep -Seconds 5
  exit
}
Write-Host "Westeros print station is running on http://localhost:$port  (keep this window open)"

function Send-Reply($ctx, [int]$code, [string]$text) {
  $res = $ctx.Response
  $origin = $ctx.Request.Headers['Origin']
  if ($origin) { $res.Headers['Access-Control-Allow-Origin'] = $origin } else { $res.Headers['Access-Control-Allow-Origin'] = '*' }
  $res.Headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
  $res.Headers['Access-Control-Allow-Headers'] = 'Content-Type'
  $res.Headers['Access-Control-Allow-Private-Network'] = 'true'
  $res.Headers['Vary'] = 'Origin'
  $res.StatusCode = $code
  $bytes = [Text.Encoding]::UTF8.GetBytes($text)
  $res.ContentType = 'application/json; charset=utf-8'
  $res.ContentLength64 = $bytes.Length
  $res.OutputStream.Write($bytes, 0, $bytes.Length)
  $res.OutputStream.Close()
}

while ($listener.IsListening) {
  try { $ctx = $listener.GetContext() } catch { break }
  try {
    $req = $ctx.Request
    $path = $req.Url.AbsolutePath
    if ($req.HttpMethod -eq 'OPTIONS') { Send-Reply $ctx 204 ''; continue }
    if ($path -eq '/ping') { Send-Reply $ctx 200 '{"ok":true,"v":1}'; continue }
    if ($path -eq '/print' -and $req.HttpMethod -eq 'POST') {
      $reader = New-Object IO.StreamReader($req.InputStream, [Text.Encoding]::UTF8)
      $job = $reader.ReadToEnd() | ConvertFrom-Json
      $data = [Convert]::FromBase64String($job.data)
      $p = 9100; if ($job.port) { $p = [int]$job.port }
      $client = New-Object System.Net.Sockets.TcpClient
      $wait = $client.BeginConnect([string]$job.ip, $p, $null, $null)
      if (-not $wait.AsyncWaitHandle.WaitOne(4000)) { $client.Close(); throw "printer $($job.ip) not reachable" }
      $client.EndConnect($wait)
      $stream = $client.GetStream()
      $stream.Write($data, 0, $data.Length)
      $stream.Flush()
      Start-Sleep -Milliseconds 200
      $client.Close()
      Write-Host ("{0}  printed {1} bytes to {2}" -f (Get-Date -Format 'HH:mm:ss'), $data.Length, $job.ip)
      Send-Reply $ctx 200 '{"ok":true}'
      continue
    }
    Send-Reply $ctx 404 '{"ok":false}'
  } catch {
    Write-Host ("{0}  error: {1}" -f (Get-Date -Format 'HH:mm:ss'), $_.Exception.Message)
    try { Send-Reply $ctx 500 (('{"ok":false,"error":' + (ConvertTo-Json ([string]$_.Exception.Message)) + '}')) } catch {}
  }
}
