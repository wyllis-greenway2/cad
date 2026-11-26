// A dev check in the real page (not a test, `in_1444`): the kinds of face pull the info bar offers, on the human's chamfered block: Move (the step that made the face, so the height), Extrude (a prism of the face), Extend (the chamfers carried on towards a pyramid).
//   node --experimental-strip-types dev/pullkinds-browser.ts [screenshot-dir]
import { S, dir, ok, finish, evalIn, pxIn, clickIn } from "./page-lib.ts";
import { writeFileSync } from "node:fs";
try {
  const { page, errors, close } = await S.open("");
  const ev = evalIn(page);
  const settle = async () => { await ev(`() => window.__studio.settled()`); await page.waitForTimeout(500); };
  const body = () => ev<any>(`() => { const s = window.__studio.state(); const m = s.meshes[0]; const z = m ? Array.from({ length: m.positions.length / 3 }, (_, i) => m.positions[3 * i + 2]) : [0]; return { steps: s.steps.map((x) => x.kind), problem: s.problem, top: Math.max(...z), tris: m ? m.indices.length / 3 : 0 }; }`);
  const p3 = (p: number[]) => ev<[number, number]>(`() => window.__proj3([${p}])`);
  await ev(`() => { window.__studio.change([{ id: "s1", kind: "sketchPolygon", params: { points: [[0, 0], [20, 0], [20, 20], [0, 20]] }, inputs: [] }, { id: "e1", kind: "extrude", params: { d: 10 }, inputs: ["s1"] }]); return 1; }`);
  await settle();
  // chamfer the four top edges (through the bar, one by one with Shift)
  const edges = [[10, 0, 10], [20, 10, 10], [10, 20, 10], [0, 10, 10]];
  for (let i = 0; i < edges.length; i++) { const [x, y] = await p3(edges[i]!); if (i) await page.keyboard.down("Shift"); await page.mouse.click(x, y); if (i) await page.keyboard.up("Shift"); await page.waitForTimeout(150); }
  await page.click("[data-bar='body:chamfer']"); await page.waitForTimeout(250);
  const num = async (v: string) => { const n = await page.evaluate(() => { const e = [...document.querySelectorAll<HTMLElement>("[data-fact='d'] span")].find((s) => /^-?[\d.]+$/.test(s.textContent ?? ""))!; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }); await page.mouse.click(n[0]!, n[1]!); await page.keyboard.press("Control+a"); await page.keyboard.type(v); await page.keyboard.press("Enter"); };
  await num("3"); await page.keyboard.press("Enter"); await settle();
  let b = await body(); ok(b.steps.join() === "sketchPolygon,extrude,round" && b.problem === "", `a chamfered block: ${JSON.stringify(b)}`);
  const pickTop = async () => { const [x, y] = await p3([10, 10, 10]); await page.mouse.click(x, y); await page.waitForTimeout(250); await page.click("[data-bar='body:pull']"); await page.waitForTimeout(600); };
  const chips = () => ev<string[]>(`() => [...document.querySelectorAll("[data-info] [data-bar^='opt:']")].map((e) => e.dataset.bar.slice(4))`);
  await pickTop();
  let c = await chips(); ok(c.includes("push") && c.includes("move") && !c.includes("offset") && !c.includes("edit"), `the info bar offers the other kinds, Extrude and Extend (Move is the one in use; Offset cannot be made here): ${c.join(" ")}`);
  writeFileSync(`${dir}/pullkinds-1.png`, await page.screenshot());
  // Extend: the chamfers go with it
  await page.click("[data-bar='opt:move']"); await page.waitForTimeout(150); await num("3"); await page.keyboard.press("Enter"); await settle();
  b = await body(); ok(b.steps.join() === "sketchPolygon,extrude,round,moveFace" && b.problem === "" && Math.abs(b.top - 13) < 1e-3, `Extend: the top rises 3 and the chamfers go on: ${JSON.stringify(b)}`);
  writeFileSync(`${dir}/pullkinds-2.png`, await page.screenshot());
  await page.keyboard.press("Control+z"); await settle();
  // Extrude: a prism of the top square
  await pickTop(); await page.click("[data-bar='opt:push']"); await page.waitForTimeout(150); await num("3"); await page.keyboard.press("Enter"); await settle();
  b = await body(); ok(b.steps.join() === "sketchPolygon,extrude,round,push" && b.problem === "" && Math.abs(b.top - 13) < 1e-3, `Extrude: a prism of the face: ${JSON.stringify(b)}`);
  writeFileSync(`${dir}/pullkinds-3.png`, await page.screenshot());
  await page.keyboard.press("Control+z"); await settle();
  // Move: the extrude's depth (the kind in use when a face is pulled): the chamfer stays on the top edges
  await pickTop(); await num("3"); await page.keyboard.press("Enter"); await settle();
  b = await body(); const st = await ev<any>(`() => window.__studio.state().steps.find((s) => s.id === "e1").params.d`);
  ok(b.steps.join() === "sketchPolygon,extrude,round" && st === 13 && b.problem === "", `Move: the extrude's depth is now ${st}: ${JSON.stringify(b)}`);
  ok(errors.length === 0, `no errors in the page ${errors.join(" | ").slice(0, 300)}`);
  await close();
} finally { await S.stop(); }
finish();
