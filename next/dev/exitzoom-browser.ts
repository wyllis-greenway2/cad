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
  const dist = () => ev<number>(`() => Math.hypot(...window.__cad.cam.eye)`);
  await zButton(); // a straight view
  await page.waitForTimeout(900);
  const seen: number[] = [];
  for (let i = 0; i < 5; i++) {
    await page.mouse.move(200, 400);
    await page.mouse.down();
    for (let k = 1; k <= 16; k++) await page.mouse.move(200 + k * 5, 400 + k, { steps: 1 }); // just enough to go out
    await page.mouse.up();
    await page.waitForTimeout(1000); // fully out: the 3D view it entered
    seen.push(await dist());
    await zButton(); // back to the straight view
    await page.waitForTimeout(900);
  }
  const spread = Math.max(...seen) / Math.min(...seen);
  ok(
    spread < 1.03,
    `the 3D view entered is the same each time: eye distances ${seen.map((x) => x.toFixed(0)).join(", ")} (spread ${spread.toFixed(3)})`,
  );
  ok(errors.length === 0, `no errors in the page ${errors.join(" | ").slice(0, 300)}`);
  await close();
} finally {
  await S.stop();
}
finish();
