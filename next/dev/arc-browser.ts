// A dev check in the real page (not a test, `in_1444`): the arc tool (centre, start, end), the short way round, a radius put on it with D and typed over, a quarter-disc closed by two lines and extruded, and an arc dragged by its end.
//   node --experimental-strip-types dev/arc-browser.ts [screenshot-dir]
import { S, dir, ok, finish, evalIn, pxIn, clickIn } from "./page-lib.ts";
import { writeFileSync } from "node:fs";
try {
  const { page, errors, close } = await S.open("");
  const ev = evalIn(page);
  const px = pxIn(ev);
  const click = clickIn(page, px, 100);
  const def = () => ev<any>(`() => Object.values(window.__sketch.snapshot())[0]`);
  const stop = () => ev(`() => { window.__sketch.stop(); window.__sketch.stop(); window.__sketch.stop(); }`);
  await ev(`() => window.__tool("arc")`); await page.waitForTimeout(900);
  await click(0, 0); await click(10, 0);
  const [mx, my] = await px(0, 10); await page.mouse.move(mx, my); await page.waitForTimeout(150);
  writeFileSync(`${dir}/arc-1.png`, await page.screenshot());
  await page.mouse.click(mx, my); await page.waitForTimeout(150);
  let d = await def(); ok(d.arcs.length === 1 && d.points.length === 3 && !d.arcs[0].cw, `an arc from (10, 0) to (0, 10): ${JSON.stringify(d.arcs)}`);
  const near = (x: number, y: number) => d.points.reduce((a: any, p: any) => (Math.hypot(p.x - x, p.y - y) < Math.hypot(a.x - x, a.y - y) ? p : a));
  ok(Math.hypot(near(0, 10).x, near(0, 10).y - 10) < 1e-4, "its end is on the circle, at the pointer's angle");
  // a second arc the other way: start above, end to the right of it: clockwise
  await ev(`() => window.__tool("arc")`); await click(-20, 0); await click(-20, 6); await click(-14, 0); await stop();
  d = await def(); ok(d.arcs.length === 2 && d.arcs[1].cw === true, `a start above the centre and an end to its right goes clockwise: ${JSON.stringify(d.arcs[1])}`);
  // a quarter disc: close the first arc with two lines through its centre
  await ev(`() => window.__tool("line")`); await click(10, 0); await click(0, 0); await click(0, 10); await stop();
  d = await def(); ok(d.lines.length === 2, "two lines close it");
  await ev(`() => window.__startExtrude()`); await click(3, 3); await page.waitForTimeout(900);
  const num = await page.evaluate(() => { const e = [...document.querySelectorAll<HTMLElement>("[data-bubble='d'] span")].find((s) => /^-?[\d.]+$/.test(s.textContent ?? ""))!; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await page.mouse.click(num[0]!, num[1]!); await page.keyboard.press("Control+a"); await page.keyboard.type("5"); await page.keyboard.press("Enter"); await page.keyboard.press("Enter");
  await ev(`() => window.__studio.settled()`); await page.waitForTimeout(500);
  const st = await ev<any>(`() => { const s = window.__studio.state(); return { steps: s.steps.map((x) => x.kind), problem: s.problem, tris: s.meshes[0] ? s.meshes[0].indices.length / 3 : 0 }; }`);
  ok(st.steps.join() === "sketch,extrude" && st.problem === "" && st.tris > 20, `the quarter disc extrudes: ${JSON.stringify(st)}`);
  writeFileSync(`${dir}/arc-2.png`, await page.screenshot());
  // undo the extrude, then put a radius on the arc and type over it
  await page.keyboard.press("Control+z"); await page.waitForTimeout(400);
  await stop(); await click(7.07, 7.07); await page.waitForTimeout(150);
  const bar = await ev<string[]>(`() => [...document.querySelectorAll("[data-bar]")].filter((e) => e.offsetParent !== null).map((e) => e.dataset.bar)`);
  ok(bar.includes("rel:radius"), `a selected arc offers its radius: ${bar.join(" ")}`);
  await page.click("[data-bar='rel:radius']"); await page.waitForTimeout(250);
  const rnum = await page.evaluate(() => { const e = [...document.querySelectorAll<HTMLElement>("[data-bubble] span")].find((s) => s.textContent === "10"); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  ok(!!rnum, "the radius bubble reads 10");
  if (rnum) { await page.mouse.click(rnum[0]!, rnum[1]!); await page.keyboard.press("Control+a"); await page.keyboard.type("14"); await page.keyboard.press("Enter"); await page.waitForTimeout(300); }
  d = await def(); const st1 = d.points.find((p: any) => p.id === d.arcs[0].a), c1 = d.points.find((p: any) => p.id === d.arcs[0].c);
  ok(Math.abs(Math.hypot(st1.x - c1.x, st1.y - c1.y) - 14) < 1e-3, `typing 14 makes the radius 14 (${Math.hypot(st1.x - c1.x, st1.y - c1.y).toFixed(3)})`);
  writeFileSync(`${dir}/arc-3.png`, await page.screenshot());
  ok(errors.length === 0, `no errors in the page ${errors.join(" | ").slice(0, 300)}`);
  await close();
} finally { await S.stop(); }
finish();
