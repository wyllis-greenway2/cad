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
  const b = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-bubble^='offer']")].map((e) => e.title));
  ok(b.some((t) => /tangent/.test(t)), `the tangent is offered as a constraint: ${JSON.stringify(b)}`);
  const d = await def(); ok(d.constraints.length === 0, "and nothing was made unasked");
  ok(errors.length === 0, `no errors in the page ${errors.join("; ")}`);
  await close();
} finally { await S.stop(); }
finish();
