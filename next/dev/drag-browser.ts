// A dev check in the real page (not a test, `in_1444`): dragging sketch parts with the solver following: a corner of a rectangle (the constraints keep it a rectangle), a whole line, a point let go on another point, a drag held back by a locked length (red), undo of the whole drag as one change, and a click that goes nowhere is still a click.
//   node --experimental-strip-types dev/drag-browser.ts [screenshot-dir]
import { start } from "../test/browser/harness.ts";
import { writeFileSync } from "node:fs";
const dir = process.argv[2] ?? "/tmp", S = await start(5199);
let bad = 0; const ok = (c: boolean, what: string) => { console.log(`${c ? "ok  " : "FAIL"} ${what}`); if (!c) bad++; };
try {
  const { page, errors, close } = await S.open("");
  const ev = <T,>(f: string): Promise<T> => page.evaluate((src: string) => new Function(`return (${src})`)()(), f) as Promise<T>;
  const px = (x: number, y: number) => ev<[number, number]>(`() => window.__px([${x}, ${y}])`);
  const click = async (x: number, y: number) => { const [a, b] = await px(x, y); await page.mouse.click(a, b); await page.waitForTimeout(100); };
  const def = () => ev<any>(`() => Object.values(window.__sketch.snapshot())[0]`);
  const near = (d: any, x: number, y: number) => d.points.reduce((a: any, p: any) => (Math.hypot(p.x - x, p.y - y) < Math.hypot(a.x - x, a.y - y) ? p : a));
  const drag = async (from: [number, number], to: [number, number]) => { const [a, b] = await px(...from), [c, e] = await px(...to); await page.mouse.move(a, b); await page.mouse.down(); await page.mouse.move((a + c) / 2, (b + e) / 2, { steps: 4 }); await page.mouse.move(c, e, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(150); };
  await ev(`() => window.__tool("rect")`); await page.waitForTimeout(900);
  await click(0, 0); await click(20, 12); await ev(`() => window.__sketch.stop()`);
  ok((await def()).points.length === 4, "a rectangle to drag");
  // a click that goes nowhere is a click: the corner is picked
  const [cx, cy] = await px(20, 12); await page.mouse.click(cx, cy); await page.waitForTimeout(100);
  const picked = (await ev<any>(`() => window.__sketch.debug().selection`)).ids.join(), corner = near(await def(), 20, 12).id; ok(picked === corner, `a press that goes nowhere picks the corner (${picked})`);
  // drag the corner (20, 12) to (30, 20): level and upright sides keep it a rectangle
  await drag([20, 12], [30, 20]);
  let d = await def(); const P1 = near(d, 0, 0), P2 = near(d, 30, 0), P3 = near(d, 30, 20), P4 = near(d, 0, 20);
  ok(Math.abs(P3.x - 30) < 0.3 && Math.abs(P3.y - 20) < 0.3, `the corner follows the pointer to (${P3.x.toFixed(1)}, ${P3.y.toFixed(1)})`);
  ok(Math.abs(P2.y - P1.y) < 1e-6 && Math.abs(P2.x - P3.x) < 1e-6 && Math.abs(P4.y - P3.y) < 1e-6 && Math.abs(P4.x - P1.x) < 1e-6, "and the sides stay level and upright (still a rectangle)");
  ok(Math.abs(P1.x) < 1e-6 && Math.abs(P1.y) < 1e-6, "the first corner stayed");
  writeFileSync(`${dir}/drag-1.png`, await page.screenshot());
  // one undo takes the whole drag back
  await page.keyboard.press("Control+z"); await page.waitForTimeout(150);
  d = await def(); const back = near(d, 20, 12); ok(Math.hypot(back.x - 20, back.y - 12) < 1e-4, "undo puts the whole drag back in one step");
  await page.keyboard.press("Control+Shift+z"); await page.waitForTimeout(150);
  // a locked length holds the drag back: select the bottom side, put a number on it (D), then pull the right end sideways
  await click(10, 0); await page.keyboard.press("KeyD"); await page.waitForTimeout(200);
  const d0 = await def(), a0 = near(d0, 0, 0), b0 = near(d0, 30, 0), before = b0.x - a0.x;
  await drag([30, 0], [45, 0]);
  d = await def(); const after = near(d, 30, 0).x - near(d, 0, 0).x;
  ok(Math.abs(after - before) < 1e-4, `a locked length holds: ${before.toFixed(2)} stays ${after.toFixed(2)}`);
  // a free point let go on another point joins it (coincident)
  await page.keyboard.press("Escape");
  await ev(`() => window.__tool("line")`); await click(40, -5); await click(45, 10); await ev(`() => { window.__sketch.stop(); window.__sketch.stop(); }`); // (the first ends the chain, the second puts the tool away)
  const n0 = (await def()).constraints.length;
   const top = (await def()).points.filter((p: any) => p.id !== "P5" && p.id !== "P6").reduce((a: any, p: any) => (p.x + p.y > a.x + a.y ? p : a)); await drag([45, 10], [top.x, top.y]);
  d = await def(); const joined = d.constraints.some((c: any) => c.kind === "coincident" && c.parts.includes("P6"));
  ok(joined && d.constraints.length === n0 + 1, `a point let go on another point joins it (coincident added): ${d.constraints.length - n0} new constraint`);
  writeFileSync(`${dir}/drag-2.png`, await page.screenshot());
  ok(errors.length === 0, `no errors in the page ${errors.join(" | ").slice(0, 300)}`);
  await close();
} finally { await S.stop(); }
process.exit(bad ? 1 : 0);
