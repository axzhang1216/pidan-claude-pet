import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = process.cwd();

test("pet spritesheet path is resolved through bundled assets", () => {
  const mainTs = readFileSync(join(repoRoot, "src", "main.ts"), "utf8");
  assert.ok(
    !mainTs.includes("/src/assets/pets/"),
    "src/main.ts still hardcodes a source-only pet asset path",
  );
});

test("tray config action recreates and focuses the config window", () => {
  const trayRs = readFileSync(join(repoRoot, "src-tauri", "src", "tray.rs"), "utf8");
  assert.ok(
    trayRs.includes("WebviewWindowBuilder"),
    "src-tauri/src/tray.rs should rebuild the config window when it no longer exists",
  );
  assert.ok(
    trayRs.includes("from_config"),
    "src-tauri/src/tray.rs should create the config window from tauri.conf.json metadata",
  );
  assert.ok(
    trayRs.includes("unminimize"),
    "src-tauri/src/tray.rs should unminimize the config window before focusing it",
  );
});
