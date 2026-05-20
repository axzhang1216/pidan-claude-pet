#!/usr/bin/env bash
set +e
EVENT="${1:-}"
PORT_FILE="${APPDATA:-$HOME/.config}/pidan/port"

# Read port from file, then verify it's alive; if not, scan range
PORT=""
if [ -f "$PORT_FILE" ]; then
    PORT="$(cat "$PORT_FILE" 2>/dev/null)"
fi

# Verify port is alive; if not, scan and self-heal port file
if [ -n "$PORT" ]; then
    curl -s -m 0.5 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 || PORT=""
fi

if [ -z "$PORT" ]; then
    for p in $(seq 19514 19523); do
        if curl -s -m 0.3 "http://127.0.0.1:$p/health" >/dev/null 2>&1; then
            PORT="$p"
            echo -n "$p" > "$PORT_FILE" 2>/dev/null
            break
        fi
    done
fi

if [ -z "$PORT" ]; then exit 0; fi

STDIN_JSON=""
if ! [ -t 0 ]; then STDIN_JSON="$(cat)"; fi

node -e "
const event = process.argv[1];
const port  = process.argv[2];
const raw   = process.argv[3];
let sid = 'unknown', cwd = '', msg = '', notifType = '';
try {
  const d = JSON.parse(raw);
  sid = d.session_id || sid;
  cwd = d.cwd || '';
  notifType = d.notification_type || '';
  const full = d.last_assistant_message || d.message || d.prompt || '';
  msg = full.length > 120 ? full.slice(0, 120) + '…' : full;
} catch(e) {}
const payload = JSON.stringify({ event_type: event, session_id: sid, cwd: cwd, msg: msg, notification_type: notifType });
const http = require('http');
const req = http.request({
  host: '127.0.0.1', port: parseInt(port), path: '/event', method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
}, () => {});
req.on('error', () => {});
req.setTimeout(1500, () => req.destroy());
req.write(payload);
req.end();
" -- "$EVENT" "$PORT" "$STDIN_JSON" 2>/dev/null

exit 0
