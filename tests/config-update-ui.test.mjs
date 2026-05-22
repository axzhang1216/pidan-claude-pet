import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = process.cwd();
const html = readFileSync(join(repoRoot, "config.html"), "utf8");
const script = readFileSync(join(repoRoot, "src", "config.ts"), "utf8");

assert.match(html, /id="check-update"/, "missing check-update button");
assert.match(script, /invoke(?:<[^>]+>)?\("check_update"/, "missing check_update invoke");

console.log("config update UI checks passed");
