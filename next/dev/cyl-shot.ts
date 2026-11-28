// A screenshot of a cylinder's wall picked, hovered and pulled (scaffolding, not a check).
//   node --experimental-strip-types dev/cyl-shot.ts <dir>
import { S, dir, evalIn } from "./page-lib.ts";
import { writeFileSync } from "node:fs";
try {
  const { page, close } = await S.open("");
  const ev = evalIn(page);
  await ev(`() => { window.__studio.change([{ id: "s1", kind: "sketchCircle", params: { r: 20 }, inputs: [] }, { id: "e1", kind: "extrude", params: { d: 20 }, inputs: ["s1"] }]); return 1; }`);
  await ev(`() => window.__studio.settled()`);
  await page.waitForTimeout(700);
  const p3 = (p: number[]) => ev<[number, number]>(`() => window.__proj3([${p}])`);
  const shot = async (n: string) => writeFileSync(`${dir}/${n}.png`, await page.screenshot());
  const [wx, wy] = await p3([14.1, 14.1, 10]);
  await page.mouse.move(wx, wy);
  await page.waitForTimeout(500);
  await shot("c1-hover-wall");
  await page.mouse.click(wx, wy);
  await page.waitForTimeout(1000);
  await shot("c2-wall-picked");
  console.log(JSON.stringify(await ev(`() => ({ pull: window.__ext.debug().pull, sel: window.__bodies.debug() })`)).slice(0, 600));
  const [tx, ty] = await p3([5, 5, 20]);
  await page.mouse.click(1000, 600);
  await page.mouse.move(tx, ty);
  await page.waitForTimeout(500);
  await shot("c3-hover-top");
  await close();
} finally {
  await S.stop();
}
