// A dev check in the real page (not a test, `in_1444`): the round arrow of a circle's rim points out of the body between the top and the wall AT the place it stands: up and straight out from the axis there, whichever place of the rim it is clicked at (`in_1735`).
//   node --experimental-strip-types dev/rim-browser.ts
import { S, ok, finish, evalIn } from "./page-lib.ts";
try {
  const { page, errors, close } = await S.open("");
  const ev = evalIn(page);
  await ev(
    `() => { window.__studio.change([{ id: "s1", kind: "sketchCircle", params: { r: 20 }, inputs: [] }, { id: "e1", kind: "extrude", params: { d: 20 }, inputs: ["s1"] }]); return 1; }`,
  );
  await ev(`() => window.__studio.settled()`);
  await page.waitForTimeout(800);
  for (const deg of [20, 70, 100]) {
    const a = (deg * Math.PI) / 180,
      [x, y] = await ev<[number, number]>(`() => window.__proj3([${20 * Math.cos(a)}, ${20 * Math.sin(a)}, 20])`);
    await page.mouse.click(1000, 650);
    await page.waitForTimeout(300);
    await page.mouse.click(x, y);
    await page.waitForTimeout(800);
    const d = await ev<any>(`() => window.__ext.debug().pull`);
    const b = d?.arrow?.base as number[] | undefined,
      n = d?.arrow?.normal as number[] | undefined;
    const r = b ? Math.hypot(b[0]!, b[1]!) : 0;
    ok(
      !!b &&
        !!n &&
        Math.abs(n[2]! - Math.SQRT1_2) < 0.02 &&
        Math.abs(n[0]! * b[0]! + n[1]! * b[1]! - Math.SQRT1_2 * r) < 0.3,
      `at ${deg} degrees round the rim the arrow goes up and straight out from the axis: ${JSON.stringify(n?.map((v) => Math.round(v * 100) / 100))} from ${JSON.stringify(b?.map((v) => Math.round(v * 10) / 10))}`,
    );
  }
  ok(errors.length === 0, `no errors in the page ${errors.join(" | ").slice(0, 300)}`);
  await close();
} finally {
  await S.stop();
}
finish();
