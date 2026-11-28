// A screenshot of three overlapping circles: every closed part is tinted, the world's panes in the same look (scaffolding, not a check).
//   node --experimental-strip-types dev/fills-shot.ts <dir>
import { S, dir, evalIn, pxIn, clickIn } from "./page-lib.ts";
import { writeFileSync } from "node:fs";
try {
  const { page, close } = await S.open("");
  const ev = evalIn(page);
  const click = clickIn(page, pxIn(ev), 120);
  await ev(`() => window.__tool("circle")`);
  await page.waitForTimeout(900);
  for (const [cx, cy, ex, ey] of [[0, 0, 10, 0], [12, 0, 22, 0], [6, 10, 16, 10]]) {
    await click(cx, cy);
    await click(ex, ey);
  }
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  writeFileSync(`${dir}/fills.png`, await page.screenshot());
  await close();
} finally {
  await S.stop();
}
