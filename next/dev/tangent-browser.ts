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
  const bars = () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-info] [data-bar]")].map((e) => e.dataset.bar!));
  const tangent = (await bars()).find((id) => id.startsWith("near:tangent"));
  ok(!!tangent, `the line just made is selected and the tangent is suggested on the right of the info bar: ${JSON.stringify(await bars())}`);
  let d = await def(); ok(d.constraints.length === 0, "and nothing was made unasked");
  writeFileSync(`${dir}/tangent-2.png`, await page.screenshot());
  await page.click(`[data-bar='${tangent}']`); await page.waitForTimeout(250);
  d = await def(); ok(d.constraints.some((k: any) => k.kind === "tangent"), `a click makes it: ${JSON.stringify(d.constraints)}`);
  ok(!(await bars()).includes(tangent!) && (await page.locator("[data-info] [data-fact]").count()) >= 1, "and it moves to the left, among what is so");
  await page.click("[data-info] [data-fact]:not(:has([data-number]))"); await page.waitForTimeout(250);
  d = await def(); ok(!d.constraints.some((k: any) => k.kind === "tangent"), "clicked there it is taken away");
  ok((await bars()).some((id) => id.startsWith("near:tangent")), "and it is on the right again, offered");
  ok(errors.length === 0, `no errors in the page ${errors.join("; ")}`);
  await close();
} finally { await S.stop(); }
finish();
