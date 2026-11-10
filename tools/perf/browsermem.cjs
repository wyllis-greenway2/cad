const FIXTURES = process.env.FIXTURES || require('path').join(__dirname, '../../app/test/fixtures');
const { chromium } = require('playwright');
const fs = require('fs');
const { execSync } = require('child_process');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rss = () => Math.round(Number(execSync("ps -eo rss,comm | awk '/chrom|headless/ {s+=$1} END {print s}'").toString()) / 1024);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1000, height: 650 } });
  await p.goto('' + (process.env.URL || 'http://localhost:5199/') + ''); await sleep(2500);
  await p.evaluate((t) => window.__cad.load(t), fs.readFileSync(FIXTURES + '/' + process.argv[2], 'utf8'));
  await sleep(6000);
  console.log('after load: chromium rss', rss(), 'MB');
  const id = await p.evaluate(() => window.__cad.state.session.history.scene.steps.find((s) => s.type === 'extrude').id);
  const base = await p.evaluate(() => Number(window.__cad.state.session.history.scene.steps.find((s) => s.type === 'extrude').params.depth));
  for (let i = 1; i <= 60; i++) {
    await p.evaluate(([id, d]) => window.__cad.run({ type: 'setStepParams', id, params: { depth: d } }), [id, base + (i % 6) * 0.3]);
    await sleep(Number(process.argv[3] ?? 500));
    if (i % 10 === 0) console.log(i, 'edits: chromium rss', rss(), 'MB; js heap', await p.evaluate(() => Math.round(performance.memory.usedJSHeapSize / 1e6)), 'MB');
  }
  await b.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
