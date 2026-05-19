"""Manual E2E driver. Run AFTER `npm run tauri dev` is up in another terminal."""
import json, os, time, urllib.request, sys

PORT_FILE = os.path.join(os.environ["APPDATA"], "pidan", "port")

def post(event_type, sid, cwd="D:/proj/foo"):
    port = open(PORT_FILE).read().strip()
    data = json.dumps({"event_type": event_type, "session_id": sid, "cwd": cwd}).encode()
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}/event",
        data=data,
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=2) as r:
        return r.status

def main():
    print("→ SessionStart (foo)");    print(post("SessionStart", "e2e-1", "D:/proj/foo")); time.sleep(0.8)
    print("→ Notification (foo)");   print(post("Notification", "e2e-1")); time.sleep(0.8)
    print("→ Stop (foo)");           print(post("Stop", "e2e-1")); time.sleep(0.8)
    print("→ SessionStart (bar)");   print(post("SessionStart", "e2e-2", "D:/proj/bar")); time.sleep(0.8)
    print("→ SessionStart (baz)");   print(post("SessionStart", "e2e-3", "D:/proj/baz")); time.sleep(0.8)
    print("→ Notification (bar)");   print(post("Notification", "e2e-2")); time.sleep(0.8)
    print("done — observe:")
    print("  pet: waiting state (bar has highest priority)")
    print("  right-click pet: panel shows bar+baz")
    print("  toast: '📨 bar 在等你回复'")

if __name__ == "__main__":
    main()
