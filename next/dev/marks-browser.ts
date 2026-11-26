// A dev check in the real page (not a test, `in_1444`): a mark stands directly on its part (its lower edge touches it) and can be dragged out of the way; a drag is not a click; it does not remember where it was put once the part is deselected and selected again (`dec_marks_on_things`).
//   node --experimental-strip-types dev/marks-browser.ts [screenshot-dir]
import { S, dir, ok, finish, evalIn, pxIn, clickIn } from "./page-lib.ts";
import { writeFileSync } from "node:fs";
try {
  const { page, errors, close } = await S.open(""), ev = evalIn(page), px = pxIn(ev), click = clickIn(page, px, 120);
  const def = () => ev<any>(`() => Object.values(window.__sketch.snapshot())[0]`);
  await ev(`() => window.__tool("rect")`); await page.waitForTimeout(900);
  await click(0, 0); await click(40, 25); await ev(`() => window.__sketch.stop()`);
  await page.waitForTimeout(5200); // (the offers for what was just made are gone)
  const pill = () => page.evaluate(() => { const e = [...document.querySelectorAll<HTMLElement>("[data-marks] [data-fact]")].find((f) => f.querySelector("[data-number]")); if (!e) return null; const b = (e.parentElement as HTMLElement), r = b.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, text: e.querySelector("[data-number]")!.textContent, open: e.querySelector("[data-padlock]")!.getAttribute("data-padlock") }; });
  ok((await pill()) === null, "nothing selected, nothing recent: no marks");
  await click(10, 0); await page.waitForTimeout(250);
  const a = await pill(); ok(!!a && a.text === "40", `a selected side shows its measured number: ${JSON.stringify(a)}`);
  const [mx, my] = await px(20, 0); // the middle of the bottom side
  ok(!!a && Math.abs(a.x + a.w / 2 - mx) < 60 && a.y + a.h <= my + 1 && a.y + a.h >= my - 6, `it stands on the side (its lower edge touches the middle of it): mark bottom ${a && a.y + a.h}, side at ${my}`);
  writeFileSync(`${dir}/marks-1.png`, await page.screenshot());
  // drag it by its edge (not the number, not the padlock) out of the way
  const gx = a!.x + 4, gy = a!.y + a!.h / 2;
  await page.mouse.move(gx, gy); await page.mouse.down(); await page.mouse.move(gx + 20, gy - 30, { steps: 4 }); await page.mouse.move(gx + 60, gy - 90, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(250);
  const b = await pill(); ok(!!b && Math.abs(b.x - a!.x - 60) < 2 && Math.abs(b.y - a!.y + 90) < 2, `a drag moved it out of the way: from ${a!.x},${a!.y} to ${b?.x},${b?.y}`);
  ok(!!b && b.open === "open" && (await def()).constraints.length === a0(await def()), "and the drag was not a click: the number is still only measured");
  await page.waitForTimeout(300);
  const c = await pill(); ok(!!c && Math.abs(c.x - b!.x) < 1 && Math.abs(c.y - b!.y) < 1, "it stays where it was put while the part is selected");
  writeFileSync(`${dir}/marks-2.png`, await page.screenshot());
  // deselect (a click on nothing), select again: it does not remember
  await click(-20, 8); await page.waitForTimeout(250);
  ok((await pill()) === null, "deselected: it is gone");
  await click(10, 0); await page.waitForTimeout(250);
  const d = await pill(); ok(!!d && Math.abs(d.x - a!.x) < 1 && Math.abs(d.y - a!.y) < 1, `selected again it stands on the part again: ${JSON.stringify(d && [d.x, d.y])} (was ${a!.x}, ${a!.y})`);
  ok(errors.length === 0, `no errors in the page ${errors.join("; ")}`);
  await close();
} finally { await S.stop(); }
function a0(d: any): number { return d.constraints.length; }
finish();
