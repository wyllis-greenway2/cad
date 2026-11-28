// A dev check in the real page (scaffolding): a measured number stands on its own dimension line, drawn only when the number is pointed at: a circle's size a dashed radial line, a line's length a dashed line beside it, an arrow tip at each end (`in_1650`, `in_1666`).
//   node --experimental-strip-types dev/dims-browser.ts [screenshot-dir]
import { S, dir, ok, finish, evalIn, pxIn, clickIn } from "./page-lib.ts";
import { writeFileSync } from "node:fs";
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
    s[k] = { arcs: [], circles: [{ c: "P1", id: "K1", r: 7 }], constraints: [],
      lines: [{ a: "P2", b: "P3", id: "L1" }],
      points: [{ id: "P1", x: 15, y: 20 }, { id: "P2", x: 32, y: 14 }, { id: "P3", x: 46, y: 22 }] };
    window.__sketch.restore(s);
  }`);
  await page.waitForTimeout(400);
  const dimLines = () => ev<any[]>(`() => window.__sketch.lines(null).filter((l) => /^dim/.test(l.kind))`);
  const bubble = (re: string) =>
    page.evaluate((re) => {
      const e = [...document.querySelectorAll("[data-key]")].find((x) =>
        new RegExp(re).test(x.getAttribute("data-key") ?? ""),
      ) as HTMLElement | undefined;
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, re);
  // the circle: its size is a number on a radial line
  await click(15 + 7, 20); // the circle's edge
  await page.waitForTimeout(500);
  ok((await dimLines()).length === 0, "at rest no dimension line is drawn");
  const b1 = await bubble("^measure");
  ok(!!b1, "the circle's size is a number bubble");
  await page.mouse.move(b1!.x, b1!.y);
  await page.waitForTimeout(250);
  const d1 = await dimLines();
  ok(
    d1.some((l) => l.kind === "dim") && d1.filter((l) => l.kind === "dimHead").length === 2,
    `pointing at it draws a dashed radial line with an arrow tip at each end: ${d1.map((l) => l.kind).join()}`,
  );
  const dl = d1.find((l) => l.kind === "dim");
  const len = dl ? Math.hypot(dl.pts[1][0] - dl.pts[0][0], dl.pts[1][1] - dl.pts[0][1]) : 0;
  ok(Math.abs(len - 7) < 0.05 * 7 || Math.abs(len - 7) < 0.6, `the line is one radius long (7 mm): ${len.toFixed(2)}`);
  writeFileSync(`${dir}/dims-circle.png`, await page.screenshot());
  await page.mouse.move(b1!.x + 300, b1!.y + 250, { steps: 6 });
  await page.waitForTimeout(250);
  ok((await dimLines()).length === 0, "moving away takes it away again");
  // the line: its length is a number on a dashed line beside it
  await click(39, 18.2); // line L1 (from (32,14) to (46,22): its middle is (39,18))
  await page.waitForTimeout(500);
  const b2 = await bubble("^measure");
  ok(!!b2, "the line's length is a number bubble");
  if (b2) {
    await page.mouse.move(b2.x, b2.y);
    await page.waitForTimeout(250);
    const d2 = await dimLines();
    ok(
      d2.filter((l) => l.kind === "dim").length === 1 &&
        d2.filter((l) => l.kind === "dimExt").length === 2 &&
        d2.filter((l) => l.kind === "dimHead").length === 2,
      `pointing at it draws a dashed line beside the line, two thin lines to it, two arrow tips: ${d2.map((l) => l.kind).join()}`,
    );
    writeFileSync(`${dir}/dims-line.png`, await page.screenshot());
  }
  ok(errors.length === 0, `no errors in the page ${errors.join("; ")}`);
  await close();
} finally {
  await S.stop();
}
finish();
