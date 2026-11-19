// Prototype (thrown away, `in_988`): how much of the first model's delay does a warm-up of the kernel remove?
// Run (from app/, after `npm run build` and `npx vite preview --port 5198`): node ../prototypes/kernel-warmup/run.cjs
// For each target model, in a fresh page: (A) load it as soon as the kernel is up; (B) first load the warm-up models one after another (each waited for), then the target.
const { chromium } = require("playwright");
const fs = require("fs");
const read = (n) => fs.readFileSync(`test/fixtures/${n}.cad.json`, "utf8");
const WARM = (process.env.WARM ?? "rod-fillet,lofts-and-block-in_446,sweep-chamfer-in_653").split(",");
const TARGETS = (process.env.TARGETS ?? "hollow-pushed,group-then-new-body-in_426,chamfer-continuation-in_504,gear-teeth").split(",");
const answer = async (page, txt) => page.evaluate(async (txt) => {
  const t = performance.now(); window.__cad.load(txt);
  await new Promise((r) => setTimeout(r, 30));
  while (performance.now() - t < 90000) { const k = window.__cad.state.session.outcome.kernel; if (k && !k.stale && k.ops.length > 0) break; await new Promise((r) => setTimeout(r, 20)); }
  const k = window.__cad.state.session.outcome.kernel;
  return { ms: Math.round(performance.now() - t), kernelMs: Math.round(k.totalMs ?? 0), trip: k.trip ? { wait: Math.round(k.trip.waitMs), trip: Math.round(k.trip.tripMs) } : null };
}, txt);
(async () => {
  const browser = await chromium.launch();
  for (const target of TARGETS) {
    const out = {};
    for (const mode of ["cold", "warm"]) {
      const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
      await page.goto("http://localhost:5198/", { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => window.__cad, null, { timeout: 120000 });
      // (the kernel is up when the app is: the app waits for it before it makes its session)
      if (mode === "warm") { let t = 0; for (const w of WARM) t += (await answer(page, read(w))).ms; out.warmupMs = t; }
      out[mode] = await answer(page, read(target));
      await page.close();
    }
    console.log(target.padEnd(30), "cold", JSON.stringify(out.cold), "| warm-up", out.warmupMs, "ms then", JSON.stringify(out.warm));
  }
  await browser.close();
})();
