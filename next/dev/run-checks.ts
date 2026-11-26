// Runs the dev checks (not tests, `in_1444`): every `dev/*-check.ts`, and with `--all` also the checks in a real page (`*-browser.ts`, one at a time: each starts its own dev server) and the drawing stress run.
// Each check is a process of its own (the kernel leaks memory, the page checks share one port). A check fails when it exits with an error or prints a line that starts with FAIL. The last line says how many passed.
//   node --experimental-strip-types dev/run-checks.ts [--all] [name ...]     (npm run checks, npm run checks:all; names: any part of a file name, e.g. helpers pick)
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL(".", import.meta.url)),
  args = process.argv.slice(2),
  all = args.includes("--all"),
  names = args.filter((a) => !a.startsWith("--"));
// the ones that take more than ten seconds on their own (random edits of the engine, the worker, the kernel's memory): only with --all or by name
const SLOW = new Set([
  "engine-check",
  "failure-check",
  "failure-worker-check",
  "mutation-check",
  "pull-equivalence-check",
  "pull-modes-check",
  "stress-found-check",
]);
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".ts"))
  .sort();
const wanted = files.filter((f) => {
  const base = f.replace(/\.ts$/, "");
  if (names.length)
    return names.some((n) => base.includes(n)) && (/-check$|-browser$/.test(base) || base === "stress-drawing");
  if (base.endsWith("-check")) return all || !SLOW.has(base);
  return all && (base.endsWith("-browser") || base === "stress-drawing");
});
let bad = 0;
const t0 = Date.now();
for (const f of wanted) {
  const s = Date.now(),
    r = spawnSync("node", ["--experimental-strip-types", dir + f], {
      encoding: "utf8",
      timeout: 600000,
      cwd: dir + "..",
    }),
    out = `${r.stdout}${r.stderr}`;
  const fails = out.split("\n").filter((l) => /^\s*FAIL/.test(l)),
    failed = r.status !== 0 || fails.length > 0;
  console.log(
    `${failed ? "FAIL" : "ok  "} ${f.replace(/\.ts$/, "").padEnd(28)} ${((Date.now() - s) / 1000).toFixed(0)}s`,
  );
  if (failed) {
    bad++;
    console.log(
      (fails.length
        ? fails
        : out
            .split("\n")
            .filter((l) => l.trim())
            .slice(-6)
      )
        .map((l) => `     ${l.slice(0, 200)}`)
        .join("\n"),
    );
  }
}
console.log(
  `${wanted.length - bad} of ${wanted.length} checks passed in ${((Date.now() - t0) / 1000).toFixed(0)}s${bad ? `; ${bad} failed` : ""}`,
);
process.exit(bad ? 1 : 0);
