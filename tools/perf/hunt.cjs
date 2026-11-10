const FIXTURES = process.env.FIXTURES || require('path').join(__dirname, '../../app/test/fixtures');
// usage: node hunt.cjs fixture.cad.json
const { chromium } = require('playwright');
const fs = require('fs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const file = process.argv[2];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 687 }, deviceScaleFactor: 1 });
  const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto('' + (process.env.URL || 'http://localhost:5199/') + ''); await sleep(2500);
  await p.evaluate((t) => window.__cad.load(t), fs.readFileSync(FIXTURES + '/' + file, 'utf8')); await sleep(3000);
  const cd = await p.context().newCDPSession(p); await cd.send('Profiler.enable'); await cd.send('Profiler.setSamplingInterval', { interval: 400 });
  const out = [];
  const D = (e) => p.evaluate((e) => { const t = performance.now(); window.__cad.dispatch(e); return performance.now() - t; }, e);
  async function scenario(name, fn) {
    await cd.send('Profiler.start'); const t0 = Date.now();
    const dispatchMs = []; await fn((e) => D(e).then((ms) => dispatchMs.push(ms)));
    const { profile } = await cd.send('Profiler.stop');
    const self = new Map(); const byId = new Map(profile.nodes.map((n) => [n.id, n])); const dt = profile.timeDeltas;
    profile.samples.forEach((id, i) => { const n = byId.get(id); if (n.callFrame.functionName === '(program)' || n.callFrame.functionName === '(idle)') return; const k = n.callFrame.functionName + ' ' + n.callFrame.url.split('/').slice(-2).join('/').split('?')[0] + ':' + n.callFrame.lineNumber; self.set(k, (self.get(k) || 0) + dt[i]); });
    const s = await p.evaluate(() => window.__cad.snapshot()); const t = s.timing;
    const all = t['frame: all'];
    const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => (v / 1000).toFixed(0) + 'ms ' + k).join(' ; ');
    const dmax = dispatchMs.length ? Math.max(...dispatchMs).toFixed(0) : '-'; const davg = dispatchMs.length ? (dispatchMs.reduce((a, b) => a + b, 0) / dispatchMs.length).toFixed(1) : '-';
    console.log(`${name.padEnd(34)} frame avg ${String(all.avgMs).padStart(6)} p95 ${String(all.p95Ms).padStart(6)} | dispatch avg ${davg} max ${dmax} | ${top}`);
  }
  const orbit = async (d, n = 50) => { for (let i = 0; i < n; i++) { await d({ type: 'orbit', dx: 3, dy: 1, x: 600 + i, y: 300 }); await sleep(16); } };
  const hoverSweep = async (d, n = 80) => { for (let i = 0; i < n; i++) { await d({ type: 'hover', x: 200 + i * 10, y: 250 + (i % 9) * 25 }); await sleep(12); } };
  await scenario('orbit (nothing selected)', async (d) => orbit(d));
  await scenario('hover sweep', async (d) => hoverSweep(d));
  await scenario('zoom', async (d) => { for (let i = 0; i < 50; i++) { await d({ type: 'zoom', factor: i % 2 ? 1.05 : 0.95, x: 640, y: 340 }); await sleep(16); } });
  await scenario('pan', async (d) => { for (let i = 0; i < 50; i++) { await d({ type: 'pan', dx: 4, dy: 2 }); await sleep(16); } });
  // select the body (triple click on it) and each op
  await p.evaluate(() => window.__cad.dispatch({ type: 'home' })); await sleep(800);
  const c = await p.evaluate(() => { const sc = window.__cad.state.session.history.scene; const k = Object.values(sc.parts).find((q) => q.kind === 'body'); return k ? window.__cad.project(sc.parts[k.ref] && [20, 25, 1.5]) : null; });
  if (c) {
    await p.mouse.click(c[0], c[1], { clickCount: 3 }); await sleep(600);
    console.log('selection', JSON.stringify(await p.evaluate(() => window.__cad.state.session.click.selection)));
    await scenario('orbit, body selected', async (d) => orbit(d));
    for (const op of ['op:move', 'op:rotate', 'op:scale', 'op:linear', 'op:circular', 'op:copy']) {
      await p.evaluate(() => window.__cad.dispatch({ type: 'escape' })); await sleep(200);
      await p.mouse.click(c[0], c[1], { clickCount: 3 }); await sleep(400);
      await p.evaluate((id) => window.__cad.dispatch({ type: 'runAction', id }), op); await sleep(800);
      await scenario(op + ' open: orbit', async (d) => orbit(d, 40));
    }
    await p.evaluate(() => window.__cad.dispatch({ type: 'escape' })); await sleep(300);
  }
  console.log('errors', errs); await b.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
