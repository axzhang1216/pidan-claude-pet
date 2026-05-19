import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";

type State = "working"|"waiting"|"done"|"failed"|"idle";
interface Session { id:string; project:string; state:State; title:string|null; last_change:string; agent:string; }
interface Snapshot { main_state:State; sessions:Session[]; }

const list = document.getElementById("list")!;

function render(snap: Snapshot) {
    if (snap.sessions.length === 0) {
        list.innerHTML = `<div class="empty">没有活跃会话</div>`;
        return;
    }
    list.innerHTML = snap.sessions.map(s => `
        <div class="row" title="${(s.title||'').replace(/"/g,'&quot;')}">
            <div class="dot ${s.state}"></div>
            <div class="proj">${s.project}</div>
            <div class="state-label">${s.state}</div>
        </div>`).join("");
}

listen<Snapshot>("pidan://snapshot", (e) => render(e.payload));

getCurrentWindow().onFocusChanged(({ payload: focused }) => {
    if (!focused) getCurrentWindow().hide();
});

invoke<Snapshot>("get_snapshot").then(render).catch(console.error);
