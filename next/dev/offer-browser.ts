// A dev check in the real page (not a test, `in_1444`): the constraint a helper held is offered for a moment as a bubble with a question mark; a click makes it (a check, then it fades); nothing is made unasked, and a selected line shows its constraints.
//   node --experimental-strip-types dev/offer-browser.ts [screenshot-dir]
import { S, dir, ok, finish, evalIn, pxIn, clickIn } from "./page-lib.ts";
import { writeFileSync } from "node:fs";
try {
  const { page, errors, close } = await S.open("");
  const ev = evalIn(page);
  const px = pxIn(ev);
  const click = clickIn(page, px, 120);
  const def = () => ev<any>(`() => Object.values(window.__sketch.snapshot())[0]`);
  const bubbles = () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-bubble^='offer']")].map((e) => ({ id: e.dataset.bubble, text: e.textContent, opacity: e.style.opacity, box: (() => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })() })));
  await ev(`() => window.__tool("line")`); await page.waitForTimeout(900);
  await click(10, 10);
  const [mx, my] = await px(30, 10.3); await page.mouse.move(mx, my, { steps: 5 }); await page.waitForTimeout(150);
  await page.mouse.click(mx, my); await page.waitForTimeout(300);
  let d = await def();
  ok(d.lines.length === 1 && d.constraints.length === 0, "a line drawn level by the helper makes no constraint");
  ok(Math.abs(d.points[1].y - d.points[0].y) < 1e-6, "but it is level");
  let b = await bubbles();
  ok(b.length >= 1 && b.some((x: any) => /\?/.test(x.text ?? "")), `an offer with a question mark stands there: ${JSON.stringify(b.map((x: any) => x.text))}`);
  writeFileSync(`${dir}/offer-1.png`, await page.screenshot());
  await page.mouse.click(b[0].box[0], b[0].box[1]); await page.waitForTimeout(200);
  d = await def();
  ok(d.constraints.length === 1 && d.constraints[0].kind === "horizontal", `a click makes it: ${JSON.stringify(d.constraints)}`);
  b = await bubbles(); ok(b.some((x: any) => x.id === "offer:0" && !/\?/.test(x.text ?? "")), "the bubble shows a check, no question mark");
  writeFileSync(`${dir}/offer-2.png`, await page.screenshot());
  await page.waitForTimeout(1500);
  b = await bubbles(); ok(b.length === 0 || b.every((x: any) => Number(x.opacity) < 1), "and it fades away");
  // an offer not taken fades and makes nothing
  await ev(`() => window.__sketch.stop()`);
  await click(10, 20); const [nx, ny] = await px(30, 20.3); await page.mouse.move(nx, ny, { steps: 5 }); await page.mouse.click(nx, ny); await page.waitForTimeout(300);
  d = await def(); ok(d.constraints.length === 1, "a second line level by the helper: nothing made unasked");
  await page.mouse.move(700, 600); await page.waitForTimeout(5200);
  b = await bubbles(); ok(b.length === 0, "an offer not taken is gone after a few seconds");
  d = await def(); ok(d.constraints.length === 1, "and made nothing");
  ok(errors.length === 0, `no errors in the page ${errors.join("; ")}`);
  await close();
} finally { await S.stop(); }
finish();
