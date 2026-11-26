// A dev check in the real page (not a test, `in_1444`; scaffolding): a face pulled near the plane of another body's face is placed flush with it, that face is lit orange while it is, and nothing is constrained (`in_1629`, `engine/flush.ts`).
//   node --experimental-strip-types dev/flush-browser.ts
import { S, ok, finish, evalIn, dir } from "./page-lib.ts";
import { writeFileSync } from "node:fs";
try {
  const { page, errors, close } = await S.open(""),
    ev = evalIn(page);
  const proj = (p: number[]) => ev<[number, number]>(`() => window.__proj3([${p}])`);
  // two bodies: a block 10 high, and beside it one 15 high
  await ev(`() => window.__studio.change([
    { id: "s1", kind: "sketchPolygon", params: { points: [[0, 0], [40, 0], [40, 25], [0, 25]] }, inputs: [] }, { id: "e1", kind: "extrude", params: { d: 10 }, inputs: ["s1"] },
    { id: "s2", kind: "sketchPolygon", params: { points: [[60, 0], [80, 0], [80, 25], [60, 25]] }, inputs: [] }, { id: "e2", kind: "extrude", params: { d: 15 }, inputs: ["s2"] },
    { id: "j", kind: "combine", params: { mode: "keep" }, inputs: ["e1", "e2"] }])`);
  await ev(`() => window.__studio.settled()`);
  await page.waitForTimeout(800);
  await ev(`() => window.__tool("pull")`);
  await page.waitForTimeout(300);
  await page.mouse.click(...(await proj([20, 12.5, 10])));
  await page.waitForTimeout(1100);
  let d = await ev<any>(`() => window.__ext.debug()`);
  ok(!!d.pull?.arrow, `the pull is open with its arrow: ${JSON.stringify(d.pull?.arrow)}`);
  const base = d.pull.arrow.base as number[],
    [b0x, b0y] = await proj(base),
    [b1x, b1y] = await proj([base[0]!, base[1]!, base[2]! + 10]);
  const ux = (b1x - b0x) / 10,
    uy = (b1y - b0y) / 10; // (pixels for a mm up)
  let held = false;
  for (const k of [2, 3, 4, 5, 6]) {
    const [x, y] = await proj([base[0]!, base[1]!, base[2]! + k]);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + ux * 2.4, y + uy * 2.4, { steps: 5 });
    await page.mouse.move(x + ux * 4.8, y + uy * 4.8, { steps: 5 });
    await page.waitForTimeout(250);
    const pull = (await ev<any>(`() => window.__ext.debug()`)).pull;
    if (pull.d > 0.5) {
      held = true;
      break;
    }
    await page.mouse.up();
  }
  d = await ev<any>(`() => window.__ext.debug()`);
  const tie = await ev<string | null>(`() => window.__ext.tie()`);
  ok(
    held && Math.abs(d.pull.d - 5) < 1e-6,
    `dragged to about 4.8 the pull is placed at 5, flush with the other body's top: ${JSON.stringify(d.pull.d)}`,
  );
  ok(!!tie, `and the face it is flush with is lit: ${tie}`);
  writeFileSync(`${dir}/flush-1.png`, await page.screenshot());
  await page.mouse.up();
  await page.waitForTimeout(200);
  ok((await ev<string | null>(`() => window.__ext.tie()`)) === null, "the light goes when the arrow is let go");
  ok(errors.length === 0, `no errors in the page ${errors.join("; ")}`);
  await close();
} finally {
  await S.stop();
}
finish();
