const { chromium } = require('playwright'); const fs = require('fs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 687 }, deviceScaleFactor: 1 });
  const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto('http://localhost:5199/'); await sleep(2500);
  console.log('load', await p.evaluate((t) => window.__cad.load(t), fs.readFileSync('/tmp/claude-0/prof/gear.json', 'utf8'))); await sleep(3000);
  const cd = await p.context().newCDPSession(p); await cd.send('Profiler.enable'); await cd.send('Profiler.setSamplingInterval', { interval: 300 });
  const orbit = async () => { await p.mouse.move(640, 400); await p.mouse.down(); for (let i = 0; i < 40; i++) await p.mouse.move(640 + i * 4, 400 + i * 2); await p.mouse.up(); };
  const hover = async () => { for (let i = 0; i < 60; i++) { await p.mouse.move(500 + i * 4, 300 + (i % 7)); await sleep(16); } };
  async function scenario(name, fn) {
    await p.evaluate(() => window.__cad.snapshot()); // warm
    await cd.send('Profiler.start'); const t0 = Date.now(); await fn(); const wall = Date.now() - t0;
    const { profile } = await cd.send('Profiler.stop');
    const self = new Map(); const byId = new Map(profile.nodes.map((n) => [n.id, n])); const dt = profile.timeDeltas;
    profile.samples.forEach((id, i) => { const n = byId.get(id); if (/^\((program|idle)\)$/.test(n.callFrame.functionName)) return; const k = n.callFrame.functionName + ' ' + n.callFrame.url.split('/').slice(-1)[0].split('?')[0] + ':' + n.callFrame.lineNumber; self.set(k, (self.get(k) || 0) + dt[i]); });
    const tot = [...self.values()].reduce((a, c) => a + c, 0);
    const top = [...self.entries()].sort((a, c) => c[1] - a[1]).slice(0, 6).map(([k, v]) => (v / 1000).toFixed(0) + 'ms ' + k).join('\n      ');
    const s = await p.evaluate(() => window.__cad.snapshot().timing);
    const g = (k) => s[k] ? `avg ${s[k].avgMs} p95 ${s[k].p95Ms}` : '-';
    console.log(`${name}: wall ${wall}ms js ${(tot / 1000).toFixed(0)}ms | build ${g('frame: build what is drawn')} | draw ${g('frame: draw (render)')} | all ${g('frame: all')}\n      ${top}`);
  }
  const ref = await p.evaluate(() => Object.values(window.__cad.state.session.history.scene.parts).find((q) => q.kind === 'face' && q.origin === 'drawn' && q.loop)?.ref);
  console.log('face', ref);
  await p.evaluate(() => window.__cad.select([])); await sleep(500);
  await scenario('NOT selected: orbit', orbit); await scenario('NOT selected: hover', hover);
  await p.evaluate((r) => window.__cad.select([r]), ref); await sleep(1500);
  await scenario('SELECTED: orbit', orbit); await scenario('SELECTED: hover', hover);
  const lines = await p.evaluate(() => Object.values(window.__cad.state.session.history.scene.parts).filter((q) => q.origin === 'drawn' && (q.kind === 'line' || q.kind==='corner')).map((q) => q.ref));
  console.log('lines+corners', lines.length);
  await p.evaluate((r) => window.__cad.select(r), lines); await sleep(1500);
  await scenario('ALL LINES SELECTED: orbit', orbit); await scenario('ALL LINES SELECTED: hover', hover);
  console.log('errors', errs); await b.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
