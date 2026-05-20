; pidan-hooks.nsh — NSIS installer hooks for Pidan
; Runs after installation to:
;   1. Copy the hook script to %APPDATA%\pidan\hooks\
;   2. Patch ~/.claude/settings.json to add Claude Code hooks

!macro NSIS_HOOK_POSTINSTALL
  ; Copy hook scripts to %APPDATA%\pidan\hooks\
  CreateDirectory "$APPDATA\pidan\hooks"
  CopyFiles "$INSTDIR\hooks\pidan-hook.ps1" "$APPDATA\pidan\hooks\pidan-hook.ps1"
  CopyFiles "$INSTDIR\hooks\pidan-hook.sh"  "$APPDATA\pidan\hooks\pidan-hook.sh"

  ; Run the settings patcher (silent, non-interactive)
  ExecWait 'powershell.exe -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\installer\patch-claude-settings.ps1"' $0
  ; $0 = exit code, silently ignore failures (Claude Code may not be installed yet)
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; Leave %APPDATA%\pidan\ intact on uninstall (user data / config)
  ; Optionally remove hooks:
  ; Delete "$APPDATA\pidan\hooks\pidan-hook.ps1"
  ; Delete "$APPDATA\pidan\hooks\pidan-hook.sh"
!macroend
