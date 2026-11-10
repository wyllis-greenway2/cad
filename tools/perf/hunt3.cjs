const FIXTURES = process.env.FIXTURES || require('path').join(__dirname, '../../app/test/fixtures');
// drags with real mouse events; usage: node hunt3.cjs fixture [unextrude]
const { chromium } = require('playwright');
const fs = require('fs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const file = process.argv[2], prep = process.argv[3] || '';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 687 }, deviceScaleFactor: 1 });
  const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto('' + (process.env.URL || 'http://localhost:5199/') + ''); await sleep(2500);
  await p.evaluate((t) => window.__cad.load(t), fs.readFileSync(FIXTURES + '/' + file, 'utf8')); await sleep(3000);
  if (prep === 'unextrude') { await p.evaluate(() => { const sc = window.__cad.state.session.history.scene; for (const st of sc.steps) window.__cad.dispatch({ type: 'panelRow', id: st.id, act: 'remove' }); }); await sleep(2000); }
  await p.evaluate(() => window.__cad.dispatch({ type: 'look', plane: 'Z' })); await sleep(900);
  const cd = await p.context().newCDPSession(p); await cd.send('Profiler.enable'); await cd.send('Profiler.setSamplingInterval', { interval: 400 });
  async function scenario(name, fn) {
    await cd.send('Profiler.start'); const t0 = Date.now(); await fn(); const wall = Date.now() - t0;
    const { profile } = await cd.send('Profiler.stop');
    const self = new Map(); const byId = new Map(profile.nodes.map((n) => [n.id, n])); const dt = profile.timeDeltas;
    profile.samples.forEach((id, i) => { const n = byId.get(id); if (/^\((program|idle)\)$/.test(n.callFrame.functionName)) return; const k = n.callFrame.functionName + ' ' + n.callFrame.url.split('/').slice(-2).join('/').split('?')[0] + ':' + n.callFrame.lineNumber; self.set(k, (self.get(k) || 0) + dt[i]); });
    const s = await p.evaluate(() => window.__cad.snapshot()); const all = s.timing['frame: all'];
    const tot = [...self.values()].reduce((a, b) => a + b, 0);
    const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => (v / 1000).toFixed(0) + 'ms ' + k).join(' ; ');
    console.log(`${name.padEnd(34)} wall ${wall}ms js ${(tot / 1000).toFixed(0)}ms frame avg ${all.avgMs} p95 ${all.p95Ms} | ${top}`);
  }
  const scr = (q) => p.evaluate((q) => window.__cad.project(q), q);
  const drag = async (from, to, steps = 20) => { await p.mouse.move(from[0], from[1]); await p.mouse.down(); for (let i = 1; i <= steps; i++) { await p.mouse.move(from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps); await sleep(8); } await p.mouse.up(); await sleep(400); };
  const corners = await p.evaluate(() => { const sc = window.__cad.state.session.history.scene; return Object.values(sc.parts).filter((q) => q.kind === 'corner' && q.origin === 'drawn' && !q.derived && q.movable).slice(0, 40).map((q) => q.at); });
  if (prep === 'unextrude') {
    for (let k = 0; k < 3; k++) { const c = await scr(corners[k * 7]); await scenario('drag a sketch corner #' + k, () => drag(c, [c[0] + 40, c[1] + 25])); }
    // drag a figure (face) with the move op: select the face & move
  }
  // body: select top face, pull
  if (prep !== 'unextrude') {
    const c = await scr([20, 25, 3]); await p.mouse.click(c[0], c[1]); await sleep(500);
    const g = await p.evaluate(() => { const f = window.__cad.frame(); return f.gizmo ? f.gizmo.handles.map((h) => h.points.map((q) => window.__cad.project(q))) : null; });
    if (g) { const [a, d] = g[0]; const mid = [(a[0] + d[0]) / 2, (a[1] + d[1]) / 2]; await scenario('pull the face arrow (preview)', () => drag(mid, [mid[0], mid[1] - 50])); await scenario('pull again', async () => { const g2 = await p.evaluate(() => window.__cad.frame().gizmo.handles.map((h) => h.points.map((q) => window.__cad.project(q)))); const [a2, d2] = g2[0]; const m2 = [(a2[0] + d2[0]) / 2, (a2[1] + d2[1]) / 2]; await drag(m2, [m2[0], m2[1] + 30]); }); }
  }
  console.log('errors', errs); await b.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
