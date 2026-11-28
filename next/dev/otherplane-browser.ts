// A dev check in the real page (not a test, `in_1444`): a figure or a part of a drawing on any plane is picked, not only on the plane that is on (the human's model had a sketch on a face that could not be selected, `in_1737`). Two drawings, on the XY and the XZ planes: the plane that is on is XY.
//   node --experimental-strip-types dev/otherplane-browser.ts
import { S, ok, finish, evalIn } from "./page-lib.ts";
try {
  const { page, errors, close } = await S.open("");
  const ev = evalIn(page);
  const circle = (x: number, y: number, r: number) => ({
    arcs: [],
    circles: [{ c: "P1", id: "K1", r }],
    constraints: [],
    lines: [],
    points: [{ id: "P1", x, y }],
  });
  await ev(
    `() => { window.__restore({ sketches: ${JSON.stringify({ "world:2": circle(30, 30, 3), "world:1": circle(0, 0, 10) })}, steps: [], faces: new Map() }); return 1; }`,
  );
  await page.waitForTimeout(900);
  const p3 = (p: number[]) => ev<[number, number]>(`() => window.__proj3([${p}])`);
  const sel = () => ev<any>(`() => window.__selection.get()`);
  const [x, y] = await p3([3, 0, 3]); // (inside the circle of the XZ plane, which is not the plane that is on)
  await page.mouse.move(x, y);
  await page.waitForTimeout(300);
  await page.mouse.click(x, y);
  await page.waitForTimeout(500);
  const s = await sel();
  ok(
    s?.kind === "region" && s.key === "world:1",
    `a click inside a figure on another plane picks it: ${JSON.stringify(s)?.slice(0, 120)}`,
  );
  // a part of a drawing on that plane is dragged too (the drag follows the plane of the drawing, not the plane that is on): the edge of the circle sets its radius
  await page.mouse.click(1000, 650);
  await page.waitForTimeout(300);
  const radius = () => ev<number>(`() => window.__sketch.snapshot()["world:1"].circles[0].r`);
  const r0 = await radius();
  const [ox, oy] = await p3([10, 0, 0]);
  await page.mouse.move(ox, oy);
  await page.mouse.down();
  await page.mouse.move(ox + 50, oy + 5, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  const r1 = await radius();
  ok(
    Math.abs(r1 - r0) > 1,
    `a press on the edge of the circle on another plane and a drag changes its radius: ${r0} to ${r1}`,
  );
  ok(errors.length === 0, `no errors in the page ${errors.join(" | ").slice(0, 300)}`);
  await close();
} finally {
  await S.stop();
}
finish();
