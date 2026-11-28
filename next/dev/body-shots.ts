// Screenshots of how a body is picked and handled, to set beside the old app's (`dec_body_look_and_feel`): scaffolding, not a check.
//   node --experimental-strip-types dev/body-shots.ts <dir>
import { S, dir, evalIn } from "./page-lib.ts";
import { writeFileSync } from "node:fs";
try {
  const { page, errors, close } = await S.open("");
  const ev = evalIn(page);
  await ev(
    `() => { window.__studio.change([{ id: "s1", kind: "sketchPolygon", params: { points: [[-20, -10], [20, -10], [20, 10], [-20, 10]] }, inputs: [] }, { id: "e1", kind: "extrude", params: { d: 20 }, inputs: ["s1"] }]); return 1; }`,
  );
  await ev(`() => window.__studio.settled()`);
  await page.waitForTimeout(600);
  const p3 = (p: number[]) => ev<[number, number]>(`() => window.__proj3([${p}])`);
  const shot = async (name: string) => writeFileSync(`${dir}/${name}.png`, await page.screenshot());
  const [fx, fy] = await p3([0, 0, 20]);
  await page.mouse.move(fx, fy);
  await page.waitForTimeout(400);
  await shot("n1-hover-face");
  await page.mouse.click(fx, fy);
  await page.waitForTimeout(90);
  await shot("n2-face-click-early");
  await page.waitForTimeout(900);
  await shot("n3-face-picked");
  await shot("n4-face-pull");
  await page.mouse.click(fx + 150, fy + 150, { clickCount: 1 }); // elsewhere on the body: the untouched arrow goes, the click picks
  await page.waitForTimeout(500);
  const [ex, ey] = await p3([0, -10, 20]);
  await page.mouse.move(ex, ey);
  await page.waitForTimeout(400);
  await shot("n5-hover-edge");
  await page.mouse.click(ex, ey);
  await page.waitForTimeout(600);
  await shot("n6-edge-picked-with-arrow");
  await page.mouse.click(fx + 80, fy - 20, { clickCount: 1 }); // (not on the arrow: that is a grab)
  await page.waitForTimeout(300);
  await page.mouse.click(fx + 80, fy - 20, { clickCount: 2 });
  await page.waitForTimeout(700);
  await shot("n7-body-picked-orb");
  console.log(JSON.stringify(await ev<any>(`() => ({ b: window.__bodies.debug(), mv: window.__bmove.debug() })`)));
  console.log("errors:", JSON.stringify(errors));
  await close();
} finally {
  await S.stop();
}
