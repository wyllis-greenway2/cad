// A dev check in the real page (not a test, `in_1444`): a box drawn on the screen picks the parts of a drawing wholly in it (`in_1738`): two circles in the box, a third out of it.
//   node --experimental-strip-types dev/boxsketch-browser.ts
import { S, ok, finish, evalIn } from "./page-lib.ts";
try {
  const { page, errors, close } = await S.open("");
  const ev = evalIn(page);
  const sk = (cs: [number, number][]) => ({
    arcs: [],
    circles: cs.map(([,], i) => ({ c: `P${i + 1}`, id: `K${i + 1}`, r: 4 })),
    constraints: [],
    lines: [],
    points: cs.map(([x, y], i) => ({ id: `P${i + 1}`, x, y })),
  });
  await ev(
    `() => { window.__restore({ sketches: ${JSON.stringify({
      "world:2": sk([
        [0, 0],
        [14, 0],
        [60, 40],
      ]),
    })}, steps: [], faces: new Map() }); return 1; }`,
  );
  await page.waitForTimeout(900);
  const p3 = (p: number[]) => ev<[number, number]>(`() => window.__proj3([${p}])`);
  const [ax, ay] = await p3([-8, -8, 0]);
  const [bx, by] = await p3([22, 8, 0]);
  const x0 = Math.min(ax, bx),
    x1 = Math.max(ax, bx),
    y0 = Math.min(ay, by),
    y1 = Math.max(ay, by);
  await ev(`() => { window.__box.arm(); return 1; }`);
  await page.mouse.move(x0 - 45, y0 - 45);
  await page.mouse.down();
  await page.mouse.move(x1 + 45, y1 + 45, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  const s = await ev<any>(`() => window.__selection.get()`);
  ok(
    s?.kind === "sketch" && s.ids.length === 2 && s.ids.every((i: string) => i.startsWith("K")),
    `a box round two circles picks them (not the third): ${JSON.stringify(s)}`,
  );
  ok(errors.length === 0, `no errors in the page ${errors.join(" | ").slice(0, 300)}`);
  await close();
} finally {
  await S.stop();
}
finish();
