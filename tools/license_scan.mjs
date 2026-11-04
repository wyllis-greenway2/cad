#!/usr/bin/env node
// Lists the license of every package under a node_modules directory (including nested ones),
// grouped by license, and exits 1 if any GPL/AGPL/unknown license is found.
// Usage: node tools/license_scan.mjs prototypes/kernel-slice/node_modules
import fs from "node:fs";
import path from "node:path";

const root = process.argv[2];
if (!root) {
  console.error("usage: node tools/license_scan.mjs <node_modules dir>");
  process.exit(2);
}
const seen = new Map();
function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    const p = path.join(dir, name);
    if (name.startsWith("@")) {
      walk(p);
      continue;
    }
    const pj = path.join(p, "package.json");
    if (!fs.existsSync(pj)) continue;
    const j = JSON.parse(fs.readFileSync(pj, "utf8"));
    let l = j.license ?? (j.licenses ? j.licenses.map((x) => x.type).join(" OR ") : "UNKNOWN");
    if (typeof l === "object") l = l.type;
    seen.set(`${j.name}@${j.version}`, l);
    const nested = path.join(p, "node_modules");
    if (fs.existsSync(nested)) walk(nested);
  }
}
walk(root);
const byLicense = {};
for (const [pkg, l] of seen) (byLicense[l] ??= []).push(pkg);
let bad = false;
for (const [l, pkgs] of Object.entries(byLicense).sort()) {
  const flagged = /(^|[^L])GPL|AGPL|UNKNOWN|UNLICENSED/.test(l);
  if (flagged) bad = true;
  console.log(`${flagged ? "!! " : "   "}${l}  (${pkgs.length})${pkgs.length <= 6 ? "  " + pkgs.join(", ") : ""}`);
}
if (bad) console.error("\nFlagged licenses found: review before shipping (see docs/licenses.md).");
process.exit(bad ? 1 : 0);
