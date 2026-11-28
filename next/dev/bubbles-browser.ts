// A dev check in the real page (scaffolding): a bubble is dragged only while the button is down (a press let go off it is over), and while one is pointed at the others fade (`in_1674`).
//   node --experimental-strip-types dev/bubbles-browser.ts
import { S, ok, finish, evalIn, pxIn, clickIn } from "./page-lib.ts";
try {
  const { page, errors, close } = await S.open(""),
    ev = evalIn(page),
    px = pxIn(ev),
    click = clickIn(page, px, 100);
  await ev(`() => window.__tool("line")`);
  await page.waitForTimeout(600);
  await click(10, 10);
  await click(20, 10);
  await ev(`() => window.__sketch.stop()`);
  await ev(`() => {
    const s = structuredClone(window.__sketch.snapshot()), k = Object.keys(s)[0];
    s[k] = { arcs: [], circles: [{ c: "P1", id: "K1", r: 7 }], constraints: [], lines: [{ a: "P2", b: "P3", id: "L1" }],
      points: [{ id: "P1", x: 15, y: 20 }, { id: "P2", x: 32, y: 14 }, { id: "P3", x: 46, y: 22 }] };
    window.__sketch.restore(s);
  }`);
  await page.waitForTimeout(400);
  await click(22, 20); // the circle
  await page.waitForTimeout(500);
  const box = (re: string) =>
    page.evaluate((re) => {
      const e = [...document.querySelectorAll("[data-key]")].find((x) =>
        new RegExp(re).test(x.getAttribute("data-key") ?? ""),
      ) as HTMLElement | undefined;
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, l: r.x, w: r.width };
    }, re);
  const opac = () =>
    page.evaluate(() =>
      [...document.querySelectorAll("[data-key]")].map((e) =>
        Number(getComputedStyle((e as HTMLElement).firstElementChild ?? e).opacity),
      ),
    );
  const a = (await box("^measure"))!;
  // press on the bubble's edge, let go well away from it, come back with no button down: it must not follow the pointer
  await page.mouse.move(a.l + 3, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 400, a.y + 200); // one jump: the bubble never sees where it ends
  await page.mouse.up();
  await page.mouse.move(a.x, a.y, { steps: 6 });
  await page.mouse.move(a.x + 40, a.y + 30, { steps: 6 });
  await page.waitForTimeout(250);
  const b = (await box("^measure"))!;
  ok(
    Math.abs(b.x - a.x) < 2 && Math.abs(b.y - a.y) < 2,
    `hovering a bubble after a press let go off it does not drag it: (${a.x.toFixed(0)}, ${a.y.toFixed(0)}) to (${b.x.toFixed(0)}, ${b.y.toFixed(0)})`,
  );
  // a real drag still works
  await page.mouse.move(b.l + 3, b.y);
  await page.mouse.down();
  await page.mouse.move(b.l + 3 + 80, b.y + 60, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const c = (await box("^measure"))!;
  ok(
    Math.abs(c.x - b.x - 80) < 6 && Math.abs(c.y - b.y - 60) < 6,
    `a drag with the button down still moves it: ${(c.x - b.x).toFixed(0)}, ${(c.y - b.y).toFixed(0)}`,
  );
  // the others fade while one is pointed at: a line shows its length and what it can be offered
  await page.mouse.move(5, 5, { steps: 4 });
  await click(39, 18.2); // line L1
  await page.waitForTimeout(500);
  const m2 = (await box("^measure"))!;
  ok((await opac()).length >= 2, `the line has several bubbles: ${(await opac()).length}`);
  await page.mouse.move(m2.x, m2.y);
  await page.waitForTimeout(300);
  const during = await opac();
  ok(
    during.filter((o) => o > 0.9).length === 1 && during.filter((o) => o < 0.4).length >= 1,
    `one bubble pointed at: the others fade (${during.map((o) => o.toFixed(1)).join(" ")})`,
  );
  await page.mouse.move(5, 5, { steps: 5 });
  await page.waitForTimeout(300);
  ok(
    (await opac()).every((o) => o > 0.9),
    "and they come back when it is let go",
  );
  ok(errors.length === 0, `no errors in the page ${errors.join("; ")}`);
  await close();
} finally {
  await S.stop();
}
finish();
