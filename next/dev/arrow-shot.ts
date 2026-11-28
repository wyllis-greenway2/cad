// Screenshots of the pull arrow picked, pointed at and taken (scaffolding, not a check).
import { S, dir, evalIn } from "./page-lib.ts";
import { writeFileSync } from "node:fs";
try {
  const { page, close } = await S.open("");
  const ev = evalIn(page);
  await ev(`() => { window.__studio.change([{ id: "s1", kind: "sketchPolygon", params: { points: [[-20, -10], [20, -10], [20, 10], [-20, 10]] }, inputs: [] }, { id: "e1", kind: "extrude", params: { d: 20 }, inputs: ["s1"] }]); return 1; }`);
  await ev(`() => window.__studio.settled()`);
  await page.waitForTimeout(700);
  const p3 = (p: number[]) => ev<[number, number]>(`() => window.__proj3([${p}])`);
  const shot = async (n: string) => writeFileSync(`${dir}/${n}.png`, await page.screenshot());
  const [gx, gy] = await p3([12, 4, 20]);
  await page.mouse.click(gx, gy);
  await page.waitForTimeout(1000);
  await shot("a1-picked");
  const [ax, ay] = await p3([0, 0, 20]);
  await page.mouse.move(ax, ay);
  await page.waitForTimeout(400);
  await shot("a2-hover-arrow");
  await page.mouse.down();
  await page.mouse.move(ax, ay - 40, { steps: 8 });
  await page.waitForTimeout(400);
  await shot("a3-dragging");
  await page.mouse.up();
  await close();
} finally {
  await S.stop();
}
