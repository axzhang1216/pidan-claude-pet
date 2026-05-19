import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalPosition } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

type State = "working" | "waiting" | "done" | "failed" | "idle";

interface Session {
    id: string; project: string; state: State;
    title: string | null; last_msg: string; last_change: string; agent: string;
}
interface StateChange {
    kind: "created" | "transitioned" | "removed";
    id?: string; from?: State; to?: State; msg?: string;
}
interface Snapshot {
    main_state: State; sessions: Session[]; last_change?: StateChange;
}

const STATE_EMOJI: Record<State, string> = {
    idle: "😺", working: "🐱💻", waiting: "😾", done: "😸✨", failed: "🙀",
};

const pet = document.getElementById("pet")!;
const bubblesEl = document.getElementById("bubbles")!;
let currentSnap: Snapshot = { main_state: "idle", sessions: [] };

// Track open bubbles — when all closed + no working sessions → idle
let openBubbles = 0;

function checkIdleFallback() {
    if (openBubbles > 0) return;
    const hasActive = currentSnap.sessions.some(s => s.state === "working");
    if (!hasActive) {
        pet.className = "pet idle";
        pet.textContent = STATE_EMOJI["idle"];
    }
}

function render(snap: Snapshot) {
    currentSnap = snap;
    pet.textContent = STATE_EMOJI[snap.main_state];
    pet.className = `pet ${snap.main_state}`;
}

function bubbleText(change: StateChange, sessions: Session[]): string | null {
    if (change.kind !== "transitioned") return null;
    const sess = sessions.find(s => s.id === change.id);
    const project = sess?.project ?? "?";
    const msg = change.msg || sess?.last_msg || "";
    const preview = msg ? `\n${msg}` : "";
    if (change.to === "waiting") return `📨 ${project} 在等你回复${preview}`;
    if (change.to === "done" && change.from === "working") return `✅ ${project} 跑完啦${preview}`;
    if (change.to === "failed") return `❌ ${project} 出错了${preview}`;
    return null;
}

function showBubble(text: string) {
    const div = document.createElement("div");
    div.className = "bubble";

    const closeBtn = document.createElement("button");
    closeBtn.className = "bubble-close";
    closeBtn.textContent = "✕";
    closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        div.remove();
        openBubbles = Math.max(0, openBubbles - 1);
        checkIdleFallback();
    });

    const textDiv = document.createElement("div");
    textDiv.className = "bubble-text";
    textDiv.textContent = text;

    div.appendChild(closeBtn);
    div.appendChild(textDiv);
    bubblesEl.appendChild(div);
    openBubbles++;
}

listen<Snapshot>("pidan://snapshot", (e) => {
    render(e.payload);
    if (e.payload.last_change) {
        const text = bubbleText(e.payload.last_change, e.payload.sessions);
        if (text) showBubble(text);
    }
});

// right-click to open panel
pet.addEventListener("contextmenu", async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const panel = await WebviewWindow.getByLabel("panel");
    if (!panel) return;
    const w = getCurrentWindow();
    const pos = await w.outerPosition();
    await panel.setPosition(new LogicalPosition(pos.x - 320 - 8, pos.y));
    await panel.show();
    await panel.setFocus();
});

render(currentSnap);
