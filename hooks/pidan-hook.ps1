# pidan-hook.ps1 — Claude Code Hook bridge for Pidan desktop pet
# Usage: powershell -NonInteractive -File pidan-hook.ps1 <EventType>
# EventType: SessionStart | UserPromptSubmit | Notification | Stop | SessionEnd
param([string]$EventType = "")

$portFile = Join-Path $env:APPDATA "pidan\port"
$port = ""
if (Test-Path $portFile) { $port = (Get-Content $portFile -Raw).Trim() }

# Verify port alive; if not, scan range and self-heal
function Test-Port($p) {
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:$p/health" -TimeoutSec 1 -UseBasicParsing -ErrorAction Stop
        return $r.Content -eq "ok"
    } catch { return $false }
}

if ($port -and -not (Test-Port $port)) { $port = "" }

if (-not $port) {
    foreach ($p in 19514..19523) {
        if (Test-Port $p) {
            $port = "$p"
            [System.IO.File]::WriteAllText($portFile, $port)
            break
        }
    }
}

if (-not $port) { exit 0 }

# Read stdin JSON (Claude Code pipes hook payload via stdin)
$stdinJson = ""
if (-not [Console]::IsInputRedirected -eq $false) {
    try { $stdinJson = $input | Out-String } catch {}
}
if (-not $stdinJson) {
    try {
        $stdinJson = [Console]::In.ReadToEnd()
    } catch {}
}

$sid = "manual-$PID"
$cwd = ""
$msg = ""
$notifType = ""

if ($stdinJson) {
    try {
        $d = $stdinJson | ConvertFrom-Json
        if ($d.session_id)        { $sid = $d.session_id }
        if ($d.cwd)               { $cwd = $d.cwd }
        if ($d.notification_type) { $notifType = $d.notification_type }
        $raw = if ($d.last_assistant_message) { $d.last_assistant_message }
               elseif ($d.message) { $d.message }
               elseif ($d.prompt)  { $d.prompt }
               else { "" }
        if ($raw.Length -gt 120) { $msg = $raw.Substring(0, 120) + "…" }
        else { $msg = $raw }
    } catch {}
}

$payload = @{
    event_type        = $EventType
    session_id        = $sid
    cwd               = $cwd
    msg               = $msg
    notification_type = $notifType
} | ConvertTo-Json -Compress

try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
    $req = [System.Net.HttpWebRequest]::Create("http://127.0.0.1:$port/event")
    $req.Method = "POST"
    $req.ContentType = "application/json"
    $req.ContentLength = $bytes.Length
    $req.Timeout = 1500
    $stream = $req.GetRequestStream()
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Close()
    $resp = $req.GetResponse()
    $resp.Close()
} catch {
    # Pidan not running — silent fail
}

exit 0
