// Prototype (thrown away, `in_1005`): the boxes of a project drawn before its commands are replayed. When the boxes are set and painted, when the replay is done, when the last part is made.
// Run (from app/, after `npm run build` and `npx vite preview --port 5198`): node ../prototypes/progressive-load/opening.cjs /tmp/synth-300.cad.json
const { chromium } = require("playwright");
const fs = require("fs");
(async () => {
  const browser = await chromium.launch();
  for (const file of process.argv.slice(2)) {
    const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message.slice(0, 120)));
    await page.goto("http://localhost:5198/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__cad, null, { timeout: 120000 });
    await page.waitForTimeout(2000);
    const txt = fs.readFileSync(file, "utf8");
    const r = await page.evaluate(async (txt) => {
      const out = {};
      const t0 = performance.now();
      let boxesAt = null, paintedAt = null, replayDoneAt = null, lastAt = null;
      const watch = setInterval(() => { if (boxesAt === null && window.__cad.opening > 0) { boxesAt = Math.round(performance.now() - t0); requestAnimationFrame(() => requestAnimationFrame(() => { paintedAt = Math.round(performance.now() - t0); })); } }, 1);
      const p = window.__cad.openText(txt);
      await p;
      replayDoneAt = Math.round(performance.now() - t0);
      clearInterval(watch);
      while (performance.now() - t0 < 150000) { await new Promise((r) => setTimeout(r, 50)); const k = window.__cad.state.session.outcome.kernel; if (k && !k.stale && k.bodies && k.bodies.length > 0) { lastAt = Math.round(performance.now() - t0); out.built = k.bodies.length; break; } }
      Object.assign(out, { boxesSetMs: boxesAt, boxesPaintedMs: paintedAt, replayDoneMs: replayDoneAt, allPartsMs: lastAt, openingAfter: window.__cad.opening });
      return out;
    }, txt);
    console.log(file.split("/").pop().padEnd(22), JSON.stringify(r), errs.length ? "| " + errs.join(" ; ") : "");
    await page.close();
  }
  await browser.close();
})();
