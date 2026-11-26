// A dev check in the real page (not a test, `in_1444`; scaffolding) that nothing is left over when something is taken away (`dec_nothing_haunts`, `in_1624`): a sketch on a face whose body is taken out is a free drawing and an extrude of it names no step that is gone; a file holds no empty drawing and no plane that nothing is drawn on.
//   node --experimental-strip-types dev/leftovers-browser.ts
import { S, ok, finish, evalIn, pxIn, clickIn } from "./page-lib.ts";
try {
  const { page, errors, close } = await S.open(""), ev = evalIn(page);
  const proj = (p: number[]) => ev<[number, number]>(`() => window.__proj3([${p}])`);
  await ev(`() => window.__studio.change([{ id: "s1", kind: "sketchPolygon", params: { points: [[0, 0], [40, 0], [40, 25], [0, 25]] }, inputs: [] }, { id: "e1", kind: "extrude", params: { d: 10 }, inputs: ["s1"] }])`); await ev(`() => window.__studio.settled()`); await page.waitForTimeout(700);
  await ev(`() => window.__tool("sketch-face")`); await page.waitForTimeout(300);
  const [fx, fy] = await proj([20, 12.5, 10]); await page.mouse.click(fx, fy); await page.waitForTimeout(900);
  await ev(`() => window.__tool("rect")`); await page.waitForTimeout(700);
  const [a1, b1] = await proj([8, 6, 10]), [a2, b2] = await proj([20, 14, 10]);
  await page.mouse.click(a1, b1); await page.waitForTimeout(200); await page.mouse.click(a2, b2); await page.waitForTimeout(400); await ev(`() => window.__sketch.stop()`);
  let doc = JSON.parse(await ev<string>(`() => window.__doc()`));
  ok(Object.keys(doc.drawings).length === 1 && Object.keys(doc.faces).length === 1, `a sketch on a face is saved with its plane: ${Object.keys(doc.drawings)} ${Object.keys(doc.faces)}`);
  // the body's extrude step is taken out: the sketch is a free drawing; an extrude of it does not name the step that is gone
  await ev(`() => window.__studio.change([{ id: "s1", kind: "sketchPolygon", params: { points: [[0, 0], [40, 0], [40, 25], [0, 25]] }, inputs: [] }])`); await ev(`() => window.__studio.settled()`); await page.waitForTimeout(500);
  await ev(`() => window.__startExtrude()`); await page.waitForTimeout(300);
  await page.mouse.click(...(await proj([14, 10, 10]))); await page.waitForTimeout(700);
  const op = await ev<any>(`() => window.__ext.debug()`); ok(!!op.pull, "the sketch on the face still extrudes (it is a free drawing now)");
  await page.click("[data-fact='d'] [data-number]"); await page.keyboard.press("Control+a"); await page.keyboard.type("4"); await page.keyboard.press("Enter"); await page.keyboard.press("Enter");
  await ev(`() => window.__studio.settled()`); await page.waitForTimeout(500);
  const steps = await ev<any[]>(`() => window.__studio.state().steps.map((s) => ({ id: s.id, kind: s.kind, inputs: s.inputs, face: !!s.params.face }))`);
  const sk = steps.find((x) => x.kind === "sketch");
  ok(!!sk && sk.inputs.length === 0 && !sk.face && !steps.some((x) => x.inputs.includes("e1")), `its extrude names no step that is gone: ${JSON.stringify(steps)}`);
  // nothing in it: not saved
  await ev(`() => window.__tool("sketch-plane")`); await page.waitForTimeout(400); // (a new plane: the one on the face is no longer the one drawn on)
  await ev(`() => window.__sketch.restore({ "world:2": { points: [], lines: [], circles: [], arcs: [], constraints: [] } })`);
  doc = JSON.parse(await ev<string>(`() => window.__doc()`));
  ok(Object.keys(doc.drawings).length === 0 && Object.keys(doc.faces).length === 0, `a file holds no empty drawing and no plane nothing is drawn on: ${JSON.stringify(Object.keys(doc.drawings))} ${JSON.stringify(Object.keys(doc.faces))}`);
  ok(errors.length === 0, `no errors in the page ${errors.join("; ")}`);
  await close();
} finally { await S.stop(); }
finish();
