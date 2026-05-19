#!/usr/bin/env bash
set +e
EVENT="${1:-}"
PORT_FILE="${APPDATA:-$HOME/.config}/pidan/port"
if [ ! -f "$PORT_FILE" ]; then exit 0; fi
PORT="$(cat "$PORT_FILE" 2>/dev/null)"
if [ -z "$PORT" ]; then exit 0; fi

STDIN_JSON=""
if ! [ -t 0 ]; then STDIN_JSON="$(cat)"; fi

node -e "
const event = process.argv[1];
const port  = process.argv[2];
const raw   = process.argv[3];
let sid = 'unknown', cwd = '', msg = '';
try {
  const d = JSON.parse(raw);
  sid = d.session_id || sid;
  cwd = d.cwd || '';
  const full = d.last_assistant_message || d.message || d.prompt || '';
  msg = full.length > 120 ? full.slice(0, 120) + '…' : full;
} catch(e) {}
const payload = JSON.stringify({ event_type: event, session_id: sid, cwd: cwd, msg: msg });
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
