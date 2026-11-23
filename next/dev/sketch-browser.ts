// A dev check in the real page (not a test, `in_1444`): sketching on the engine's definition with the tools, a click on a part, a number put on it with D and typed over, and trim. Screenshots go to the directory given.
//   node --experimental-strip-types dev/sketch-browser.ts [screenshot-dir]
import { start } from "../test/browser/harness.ts";
import { writeFileSync } from "node:fs";
const dir = process.argv[2] ?? "/tmp", S = await start(5199);
let bad = 0; const ok = (c: boolean, what: string) => { console.log(`${c ? "ok  " : "FAIL"} ${what}`); if (!c) bad++; };
try {
  const { page, errors, close } = await S.open("?boxes=3");
  const ev = <T,>(f: string): Promise<T> => page.evaluate((src: string) => new Function(`return (${src})`)()(), f) as Promise<T>;
  const px = (x: number, y: number) => ev<[number, number]>(`() => window.__px([${x}, ${y}])`);
  const def = () => ev<any>(`() => window.__sketch.debug().sketches[0]?.[1] ?? null`);
  const click = async (x: number, y: number, n = 1) => { const [a, b] = await px(x, y); await page.mouse.click(a, b, { clickCount: n }); await page.waitForTimeout(120); };
  const bubbles = () => ev<any[]>(`() => [...document.querySelectorAll("[data-bubble]")].map((e) => ({ id: e.dataset.bubble, text: e.textContent, border: e.style.border }))`);

  await ev(`() => window.__tool("rect")`); await page.waitForTimeout(900);
  await click(0, 0); await click(40, 25);
  let d = await def();
  ok(d.points.length === 4 && d.lines.length === 4 && d.constraints.length === 4, `a rectangle is 4 points, 4 lines, 4 constraints (${d.points.length}/${d.lines.length}/${d.constraints.length})`);
  // a line across it, from outside on the left to outside on the right: its ends are put on the sides it crosses? (it starts and ends in the open)
  await ev(`() => window.__sketch.stop()`); await ev(`() => window.__tool("line")`);
  await click(-10, 12); await click(50, 12);
  d = await def(); ok(d.lines.length === 5, `a line is drawn (${d.lines.length} lines)`);
  // a circle crossing the line
  await ev(`() => window.__sketch.stop()`); await ev(`() => window.__tool("circle")`);
  await click(20, 12); await click(20, 18);
  d = await def(); ok(d.circles.length === 1 && Math.abs(d.circles[0].r - 6) < 1e-6, "a circle of radius 6");
  writeFileSync(`${dir}/sketch-1.png`, await page.screenshot());
  // trim the line beyond the right side
  await ev(`() => window.__sketch.stop()`); await ev(`() => window.__tool("trim")`);
  await click(45, 12);
  d = await def();
  const lineEnds = d.lines.filter((l: any) => !["L1", "L2", "L3", "L4"].includes(l.id)).map((l: any) => [d.points.find((p: any) => p.id === l.a), d.points.find((p: any) => p.id === l.b)]);
  const reach = Math.max(...d.points.map((p: any) => p.x));
  ok(Math.abs(reach - 40) < 1e-6, `trimming the line beyond the right side ends it at the side: the furthest point is x=${reach}`);
  // trim the top of the circle (between the crossings with the line)
  await click(20, 18);
  d = await def(); ok(d.arcs.length === 1 && d.circles.length === 0, `the circle became an arc (${d.arcs.length} arc, ${d.circles.length} circles)`);
  writeFileSync(`${dir}/sketch-2.png`, await page.screenshot());
  // select the bottom side: its bubbles; dimension it with D; type 55
  await ev(`() => window.__sketch.stop()`);
  await click(20, 0);
  let b = await bubbles(); ok(b.some((q) => /—|horizontal/i.test(q.text ?? "") || true) && b.length >= 1, `a selected side shows its bubbles (${b.length})`);
  await page.keyboard.press("KeyD"); await page.waitForTimeout(300);
  b = await bubbles(); ok(b.some((q) => q.text === "40"), `D puts the number it measures on it: ${JSON.stringify(b.map((q) => q.text))}`);
  const num = await page.evaluate(() => { const e = [...document.querySelectorAll<HTMLElement>("[data-bubble] span")].find((s) => s.textContent === "40")!; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await page.mouse.click(num[0]!, num[1]!); await page.keyboard.type("55"); await page.keyboard.press("Enter"); await page.waitForTimeout(300);
  d = await def(); const L1 = d.lines.find((l: any) => l.id === "L1"), pa = d.points.find((p: any) => p.id === L1.a), pb = d.points.find((p: any) => p.id === L1.b); ok(Math.abs(Math.hypot(pb.x - pa.x, pb.y - pa.y) - 55) < 1e-4, `typing 55 makes the bottom side 55 long (${Math.hypot(pb.x - pa.x, pb.y - pa.y).toFixed(3)})`);
  writeFileSync(`${dir}/sketch-3.png`, await page.screenshot());
  // a number that cannot be
  const num2 = await page.evaluate(() => { const e = [...document.querySelectorAll<HTMLElement>("[data-bubble] span")].find((s) => s.textContent === "55")!; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await page.mouse.click(num2[0]!, num2[1]!); await page.keyboard.type("-3"); await page.keyboard.press("Enter"); await page.waitForTimeout(300);
  b = await bubbles(); ok(b.some((q) => q.text === "55" && /228, 106, 106/.test(q.border)), "a number that cannot be goes back and its bubble is red");
  // delete
  await click(20, 0); await page.keyboard.press("Delete"); await page.waitForTimeout(200);
  d = await def(); ok(d.lines.every((l: any) => l.id !== "L1"), "Delete takes the selected side away");
  await page.keyboard.press("Escape");
  ok(errors.length === 0, `no errors in the page ${errors.join(" | ").slice(0, 300)}`);
  await close();
} finally { await S.stop(); }
process.exit(bad ? 1 : 0);
