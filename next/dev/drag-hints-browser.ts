// A dev check in the real page (not a test, `in_1444`; scaffolding): the same helpers while dragging as while drawing (`in_1617`): the end of a line dragged near the tangent to a circle is placed on it and the circle is lit; a circle's edge dragged near a line is placed on it (equal to the distance) and lit; nothing is constrained by it, and what holds after the drop is offered.
//   node --experimental-strip-types dev/drag-hints-browser.ts [screenshot-dir]
import { S, dir, ok, finish, evalIn, pxIn, clickIn } from "./page-lib.ts";
import { writeFileSync } from "node:fs";
try {
  const { page, errors, close } = await S.open(""), ev = evalIn(page), px = pxIn(ev), click = clickIn(page, px, 100);
  const def = () => ev<any>(`() => Object.values(window.__sketch.snapshot())[0]`);
  const pt = (d: any, id: string) => d.points.find((p: any) => p.id === id);
  const drag = async (from: [number, number], to: [number, number], hold = false) => { const [a, b] = await px(...from), [c, e] = await px(...to); await page.mouse.move(a, b); await page.mouse.down(); await page.mouse.move((a + c) / 2, (b + e) / 2, { steps: 6 }); await page.mouse.move(c, e, { steps: 6 }); await page.waitForTimeout(500); return { c, e }; };
  await ev(`() => window.__tool("circle")`); await page.waitForTimeout(900);
  await click(30, 10); await click(35, 10); await ev(`() => window.__sketch.stop()`);          // a circle, centre (30, 10), radius 5
  await ev(`() => window.__tool("line")`); await page.waitForTimeout(300);
  await click(12, 28); await click(30, 22); await ev(`() => window.__sketch.stop()`);          // a line to the apex above the circle
  await ev(`() => window.__tool("line")`); await page.waitForTimeout(500);
  await click(30, 22); await click(44, 30); await ev(`() => window.__sketch.stop()`);          // a second line from the apex, free end up and to the right
  await page.waitForTimeout(5200);
  let d = await def(); const apex = d.points.find((p: any) => Math.hypot(p.x - 30, p.y - 22) < 1e-6)!, end = d.points.find((p: any) => Math.hypot(p.x - 44, p.y - 30) < 1e-6)!;
  // the tangent from the apex to the circle: the end of the line, dragged to about where it would be tangent, is placed exactly on it
  const dist = 12, ang = -Math.PI / 2 + Math.asin(5 / dist), len = 18, tx = 30 + len * Math.cos(ang), ty = 22 + len * Math.sin(ang);
  const r0 = await drag([end.x, end.y], [tx, ty + 0.25]);
  const hint = await ev<any[]>(`() => window.__sketch.lines({ x: ${r0.c}, y: ${r0.e} }).filter((l) => l.kind === "tie" || l.kind === "tieBall")`);
  ok(hint.length >= 1, `dragging the end of a line near the tangent lights the circle while it is held: ${hint.length} tie`);
  writeFileSync(`${dir}/drag-hints-1.png`, await page.screenshot());
  await page.mouse.up(); await page.waitForTimeout(250);
  d = await def(); const e2 = pt(d, end.id), a2 = pt(d, apex.id), k = d.circles[0], c2 = pt(d, k.c);
  // distance from the circle's centre to the line through the apex and the end
  const dx = e2.x - a2.x, dy = e2.y - a2.y, off = Math.abs(dx * (c2.y - a2.y) - dy * (c2.x - a2.x)) / Math.hypot(dx, dy);
  ok(Math.abs(off - k.r) < 1e-3, `and it lands exactly tangent (distance ${off.toFixed(4)} from the centre, radius ${k.r})`);
  ok(d.constraints.length === 0, `and nothing was constrained by the hint: ${JSON.stringify(d.constraints)}`);
  // a circle's edge: drag it towards a level line 12 below its centre and it lands on the line (radius 12)
  await ev(`() => window.__tool("line")`); await page.waitForTimeout(300);
  await click(8, -2); await click(52, -2); await ev(`() => window.__sketch.stop()`);
  await page.waitForTimeout(5200);
  const r1 = await drag([35, 10], [41.8, 10]);
  console.log('DBG during', JSON.stringify((await def()).circles), JSON.stringify(await ev<any>(`() => window.__sketch.debug().tool`)));
  const hint2 = await ev<any[]>(`() => window.__sketch.lines({ x: ${r1.c}, y: ${r1.e} }).filter((l) => l.kind === "tie" || l.kind === "tieBall")`);
  ok(hint2.length >= 1, `dragging a circle's edge near a line lights it while held: ${hint2.length} tie`);
  writeFileSync(`${dir}/drag-hints-2.png`, await page.screenshot());
  await page.mouse.up(); await page.waitForTimeout(250);
  d = await def(); ok(Math.abs(d.circles[0].r - 12) < 1e-3, `and the circle lands tangent to the line (radius ${d.circles[0].r}, wanted 12)`);
  ok(errors.length === 0, `no errors in the page ${errors.join("; ")}`);
  await close();
} finally { await S.stop(); }
finish();
