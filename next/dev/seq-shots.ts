// The same sequence of pointer moves and clicks as a script drives in the old app, on a cylinder, for side by side screenshots (scaffolding, not a check).
//   node --experimental-strip-types dev/seq-shots.ts <dir>
import { S, dir, evalIn } from "./page-lib.ts";
import { writeFileSync } from "node:fs";
try {
  const { page, close } = await S.open("");
  const ev = evalIn(page);
  await ev(`() => { window.__studio.change([{ id: "s1", kind: "sketchCircle", params: { r: 20 }, inputs: [] }, { id: "e1", kind: "extrude", params: { d: 20 }, inputs: ["s1"] }]); return 1; }`);
  await ev(`() => window.__studio.settled()`);
  await page.waitForTimeout(1000);
  const pr = (p: number[]) => ev<[number, number]>(`() => window.__proj3([${p}])`);
  const shot = async (n: string) => {
    await page.waitForTimeout(700);
    writeFileSync(`${dir}/A-new-${n}.png`, await page.screenshot());
  };
  const wall = await pr([14.1, 14.1, 10]), top = await pr([8, 8, 20]), rim = await pr([14.14, 14.14, 20]);
  await page.mouse.move(...wall);
  await shot("1-hover-wall");
  await page.mouse.click(...wall);
  await page.waitForTimeout(600);
  await shot("2-click-wall");
  await page.mouse.click(1000, 650);
  await page.waitForTimeout(400);
  await page.mouse.move(...top);
  await shot("3-hover-top");
  await page.mouse.click(...top);
  await page.waitForTimeout(600);
  await shot("4-click-top");
  await page.mouse.click(1000, 650);
  await page.waitForTimeout(400);
  await page.mouse.move(...rim);
  await shot("5-hover-rim");
  await page.mouse.click(...rim);
  await page.waitForTimeout(600);
  await shot("6-click-rim");
  await page.mouse.click(1000, 650);
  await page.waitForTimeout(400);
  await page.mouse.click(...wall);
  await page.waitForTimeout(300);
  await page.mouse.click(...wall);
  await page.waitForTimeout(300);
  await shot("7-double-click");
  await close();
} finally {
  await S.stop();
}
