import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalPosition } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

// Spritesheet: 8 cols × 9 rows, each cell 192×208px
// Row mapping (0-indexed):
// 0: idle  1: running-right  2: running-left  3: waving
// 4: jumping  5: failed  6: waiting  7: running  8: review
const SHEET_COLS = 8;
const CELL_W = 192;
const CELL_H = 208; // 1872 / 9

const ROW: Record<string, number> = {
  idle:    0,
  working: 7,   // "running" row for active work
  waiting: 6,   // "waiting" row
  done:    3,   // "waving" for done
  failed:  5,
};

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

// --- Canvas sprite player ---
const canvas = document.getElementById("pet") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const sheet = new Image();
sheet.src = "/src/assets/pets/pidan/spritesheet.webp";

let currentRow = ROW.idle;
let frame = 0;
let frameTimer = 0;
const FPS = 8; // frames per second
const FRAME_MS = 1000 / FPS;

// Count usable frames per row (skip transparent-only cells)
// For simplicity use all 8 cols and let transparent frames be transparent
const FRAMES_PER_ROW = 8;

function drawFrame() {
  ctx.clearRect(0, 0, 192, 192);
  if (!sheet.complete) return;
  const sx = (frame % FRAMES_PER_ROW) * CELL_W;
  const sy = currentRow * CELL_H;
  // source is 192×208, we draw into 192×192 (crop bottom 16px which is usually ground/empty)
  ctx.drawImage(sheet, sx, sy, CELL_W, 192, 0, 0, 192, 192);
}

let lastTime = 0;
function animate(ts: number) {
  frameTimer += ts - lastTime;
  lastTime = ts;
  if (frameTimer >= FRAME_MS) {
    frame = (frame + 1) % FRAMES_PER_ROW;
    frameTimer = 0;
    drawFrame();
  }
  requestAnimationFrame(animate);
}
sheet.onload = () => { drawFrame(); requestAnimationFrame(animate); };

function setState(s: State) {
  const row = ROW[s] ?? ROW.idle;
  if (row !== currentRow) { currentRow = row; frame = 0; }
}

// --- Bubbles ---
const bubblesEl = document.getElementById("bubbles")!;
let openBubbles = 0;
let currentSnap: Snapshot = { main_state: "idle", sessions: [] };

function checkIdleFallback() {
  if (openBubbles > 0) return;
  const hasActive = currentSnap.sessions.some(s => s.state === "working");
  if (!hasActive) setState("idle");
}

function showBubble(project: string, msg: string) {
  const div = document.createElement("div");
  div.className = "bubble";

  const close = document.createElement("button");
  close.className = "bubble-close";
  close.textContent = "✕";
  close.addEventListener("click", (e) => {
    e.stopPropagation();
    div.remove();
    openBubbles = Math.max(0, openBubbles - 1);
    checkIdleFallback();
  });

  const label = document.createElement("div");
  label.className = "bubble-label";
  label.textContent = `✅ ${project}`;

  const text = document.createElement("div");
  text.className = "bubble-text";
  text.textContent = msg || "回复完毕";

  div.appendChild(close);
  div.appendChild(label);
  div.appendChild(text);
  bubblesEl.appendChild(div);
  openBubbles++;
}

// --- Snapshot listener ---
listen<Snapshot>("pidan://snapshot", (e) => {
  currentSnap = e.payload;
  setState(e.payload.main_state);

  const ch = e.payload.last_change;
  if (!ch || ch.kind !== "transitioned") return;

  // Only show bubble when Claude finishes (Stop → done) or fails
  if (ch.to === "done" || ch.to === "failed") {
    const sess = e.payload.sessions.find(s => s.id === ch.id);
    const project = sess?.project ?? ch.id ?? "?";
    const msg = ch.msg || sess?.last_msg || "";
    const preview = msg.length > 200 ? msg.slice(0, 200) + "…" : msg;
    showBubble(project, preview);
  }
});

// Right-click → panel
canvas.addEventListener("contextmenu", async (ev) => {
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
