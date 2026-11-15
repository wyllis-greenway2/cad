// The page shows which build it is (in the menu), so you can tell at a glance whether the browser has the latest.
import { defineConfig } from "vite";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";

const git = (cmd: string): string => {
  try { return execSync(cmd, { encoding: "utf8" }).trim(); } catch { return "unknown"; }
};
/** A stamp of the kernel: its source files and the libraries it uses. A kept answer of the kernel is looked for under it, so that a change of any of them never finds an old answer (`dec_description_cache`). */
const kernelStamp = (): string => {
  try {
    const h = createHash("sha256");
    const dir = "src/compiler/kernel";
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`])).sort();
    for (const f of walk(dir)) h.update(f).update(readFileSync(f));
    for (const f of ["src/kernel-worker.ts", "src/kernel-async.ts"]) h.update(readFileSync(f));
    for (const lib of ["replicad", "replicad-opencascadejs"]) h.update(lib).update(JSON.parse(readFileSync(`node_modules/${lib}/package.json`, "utf8")).version);
    return h.digest("hex").slice(0, 16);
  } catch { return "unstamped"; }
};
export default defineConfig({
  define: { __KERNEL__: JSON.stringify(kernelStamp()), __BUILD__: JSON.stringify(`${git("git rev-parse --short HEAD")} ${git("git log -1 --format=%cd --date=format:%m-%d_%H:%M")}`) },
});
