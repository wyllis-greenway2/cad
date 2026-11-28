// A dev check in the real page (not a test, `in_1444`): a closed figure of a drawing is picked by a click inside it and offers its extrude arrow by itself, as a face of a body does (`dec_body_look_and_feel`, `in_1716`); the Extrude tool of the ring still does it too (`extrude-browser`).
//   node --experimental-strip-types dev/regionpick-browser.ts [screenshot-dir]
import { S, dir, ok, finish, evalIn, pxIn, clickIn } from "./page-lib.ts";
import { writeFileSync } from "node:fs";
try {
  const { page, errors, close } = await S.open("");
  const ev = evalIn(page);
  const px = pxIn(ev);
  const click = clickIn(page, px, 120);
  const shot = async (n: string) => writeFileSync(`${dir}/${n}.png`, await page.screenshot());
  const state = () =>
    ev<any>(
      `() => ({ pull: window.__ext.debug().pull, steps: window.__studio.state().steps.map((x) => x.kind), tool: window.__sketch.tool() })`,
    );
  await ev(`() => window.__tool("rect")`);
  await page.waitForTimeout(900);
  await click(0, 0);
  await click(40, 25); // a rectangle, 40 by 25 mm
  await page.keyboard.press("Escape"); // the tool put away
  await page.waitForTimeout(300);
  ok((await state()).tool === null && (await state()).pull === null, "a rectangle is drawn and no tool is on");

  // hover: the orb's disc on the figure
  const [hx, hy] = await px(30, 5);
  await page.mouse.move(hx, hy);
  await page.waitForTimeout(400);
  await shot("r1-hover");

  // a click inside it, with no tool: it is picked and its extrude arrow shows by itself, in its middle
  const [cx, cy] = await px(30, 5);
  const cam0 = await ev<any>(`() => JSON.stringify(window.__cad.cam)`);
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(900);
  let s = await state();
  ok(s.pull?.mode === "extrude", `a click inside the figure opens its extrude by itself: ${s.pull?.mode}`);
  const [bx, by] = await px(s.pull.arrow.base[0], s.pull.arrow.base[1]); // (the arrow stands on the figure near where it was clicked, as a face's does: not under the click)
  const away = Math.hypot(bx - cx, by - cy);
  ok(
    s.pull.arrow.base[0] > 0 &&
      s.pull.arrow.base[0] < 40 &&
      s.pull.arrow.base[1] > 0 &&
      s.pull.arrow.base[1] < 25 &&
      away > 25 &&
      away < 90,
    `the arrow stands on the figure a little way (${Math.round(away)} px) from where it was clicked: ${JSON.stringify(s.pull.arrow.base)}`,
  );
  await shot("r2-picked");
  ok((await ev<any>(`() => JSON.stringify(window.__cad.cam)`)) === cam0, "and the camera did not move");

  // an untouched arrow goes on the next click, which does its own work: a click on nothing
  await page.mouse.click(1000, 600);
  await page.waitForTimeout(500);
  s = await state();
  ok(s.pull === null, "an untouched arrow is put away by a click elsewhere");

  // the same figure again brings it back (each click is a pick)
  const [ax, ay] = await px(30, 5); // (the view tilts to show a pull, so where the figure is on the screen has changed)
  await page.mouse.click(ax, ay);
  await page.waitForTimeout(700);
  s = await state();
  ok(s.pull?.mode === "extrude", "a click inside the figure again brings its arrow back");

  await shot("r2b-again");
  // digits typed with the arrow showing begin its number, as the old app's did; one Enter sets it and makes the body
  await page.keyboard.type("12");
  await page.waitForTimeout(200);
  s = await state();
  ok(
    await page.evaluate(() => !!document.activeElement && document.activeElement.tagName === "INPUT"),
    "digits typed with the arrow showing go to its number",
  );
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);
  s = await state();
  ok(s.steps.includes("extrude"), `Enter makes the body: ${s.steps.join(",")}`);
  ok(s.pull === null, "and the figure is let go");
  await shot("r3-made");
  // the body made stands over the figure it was made from (the figure is on its underside): a click on the body's top picks the body's face, not the figure behind it (the old app's surface came first)
  await page.waitForTimeout(500);
  const [tx, ty] = await ev<[number, number]>(`() => window.__proj3([30, 5, 12])`);
  await page.mouse.click(tx, ty);
  await page.waitForTimeout(700);
  const sel = await ev<any>(`() => window.__selection.get()`);
  ok(
    sel?.kind === "body" && sel.faces?.length === 1,
    `a click on the top of the body picks its face, not the figure behind it: ${JSON.stringify(sel)?.slice(0, 160)}`,
  );
  ok(errors.length === 0, `no errors in the page ${errors.join(" | ").slice(0, 300)}`);
  await close();
} finally {
  await S.stop();
}
finish();
