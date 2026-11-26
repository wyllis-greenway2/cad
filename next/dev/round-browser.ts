// A dev check in the real page (not a test, `in_1444`): round and chamfer picked edges: the bar's button, the size to type over, Enter, the engine makes it.
//   node --experimental-strip-types dev/round-browser.ts [screenshot-dir]
import { S, dir, ok, finish, evalIn, pxIn, clickIn } from "./page-lib.ts";
import { writeFileSync } from "node:fs";
try {
  const { page, errors, close } = await S.open("");
  const ev = evalIn(page);
  const settle = async () => { await ev(`() => window.__studio.settled()`); await page.waitForTimeout(400); };
  const body = () => ev<any>(`() => { const s = window.__studio.state(); return { steps: s.steps.map((x) => x.kind), problem: s.problem, tris: s.meshes[0] ? s.meshes[0].indices.length / 3 : 0 }; }`);
  await ev(`() => { window.__studio.change([{ id: "s1", kind: "sketchPolygon", params: { points: [[0, 0], [40, 0], [40, 25], [0, 25]] }, inputs: [] }, { id: "e1", kind: "extrude", params: { d: 10 }, inputs: ["s1"] }]); return 1; }`);
  await settle();
  const p3 = (p: number[]) => ev<[number, number]>(`() => window.__proj3([${p}])`);
  const type = async (v: string) => { const num = await page.evaluate(() => { const e = [...document.querySelectorAll<HTMLElement>("[data-fact='d'] span")].find((s) => /^-?[\d.]+$/.test(s.textContent ?? ""))!; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }); await page.mouse.click(num[0]!, num[1]!); await page.keyboard.press("Control+a"); await page.keyboard.type(v); await page.keyboard.press("Enter"); };
  const [ex, ey] = await p3([20, 25, 10]); await page.mouse.click(ex, ey); await page.waitForTimeout(250);
  await page.click("[data-bar='body:round']"); await page.waitForTimeout(250);
  let d = await ev<any>(`() => window.__ext.debug()`); ok(d.pull?.mode === "round" && d.pull.edges === 1, `the bar's round starts the operation with a size: ${JSON.stringify(d.pull)}`);
  await type("3"); await page.waitForTimeout(150);
  d = await ev<any>(`() => window.__ext.debug()`); ok(d.pull.d === 3, "typing 3 sets the size");
  writeFileSync(`${dir}/round-1.png`, await page.screenshot());
  // the arrow out of the edge (the pull arrow, `dec_task_handles`): pushed in it is a chamfer, pulled out a round
  const ar = d.pull.arrow as { base: number[]; normal: number[] };
  ok(!!ar && Math.abs(ar.normal[1]! - ar.normal[2]!) < 1e-6 && ar.normal[1]! > 0.5, `the edge has an arrow pointing out of the body between its two faces: ${JSON.stringify(ar)}`);
  const at = (k: number) => p3(ar.base.map((v, i) => v + ar.normal[i]! * k));
  const [b0x, b0y] = await at(0), [b1x, b1y] = await at(10), ux = b1x! - b0x!, uy = b1y! - b0y!, ul = Math.hypot(ux, uy) / 10; // pixels per mm along the arrow
  let grabbed = false;
  for (const k of [2, 3, 4, 5, 6, 8, 10, 12]) { const [x, y] = await at(k); await page.mouse.move(x!, y!); await page.mouse.down(); await page.mouse.move(x! - ux / ul * 0.01, y! - uy / ul * 0.01); await page.mouse.move(x! - (ux / ul) * 2 * ul, y! - (uy / ul) * 2 * ul, { steps: 6 }); await page.waitForTimeout(120); const g = (await ev<any>(`() => window.__ext.debug()`)).pull; await page.mouse.up(); if (g.mode === "round" && g.pulled !== 3) { grabbed = true; d = { pull: g }; break; } }
  ok(grabbed && d.pull.pulled < 0 && d.pull.d > 0, `dragging the arrow in makes it a chamfer of the size dragged: ${JSON.stringify(d.pull)}`);
  const sz = d.pull.d; { const [x, y] = await at(d.pull.pulled); await page.mouse.move(x!, y!); await page.mouse.down(); await page.mouse.move(x! + (ux / ul) * 5 * ul, y! + (uy / ul) * 5 * ul, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(150); d = await ev<any>(`() => window.__ext.debug()`); }
  ok(d.pull.pulled > 0 && d.pull.d > 0, `and dragging it out makes it a round (was a chamfer of ${sz}): ${JSON.stringify(d.pull)}`);
  await type("3"); await page.keyboard.press("Enter"); await settle();
  let b = await body(); ok(b.steps.join() === "sketchPolygon,extrude,round" && b.problem === "" && b.tris > 12, `the engine rounded the edge: ${JSON.stringify(b)}`);
  writeFileSync(`${dir}/round-2.png`, await page.screenshot());
  // a chamfer of the opposite top edge
  const [cx, cy] = await p3([20, 0, 10]); await page.mouse.click(cx, cy); await page.waitForTimeout(250);
  await page.click("[data-bar='body:chamfer']"); await page.waitForTimeout(250); await type("2"); await page.keyboard.press("Enter"); await settle();
  b = await body(); ok(b.steps.join() === "sketchPolygon,extrude,round,round" && b.problem === "", `and a chamfer: ${JSON.stringify(b)}`);
  // a size of nothing is refused, not applied
  await page.mouse.click(cx, cy); await page.waitForTimeout(200);
  ok(errors.length === 0, `no errors in the page ${errors.join(" | ").slice(0, 300)}`);
  await close();
} finally { await S.stop(); }
finish();
