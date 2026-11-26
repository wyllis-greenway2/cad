// A dev check in the real page (scaffolding): the arrows of an offer are what applying it does (`in_1638`): a vertex and a circle are picked, "on the circle" is offered with arrows, it is applied, and every point that moved did so exactly as an arrow said, and nothing else moved.
//   node --experimental-strip-types dev/moves-browser.ts [screenshot-dir]
import { S, dir, ok, finish, evalIn, pxIn, clickIn } from "./page-lib.ts";
import { writeFileSync } from "node:fs";
try {
  const { page, errors, close } = await S.open(""),
    ev = evalIn(page),
    px = pxIn(ev),
    click = clickIn(page, px, 100);
  await ev(`() => window.__tool("line")`);
  await page.waitForTimeout(600);
  await click(10, 10); // (a sketch exists on the plane, then it is replaced by the numbers below)
  await click(20, 10);
  await ev(`() => window.__sketch.stop()`);
  await ev(`() => {
    const s = structuredClone(window.__sketch.snapshot()), k = Object.keys(s)[0];
    s[k] = { arcs: [], circles: [{ c: "P1", id: "K1", r: 5 }], constraints: [], lines: [{ a: "P2", b: "P3", id: "L1" }],
      points: [{ id: "P1", x: 10, y: 12 }, { id: "P2", x: 12, y: 30 }, { id: "P3", x: 30, y: 20 }] };
    window.__sketch.restore(s);
  }`);
  await page.waitForTimeout(500);
  const pts = async () =>
    Object.fromEntries(
      (Object.values(await ev<any>(`() => window.__sketch.snapshot()`))[0] as any).points.map((p: any) => [
        p.id,
        [p.x, p.y],
      ]),
    ) as Record<string, [number, number]>;
  const radius = async () =>
    (Object.values(await ev<any>(`() => window.__sketch.snapshot()`))[0] as any).circles[0].r as number;
  const before = await pts(),
    r0 = await radius();
  await click(30, 20); // the vertex
  await page.keyboard.down("Shift");
  await click(10 + 5, 12); // the circle's edge
  await page.keyboard.up("Shift");
  await page.waitForTimeout(500);
  const marks = await ev<any[]>(`() => window.__sketch.marks(performance.now()).map((m) => m.mark)`),
    offer = marks.find((m) => m.id === "rel:pointOnCircle");
  ok(
    !!offer?.moves?.length,
    `a vertex and a circle picked: "on the circle" is offered with arrows: ${JSON.stringify(offer?.moves)}`,
  );
  const lines = await ev<any[]>(
    `() => window.__sketch.lines(null).filter((l) => l.kind === "move" || l.kind === "moveHead")`,
  );
  ok(lines.length >= 2, `and they are drawn: ${lines.length} lines`);
  writeFileSync(`${dir}/moves-1.png`, await page.screenshot());
  // apply it: the same call as the arrows were made with
  await ev(`() => window.__sketch.handlers.suggest("rel:pointOnCircle")`);
  await page.waitForTimeout(300);
  const after = await pts(),
    r1 = await radius();
  const arrows: { from: number[]; to: number[] }[] = offer?.moves ?? [],
    movedPoints = Object.keys(after).filter(
      (id) => Math.hypot(after[id]![0] - before[id]![0], after[id]![1] - before[id]![1]) > 1e-3,
    );
  const pointArrows = arrows.filter((a) =>
    Object.keys(before).some((id) => Math.hypot(before[id]![0] - a.from[0]!, before[id]![1] - a.from[1]!) < 1e-6),
  );
  ok(
    movedPoints.length === pointArrows.length &&
      movedPoints.every((id) =>
        pointArrows.some(
          (a) =>
            Math.hypot(before[id]![0] - a.from[0]!, before[id]![1] - a.from[1]!) < 1e-6 &&
            Math.hypot(after[id]![0] - a.to[0]!, after[id]![1] - a.to[1]!) < 1e-6,
        ),
      ),
    `every point that moved went where an arrow said, and no other: moved ${movedPoints} of ${pointArrows.length} arrows`,
  );
  ok(
    Math.abs(r1 - r0) > 1e-3 === arrows.length > pointArrows.length,
    `and the circle's edge has an arrow exactly when its size changed: ${r0} to ${r1}`,
  );
  ok(errors.length === 0, `no errors in the page ${errors.join("; ")}`);
  await close();
} finally {
  await S.stop();
}
finish();
