// A dev check in the real page (scaffolding): an offered constraint that would move a part shows a dashed arrow from where it is to where it would be, with the offer in the middle (`in_1631`).
//   node --experimental-strip-types dev/moves-browser.ts [screenshot-dir]
import { S, dir, ok, finish, evalIn, pxIn, clickIn } from "./page-lib.ts";
import { writeFileSync } from "node:fs";
try {
  const { page, errors, close } = await S.open(""),
    ev = evalIn(page),
    px = pxIn(ev),
    click = clickIn(page, px, 100);
  await ev(`() => window.__tool("circle")`);
  await page.waitForTimeout(900);
  await click(30, 10);
  await click(35, 10);
  await ev(`() => window.__sketch.stop()`);
  await ev(`() => window.__tool("line")`);
  await page.waitForTimeout(300);
  await click(10, 10);
  await click(24.5, 10); // its end is 0.5 mm short of the edge (at 25)
  await ev(`() => window.__sketch.stop()`);
  await page.waitForTimeout(400);
  await click(16, 10); // the line is picked: its end shows the offers
  await page.waitForTimeout(500);
  // (drawing places an end on the edge when it is near; to have one off it, move it in the sketch's own numbers)
  await ev(
    `() => { const s = structuredClone(window.__sketch.snapshot()), k = Object.keys(s)[0]; s[k].points.find((p) => p.id === "P3").x = 24.75; s[k].points.find((p) => p.id === "P2").y = 14; window.__sketch.restore(s); }`,
  );
  await click(17, 12.1);
  await page.waitForTimeout(500);
  await page.waitForTimeout(300);
  const ls = await ev<any[]>(
    `() => window.__sketch.lines(null).filter((l) => l.kind === "move" || l.kind === "moveHead")`,
  );
  ok(ls.length >= 2, `an offer that would move a part has its arrow: ${ls.length} lines`);
  writeFileSync(`${dir}/moves-1.png`, await page.screenshot());
  ok(errors.length === 0, `no errors in the page ${errors.join("; ")}`);
  await close();
} finally {
  await S.stop();
}
finish();
