// A dev check in the real page (not a test, `in_1444`): dimensions as the old app shows them (`dec_dimensions_measure_then_lock`, slice c): a circle is measured by its diameter (a typed number is the diameter), two sides show their angle with a thin arc at their corner and the number on it.
//   node --experimental-strip-types dev/dimension-look-browser.ts [screenshot-dir]
import { S, dir, ok, finish, evalIn, pxIn, clickIn } from "./page-lib.ts";
import { writeFileSync } from "node:fs";
try {
  const { page, errors, close } = await S.open("");
  const ev = evalIn(page), px = pxIn(ev), click = clickIn(page, px, 150);
  const def = () => ev<any>(`() => Object.values(window.__sketch.snapshot())[0]`);
  const bubbles = () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-bubble]")].map((e) => ({ id: e.dataset.bubble, text: e.textContent, padlock: e.querySelector<HTMLElement>("[data-padlock]")?.dataset.padlock })));
  await ev(`() => window.__tool("rect")`); await page.waitForTimeout(900);
  await click(0, 0); await click(40, 25); await ev(`() => { window.__sketch.stop(); window.__sketch.stop(); }`); await page.waitForTimeout(200);
  await ev(`() => window.__tool("circle")`); await page.waitForTimeout(700);
  await click(-30, 10); await click(-24, 10); await ev(`() => { window.__sketch.stop(); window.__sketch.stop(); }`); await page.waitForTimeout(200);
  // a circle: the diameter
  await click(-24, 10); await page.waitForTimeout(200);
  let b = await bubbles(); ok(b.some((x) => x.id === "measure" && /12/.test(x.text ?? "") && /Ø/.test(x.text ?? "")), `a selected circle shows its diameter, measured, with a diameter sign: ${JSON.stringify(b.map((x) => x.text))}`);
  writeFileSync(`${dir}/dim-circle.png`, await page.screenshot());
  await page.keyboard.type("14"); await page.keyboard.press("Enter"); await page.waitForTimeout(300);
  let d = await def(); ok(Math.abs(d.circles[0].r - 7) < 1e-4 && d.constraints.some((k: any) => k.kind === "radius" && Math.abs(k.value - 7) < 1e-4), `typing 14 makes the diameter 14 (radius ${d.circles[0].r.toFixed(3)}), locked`);
  b = await bubbles(); ok(b.some((x) => /14/.test(x.text ?? "") && x.padlock === "closed"), `and the bubble reads 14, closed: ${JSON.stringify(b.map((x) => x.text))}`);
  // two sides: the angle, with its arc
  await page.keyboard.press("Escape"); await page.waitForTimeout(200);
  await click(20, 0); await page.keyboard.down("Shift"); await click(40, 12); await page.keyboard.up("Shift"); await page.waitForTimeout(250);
  b = await bubbles(); ok(b.some((x) => x.id === "measure" && /90°?/.test(x.text ?? "")), `two sides that meet show their angle: ${JSON.stringify(b.map((x) => x.text))}`);
  const notes = await ev<any[]>(`() => window.__sketch.lines(null).filter((l) => l.kind === "note")`);
  ok(notes.length === 1 && notes[0].pts.length >= 6, `a thin arc is drawn at their corner (${notes[0]?.pts.length} points)`);
  writeFileSync(`${dir}/dim-angle.png`, await page.screenshot());
  ok(errors.length === 0, `no errors in the page ${errors.join("; ")}`);
  await close();
} finally { await S.stop(); }
finish();
