// A dev check in the real page (not a test, `in_1444`): numbers typed as a figure is drawn (`dec_dimensions_measure_then_lock`, slice b): the chip by the pointer, digits typed with no key first, Tab, Enter makes the figure with the numbers locked, Esc gives up.
//   node --experimental-strip-types dev/typed-browser.ts [screenshot-dir]
import { S, dir, ok, finish, evalIn, pxIn, clickIn } from "./page-lib.ts";
import { writeFileSync } from "node:fs";
try {
  const { page, errors, close } = await S.open("");
  const ev = evalIn(page), px = pxIn(ev), click = clickIn(page, px, 150);
  const def = () => ev<any>(`() => Object.values(window.__sketch.snapshot())[0]`);
  const chip = () => page.evaluate(() => { const e = document.querySelector<HTMLElement>("[data-marks]"); if (!e) return null; const facts = [...e.querySelectorAll<HTMLElement>("[data-fact]")].filter((f) => (f.parentElement as HTMLElement).style.display !== "none"); if (!facts.length) return null; return facts.map((f) => ({ label: f.title, text: f.querySelector("[data-number]")!.textContent, underlined: (f.querySelector<HTMLElement>("[data-number]")!.style.textDecoration ?? "").includes("underline"), padlock: f.querySelector<HTMLElement>("[data-padlock]")!.dataset.padlock })); });
  const move = async (x: number, y: number) => { const [a, b] = await px(x, y); await page.mouse.move(a, b, { steps: 4 }); await page.waitForTimeout(150); };
  await ev(`() => window.__tool("line")`); await page.waitForTimeout(900);
  ok((await chip()) === null, "no info bar before the first click");
  await click(10, 10); await move(30, 10.2);
  let c = await chip(); ok(!!c && c.length === 1 && c[0]!.label === "Length" && c[0]!.padlock === "open" && Math.abs(Number(c[0]!.text) - 20) < 0.5, `the info bar shows the length as measured, an open padlock: ${JSON.stringify(c)}`);
  writeFileSync(`${dir}/typed-1.png`, await page.screenshot());
  await page.keyboard.type("25"); await page.waitForTimeout(150);
  c = await chip(); ok(!!c && c[0]!.text === "25" && c[0]!.padlock === "closed" && c[0]!.underlined, `typing digits goes straight into the number, its padlock closes: ${JSON.stringify(c)}`);
  await move(30, 20); // the pointer moves; the length stays
  writeFileSync(`${dir}/typed-2.png`, await page.screenshot());
  await page.keyboard.press("Enter"); await page.waitForTimeout(300);
  let d = await def(); const L1 = d.lines[0], a = d.points.find((p: any) => p.id === L1.a), b = d.points.find((p: any) => p.id === L1.b);
  ok(d.lines.length === 1 && Math.abs(Math.hypot(b.x - a.x, b.y - a.y) - 25) < 1e-4, `Enter makes the line 25 long, along the pointer's direction: ${Math.hypot(b.x - a.x, b.y - a.y).toFixed(4)}`);
  ok(Math.abs((b.y - a.y) / (b.x - a.x) - 10 / 20) < 0.02, "in the direction of the pointer (its slope)");
  ok(d.constraints.some((k: any) => k.kind === "length" && k.value === 25), `the number typed is locked as a dimension: ${JSON.stringify(d.constraints)}`);
  await ev(`() => window.__undo && 0`); await page.keyboard.press("Control+z"); await page.waitForTimeout(300);
  d = await def(); ok(!d || (d.lines ?? []).length === 0, "one undo takes the line and its number away together");
  await page.keyboard.press("Control+Shift+z"); await page.waitForTimeout(300);
  // a rectangle: width, Tab, height
  await ev(`() => { window.__sketch.stop(); window.__sketch.stop(); }`); await page.waitForTimeout(300);
  await ev(`() => window.__tool("rect")`); await page.waitForTimeout(900);
  await click(0, -30); await move(20, -20);
  await page.keyboard.type("30"); await page.keyboard.press("Tab"); await page.keyboard.type("10"); await page.waitForTimeout(150);
  c = await chip(); ok(!!c && c.length === 2 && c[0]!.text === "30" && c[1]!.text === "10" && c[1]!.underlined && c.every((f: any) => f.padlock === "closed"), `a width, Tab, a height: both typed and locked: ${JSON.stringify(c)}`);
  await page.keyboard.press("Enter"); await page.waitForTimeout(300);
  d = await def();
  const corners = d.points.slice(-4), xs = corners.map((p: any) => p.x), ys = corners.map((p: any) => p.y);
  ok(Math.abs(Math.max(...xs) - Math.min(...xs) - 30) < 1e-4 && Math.abs(Math.max(...ys) - Math.min(...ys) - 10) < 1e-4, `the rectangle is 30 wide and 10 high (${(Math.max(...xs) - Math.min(...xs)).toFixed(3)} x ${(Math.max(...ys) - Math.min(...ys)).toFixed(3)}), up and to the right as the pointer was`);
  ok(d.constraints.filter((k: any) => k.kind === "horizontalDistance" || k.kind === "verticalDistance").length === 2, `both numbers are locked: ${d.constraints.map((k: any) => k.kind + ":" + k.value).join(" ")}`);
  // a circle: a diameter
  await ev(`() => { window.__sketch.stop(); window.__sketch.stop(); }`); await page.waitForTimeout(300);
  await ev(`() => window.__tool("circle")`); await page.waitForTimeout(900);
  await click(-30, 10); await move(-20, 10); await page.keyboard.type("12"); await page.waitForTimeout(150);
  c = await chip(); ok(!!c && c[0]!.label === "Diameter" && c[0]!.text === "12", `a circle's number in the info bar is its diameter: ${JSON.stringify(c)}`);
  await page.keyboard.press("Enter"); await page.waitForTimeout(300);
  d = await def(); ok(d.circles.length === 1 && Math.abs(d.circles[0].r - 6) < 1e-4 && d.constraints.some((k: any) => k.kind === "radius" && Math.abs(k.value - 6) < 1e-4), `typing 12 makes the circle radius 6, locked: ${JSON.stringify(d.circles.map((k: any) => k.r))}`);
  // Backspace and Esc
  await click(40, 20); await move(50, 20); await page.keyboard.type("77"); await page.keyboard.press("Backspace"); await page.waitForTimeout(150);
  c = await chip(); ok(!!c && c[0]!.text === "7", `Backspace takes a digit away: ${JSON.stringify(c)}`);
  await page.keyboard.press("Escape"); await page.waitForTimeout(200);
  c = await chip(); ok(!c || c.every((f: any) => f.text !== "7"), `Esc gives the figure up: the number typed is gone (the bar is now of the circle made before: ${JSON.stringify(c?.map((f: any) => f.text))})`);
  ok(errors.length === 0, `no errors in the page ${errors.join("; ")}`);
  await close();
} finally { await S.stop(); }
finish();
