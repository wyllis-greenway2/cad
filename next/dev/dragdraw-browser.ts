// A dev check in the real page (not a test, `in_1444`): with a sketch tool on, a left press and any drag is the sketch's and never turns the view: a circle is drawn by pressing at its centre and letting go on the circle, a rectangle from corner to corner; clicks still work (`in_1734`). Both buttons down and dragged draw a box; the right button alone turns the view.
//   node --experimental-strip-types dev/dragdraw-browser.ts
import { S, ok, finish, evalIn, pxIn } from "./page-lib.ts";
try {
  const { page, errors, close } = await S.open("");
  const ev = evalIn(page);
  const px = pxIn(ev);
  const cam = () => ev<string>(`() => JSON.stringify(window.__cad.cam)`);
  const drawn = () =>
    ev<any>(`() => { const s = window.__sketch.snapshot(); const k = Object.keys(s)[0]; return k ? s[k] : null; }`);
  const drag = async (a: [number, number], b: [number, number], steps = 8) => {
    const [x0, y0] = await px(...a);
    const [x1, y1] = await px(...b);
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    await page.mouse.move(x1, y1, { steps });
    await page.mouse.up();
    await page.waitForTimeout(200);
  };
  const step = () => ev<number | null>(`() => window.__sketch.drawStep()`);
  await ev(`() => window.__tool("circle")`);
  await page.waitForTimeout(900);
  const cam0 = await cam();
  // a press and a drag is ONE click, where it is let go: it begins the circle; the circle ends at the next click (not at the release)
  await drag([0, 0], [10, 0]);
  ok(
    (await step()) === 1 && ((await drawn())?.circles?.length ?? 0) === 0,
    `a drag with the circle tool begins the circle and does not end it: step ${await step()}`,
  );
  ok((await cam()) === cam0, "and the view did not turn");
  const [x2, y2] = await px(25, 0);
  await page.mouse.click(x2, y2);
  await page.waitForTimeout(250);
  const d = await drawn();
  ok(
    !!d && (d.circles?.length ?? 0) === 1 && Math.abs(d.circles[0].r - 15) < 0.5,
    `the next click ends it: ${JSON.stringify(d?.circles)}`,
  );
  await page.keyboard.press("Escape");
  // a drag of a few pixels is the same: one click
  await ev(`() => window.__tool("circle")`);
  await page.waitForTimeout(700);
  await drag([-30, -30], [-29.8, -29.8], 2);
  ok((await step()) === 1 && (await cam()) === cam0, "a short drag is one click and does not turn the view");
  await page.keyboard.press("Escape");
  // with no tool a left drag turns the view, a right drag turns it, both buttons draw a box
  await page.waitForTimeout(300);
  const [ex, ey] = [500, 300];
  await page.mouse.move(ex, ey);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(ex + 220, ey + 90, { steps: 10 });
  await page.mouse.up({ button: "right" });
  ok((await cam()) !== cam0, "a right drag turns the view");
  ok(errors.length === 0, `no errors in the page ${errors.join(" | ").slice(0, 300)}`);
  await close();
} finally {
  await S.stop();
}
finish();
