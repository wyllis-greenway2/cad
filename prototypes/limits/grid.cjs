// Prototype (thrown away, `in_905`): how big a model of many bodies the built app takes, and how it fails.
// Run (from app/, after `npm run build` and `npx vite preview --port 5198`): COUNTS=100,400,1000 node ../prototypes/limits/grid.cjs
// The 12 by 12 grid of posts (test/fixtures/grid-12x12.cad.json: one push, one linear pattern) with the pattern's counts changed.
const { chromium } = require("playwright");
const fs = require("fs");
const base = JSON.parse(fs.readFileSync("test/fixtures/grid-12x12.cad.json", "utf8"));
const make = (nx, ny, layers = 1) => {
  const d = JSON.parse(JSON.stringify(base));
  const fix = (c) => { if (c.type === "batch") c.commands.forEach(fix); else if (c.type === "addStep" && c.step.type === "pattern") { c.step.params.nx = nx; c.step.params.ny = ny; } };
  d.commands.forEach(fix);
  // more layers: more pattern steps of the same single post, each a layer higher (a pattern is at most 200 copies, `that is more than 200 copies`)
  const find = (c) => (c.type === "batch" ? c.commands.map(find).find(Boolean) : c.type === "addStep" && c.step.type === "pattern" ? c : null);
  const pat = d.commands.map(find).find(Boolean);
  for (let k = 1; k < layers; k++) { const copy = JSON.parse(JSON.stringify(pat)); copy.step.id = "s_" + (200 + k); copy.step.params.dz = 6 * (k + 1) * 3; d.commands.push(copy); }
  d.cursor = d.commands.length;
  return JSON.stringify(d);
};
const LAYERS = Number(process.env.LAYERS ?? 1);
const SHAPES = (process.env.COUNTS ?? "10,100,400,1000").split(",").map(Number).map((n) => { const nx = Math.min(n, Math.ceil(Math.sqrt(n))), ny = Math.ceil(n / nx); return [nx, ny]; });
(async () => {
  const browser = await chromium.launch();
  for (const [nx, ny] of SHAPES) {
    const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
    const errs = []; const workers = [];
    page.on("pageerror", (e) => errs.push("PAGEERR " + e.message.slice(0, 100)));
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errs.push(m.type() + ": " + m.text().slice(0, 120)); });
    page.on("worker", () => workers.push(Date.now()));
    page.on("crash", () => errs.push("PAGE CRASHED"));
    await page.goto("http://localhost:5198/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__cad, null, { timeout: 120000 });
    await page.waitForTimeout(1500);
    const txt = make(nx, ny, LAYERS);
    let r;
    try {
      r = await page.evaluate(async (txt) => {
        const t0 = performance.now();
        const ok = window.__cad.load(txt);
        const syncMs = Math.round(performance.now() - t0);
        let answered = null;
        let k = null;
        while (performance.now() - t0 < 120000) {
          await new Promise((r) => setTimeout(r, 100));
          k = window.__cad.state.session.outcome.kernel;
          if (k && !k.stale && k.ops.length > 0) { answered = Math.round(performance.now() - t0); break; }
        }
        k = window.__cad.state.session.outcome.kernel;
        const errors = Object.entries(window.__cad.state.session.outcome.errors ?? {}).map(([id, e]) => id + ": " + String(e).slice(0, 90));
        const bodies = Object.values(window.__cad.state.session.history.scene.parts).filter((p) => p.kind === "body").length;
        const tris = k && k.mesh ? Math.round(k.mesh.triangles.length / 3) : null;
        const mem = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
        const msg = window.__cad.state.session.message;
        return { ok, syncMs, answered, stale: !!(k && k.stale), kernelMs: Math.round(k?.totalMs ?? 0), bodies, tris, errors: errors.slice(0, 3), message: msg, jsHeapMB: mem };
      }, txt);
    } catch (e) { r = { threw: String(e).slice(0, 120) }; }
    console.log(`${nx}x${ny} x ${LAYERS} layers = ${nx * ny * LAYERS} bodies`.padEnd(22), JSON.stringify(r), "| workers started", workers.length, errs.length ? "| " + errs.slice(0, 4).join(" ; ") : "");
    await page.close();
  }
  await browser.close();
})();
