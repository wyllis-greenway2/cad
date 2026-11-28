// A dev check in the real page (not a test, `in_1444`): the wall of a cylinder picked and pulled shows its diameter as the number (the old app's, `MD-53`): 40 to begin with, 50 typed makes the radius 25 (an offset of 5).
//   node --experimental-strip-types dev/wall-browser.ts [screenshot-dir]
import { S, ok, finish, evalIn } from "./page-lib.ts";
try {
  const { page, errors, close } = await S.open("");
  const ev = evalIn(page);
  await ev(
    `() => { window.__studio.change([{ id: "s1", kind: "sketchCircle", params: { r: 20 }, inputs: [] }, { id: "e1", kind: "extrude", params: { d: 20 }, inputs: ["s1"] }]); return 1; }`,
  );
  await ev(`() => window.__studio.settled()`);
  await page.waitForTimeout(700);
  const [wx, wy] = await ev<[number, number]>(`() => window.__proj3([14.1, 14.1, 10])`);
  await page.mouse.click(wx, wy);
  await page.waitForTimeout(900);
  let d = await ev<any>(`() => window.__ext.debug().pull`);
  ok(d?.kind === "offset", `a click on the wall opens its offset: ${d?.kind}`);
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(250);
  const shown = await page.evaluate(() => document.querySelector("[data-fact='d']")?.textContent ?? "");
  ok(/40\.1/.test(shown), `the number is the diameter (Arrow Up makes it 40.1): ${shown}`);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.mouse.click(wx, wy);
  await page.waitForTimeout(900);
  await page.keyboard.type("5");
  await page.waitForTimeout(250);
  await page.keyboard.type("0");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);
  const r = await ev<any>(
    `() => ({ steps: window.__studio.state().steps.map((s) => [s.kind, s.params.dist]), problem: window.__studio.state().problem })`,
  );
  ok(
    r.steps.at(-1)?.[0] === "offsetFace" && Math.abs(r.steps.at(-1)[1] - 5) < 1e-9,
    `50 typed makes an offset of 5: ${JSON.stringify(r.steps.at(-1))} ${r.problem}`,
  );
  ok(errors.length === 0, `no errors in the page ${errors.join(" | ").slice(0, 300)}`);
  await close();
} finally {
  await S.stop();
}
finish();
