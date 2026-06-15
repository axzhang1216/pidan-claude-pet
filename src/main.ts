import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
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
  drag_right: 1,
  drag_left: 2,
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
const FPS = 10;
const FRAME_MS = 1000 / FPS;
let lastFrameTime = 0;
let animStarted = false;

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

sheet.onload = () => {
  drawFrame();
  if (!animStarted) {
    animStarted = true;
    requestAnimationFrame(animate);
  }
};

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

let dragLastX = 0;
let dragLastY = 0;
let dragWinX = 0;
let dragWinY = 0;

// Remove CSS drag region so we can handle it manually
(canvas.style as any).webkitAppRegion = "no-drag";
const petArea = document.getElementById("pet-area")!;
(petArea.style as any).webkitAppRegion = "no-drag";

canvas.addEventListener("pointerdown", async (ev) => {
  if (ev.button !== 0) return;
  isDragging = true;
  dragLastX = ev.screenX;
  dragLastY = ev.screenY;

  // Get current window position for manual drag
  try {
    const pos = await win.outerPosition();
    dragWinX = pos.x;
    dragWinY = pos.y;
  } catch { /* ignore */ }

  setRow(ROW.drag_right);
  canvas.setPointerCapture(ev.pointerId);
});

canvas.addEventListener("pointermove", (ev) => {
  if (!isDragging) return;
  const dx = ev.screenX - dragLastX;
  const dy = ev.screenY - dragLastY;
  dragLastX = ev.screenX;
  dragLastY = ev.screenY;
  dragWinX += dx;
  dragWinY += dy;
  win.setPosition(new PhysicalPosition(dragWinX, dragWinY));
  if (Math.abs(dx) > 2) {
    setRow(dx > 0 ? ROW.drag_right : ROW.drag_left);
  }
});

canvas.addEventListener("pointerup", () => {
  if (!isDragging) return;
  isDragging = false;
  setRow(appStateRow);
});

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

function clearAllBubbles() {
  const bubbles = bubblesEl.querySelectorAll(".bubble") as NodeListOf<HTMLDivElement>;
  bubbles.forEach((el) => {
    el.classList.add("bubble--dismissing");
    el.addEventListener("animationend", () => {
      el.remove();
      openBubbles = Math.max(0, openBubbles - 1);
      checkIdleFallback();
    }, { once: true });
  });
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

// --- Context menu ---
const ctxMenu = document.getElementById("ctx-menu")!;
let ctxVisible = false;

function showCtx() {
  ctxMenu.style.display = "block";
  ctxVisible = true;
}
function hideCtx() {
  ctxMenu.style.display = "none";
  ctxVisible = false;
}

// Right-click on pet → show context menu
canvas.addEventListener("contextmenu", (ev) => {
  ev.preventDefault();
  ev.stopPropagation();
  showCtx();
});

// Click anywhere outside menu → close it
document.addEventListener("mousedown", (ev) => {
  if (ctxVisible && !ctxMenu.contains(ev.target as Node)) {
    hideCtx();
  }
});

// Menu item actions
ctxMenu.addEventListener("click", async (ev) => {
  const target = ev.target as HTMLElement;
  if (!target.classList.contains("ctx-item")) return;
  const action = target.dataset.action;
  hideCtx();
  if (action === "clear") {
    clearAllBubbles();
  } else if (action === "config") {
    let w = await WebviewWindow.getByLabel("config");
    if (!w) {
      w = new WebviewWindow("config", {
        url: "config.html",
        title: "皮蛋配置",
        width: 360,
        height: 260,
        resizable: false,
        visible: true,
      });
    } else {
      await w.show();
      await w.setFocus();
    }
  } else if (action === "update") {
    target.textContent = "检查中…";
    showCtx();
    try {
      const resp = await fetch("https://api.github.com/repos/axzhang1216/pidan-claude-pet/releases/latest");
      if (!resp.ok) throw new Error(String(resp.status));
      const data = await resp.json();
      const tag: string = data.tag_name ?? "";
      const current = await (window as any).__TAURI__?.app?.getVersion() ?? "0.1.4";
      if (tag && tag !== `v${current}`) {
        const url: string = data.html_url ?? "";
        showBubble("皮蛋", `发现新版本 ${tag}，前往 GitHub 下载`, "done");
        if (url) await openUrl(url);
      } else {
        showBubble("皮蛋", "当前已是最新版本", "done");
      }
    } catch {
      showBubble("皮蛋", "检查更新失败，请稍后重试", "failed");
    }
    target.textContent = "检查更新";
  } else if (action === "quit") {
    await invoke("quit_app");
  }
});
