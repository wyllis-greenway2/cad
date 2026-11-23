// A dev check in the real page (not a test, `in_1444`): undo and redo of drawings and recipe together, and the step list's numbers. Draw a rectangle, extrude 12, change the distance in the list to 20 (the engine remakes the body), undo, undo, undo, redo.
//   node --experimental-strip-types dev/undo-browser.ts [screenshot-dir]
import { start } from "../test/browser/harness.ts";
import { writeFileSync } from "node:fs";
const dir = process.argv[2] ?? "/tmp", S = await start(5199);
let bad = 0; const ok = (c: boolean, what: string) => { console.log(`${c ? "ok  " : "FAIL"} ${what}`); if (!c) bad++; };
try {
  const { page, errors, close } = await S.open("");
  const ev = <T,>(f: string): Promise<T> => page.evaluate((src: string) => new Function(`return (${src})`)()(), f) as Promise<T>;
  const px = (x: number, y: number) => ev<[number, number]>(`() => window.__px([${x}, ${y}])`);
  const click = async (x: number, y: number) => { const [a, b] = await px(x, y); await page.mouse.click(a, b); await page.waitForTimeout(100); };
  const sketches = () => ev<number>(`() => Object.values(window.__sketch.snapshot()).reduce((n, p) => n + (p.lines?.length ?? 0), 0)`);
  const state = () => ev<any>(`() => { const s = window.__studio.state(); return { steps: s.steps.map((x) => x.kind + (x.params.d !== undefined ? ":" + x.params.d : "")), top: s.meshes[0] ? Math.max(...Array.from({ length: s.meshes[0].positions.length / 3 }, (_, i) => s.meshes[0].positions[3 * i + 2])) : 0, problem: s.problem }; }`);
  const settle = async () => { await ev(`() => window.__studio.settled()`); await page.waitForTimeout(250); };
  const visible = (sel: string) => ev<number>(`() => [...document.querySelectorAll(${JSON.stringify(sel)})].filter((e) => e.offsetParent !== null).length`);

  ok((await visible("[data-history]")) === 0, "nothing drawn: no history panel");
  await ev(`() => window.__tool("rect")`); await page.waitForTimeout(900);
  await click(0, 0); await click(40, 25); await ev(`() => window.__sketch.stop()`);
  ok((await sketches()) === 4 && (await visible("[data-history]")) === 2, "a rectangle: the panel shows undo and redo");
  await ev(`() => window.__startExtrude()`); await click(20, 12); await page.waitForTimeout(800);
  const arrow = await ev<number[][]>(`() => window.__ext.drawing(null).handles[0].points`);
  const mid = await ev<[number, number]>(`() => window.__proj([${arrow[0]!.map((v, i) => (v + arrow[1]![i]!) / 2)}])`);
  await page.mouse.move(mid[0], mid[1]); await page.mouse.down(); await page.mouse.move(mid[0], mid[1] - 60, { steps: 5 }); await page.mouse.up();
  const num = await page.evaluate(() => { const e = [...document.querySelectorAll<HTMLElement>("[data-bubble='d'] span")].find((s) => /^-?[\d.]+$/.test(s.textContent ?? ""))!; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await page.mouse.click(num[0]!, num[1]!); await page.keyboard.press("Control+a"); await page.keyboard.type("12"); await page.keyboard.press("Enter"); await page.keyboard.press("Enter"); await settle();
  let st = await state(); ok(st.steps.join() === "sketch,extrude:12" && Math.abs(st.top - 12) < 1e-6, `extruded 12: ${JSON.stringify(st)}`);
  ok((await visible("[data-step]")) === 2, "the step list shows the sketch and the extrude");
  writeFileSync(`${dir}/undo-1.png`, await page.screenshot());
  // the distance in the list
  await page.click("[data-number='e1:d']"); await page.keyboard.press("Control+a"); await page.keyboard.type("20"); await page.keyboard.press("Enter"); await settle();
  st = await state(); ok(st.steps.join() === "sketch,extrude:20" && Math.abs(st.top - 20) < 1e-6 && st.problem === "", `the distance typed in the list is 20 and the engine remade the body: ${JSON.stringify(st)}`);
  // a dimension of the sketch step: none yet. undo the number
  await page.keyboard.press("Control+z"); await settle();
  st = await state(); ok(st.steps.join() === "sketch,extrude:12" && Math.abs(st.top - 12) < 1e-6, `undo puts the distance back to 12 (${JSON.stringify(st)})`);
  await page.keyboard.press("Control+z"); await settle();
  st = await state(); ok(st.steps.length === 0 && st.top === 0 && (await sketches()) === 4, "undo again: the extrude is gone, the rectangle stays");
  await page.keyboard.press("Control+z"); await settle();
  ok((await sketches()) === 0, "undo again: the rectangle is gone");
  await page.keyboard.press("Control+Shift+z"); await page.keyboard.press("Control+Shift+z"); await settle();
  st = await state(); ok(st.steps.join() === "sketch,extrude:12" && (await sketches()) === 4, `redo twice: the rectangle and the extrude are back (${JSON.stringify(st)})`);
  await page.keyboard.press("Control+y"); await settle();
  st = await state(); ok(st.steps.join() === "sketch,extrude:20", "Ctrl+Y redoes the number too");
  // the buttons
  await page.click("[data-history='undo']"); await settle();
  st = await state(); ok(st.steps.join() === "sketch,extrude:12", "the undo button does what the key does");
  // a distance of nothing, typed in the list: flagged in words
  await page.click("[data-number='e1:d']"); await page.keyboard.press("Control+a"); await page.keyboard.type("0"); await page.keyboard.press("Enter"); await settle();
  st = await state(); ok(/distance is nothing/.test(st.problem), `a distance of nothing is said in words: ${st.problem.slice(0, 90)}`);
  writeFileSync(`${dir}/undo-2.png`, await page.screenshot());
  await page.keyboard.press("Control+z"); await settle();
  st = await state(); ok(st.problem === "" && st.steps.join() === "sketch,extrude:12", "and undo puts it right");
  ok(errors.length === 0, `no errors in the page ${errors.join(" | ").slice(0, 300)}`);
  await close();
} finally { await S.stop(); }
process.exit(bad ? 1 : 0);
