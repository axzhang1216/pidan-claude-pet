import { listen } from "@tauri-apps/api/event";

type State = "working" | "waiting" | "done" | "failed" | "idle";

interface Session {
    id: string;
    project: string;
    state: State;
    title: string | null;
    last_change: string;
    agent: string;
}

interface StateChange {
    kind: "created" | "transitioned" | "removed";
    id?: string;
    from?: State;
    to?: State;
}

interface Snapshot {
    main_state: State;
    sessions: Session[];
    last_change?: StateChange;
}

const STATE_EMOJI: Record<State, string> = {
    idle:    "😺",
    working: "🐱💻",
    waiting: "😾",
    done:    "😸✨",
    failed:  "🙀",
};

const pet = document.getElementById("pet")!;
const bubblesEl = document.getElementById("bubbles")!;
let currentSnap: Snapshot = { main_state: "idle", sessions: [] };

function render() {
    pet.textContent = STATE_EMOJI[currentSnap.main_state];
    pet.className = `pet ${currentSnap.main_state}`;
}

// ---- bubbles ----
const MAX_BUBBLES = 3;

function bubbleFor(change: StateChange, sessions: Session[]): string | null {
    if (change.kind !== "transitioned") return null;
    const sess = sessions.find(s => s.id === change.id);
    const project = sess?.project ?? "?";
    if (change.to === "waiting") return `📨 ${project} 在等你回复`;
    if (change.to === "done" && change.from === "working") return `✅ ${project} 跑完啦`;
    if (change.to === "failed") return `❌ ${project} 出错了`;
    return null;
}

function showBubble(text: string) {
    while (bubblesEl.children.length >= MAX_BUBBLES) {
        bubblesEl.removeChild(bubblesEl.firstChild!);
    }
    const div = document.createElement("div");
    div.className = "bubble";
    div.textContent = text;
    bubblesEl.appendChild(div);
    setTimeout(() => div.classList.add("fade"), 2700);
    setTimeout(() => div.remove(), 3500);
}

listen<Snapshot>("pidan://snapshot", (e) => {
    currentSnap = e.payload;
    render();
    if (e.payload.last_change) {
        const text = bubbleFor(e.payload.last_change, e.payload.sessions);
        if (text) showBubble(text);
    }
});

// right-click to open panel
import { getCurrentWindow, LogicalPosition } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

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

render();
console.log("pidan frontend ready");
