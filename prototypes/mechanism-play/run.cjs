// Serves the repository and runs the spike in headless Chromium (software GL: the frame rate is not a real one; the matrix and rebuild costs are the JS side of it).   node run.cjs
const http = require("http"), fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "../..");
const types = { ".js": "text/javascript", ".json": "application/json", ".html": "text/html" };
const server = http.createServer((req, res) => { const f = path.join(root, decodeURIComponent(req.url.split("?")[0])); fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, { "content-type": types[path.extname(f)] ?? "application/octet-stream" }); res.end(d); } }); }).listen(0, async () => {
  const port = server.address().port;
  const b = await chromium.launch();
  const rows = [];
  for (const [copies, mode] of [[1, "matrix"], [10, "matrix"], [50, "matrix"], [1, "rebuild"], [10, "rebuild"]]) {
    const p = await b.newPage({ viewport: { width: 900, height: 600 } });
    const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
    await p.goto(`http://localhost:${port}/prototypes/mechanism-play/index.html?copies=${copies}&mode=${mode}&seconds=4`);
    await p.waitForFunction(() => window.__result, null, { timeout: 120000 });
    rows.push(await p.evaluate(() => window.__result));
    if (copies === 1 && mode === "matrix") await p.screenshot({ path: path.join(__dirname, "frame.png") });
    if (errs.length) console.log("errors", errs);
    await p.close();
  }
  console.table(rows.map((r) => ({ copies: r.copies, mode: r.mode, bodies: r.bodies, triangles: r.triangles, fps: r.fps, "matrix ms/frame": r.msMatrixPerFrame, "rebuild ms/frame": r.msRebuildPerFrame, "render call ms/frame": r.msRenderCallPerFrame })));
  fs.writeFileSync(path.join(__dirname, "results.json"), JSON.stringify(rows, null, 1));
  await b.close(); server.close();
});
