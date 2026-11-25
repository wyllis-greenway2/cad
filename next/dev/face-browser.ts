// A dev check in the real page (not a test, `in_1444`): sketch on a face of the body, then extrude from it: a boss on top, a pocket cut into the top. Screenshots to the directory given.
//   node --experimental-strip-types dev/face-browser.ts [screenshot-dir]
import { S, dir, ok, finish, evalIn, pxIn, clickIn } from "./page-lib.ts";
import { writeFileSync } from "node:fs";
try {
  const { page, errors, close } = await S.open("");
  const ev = evalIn(page);
  const settle = async () => { await ev(`() => window.__studio.settled()`); await page.waitForTimeout(400); };
  const body = () => ev<any>(`() => { const s = window.__studio.state(); const m = s.meshes[0]; const z = m ? Array.from({ length: m.positions.length / 3 }, (_, i) => m.positions[3 * i + 2]) : [0]; return { steps: s.steps.map((x) => x.kind), problem: s.problem, top: Math.max(...z), tris: m ? m.indices.length / 3 : 0 }; }`);
  await ev(`() => { window.__studio.change([{ id: "s1", kind: "sketchPolygon", params: { points: [[0, 0], [40, 0], [40, 25], [0, 25]] }, inputs: [] }, { id: "e1", kind: "extrude", params: { d: 10 }, inputs: ["s1"] }]); return 1; }`);
  await settle();
  const px = pxIn(ev);
  const p3 = (p: number[]) => ev<[number, number]>(`() => window.__proj3([${p}])`);
  const click = clickIn(page, px, 120);
  const [fx, fy] = await p3([20, 12, 10]);
  await page.mouse.click(fx, fy); await page.waitForTimeout(250);
  await page.click("[data-bar='body:sketch']"); await page.waitForTimeout(1000);
  const plane = await ev<any>(`() => window.__sketch.debug()`); void plane;
  // draw a rectangle on the face (its frame has the origin at the face's middle)
  await ev(`() => window.__tool("rect")`); await page.waitForTimeout(900);
  await click(-8, -5); await click(8, 5); await ev(`() => window.__sketch.stop()`);
  const sk = await ev<any>(`() => window.__sketch.snapshot()`);
  const key = Object.keys(sk).find((k) => k.startsWith("face:"));
  ok(!!key && sk[key!].lines.length === 4, `a rectangle is drawn on the face's plane: ${Object.keys(sk).join(" | ").slice(0, 80)}`);
  writeFileSync(`${dir}/face-1.png`, await page.screenshot());
  // extrude it out 5: a boss
  await ev(`() => window.__startExtrude()`); await click(0, 0); await page.waitForTimeout(900);
  await page.evaluate(() => { /* type the distance */ });
  const num = await page.evaluate(() => { const e = [...document.querySelectorAll<HTMLElement>("[data-bubble='d'] span")].find((s) => /^-?[\d.]+$/.test(s.textContent ?? ""))!; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await page.mouse.click(num[0]!, num[1]!); await page.keyboard.press("Control+a"); await page.keyboard.type("5"); await page.keyboard.press("Enter"); await page.keyboard.press("Enter"); await settle();
  let b = await body(); ok(b.steps.join() === "sketchPolygon,extrude,sketch,extrude,combine" && b.problem === "" && Math.abs(b.top - 15) < 1e-4, `a boss 5 high on top: ${JSON.stringify(b)}`);
  writeFileSync(`${dir}/face-2.png`, await page.screenshot());
  // a pocket: the same sketch pulled into the body (negative) from the top of the boss? use the original top face: undo the boss, pull -3
  await page.keyboard.press("Control+z"); await settle();
  await ev(`() => window.__startExtrude()`); await click(0, 0); await page.waitForTimeout(900);
  const num2 = await page.evaluate(() => { const e = [...document.querySelectorAll<HTMLElement>("[data-bubble='d'] span")].find((s) => /^-?[\d.]+$/.test(s.textContent ?? ""))!; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await page.mouse.click(num2[0]!, num2[1]!); await page.keyboard.press("Control+a"); await page.keyboard.type("-3"); await page.keyboard.press("Enter"); await page.keyboard.press("Enter"); await settle();
  b = await body(); ok(b.steps.slice(-1)[0] === "combine" && b.problem === "" && Math.abs(b.top - 10) < 1e-4 && b.tris > 12, `a pocket 3 deep in the top: ${JSON.stringify(b)}`);
  writeFileSync(`${dir}/face-3.png`, await page.screenshot());
  ok(errors.length === 0, `no errors in the page ${errors.join(" | ").slice(0, 300)}`);
  await close();
} finally { await S.stop(); }
finish();
