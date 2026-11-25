@echo off
rem Westeros OS - print station (v2). Run once: it starts now, hidden, and every time Windows starts.
rem It runs in the background with no window: it takes this branch's print jobs from Westeros and sends
rem them to the network printers by IP (port 9100). Link it once from the Westeros station screen.
rem It also listens on this PC only (http://localhost:17777) for that link and for test prints.
set "WS_SELF=%~f0"
start "" /min powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command "$s=[IO.File]::ReadAllText($env:WS_SELF); $i=$s.LastIndexOf('#' + 'PS1'); iex $s.Substring($i)"
exit /b

#PS1
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$dir = Join-Path $env:LOCALAPPDATA 'Westeros'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$cfgFile = Join-Path $dir 'station.json'
$logFile = Join-Path $dir 'station.log'
function Log([string]$t) {
  try {
    if ((Test-Path $logFile) -and ((Get-Item $logFile).Length -gt 1MB)) { Remove-Item $logFile -Force }
    Add-Content -Path $logFile -Value ("{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $t)
  } catch {}
}

# start with Windows: copy this file into the Startup folder
try {
  $startup = [Environment]::GetFolderPath('Startup')
  $dest = Join-Path $startup 'westeros-print-station.bat'
  if ($env:WS_SELF -and ($env:WS_SELF -ne $dest)) { Copy-Item -LiteralPath $env:WS_SELF -Destination $dest -Force; Log "starts with Windows: $dest" }
} catch { Log "could not add to Windows startup: $($_.Exception.Message)" }

$port = 17777
# a newer copy replaces the one already running
try { Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:$port/quit" -TimeoutSec 2 | Out-Null; Start-Sleep -Milliseconds 800 } catch {}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
try { $listener.Start() } catch { Log "already running (port $port busy)"; exit }
Log "print station v2 running"

$cfg = $null
if (Test-Path $cfgFile) { try { $cfg = Get-Content $cfgFile -Raw | ConvertFrom-Json } catch { $cfg = $null } }

function Send-Printer([string]$ip, [int]$p, [byte[]]$data) {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $wait = $client.BeginConnect($ip, $p, $null, $null)
    if (-not $wait.AsyncWaitHandle.WaitOne(4000)) { throw "printer $ip not reachable" }
    $client.EndConnect($wait)
    $stream = $client.GetStream()
    $stream.Write($data, 0, $data.Length)
    $stream.Flush()
    Start-Sleep -Milliseconds 200
  } finally { $client.Close() }
}

function Unzip([byte[]]$gz) {
  $in = New-Object IO.MemoryStream(, $gz)
  $z = New-Object IO.Compression.GZipStream($in, [IO.Compression.CompressionMode]::Decompress)
  $out = New-Object IO.MemoryStream
  $z.CopyTo($out)
  $z.Close()
  return , $out.ToArray()
}

function Rpc([string]$name, $body) {
  $h = @{ apikey = $cfg.key; Authorization = "Bearer $($cfg.key)" }
  $json = $body | ConvertTo-Json -Compress -Depth 5
  return Invoke-RestMethod -Method Post -Uri "$($cfg.url)/rest/v1/rpc/$name" -Headers $h -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($json)) -TimeoutSec 15
}

$script:nextPoll = Get-Date
function Poll {
  if (-not $cfg) { return }
  if ((Get-Date) -lt $script:nextPoll) { return }
  $script:nextPoll = (Get-Date).AddMilliseconds(1500)
  try { $jobs = Rpc 'print_station_claim' @{ p_token = $cfg.token } } catch { Log "server: $($_.Exception.Message)"; $script:nextPoll = (Get-Date).AddSeconds(5); return }
  foreach ($j in @($jobs)) {
    if (-not $j.id) { continue }
    $err = $null
    try {
      $copies = 1; if ($j.copies) { $copies = [int]$j.copies }
      for ($c = 0; $c -lt $copies; $c++) {
        foreach ($chunk in @($j.data)) {
          if ($chunk.gz) { $bytes = Unzip ([Convert]::FromBase64String($chunk.gz)) } else { $bytes = [Convert]::FromBase64String($chunk.b64) }
          $pp = 9100; if ($chunk.port) { $pp = [int]$chunk.port }
          Send-Printer ([string]$chunk.ip) $pp $bytes
        }
      }
      Log "printed $($j.kind) $($j.id)"
    } catch { $err = $_.Exception.Message; Log "error $($j.id): $err" }
    try { Rpc 'print_station_done' @{ p_token = $cfg.token; p_id = $j.id; p_error = $err } | Out-Null } catch { Log "server: $($_.Exception.Message)" }
  }
  if (@($jobs).Count -gt 0) { $script:nextPoll = Get-Date }
}

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

function Handle($ctx) {
  $req = $ctx.Request
  $path = $req.Url.AbsolutePath
  if ($req.HttpMethod -eq 'OPTIONS') { Send-Reply $ctx 204 ''; return $true }
  if ($path -eq '/ping') { $l = 'false'; if ($cfg) { $l = 'true' }; Send-Reply $ctx 200 ('{"ok":true,"v":2,"os":"windows","linked":' + $l + '}'); return $true }
  if ($path -eq '/quit') { Send-Reply $ctx 200 '{"ok":true}'; return $false }
  $body = ''
  if ($req.HttpMethod -eq 'POST') { $reader = New-Object IO.StreamReader($req.InputStream, [Text.Encoding]::UTF8); $body = $reader.ReadToEnd() }
  if ($path -eq '/link' -and $req.HttpMethod -eq 'POST') {
    $c = $body | ConvertFrom-Json
    if (-not $c.url -or -not $c.key -or -not $c.token) { Send-Reply $ctx 400 '{"ok":false,"error":"missing"}'; return $true }
    $script:cfg = $c
    Set-Content -Path $cfgFile -Value $body -Encoding UTF8
    Log "linked"
    Send-Reply $ctx 200 '{"ok":true}'
    return $true
  }
  if ($path -eq '/print' -and $req.HttpMethod -eq 'POST') {
    $job = $body | ConvertFrom-Json
    $p = 9100; if ($job.port) { $p = [int]$job.port }
    Send-Printer ([string]$job.ip) $p ([Convert]::FromBase64String($job.data))
    Send-Reply $ctx 200 '{"ok":true}'
    return $true
  }
  Send-Reply $ctx 404 '{"ok":false}'
  return $true
}

$pending = $listener.BeginGetContext($null, $null)
$running = $true
while ($running) {
  if ($pending.AsyncWaitHandle.WaitOne(500)) {
    try {
      $ctx = $listener.EndGetContext($pending)
      try { $running = Handle $ctx } catch {
        Log "error: $($_.Exception.Message)"
        try { Send-Reply $ctx 500 (('{"ok":false,"error":' + (ConvertTo-Json ([string]$_.Exception.Message)) + '}')) } catch {}
      }
    } catch { Log "listener: $($_.Exception.Message)" }
    if ($running) { $pending = $listener.BeginGetContext($null, $null) }
  }
  Poll
}
$listener.Stop()
Log "stopped (replaced by a newer copy)"
