// A dev check in the real page (not a test, `in_1444`): going out of a straight view by a drag and back by a world button, again and again, lands in the same 3D view every time (`in_1706`).
//   node --experimental-strip-types dev/exitzoom-browser.ts
import { S, ok, finish, evalIn } from "./page-lib.ts";
try {
  const { page, errors, close } = await S.open("");
  const ev = evalIn(page);
  await ev(
    `() => { window.__studio.change([{ id: "s1", kind: "sketchPolygon", params: { points: [[-20, -10], [20, -10], [20, 10], [-20, 10]] }, inputs: [] }, { id: "e1", kind: "extrude", params: { d: 20 }, inputs: ["s1"] }]); return 1; }`,
  );
  await ev(`() => window.__studio.settled()`);
  await page.waitForTimeout(600);
  const zButton = async () => {
    const b = await page.evaluate(() => {
      const e = [...document.querySelectorAll(".cadbtn")]
        .find((x) => x.textContent?.trim().endsWith("Z"))!
        .getBoundingClientRect();
      return { x: e.left + e.width / 2, y: e.top + e.height / 2 };
    });
    await page.mouse.click(b.x, b.y);
  };
  // how far the eye is from the point the straight view was entered about, and where that point is (the Z button alternates the side it looks from, so the distance from the origin is no measure)
  const dist = () => ev<number>(`() => Math.hypot(...window.__cad.cam.eye.map((v, i) => v - window.__cad.held[i]))`);
  const heldAt = () => ev<number[]>(`() => window.__cad.held.map((v) => Math.round(v * 10) / 10)`);
  await zButton(); // a straight view
  await page.waitForTimeout(900);
  const seen: number[] = [],
    helds: string[] = [];
  for (let i = 0; i < 5; i++) {
    await page.mouse.move(200, 400);
    await page.mouse.down();
    for (let k = 1; k <= 16; k++) await page.mouse.move(200 + k * 5, 400 + k, { steps: 1 }); // just enough to go out
    await page.mouse.up();
    await page.waitForTimeout(1000); // fully out: the 3D view it entered
    seen.push(await dist());
    helds.push((await heldAt()).join());
    await zButton(); // back to the straight view
    await page.waitForTimeout(900);
  }
  const spread = Math.max(...seen) / Math.min(...seen);
  ok(new Set(helds).size === 1, `the same point is held each time: ${[...new Set(helds)].join(" | ")}`);
  ok(
    spread < 1.01,
    `the 3D view entered is the same each time: eye distances from the point held ${seen.map((x) => x.toFixed(0)).join(", ")} (spread ${spread.toFixed(3)})`,
  );
  ok(errors.length === 0, `no errors in the page ${errors.join(" | ").slice(0, 300)}`);
  await close();
} finally {
  await S.stop();
}
finish();
