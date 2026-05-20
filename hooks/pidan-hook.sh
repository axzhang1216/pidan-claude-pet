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
const event    = process.argv[1];
const port     = parseInt(process.argv[2]);
const raw      = process.argv[3];
const portFile = process.argv[4];

let sid = 'unknown', cwd = '', msg = '', notifType = '';
try {
  const d = JSON.parse(raw);
  sid       = d.session_id        || sid;
  cwd       = d.cwd               || '';
  notifType = d.notification_type || '';
  const full = d.last_assistant_message || d.message || d.prompt || '';
  msg = full.length > 120 ? full.slice(0, 120) + '…' : full;
} catch(e) {}

const payload = JSON.stringify({ event_type: event, session_id: sid, cwd, msg, notification_type: notifType });
const http = require('http');
const fs   = require('fs');

function send(p) {
  return new Promise((resolve) => {
    const req = http.request({
      host: '127.0.0.1', port: p, path: '/event', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, (res) => { res.resume(); resolve(true); });
    req.on('error', () => resolve(false));
    req.setTimeout(800, () => { req.destroy(); resolve(false); });
    req.write(payload);
    req.end();
  });
}

(async () => {
  if (await send(port)) return;
  // port stale — scan once, update file
  for (let p = 19514; p <= 19523; p++) {
    if (p === port) continue;
    if (await send(p)) {
      try { fs.writeFileSync(portFile, String(p)); } catch(e) {}
      return;
    }
  }
})();
" -- "$EVENT" "$PORT" "$STDIN_JSON" "$PORT_FILE" 2>/dev/null

exit 0
