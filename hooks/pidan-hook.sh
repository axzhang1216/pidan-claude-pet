#!/usr/bin/env bash
# pidan-hook.sh — Claude Code Hook bridge to Pidan desktop pet.
# Usage: pidan-hook.sh <EventType>
#   EventType: SessionStart | UserPromptSubmit | Notification | Stop | SessionEnd
set +e
EVENT="${1:-}"
PORT_FILE="${APPDATA:-$HOME/.config}/pidan/port"
if [ ! -f "$PORT_FILE" ]; then exit 0; fi
PORT="$(cat "$PORT_FILE" 2>/dev/null)"
if [ -z "$PORT" ]; then exit 0; fi

STDIN_JSON=""
if ! [ -t 0 ]; then
    STDIN_JSON="$(cat)"
fi

SID=""
CWD=""
if [ -n "$STDIN_JSON" ]; then
    SID="$(printf '%s' "$STDIN_JSON" | grep -oE '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')"
    CWD="$(printf '%s' "$STDIN_JSON" | grep -oE '"cwd"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')"
fi
[ -z "$SID" ] && SID="manual-$$"

PAYLOAD=$(printf '{"event_type":"%s","session_id":"%s","cwd":"%s","raw":%s}' \
    "$EVENT" "$SID" "$CWD" "${STDIN_JSON:-null}")

curl -sS -m 1 -X POST "http://127.0.0.1:$PORT/event" \
     -H "Content-Type: application/json" \
     -d "$PAYLOAD" >/dev/null 2>&1 || true

exit 0
