// Prototype (thrown away, `in_989`): what the person sees when a step is more than the kernel can do in 60 s, after a model that worked.
const { chromium } = require("playwright");
const fs = require("fs");
const base = JSON.parse(fs.readFileSync("test/fixtures/grid-12x12.cad.json", "utf8"));
const make = (nx, ny, layers) => {
  const d = JSON.parse(JSON.stringify(base));
  const fix = (c) => { if (c.type === "batch") c.commands.forEach(fix); else if (c.type === "addStep" && c.step.type === "pattern") { c.step.params.nx = nx; c.step.params.ny = ny; } };
  d.commands.forEach(fix);
  const find = (c) => (c.type === "batch" ? c.commands.map(find).find(Boolean) : c.type === "addStep" && c.step.type === "pattern" ? c : null);
  const pat = d.commands.map(find).find(Boolean);
  for (let k = 1; k < layers; k++) { const copy = JSON.parse(JSON.stringify(pat)); copy.step.id = "s_" + (200 + k); copy.step.params.dz = 18 * (k + 1); d.commands.push(copy); }
  d.cursor = d.commands.length;
  return d;
};
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  const errs = []; let workers = 0;
  page.on("worker", () => workers++);
  page.on("console", (m) => { const t = m.text(); if ((m.type() === "error" || m.type() === "warning") && !/GL Driver|WebGL/.test(t)) errs.push(t.slice(0, 160)); });
  await page.goto("http://localhost:5198/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__cad, null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  const good = JSON.stringify(make(8, 8, 3)); // (484 bodies, 21 s)
  const snap = () => page.evaluate(() => { const s = window.__cad.state.session; const k = s.outcome.kernel; return { stale: !!k?.stale, bodies: Object.values(s.history.scene.parts).filter((p) => p.kind === "body").length, tris: Math.round((k?.mesh?.triangles.length ?? 0) / 3), errors: Object.entries(s.outcome.errors ?? {}).map(([i, e]) => i + ": " + String(e).slice(0, 110)), message: s.message, steps: s.history.scene.steps.length, cursor: s.history.cursor }; });
  const wait = (ms) => page.evaluate(async (ms) => { const t0 = performance.now(); await new Promise((r) => setTimeout(r, 300)); while (performance.now() - t0 < ms) { const k = window.__cad.state.session.outcome.kernel; if (k && !k.stale) return Math.round(performance.now() - t0); await new Promise((r) => setTimeout(r, 200)); } return null; }, ms);
  await page.evaluate((txt) => window.__cad.load(txt), good);
  console.log("good model answered after", await wait(100000), "ms:", JSON.stringify(await snap()));
  // one more layer of the pattern: past the limit
  await page.evaluate(() => { const s = window.__cad.state.session.history.scene; window.__cad.run({ type: "addStep", step: { id: "s_900", type: "pattern", parts: ["b/body/o"], params: { mode: "linear", nx: 14, dx: 13, ny: 14, dy: 10, nz: 1, dz: 90 } } }); });
  console.log("a step the kernel cannot finish: right after:", JSON.stringify(await snap()));
  const tStart = Date.now();
  let t;
  try { t = await wait(130000); } catch (e) { console.log("THE PAGE CRASHED after", Math.round((Date.now() - tStart) / 1000), "s:", String(e.message).slice(0, 60)); await browser.close(); return; }
  console.log("after", t, "ms:", JSON.stringify(await snap()), "| workers", workers);
  await page.waitForTimeout(2000);
  console.log("2 s later:", JSON.stringify(await snap()), errs.length ? "| console: " + errs.slice(0, 3).join(" ; ") : "");
  await browser.close();
})();
