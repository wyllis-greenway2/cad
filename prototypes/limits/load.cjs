// Prototype (thrown away, `in_992`): load a saved model of many bodies in the built app and see how it answers or fails.
// Run (from app/, after `npm run build` and `npx vite preview --port 5198`): node ../prototypes/limits/load.cjs /tmp/boxes-100.cad.json ...
const { chromium } = require("playwright");
const fs = require("fs");
(async () => {
  const browser = await chromium.launch();
  for (const file of process.argv.slice(2)) {
    const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
    const errs = []; let workers = 0, crashed = false;
    page.on("pageerror", (e) => errs.push("PAGEERR " + e.message.slice(0, 100)));
    page.on("console", (m) => { const t = m.text(); if (m.type() === "error" || (m.type() === "warning" && !/GL Driver|WebGL/.test(t))) errs.push(m.type() + ": " + t.slice(0, 140)); });
    page.on("worker", () => workers++);
    page.on("crash", () => { crashed = true; });
    await page.goto("http://localhost:5198/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__cad, null, { timeout: 120000 });
    await page.waitForTimeout(1500);
    const txt = fs.readFileSync(file, "utf8");
    let r;
    const t0 = Date.now();
    try {
      r = await page.evaluate(async (txt) => {
        const t0 = performance.now();
        const ok = window.__cad.load(txt);
        const syncMs = Math.round(performance.now() - t0);
        let answered = null, k = null;
        while (performance.now() - t0 < 150000) {
          await new Promise((r) => setTimeout(r, 200));
          k = window.__cad.state.session.outcome.kernel;
          if (k && !k.stale && k.ops.length > 0) { answered = Math.round(performance.now() - t0); break; }
        }
        k = window.__cad.state.session.outcome.kernel;
        const errors = Object.entries(window.__cad.state.session.outcome.errors ?? {}).map(([id, e]) => id + ": " + String(e).slice(0, 100));
        const bodies = Object.values(window.__cad.state.session.history.scene.parts).filter((p) => p.kind === "body").length;
        return { ok, syncMs, answered, stale: !!(k && k.stale), kernelMs: Math.round(k?.totalMs ?? 0), bodies, tris: k && k.mesh ? Math.round(k.mesh.triangles.length / 3) : null, errors: errors.slice(0, 3), errorCount: errors.length, message: window.__cad.state.session.message, jsHeapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null };
      }, txt);
    } catch (e) { r = { threw: String(e).slice(0, 80), afterMs: Date.now() - t0 }; }
    console.log(file.split("/").pop().padEnd(22), JSON.stringify(r), `| workers ${workers}`, crashed ? "| PAGE CRASHED" : "", errs.length ? "| " + errs.slice(0, 3).join(" ; ") : "");
    await page.close();
  }
  await browser.close();
})();
