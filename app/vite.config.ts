// The page shows which build it is (in the menu), so you can tell at a glance whether the browser has the latest.
import { defineConfig } from "vite";
import type { Plugin } from "vite";
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
/**
 * Starts the kernel's thread at once (`in_903`): the built page gets a small script of its own, ahead of the app's two megabytes, that asks for the thread (which then fetches and compiles the kernel's 23 MB of WebAssembly while
 * the app is still being read). `kernel-async.ts` takes the thread from `window.__earlyKernel`. Only in a build: the bundler's own server has no such file name.
 */
const earlyKernel = (): Plugin => {
  let base = "/";
  return {
    name: "early-kernel",
    configResolved(c) { base = c.base; },
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        const file = Object.keys(ctx.bundle ?? {}).find((f) => /(^|\/)kernel-worker-[^/]*\.js$/.test(f));
        if (!file) return html;
        const url = `${base.endsWith("/") ? base : `${base}/`}${file}`;
        return html.replace("<head>", `<head>\n<script>try{window.__earlyKernel=new Worker(${JSON.stringify(url)},{type:"module"})}catch(e){}</script>`);
      },
    },
  };
};
export default defineConfig({
  plugins: [earlyKernel()],
  define: { __KERNEL__: JSON.stringify(kernelStamp()), __BUILD__: JSON.stringify(`${git("git rev-parse --short HEAD")} ${git("git log -1 --format=%cd --date=format:%m-%d_%H:%M")}`) },
});
