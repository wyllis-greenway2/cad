// A dev check in the real page (not a test, `in_1444`): round and chamfer picked edges: the bar's button, the size to type over, Enter, the engine makes it.
//   node --experimental-strip-types dev/round-browser.ts [screenshot-dir]
import { start } from "../test/browser/harness.ts";
import { writeFileSync } from "node:fs";
const dir = process.argv[2] ?? "/tmp", S = await start(5199);
let bad = 0; const ok = (c: boolean, what: string) => { console.log(`${c ? "ok  " : "FAIL"} ${what}`); if (!c) bad++; };
try {
  const { page, errors, close } = await S.open("");
  const ev = <T,>(f: string): Promise<T> => page.evaluate((src: string) => new Function(`return (${src})`)()(), f) as Promise<T>;
  const settle = async () => { await ev(`() => window.__studio.settled()`); await page.waitForTimeout(400); };
  const body = () => ev<any>(`() => { const s = window.__studio.state(); return { steps: s.steps.map((x) => x.kind), problem: s.problem, tris: s.meshes[0] ? s.meshes[0].indices.length / 3 : 0 }; }`);
  await ev(`() => { window.__studio.change([{ id: "s1", kind: "sketchPolygon", params: { points: [[0, 0], [40, 0], [40, 25], [0, 25]] }, inputs: [] }, { id: "e1", kind: "extrude", params: { d: 10 }, inputs: ["s1"] }]); return 1; }`);
  await settle();
  const p3 = (p: number[]) => ev<[number, number]>(`() => window.__proj3([${p}])`);
  const type = async (v: string) => { const num = await page.evaluate(() => { const e = [...document.querySelectorAll<HTMLElement>("[data-bubble='d'] span")].find((s) => /^-?[\d.]+$/.test(s.textContent ?? ""))!; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }); await page.mouse.click(num[0]!, num[1]!); await page.keyboard.press("Control+a"); await page.keyboard.type(v); await page.keyboard.press("Enter"); };
  const [ex, ey] = await p3([20, 25, 10]); await page.mouse.click(ex, ey); await page.waitForTimeout(250);
  await page.click("[data-bar='body:round']"); await page.waitForTimeout(250);
  let d = await ev<any>(`() => window.__ext.debug()`); ok(d.pull?.mode === "round" && d.pull.edges === 1, `the bar's round starts the operation with a size: ${JSON.stringify(d.pull)}`);
  await type("3"); await page.waitForTimeout(150);
  d = await ev<any>(`() => window.__ext.debug()`); ok(d.pull.d === 3, "typing 3 sets the size");
  writeFileSync(`${dir}/round-1.png`, await page.screenshot());
  await page.keyboard.press("Enter"); await settle();
  let b = await body(); ok(b.steps.join() === "sketchPolygon,extrude,round" && b.problem === "" && b.tris > 12, `the engine rounded the edge: ${JSON.stringify(b)}`);
  writeFileSync(`${dir}/round-2.png`, await page.screenshot());
  // a chamfer of the opposite top edge
  const [cx, cy] = await p3([20, 0, 10]); await page.mouse.click(cx, cy); await page.waitForTimeout(250);
  await page.click("[data-bar='body:chamfer']"); await page.waitForTimeout(250); await type("2"); await page.keyboard.press("Enter"); await settle();
  b = await body(); ok(b.steps.join() === "sketchPolygon,extrude,round,round" && b.problem === "", `and a chamfer: ${JSON.stringify(b)}`);
  // a size of nothing is refused, not applied
  await page.mouse.click(cx, cy); await page.waitForTimeout(200);
  ok(errors.length === 0, `no errors in the page ${errors.join(" | ").slice(0, 300)}`);
  await close();
} finally { await S.stop(); }
process.exit(bad ? 1 : 0);
