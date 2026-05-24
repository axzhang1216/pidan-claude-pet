import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalPosition } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import bruceSheetUrl from "./assets/pets/bruce/spritesheet.webp";
import pidanSheetUrl from "./assets/pets/pidan/spritesheet.webp";

// Spritesheet: 8 cols x 9 rows, cell 192x208px
// Row -> actual frame count (measured from alpha channel)
const CELL_W = 192;
const CELL_H = 208;
const ROW_FRAMES = [6, 8, 8, 4, 5, 8, 6, 6, 6]; // rows 0-8

// Row mapping
// 0:idle  1:running-right  2:running-left  3:waving
// 4:jumping  5:failed  6:waiting  7:running  8:review
const ROW: Record<string, number> = {
  idle: 0,
  working: 7,
  waiting: 6,
  done: 3,
  failed: 5,
};

type State = "working" | "waiting" | "done" | "failed" | "idle";

interface Session {
  id: string;
  project: string;
  state: State;
  title: string | null;
  last_msg: string;
  last_change: string;
}

interface StateChange {
  kind: "created" | "transitioned" | "removed";
  id?: string;
  from?: State;
  to?: State;
  msg?: string;
}

interface Snapshot {
  main_state: State;
  sessions: Session[];
  last_change?: StateChange;
}

// --- Canvas sprite player ---
// Display size: 192 * 0.6 = ~115px
const DISPLAY_SIZE = 115;
const canvas = document.getElementById("pet") as HTMLCanvasElement;
canvas.width = DISPLAY_SIZE;
canvas.height = DISPLAY_SIZE;
const ctx = canvas.getContext("2d")!;
ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = "high";

const sheet = new Image();
const skinSheets = {
  pidan: pidanSheetUrl,
  bruce: bruceSheetUrl,
} as const;

function loadSkin(skin: string) {
  const name = skin in skinSheets ? (skin as keyof typeof skinSheets) : "pidan";
  sheet.src = skinSheets[name];
}

let currentRow = ROW.idle;
let frame = 0;
const FPS = 8;
const FRAME_MS = 1000 / FPS;
let lastFrameTime = 0;
let animStarted = false;

function drawFrame() {
  ctx.clearRect(0, 0, DISPLAY_SIZE, DISPLAY_SIZE);
  if (!sheet.complete || !sheet.naturalWidth) return;
  const sx = frame * CELL_W;
  const sy = currentRow * CELL_H;
  // crop 192x192 from cell (drop bottom 16px ground), scale to display size
  ctx.drawImage(sheet, sx, sy, CELL_W, 192, 0, 0, DISPLAY_SIZE, DISPLAY_SIZE);
}

function animate(ts: number) {
  requestAnimationFrame(animate);
  if (ts - lastFrameTime < FRAME_MS) return;
  lastFrameTime = ts;
  frame = (frame + 1) % ROW_FRAMES[currentRow];
  drawFrame();
}

sheet.onload = () => {
  drawFrame();
  if (!animStarted) {
    animStarted = true;
    requestAnimationFrame(animate);
  }
};

function setState(s: State) {
  const row = ROW[s] ?? ROW.idle;
  if (row !== currentRow) {
    currentRow = row;
    frame = 0;
    lastFrameTime = 0;
    drawFrame();
  }
}

// Load initial skin from config
invoke<{ skin: string }>("get_config")
  .then((c) => loadSkin(c.skin))
  .catch(() => loadSkin("pidan"));

// Live skin switch without restart
listen<{ skin: string }>("pidan://skin-change", (e) => {
  loadSkin(e.payload.skin);
});

// --- Bubbles ---
const bubblesEl = document.getElementById("bubbles")!;
let openBubbles = 0;
let currentSnap: Snapshot = { main_state: "idle", sessions: [] };

function checkIdleFallback() {
  if (openBubbles > 0) return;
  const hasActive = currentSnap.sessions.some((s) => s.state === "working");
  if (!hasActive) setState("idle");
}

function showBubble(project: string, msg: string, kind: "done" | "waiting" | "failed" = "done") {
  const div = document.createElement("div");
  div.className = "bubble";
  if (kind === "waiting") div.classList.add("bubble--waiting");
  else div.classList.add("bubble--result");

  let dismissing = false;
  const dismissBubble = () => {
    if (dismissing) return;
    dismissing = true;
    div.classList.add("bubble--dismissing");
    div.addEventListener(
      "animationend",
      () => {
        div.remove();
        openBubbles = Math.max(0, openBubbles - 1);
        checkIdleFallback();
      },
      { once: true },
    );
  };

  const close = document.createElement("button");
  close.className = "bubble-close";
  close.type = "button";
  close.textContent = "✕";
  close.addEventListener("click", (e) => {
    e.stopPropagation();
    dismissBubble();
  });

  div.addEventListener("contextmenu", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    dismissBubble();
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
    const sess = e.payload.sessions.find((s) => s.id === ch.id);
    const project = sess?.project ?? "?";
    const msg = ch.msg || sess?.last_msg || "";
    const preview = msg.length > 200 ? `${msg.slice(0, 200)}...` : msg;
    const kind = ch.to as "done" | "waiting" | "failed";
    showBubble(project, preview, kind);
  }
});

// Right-click -> panel
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
