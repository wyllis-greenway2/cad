// Prototype (thrown away, `in_999`): the project of many parts in the built app: when the boxes, the first parts and the last part are drawn.
// Run (from app/, after `npm run build` and `npx vite preview --port 5198`): node ../prototypes/progressive-load/browser.cjs /tmp/synth-300.cad.json
const { chromium } = require("playwright");
const fs = require("fs");
(async () => {
  const browser = await chromium.launch();
  for (const file of process.argv.slice(2)) {
    const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
    const errs = []; let crashed = false;
    page.on("pageerror", (e) => errs.push("PAGEERR " + e.message.slice(0, 120)));
    page.on("crash", () => { crashed = true; });
    await page.goto("http://localhost:5198/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__cad, null, { timeout: 120000 });
    await page.waitForTimeout(2000);
    const txt = fs.readFileSync(file, "utf8");
    let r;
    try {
      r = await page.evaluate(async (txt) => {
        const out = { marks: [] };
        const t0 = performance.now();
        const ok = window.__cad.load(txt);
        out.openSyncMs = Math.round(performance.now() - t0);
        let sawBoxes = null, first = null, ten = null, last = null, maxGap = 0, prev = performance.now(), ticks = 0;
        while (performance.now() - t0 < 150000) {
          await new Promise((r) => setTimeout(r, 25));
          const now = performance.now(); maxGap = Math.max(maxGap, now - prev); prev = now; ticks++;
          const k = window.__cad.state.session.outcome.kernel;
          const f = window.__cad.lastFrame;
          const boxes = f ? f.standIns.filter((d) => d.box).length : 0;
          const built = (k && k.bodies) ? k.bodies.length : 0;
          if (boxes > 0 && sawBoxes === null) sawBoxes = { ms: Math.round(now - t0), boxes };
          if (built >= 1 && first === null) first = Math.round(now - t0);
          if (built >= 10 && ten === null) ten = Math.round(now - t0);
          if (k && !k.stale && built > 0) { last = { ms: Math.round(now - t0), built }; break; }
        }
        out.boxesDrawn = sawBoxes; out.firstPartMs = first; out.tenPartsMs = ten; out.allPartsMs = last; out.longestGapBetween25msTicks = Math.round(maxGap);
        out.heapMB = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
        return out;
      }, txt);
    } catch (e) { r = { threw: String(e).slice(0, 100) }; }
    console.log(file.split("/").pop().padEnd(22), JSON.stringify(r), crashed ? "| PAGE CRASHED" : "", errs.length ? "| " + errs.slice(0, 3).join(" ; ") : "");
    await page.close();
  }
  await browser.close();
})();
