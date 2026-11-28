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
  ok(errors.length === 0, `no errors in the page ${errors.join(" | ").slice(0, 300)}`);
  await close();
} finally {
  await S.stop();
}
finish();
