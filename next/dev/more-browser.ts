// A dev check in the real page (not a test, `in_1444`): the "..." menu: save a model to a file, export STL and STEP, New (and undo it), open the file again, open a file that is not one.
//   node --experimental-strip-types dev/more-browser.ts [screenshot-dir]
import { start } from "../test/browser/harness.ts";
import { readFileSync, writeFileSync } from "node:fs";
const dir = process.argv[2] ?? "/tmp", S = await start(5199);
let bad = 0; const ok = (c: boolean, what: string) => { console.log(`${c ? "ok  " : "FAIL"} ${what}`); if (!c) bad++; };
try {
  const { page, errors, close } = await S.open("");
  const pg = page as any;
  const ev = <T,>(f: string): Promise<T> => page.evaluate((src: string) => new Function(`return (${src})`)()(), f) as Promise<T>;
  const settle = async () => { await ev(`() => window.__studio.settled()`); await page.waitForTimeout(400); };
  const state = () => ev<any>(`() => { const s = window.__studio.state(); return { steps: s.steps.length, meshes: s.meshes.length, problem: s.problem }; }`);
  const items = () => ev<string[]>(`() => [...document.querySelectorAll("[data-item]")].filter((e) => e.style.opacity !== "0.4").map((e) => e.dataset.item)`);
  const choose = async (id: string) => { await pg.click("[data-more='button']"); await page.waitForTimeout(150); await pg.click(`[data-item='${id}']`); };
  await pg.click("[data-more='button']"); await page.waitForTimeout(150);
  ok(JSON.stringify(await items()) === JSON.stringify(["open"]), `an empty model: only Open can be chosen (${(await items()).join(" ")})`);
  writeFileSync(`${dir}/more-1.png`, await page.screenshot());
  await page.keyboard.press("Escape"); await page.waitForTimeout(100);
  await ev(`() => { window.__studio.change([{ id: "s1", kind: "sketchPolygon", params: { points: [[0, 0], [40, 0], [40, 25], [0, 25]] }, inputs: [] }, { id: "e1", kind: "extrude", params: { d: 10 }, inputs: ["s1"] }]); window.__record("Extrude"); return 1; }`);
  await settle();
  await pg.click("[data-more='button']"); await page.waitForTimeout(150);
  ok((await items()).length === 5, `with a body: all five can be chosen (${(await items()).join(" ")})`);
  writeFileSync(`${dir}/more-2.png`, await page.screenshot());
  await page.keyboard.press("Escape");
  // save
  let [dl] = await Promise.all([pg.waitForEvent("download"), choose("save")]);
  await dl.saveAs(`${dir}/model-out.cad`); const text = readFileSync(`${dir}/model-out.cad`, "utf8");
  ok(dl.suggestedFilename() === "model.cad" && text.startsWith('{"format":"cad-document"') && text.includes('"id":"e1"'), `Save gives model.cad, a document: ${text.slice(0, 40)}`);
  // export stl, step
  [dl] = await Promise.all([pg.waitForEvent("download"), choose("export:stl")]); await dl.saveAs(`${dir}/model-out.stl`);
  const stl = readFileSync(`${dir}/model-out.stl`); ok(stl.length === 84 + 50 * 12 && stl.readUInt32LE(80) === 12, `Export STL: a box of 12 triangles (${stl.length} bytes)`);
  [dl] = await Promise.all([pg.waitForEvent("download"), choose("export:step")]); await dl.saveAs(`${dir}/model-out.step`);
  ok(readFileSync(`${dir}/model-out.step`, "utf8").startsWith("ISO-10303"), "Export STEP: a STEP file");
  // new, and undo it
  await choose("new"); await settle();
  let st = await state(); ok(st.steps === 0 && st.meshes === 0, `New: nothing is left (${JSON.stringify(st)})`);
  await page.keyboard.press("Control+z"); await settle();
  st = await state(); ok(st.steps === 2 && st.meshes === 1, "undo brings the model back");
  await choose("new"); await settle();
  // open the file saved
  await pg.click("[data-more='button']"); await page.waitForTimeout(150);
  const [fc] = await Promise.all([pg.waitForEvent("filechooser"), pg.click("[data-item='open']")]); await fc.setFiles(`${dir}/model-out.cad`); await settle();
  st = await state(); ok(st.steps === 2 && st.meshes === 1 && st.problem === "", `Open: the model is back (${JSON.stringify(st)})`);
  writeFileSync(`${dir}/more-3.png`, await page.screenshot());
  // a file that is not one
  writeFileSync(`${dir}/not-a-model.cad`, "hello");
  await pg.click("[data-more='button']"); await page.waitForTimeout(150);
  const [fc2] = await Promise.all([pg.waitForEvent("filechooser"), pg.click("[data-item='open']")]); await fc2.setFiles(`${dir}/not-a-model.cad`); await page.waitForTimeout(500);
  const msg = await ev<string>(`() => [...document.querySelectorAll("div")].map((d) => d.textContent).find((t) => /not-a-model/.test(t ?? "") && (t ?? "").length < 200) ?? ""`);
  st = await state(); ok(/not a document/.test(msg) && st.steps === 2, `a file that is not a model is said in words and nothing changes: ${msg}`);
  ok(errors.length === 0, `no errors in the page ${errors.join(" | ").slice(0, 300)}`);
  await close();
} finally { await S.stop(); }
process.exit(bad ? 1 : 0);
