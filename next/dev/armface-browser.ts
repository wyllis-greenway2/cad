// A dev check in the real page (not a test, `in_1444`): a sketch tool is armed with nothing placed, and a click on a flat face of a body that stands before the plane begins the sketch on that face (the old app's `MD-64`); on the plane itself it draws.
//   node --experimental-strip-types dev/armface-browser.ts [screenshot-dir]
import { S, ok, finish, evalIn } from "./page-lib.ts";
try {
  const { page, errors, close } = await S.open("");
  const ev = evalIn(page);
  await ev(
    `() => { window.__studio.change([{ id: "s1", kind: "sketchPolygon", params: { points: [[0, 0], [40, 0], [40, 25], [0, 25]] }, inputs: [] }, { id: "e1", kind: "extrude", params: { d: 10 }, inputs: ["s1"] }]); return 1; }`,
  );
  await ev(`() => window.__studio.settled()`);
  await page.waitForTimeout(700);
  const p3 = (p: number[]) => ev<[number, number]>(`() => window.__proj3([${p}])`);
  const placed = () => ev<any>(`() => window.__cad.planes.sketch`);
  ok((await placed()) === null, "no plane is placed to begin with");
  await ev(`() => window.__tool("rect")`);
  await page.waitForTimeout(700);
  const [tx, ty] = await p3([20, 12, 10]);
  await page.mouse.click(tx, ty);
  await page.waitForTimeout(1500);
  const f = await placed();
  ok(
    !!f && Math.abs(f.normal[2] - 1) < 1e-6 && Math.abs(f.origin[2] - 10) < 1e-6,
    `a click on the top face begins the sketch on it: ${JSON.stringify(f)}`,
  );
  ok(
    (await ev<any>(`() => window.__sketch.drawStep()`)) === 0,
    "and no place is down yet: the tool waits for the first",
  );
  ok(errors.length === 0, `no errors in the page ${errors.join(" | ").slice(0, 300)}`);
  await close();
} finally {
  await S.stop();
}
finish();
