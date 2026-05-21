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
