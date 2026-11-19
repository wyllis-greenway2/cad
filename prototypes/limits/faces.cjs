// Prototype (thrown away, `in_989`): how many faces and triangles the built app draws. Adds N worm wheels of 200 teeth (about 2600 faces, 58 thousand triangles each) and times the page's own work per frame.
// (A headless browser draws in software: the picture's own time here is not a graphics card's; the page's JavaScript per frame is.)
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  await page.goto("http://localhost:5198/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__cad, null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  const c = await page.context().newCDPSession(page);
  await c.send("Profiler.enable"); await c.send("Profiler.setSamplingInterval", { interval: 500 });
  for (let n = 1; n <= Number(process.env.N ?? 4); n++) {
    await page.evaluate(async (n) => {
      window.__cad.run({ type: "gear", id: "g_" + n, plane: "w/XY", at: [n * 120, 0, 0], spec: { teeth: 200, module: 1 + n * 0.04, wheel: { diameter: 24, starts: 1, width: 10 } } });
      const t0 = performance.now();
      while (performance.now() - t0 < 150000) { await new Promise((r) => setTimeout(r, 200)); const k = window.__cad.state.session.outcome.kernel; if (k && !k.stale && k.ops.length > 3 * 0 && Object.values(window.__cad.state.session.history.scene.parts).filter((p) => p.kind === "body").length >= n) break; }
    }, n);
    await c.send("Profiler.start");
    await page.waitForTimeout(3000);
    const { profile } = await c.send("Profiler.stop");
    const total = profile.samples.length;
    const idleId = profile.nodes.filter((x) => x.callFrame.functionName === "(idle)").map((x) => x.id);
    const js = profile.samples.filter((s) => !idleId.includes(s)).length;
    const info = await page.evaluate(() => { const k = window.__cad.state.session.outcome.kernel; const parts = Object.values(window.__cad.state.session.history.scene.parts); return { tris: Math.round((k.mesh?.triangles.length ?? 0) / 3), faces: (k.faces ?? []).length, edges: (k.edges ?? []).length, parts: parts.length, bodies: parts.filter((p) => p.kind === "body").length, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null, kernelMs: Math.round(k.totalMs ?? 0), errors: Object.values(window.__cad.state.session.outcome.errors ?? {}).slice(0, 2) }; });
    const frames = await page.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((res) => { const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); }); return n; });
    console.log(`${n} wheels`, JSON.stringify(info), `| busy ${Math.round(100 * js / Math.max(1, total))}% of the main thread over 3 s, ${frames} frames in 3 s idle`);
  }
  await browser.close();
})();
