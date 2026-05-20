# 皮蛋 · Pidan — Claude Code Desktop Pet

A Windows desktop pet that shows the real-time status of your Claude Code sessions. When you're running multiple Claude agents in parallel, Pidan sits in the corner of your screen and tells you what's happening at a glance.

![Pidan demo](docs/screenshot.png)

> **Open-source & API-key friendly.** Works with any Claude Code setup — official Anthropic accounts, self-hosted proxies, or third-party API providers. As long as Claude Code runs on your machine, Pidan works.

---

## What it does

| Animation | State | Meaning |
|-----------|-------|---------|
| 😺 breathing | **idle** | No active sessions |
| 🏃 running | **working** | Claude is thinking / executing |
| 🙆 waving | **done** | Claude finished — bubble shows reply preview |
| ⌛ waiting | **waiting** | Claude is waiting for your input |
| 💀 failed | **failed** | Something went wrong |

- Multiple sessions: Pidan shows the **highest-priority** state across all sessions
- **Reply preview bubbles** appear below the pet when Claude finishes — click ✕ to dismiss
- Right-click the pet → session list panel showing all active projects
- Windows Toast notifications on completion (toggleable)
- Window position is remembered across restarts

---

## Install (Windows)

### Option A — One-click installer (recommended)

1. Download `Pidan-Setup.exe` from [Releases](../../releases)
2. Run the installer — it installs Pidan and **automatically patches your `~/.claude/settings.json`** to add the Claude Code hooks
3. Launch Pidan from the Start menu or system tray

> If you don't have `~/.claude/settings.json` yet, the installer creates it. If you do, it merges only the `hooks` section — your existing settings are preserved.

### Option B — Manual setup

1. Download and run the installer (without auto-patch), or build from source
2. Copy the hook script:
   ```powershell
   New-Item -ItemType Directory -Force "$env:APPDATA\pidan\hooks"
   Copy-Item "hooks\pidan-hook.ps1" "$env:APPDATA\pidan\hooks\"
   ```
3. Merge this into `~/.claude/settings.json`:
   ```json
   {
     "hooks": {
       "SessionStart":     [{"hooks":[{"type":"command","command":"powershell -NonInteractive -File \"%APPDATA%\pidan\hooks\pidan-hook.ps1\" SessionStart"}]}],
       "Stop":             [{"hooks":[{"type":"command","command":"powershell -NonInteractive -File \"%APPDATA%\pidan\hooks\pidan-hook.ps1\" Stop"}]}],
       "Notification":     [{"hooks":[{"type":"command","command":"powershell -NonInteractive -File \"%APPDATA%\pidan\hooks\pidan-hook.ps1\" Notification"}]}],
       "UserPromptSubmit": [{"hooks":[{"type":"command","command":"powershell -NonInteractive -File \"%APPDATA%\pidan\hooks\pidan-hook.ps1\" UserPromptSubmit"}]}],
       "SessionEnd":       [{"hooks":[{"type":"command","command":"powershell -NonInteractive -File \"%APPDATA%\pidan\hooks\pidan-hook.ps1\" SessionEnd"}]}]
     }
   }
   ```

---

## Build from source

**Prerequisites:** Rust (stable, `CARGO_HOME` and `RUSTUP_HOME` can be on any drive), Node.js ≥ 18, WebView2 (pre-installed on Windows 10/11).

```bash
git clone https://github.com/axzhang1216/pidan-claude-pet
cd pidan-claude-pet
npm install
npm run tauri dev        # development mode
npm run tauri build      # produces installer in src-tauri/target/release/bundle/nsis/
```

---

## Architecture

```
Claude Code hooks
    └─▶ pidan-hook.ps1 (or .sh)
            └─▶ POST http://127.0.0.1:<port>/event   (port written to %APPDATA%\pidan\port)
                    └─▶ Rust (axum) HTTP server
                            └─▶ AppState state machine
                                    └─▶ Tauri event: pidan://snapshot
                                            └─▶ Frontend (Vanilla TS + Canvas)
                                                    ├─▶ Spritesheet animation
                                                    ├─▶ Reply preview bubbles
                                                    └─▶ Windows Toast
```

The hook script is fail-safe: if Pidan isn't running, it exits silently with code 0 and never blocks Claude Code.

---

## For non-Anthropic Claude Code users

Pidan works with any Claude Code installation regardless of how you authenticate. The hooks fire on Claude Code events — not on Anthropic API calls. If your Claude Code runs against a proxy or third-party endpoint, the pet still works.

---

## License

MIT
