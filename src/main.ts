import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalPosition } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

// Spritesheet: 8 cols x 9 rows, cell 192x208px
// Row -> actual frame count (measured from alpha channel)
const CELL_W = 192;
const CELL_H = 208;
const ROW_FRAMES = [6, 8, 8, 4, 5, 8, 6, 6, 6]; // rows 0-8

// Row mapping
// 0:idle  1:running-right  2:running-left  3:waving
// 4:jumping  5:failed  6:waiting  7:running  8:review
const ROW: Record<string, number> = {
  idle:          0,
  working:       7,
  waiting:       6,
  done:          3,
  failed:        5,
  drag_right:    1,
  drag_left:     2,
};

type State = "working" | "waiting" | "done" | "failed" | "idle";

interface Session {
  id: string; project: string; state: State;
  title: string | null; last_msg: string; last_change: string;
}
interface StateChange {
  kind: "created" | "transitioned" | "removed";
  id?: string; from?: State; to?: State; msg?: string;
}
interface Snapshot {
  main_state: State; sessions: Session[]; last_change?: StateChange;
}

// --- Canvas sprite player ---
const DISPLAY_SIZE = 115;
const canvas = document.getElementById("pet") as HTMLCanvasElement;
canvas.width  = DISPLAY_SIZE;
canvas.height = DISPLAY_SIZE;
const ctx = canvas.getContext("2d")!;
ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = "high";

const sheet = new Image();
sheet.src = "/src/assets/pets/pidan/spritesheet.webp";

let currentRow = ROW.idle;
let frame = 0;
const FPS = 10;
const FRAME_MS = 1000 / FPS;
let lastFrameTime = 0;

function drawFrame() {
  ctx.clearRect(0, 0, DISPLAY_SIZE, DISPLAY_SIZE);
  if (!sheet.complete || !sheet.naturalWidth) return;
  const sx = frame * CELL_W;
  const sy = currentRow * CELL_H;
  ctx.drawImage(sheet, sx, sy, CELL_W, 192, 0, 0, DISPLAY_SIZE, DISPLAY_SIZE);
}

function animate(ts: number) {
  requestAnimationFrame(animate);
  if (ts - lastFrameTime < FRAME_MS) return;
  lastFrameTime = ts;
  frame = (frame + 1) % ROW_FRAMES[currentRow];
  drawFrame();
}

sheet.onload = () => { drawFrame(); requestAnimationFrame(animate); };

// current app state — drag overrides visually but doesn't change this
let appStateRow = ROW.idle;
let isDragging = false;

function setRow(row: number) {
  if (row !== currentRow) {
    currentRow = row;
    frame = 0;
    lastFrameTime = 0;
    drawFrame();
  }
}

function setState(s: State) {
  appStateRow = ROW[s] ?? ROW.idle;
  if (!isDragging) setRow(appStateRow);
}

// --- Drag with directional animation ---
const win = getCurrentWindow();

let dragStartX = 0;
let dragLastX = 0;
let dragDirTimer: ReturnType<typeof setTimeout> | null = null;

// Remove CSS drag region so we can handle it manually
(canvas.style as any).webkitAppRegion = "no-drag";
const petArea = document.getElementById("pet-area")!;
(petArea.style as any).webkitAppRegion = "no-drag";

canvas.addEventListener("mousedown", async (ev) => {
  if (ev.button !== 0) return;
  isDragging = true;
  dragLastX = ev.screenX;
  setRow(ROW.drag_right);

  // Use pointer capture so we keep getting pointermove even after startDragging
  canvas.setPointerCapture(ev.pointerId);

  await win.startDragging();

  // startDragging resolves immediately on Windows (fires WM_NCLBUTTONDOWN)
  // mousemove/mouseup may not fire after that — use a fallback timer
  if (dragDirTimer) clearTimeout(dragDirTimer);
  dragDirTimer = setTimeout(() => {
    isDragging = false;
    setRow(appStateRow);
  }, 2000);
});

canvas.addEventListener("pointermove", (ev) => {
  if (!isDragging) return;
  const dx = ev.screenX - dragLastX;
  dragLastX = ev.screenX;
  if (Math.abs(dx) > 2) {
    setRow(dx > 0 ? ROW.drag_right : ROW.drag_left);
  }
});

canvas.addEventListener("pointerup", () => {
  if (!isDragging) return;
  isDragging = false;
  if (dragDirTimer) { clearTimeout(dragDirTimer); dragDirTimer = null; }
  setRow(appStateRow);
});

// --- Bubbles ---
const bubblesEl = document.getElementById("bubbles")!;
let openBubbles = 0;
let currentSnap: Snapshot = { main_state: "idle", sessions: [] };

function checkIdleFallback() {
  if (openBubbles > 0) return;
  const hasActive = currentSnap.sessions.some(s => s.state === "working");
  if (!hasActive) setState("idle");
}

function showBubble(project: string, msg: string, kind: "done" | "waiting" | "failed" = "done") {
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
  if (kind === "waiting") label.textContent = `👆 ${project} 需要你选择`;
  else if (kind === "failed") label.textContent = `❌ ${project}`;
  else label.textContent = `✅ ${project}`;

  const text = document.createElement("div");
  text.className = "bubble-text";
  text.textContent = msg || (kind === "waiting" ? "需要你操作" : "回复完毕");

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
  if (ch.to === "done" || ch.to === "failed" || ch.to === "waiting") {
    const sess = e.payload.sessions.find(s => s.id === ch.id);
    const project = sess?.project ?? "?";
    const msg = ch.msg || sess?.last_msg || "";
    const preview = msg.length > 200 ? msg.slice(0, 200) + "…" : msg;
    showBubble(project, preview, ch.to as "done" | "waiting" | "failed");
  }
});

// Right-click → panel
canvas.addEventListener("contextmenu", async (ev) => {
  ev.preventDefault();
  ev.stopPropagation();
  const panel = await WebviewWindow.getByLabel("panel");
  if (!panel) return;
  const pos = await win.outerPosition();
  await panel.setPosition(new LogicalPosition(pos.x - 320 - 8, pos.y));
  await panel.show();
  await panel.setFocus();
});
