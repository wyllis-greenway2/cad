// A dev check in the real page (not a test, `in_1444`): sketch to extrude. A rectangle is drawn, the Extrude tool picks it, the arrow shows and is pulled (a ghost follows), a number is typed over, Enter applies, and the engine's worker (in the page, with the kernel) makes the body.
//   node --experimental-strip-types dev/extrude-browser.ts [screenshot-dir]
import { S, dir, ok, finish, evalIn, pxIn, clickIn } from "./page-lib.ts";
import { writeFileSync } from "node:fs";
try {
  const { page, errors, close } = await S.open("");
  const ev = evalIn(page);
  const px = pxIn(ev);
  const click = clickIn(page, px, 120);
  await ev(`() => window.__tool("rect")`);
  await page.waitForTimeout(900);
  await click(0, 0);
  await click(40, 25);
  await ev(`() => window.__sketch.stop()`);
  await ev(`() => window.__startExtrude()`);
  ok((await ev<any>(`() => window.__ext.debug()`)).armed, "the Extrude tool is on and waits for a click");
  await click(20, 12);
  await page.waitForTimeout(900);
  let d = await ev<any>(`() => window.__ext.debug()`);
  ok(d.pull && d.pull.d === 0, "a click inside the rectangle picks it: the arrow stands on it");
  writeFileSync(`${dir}/extrude-1.png`, await page.screenshot());
  // pull the arrow: press on its middle, drag up the screen
  const arrow = await ev<number[][]>(`() => window.__ext.drawing(null).handles[0].points`);
  const mid = await ev<[number, number]>(`() => window.__proj([${arrow[0]!.map((v, i) => (v + arrow[1]![i]!) / 2)}])`);
  await page.mouse.move(mid[0], mid[1]);
  await page.mouse.down();
  await page.mouse.move(mid[0], mid[1] - 40, { steps: 4 });
  await page.mouse.move(mid[0], mid[1] - 110, { steps: 6 });
  await page.waitForTimeout(150);
  d = await ev<any>(`() => window.__ext.debug()`);
  ok(d.pull.d > 5, `dragging the arrow pulls: d = ${d.pull.d}`);
  writeFileSync(`${dir}/extrude-2.png`, await page.screenshot());
  await page.mouse.up();
  // type a number over: click the bubble's number
  const num = await page.evaluate(() => {
    const e = [...document.querySelectorAll<HTMLElement>("[data-fact='d'] span")].find((s) =>
      /^-?[\d.]+$/.test(s.textContent ?? ""),
    )!;
    const r = e.getBoundingClientRect();
    return [r.x + r.width / 2, r.y + r.height / 2];
  });
  await page.mouse.click(num[0]!, num[1]!);
  await page.keyboard.press("Control+a");
  await page.keyboard.type("12");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);
  d = await ev<any>(`() => window.__ext.debug()`);
  ok(d.pull && d.pull.d === 12, `typing 12 over the number: d = ${d.pull?.d}`);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(100);
  ok((await ev<any>(`() => window.__ext.debug()`)).pull === null, "Enter applies the pull");
  await ev(`() => window.__studio.settled()`);
  await page.waitForTimeout(500);
  const st = await ev<any>(
    `() => { const s = window.__studio.state(); return { steps: s.steps.map((x) => x.kind), meshes: s.meshes.length, problem: s.problem, tris: s.meshes[0]?.indices.length / 3, busy: s.busy }; }`,
  );
  ok(
    st.steps.join() === "sketch,extrude" && st.meshes === 1 && st.problem === "",
    `the engine made the body: ${JSON.stringify(st)}`,
  );
  ok(st.tris === 12, "a box: 12 triangles");
  writeFileSync(`${dir}/extrude-3.png`, await page.screenshot());
  ok(errors.length === 0, `no errors in the page ${errors.join(" | ").slice(0, 300)}`);
  await close();
} finally {
  await S.stop();
}
finish();
