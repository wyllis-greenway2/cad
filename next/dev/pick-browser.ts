// A dev check in the real page (not a test, `in_1444`): face and edge picking on the engine's body: the helper bar beside the pick. Screenshots to the directory given.
//   node --experimental-strip-types dev/pick-browser.ts [screenshot-dir]
import { start } from "../test/browser/harness.ts";
import { writeFileSync } from "node:fs";
const dir = process.argv[2] ?? "/tmp", S = await start(5199);
let bad = 0; const ok = (c: boolean, what: string) => { console.log(`${c ? "ok  " : "FAIL"} ${what}`); if (!c) bad++; };
try {
  const { page, errors, close } = await S.open("");
  const ev = <T,>(f: string): Promise<T> => page.evaluate((src: string) => new Function(`return (${src})`)()(), f) as Promise<T>;
  await ev(`() => { window.__studio.change([{ id: "s1", kind: "sketchPolygon", params: { points: [[0, 0], [40, 0], [40, 25], [0, 25]] }, inputs: [] }, { id: "e1", kind: "extrude", params: { d: 10 }, inputs: ["s1"] }]); return 1; }`);
  await ev(`() => window.__studio.settled()`); await page.waitForTimeout(500);
  // look at it from a corner
  await ev(`() => window.__set ? 1 : 1`);
  const pxOf = (p: number[]) => ev<[number, number]>(`() => window.__proj3([${p}])`);
  const bar = () => ev<string[]>(`() => [...document.querySelectorAll("[data-bar]")].filter((e) => e.offsetParent !== null).map((e) => e.dataset.bar)`);
  const [fx, fy] = await pxOf([20, 12, 10]);
  await page.mouse.move(fx, fy); await page.waitForTimeout(150);
  ok((await ev<any>(`() => window.__bodies.debug()`)).over === "face", "pointing at the top face marks it");
  await page.mouse.click(fx, fy); await page.waitForTimeout(250);
  let d = await ev<any>(`() => window.__bodies.debug()`); ok(d.sel?.faces.length === 1 && d.sel.edges.length === 0, `a click picks the face: ${JSON.stringify(d.sel)}`);
  let b = await bar(); ok(b.includes("body:sketch") && b.includes("body:pull") && b.includes("body:clear"), `the bar offers sketch and push/pull: ${b.join(" ")}`);
  writeFileSync(`${dir}/pick-1.png`, await page.screenshot());
  const [ex, ey] = await pxOf([20, 25, 10]);
  await page.mouse.click(ex, ey); await page.waitForTimeout(250);
  d = await ev<any>(`() => window.__bodies.debug()`); ok(d.sel?.edges.length === 1 && d.sel.faces.length === 0, "a click on an edge picks the edge");
  b = await bar(); ok(b.includes("body:round") && b.includes("body:chamfer"), `the bar offers round and chamfer: ${b.join(" ")}`);
  const [e2x, e2y] = await pxOf([40, 12, 10]); await page.keyboard.down("Shift"); await page.mouse.click(e2x, e2y); await page.keyboard.up("Shift"); await page.waitForTimeout(250);
  d = await ev<any>(`() => window.__bodies.debug()`); ok(d.sel?.edges.length === 2, "Shift adds a second edge");
  writeFileSync(`${dir}/pick-2.png`, await page.screenshot());
  await page.keyboard.press("Escape"); await page.waitForTimeout(150);
  d = await ev<any>(`() => window.__bodies.debug()`); ok(d.sel === null && (await bar()).length === 0, "Esc puts the pick away, and the bar");
  // push / pull the top face: pick, press the bar's button, drag the arrow out, apply
  await page.mouse.click(fx, fy); await page.waitForTimeout(250); await page.click("[data-bar='body:pull']"); await page.waitForTimeout(250);
  d = await ev<any>(`() => window.__ext.debug()`); ok(d.pull?.mode === "push" && d.pull.d === 0, `the bar's push/pull puts the arrow on the face: ${JSON.stringify(d.pull)}`);
  const arrow = await ev<number[][]>(`() => window.__ext.drawing(null).handles[0].points`);
  const mid = await ev<[number, number]>(`() => window.__proj3([${arrow[0]!.map((v, i) => (v + arrow[1]![i]!) / 2)}])`);
  await page.mouse.move(mid[0], mid[1]); await page.mouse.down(); await page.mouse.move(mid[0], mid[1] - 40, { steps: 5 }); await page.waitForTimeout(100);
  d = await ev<any>(`() => window.__ext.debug()`); ok(d.pull.d > 2, `dragging the arrow pulls the face out: d = ${d.pull.d}`);
  writeFileSync(`${dir}/pick-3.png`, await page.screenshot());
  await page.mouse.up(); await page.keyboard.press("Enter"); await ev(`() => window.__studio.settled()`); await page.waitForTimeout(400);
  const st = await ev<any>(`() => { const s = window.__studio.state(); return { steps: s.steps.map((x) => x.kind), problem: s.problem, top: Math.max(...Array.from({ length: s.meshes[0].positions.length / 3 }, (_, i) => s.meshes[0].positions[3 * i + 2])) }; }`);
  ok(st.steps.join() === "sketchPolygon,extrude,push" && st.problem === "" && st.top > 12, `the engine pushed the face out: ${JSON.stringify(st)}`);

  ok(errors.length === 0, `no errors in the page ${errors.join(" | ").slice(0, 300)}`);
  await close();
} finally { await S.stop(); }
process.exit(bad ? 1 : 0);
