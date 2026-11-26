// A dev check in the real page (not a test, `in_1444`): a line that starts on the end of another line and runs tangent to a circle is offered the tangent (the circle is lit) and, once placed, the tangent is offered as a constraint.
//   node --experimental-strip-types dev/tangent-browser.ts [screenshot-dir]
import { S, dir, ok, finish, evalIn, pxIn, clickIn } from "./page-lib.ts";
import { writeFileSync } from "node:fs";
try {
  const { page, errors, close } = await S.open("");
  const ev = evalIn(page);
  const px = pxIn(ev);
  const click = clickIn(page, px, 120);
  const def = () => ev<any>(`() => Object.values(window.__sketch.snapshot())[0]`);
  await ev(`() => window.__tool("circle")`); await page.waitForTimeout(900);
  await click(30, 10); await click(35, 10); await ev(`() => window.__sketch.stop()`);
  await ev(`() => window.__tool("line")`); await page.waitForTimeout(300);
  await click(12, 28); await click(30, 22); // a first line to the apex, above the circle (the circle has radius 5 about (30, 10))
  await ev(`() => window.__sketch.stop()`);
  await ev(`() => window.__tool("line")`); await page.waitForTimeout(700); await click(30, 22); // starts on the end of the first line
  const d0 = 12, ang = -Math.PI / 2 + Math.asin(5 / d0), len = 14, tx = 30 + len * Math.cos(ang), ty = 22 + len * Math.sin(ang);
  const [mx, my] = await px(tx, ty + 0.1); await page.mouse.move(mx, my, { steps: 6 }); await page.waitForTimeout(400);
  const lit = await ev<any[]>(`() => window.__sketch.lines({ x: ${mx}, y: ${my} }).filter((l) => l.kind === "tie")`);
  ok(lit.length >= 1, "the circle is lit orange while the line runs tangent to it");
  writeFileSync(`${dir}/tangent-1.png`, await page.screenshot());
  await page.mouse.click(mx, my); await page.waitForTimeout(300);
  // the marks stand on the parts (`dec_marks_on_things`): an offer is yellow and unlocked, an applied constraint green and locked; the offer for a part just made shows for a while, selected or not, then goes
  const marks = () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-marks] [data-state]")].filter((e) => (e.parentElement as HTMLElement).style.display !== "none" && Number(e.style.opacity || 1) > 0.02).map((e) => ({ state: e.dataset.state!, id: e.dataset.bar ?? e.dataset.fact ?? "" })));
  const tangent = (await marks()).find((m) => m.id.startsWith("near:tangent"));
  ok(!!tangent && tangent.state === "offer", `the line just made, selected or not, shows the tangent as an offer (yellow, unlocked): ${JSON.stringify(await marks())}`);
  let d = await def(); ok(d.constraints.length === 0, "and nothing was made unasked");
  writeFileSync(`${dir}/tangent-2.png`, await page.screenshot());
  await page.waitForTimeout(5200);
  ok((await marks()).length === 0, `it fades away if nothing is done: ${JSON.stringify(await marks())}`);
  // select the line (the tool is put away first): the offer is there again
  await ev(`() => window.__tools.cancel()`); await ev(`() => window.__tools.cancel()`); await page.waitForTimeout(150);
  const [lx, ly] = await px((30 + tx) / 2, (22 + ty) / 2); await page.mouse.click(lx, ly); await page.waitForTimeout(300);
  const again = (await marks()).find((m) => m.id.startsWith("near:tangent"));
  ok(!!again && again.state === "offer", `selected, the offer is there again: ${JSON.stringify(await marks())}`);
  writeFileSync(`${dir}/tangent-3.png`, await page.screenshot());
  await page.click(`[data-marks] [data-bar='${again!.id}']`); await page.waitForTimeout(300);
  d = await def(); ok(d.constraints.some((k: any) => k.kind === "tangent"), `a click makes it: ${JSON.stringify(d.constraints)}`);
  const locked = (await marks()).filter((m) => m.state === "locked" && !/^[0-9]/.test(m.id));
  ok(!(await marks()).some((m) => m.id === again!.id) && locked.length >= 1, `and it is locked (green) now: ${JSON.stringify(await marks())}`);
  await page.click("[data-marks] [data-state='locked'][data-fact]:not(:has([data-number]))"); await page.waitForTimeout(300);
  d = await def(); ok(!d.constraints.some((k: any) => k.kind === "tangent"), "a click on the locked one takes it away");
  ok((await marks()).some((m) => m.id.startsWith("near:tangent") && m.state === "offer"), "and it is offered again, unlocked");
  ok(errors.length === 0, `no errors in the page ${errors.join("; ")}`);
  await close();
} finally { await S.stop(); }
finish();
