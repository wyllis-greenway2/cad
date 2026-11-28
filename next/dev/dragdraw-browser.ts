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
  await ev(`() => window.__tool("circle")`);
  await page.waitForTimeout(900);
  const cam0 = await cam();
  await drag([0, 0], [15, 0]);
  let d = await drawn();
  ok(
    !!d && (d.circles?.length ?? 0) === 1,
    `a drag with the circle tool draws a circle: ${JSON.stringify(d)?.slice(0, 120)}`,
  );
  ok((await cam()) === cam0, "and the view did not turn");
  // a drag that is only a few pixels is the sketch's too
  await ev(`() => window.__tool("rect")`);
  await page.waitForTimeout(700);
  await drag([30, 0], [30.2, 0.2], 2);
  ok((await cam()) === cam0, "a short drag does not turn the view either");
  await page.keyboard.press("Escape");
  await ev(`() => window.__tool("rect")`);
  await page.waitForTimeout(500);
  await drag([-30, -20], [-10, -5]);
  d = await drawn();
  ok((d?.lines?.length ?? 0) >= 4, `a drag with the rectangle tool draws a rectangle: ${d?.lines?.length} lines`);
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
