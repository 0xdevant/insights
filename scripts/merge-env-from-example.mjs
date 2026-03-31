#!/usr/bin/env node
/**
 * Merge .env.example into .env without overwriting existing variable assignments.
 *
 * - Reads keys already set in .env (uncommented lines like KEY=value).
 * - Appends lines from .env.example that define a KEY not yet present in .env.
 * - Backs up .env to .env.bak before writing (when --write).
 *
 * Usage:
 *   node scripts/merge-env-from-example.mjs           # preview appended block to stdout
 *   node scripts/merge-env-from-example.mjs --write   # append to .env + backup
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env");
const examplePath = join(root, ".env.example");

function extractAssignedKeys(content) {
  const keys = new Set();
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || !trimmed) continue;
    const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (m) keys.add(m[1]);
  }
  return keys;
}

/** KEY from `# FOO=bar` or `FOO=bar` */
function keyFromLine(line) {
  const m = line.trim().match(/^#?\s*([A-Za-z_][A-Za-z0-9_]*)=/);
  return m ? m[1] : null;
}

function collectMissingLines(exampleText, existingKeys) {
  const out = [];
  for (const line of exampleText.split("\n")) {
    const k = keyFromLine(line);
    if (!k) continue;
    if (existingKeys.has(k)) continue;
    out.push(line);
  }
  return out;
}

function main() {
  const write = process.argv.includes("--write");

  if (!existsSync(examplePath)) {
    console.error("Missing .env.example");
    process.exit(1);
  }
  if (!existsSync(envPath)) {
    console.error("Missing .env — create it first (e.g. cp .env.example .env)");
    process.exit(1);
  }

  const envContent = readFileSync(envPath, "utf8");
  const exampleContent = readFileSync(examplePath, "utf8");
  const keys = extractAssignedKeys(envContent);
  const missingLines = collectMissingLines(exampleContent, keys);

  const appendix = missingLines.join("\n").trimEnd();
  if (!appendix) {
    console.log("Nothing to merge — .env already covers every key from .env.example.");
    process.exit(0);
  }

  const block =
    "\n\n" +
    "# =============================================================================\n" +
    "# Appended from .env.example (keys not already set above). Edit as needed.\n" +
    "# =============================================================================\n" +
    appendix +
    "\n";

  if (!write) {
    console.log("--- Preview (would append to .env): ---\n");
    console.log(block);
    console.log("--- End preview. Run with --write to apply (creates .env.bak first). ---");
    process.exit(0);
  }

  copyFileSync(envPath, join(root, ".env.bak"));
  writeFileSync(envPath, envContent.replace(/\s*$/, "") + block, "utf8");
  console.log("Updated .env (backup: .env.bak)");
}

main();
