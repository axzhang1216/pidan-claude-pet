# patch-claude-settings.ps1
# Called by the Pidan installer to inject hooks into ~/.claude/settings.json
# Safe to run multiple times — idempotent merge.

$settingsDir  = Join-Path $env:USERPROFILE ".claude"
$settingsFile = Join-Path $settingsDir "settings.json"
$hookScript   = Join-Path $env:APPDATA "pidan\hooks\pidan-hook.ps1"
$hookCmd      = "powershell -NonInteractive -File `"$hookScript`""

# Ensure .claude dir exists
if (-not (Test-Path $settingsDir)) {
    New-Item -ItemType Directory -Force $settingsDir | Out-Null
}

# Load or create settings
if (Test-Path $settingsFile) {
    try {
        $settings = Get-Content $settingsFile -Raw -Encoding UTF8 | ConvertFrom-Json
    } catch {
        Write-Warning "Could not parse $settingsFile — creating backup and starting fresh"
        Copy-Item $settingsFile "$settingsFile.bak-pidan-$(Get-Date -Format 'yyyyMMddHHmmss')"
        $settings = [PSCustomObject]@{}
    }
} else {
    $settings = [PSCustomObject]@{}
}

# Build hooks block
$hookEntry = @(
    [PSCustomObject]@{
        hooks = @(
            [PSCustomObject]@{ type = "command"; command = "" }
        )
    }
)

$events = @("SessionStart","Stop","Notification","UserPromptSubmit","SessionEnd")

if (-not $settings.hooks) {
    $settings | Add-Member -MemberType NoteProperty -Name hooks -Value ([PSCustomObject]@{})
}

foreach ($ev in $events) {
    $cmd = "$hookCmd $ev"
    $entry = [PSCustomObject]@{
        hooks = @([PSCustomObject]@{ type = "command"; command = $cmd })
    }
    if ($settings.hooks.PSObject.Properties[$ev]) {
        # Already has this event — check if pidan hook is already there
        $existing = $settings.hooks.$ev
        $alreadyPresent = $existing | Where-Object {
            $_.hooks | Where-Object { $_.command -like "*pidan-hook*" }
        }
        if (-not $alreadyPresent) {
            # Append our entry
            $settings.hooks.$ev = @($existing) + @($entry)
        }
    } else {
        $settings.hooks | Add-Member -MemberType NoteProperty -Name $ev -Value @($entry)
    }
}

# Write back with UTF8 (no BOM)
$json = $settings | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText($settingsFile, $json, [System.Text.UTF8Encoding]::new($false))

Write-Host "✅ Pidan hooks added to $settingsFile"
