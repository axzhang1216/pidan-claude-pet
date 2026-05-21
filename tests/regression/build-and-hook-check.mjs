import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

const hookPath = path.join(repoRoot, "hooks", "pidan-hook.ps1");
const hookBytes = fs.readFileSync(hookPath);
assert.equal(hookBytes[0], 0xef, "hook file should start with UTF-8 BOM");
assert.equal(hookBytes[1], 0xbb, "hook file should start with UTF-8 BOM");
assert.equal(hookBytes[2], 0xbf, "hook file should start with UTF-8 BOM");
assert.equal(
  hookBytes.includes(Buffer.from([0xe2, 0x80, 0xa6])),
  false,
  "hook file should avoid Unicode ellipsis for Windows PowerShell compatibility",
);

const mainSource = fs.readFileSync(path.join(repoRoot, "src", "main.ts"), "utf8");
assert.equal(
  mainSource.includes("const SHEET_COLS = 8;"),
  false,
  "main.ts should not keep an unused SHEET_COLS constant",
);
assert.equal(
  mainSource.includes('sheet.src = "/src/assets/pets/bruce/spritesheet.webp";'),
  false,
  "main.ts should not hardcode a /src asset URL for the spritesheet",
);

console.log("regression checks passed");
