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
    offer = marks.find((m) => m.id === "rel:on");
  ok(
    !!offer?.moves?.length,
    `a vertex and a circle picked: "on the circle" is offered with arrows: ${JSON.stringify(offer?.moves)}`,
  );
  const drawnArrows = () => ev<any[]>(`() => window.__sketch.lines(null).filter((l) => /^move/.test(l.kind))`),
    lit = () =>
      ev<any[]>(`() => window.__sketch.lines(null).filter((l) => /^lit/.test(l.kind) || l.kind === "tieBall")`);
  ok((await drawnArrows()).length === 0, "at rest nothing of the offer is drawn: no arrows");
  // point at its bubble, with a real mouse: the arrows and the parts it is about appear
  const chip = await page.evaluate(() => {
    const e = document.querySelector('[data-key^="rel:on|"]') as HTMLElement | null;
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  ok(!!chip, "the offer's bubble is on the page");
  await page.mouse.move(chip!.x, chip!.y);
  await page.waitForTimeout(250);
  ok(
    (await drawnArrows()).length >= 2,
    `pointing at the bubble draws what applying would move: ${(await drawnArrows()).length} lines`,
  );
  ok(
    (await drawnArrows()).some((l) => l.kind === "moveMain") &&
      (await drawnArrows()).some((l) => l.kind === "moveMainHead"),
    "the arrow of the parts it names is the main one",
  );
  ok((await lit()).length >= 2, `and lights the parts it is about: ${(await lit()).length} drawn`);
  writeFileSync(`${dir}/moves-hover.png`, await page.screenshot());
  await page.mouse.move(chip!.x + 300, chip!.y + 250, { steps: 6 });
  await page.waitForTimeout(250);
  ok((await drawnArrows()).length === 0 && (await lit()).length === 0, "and moving away takes them all away again");
  writeFileSync(`${dir}/moves-1.png`, await page.screenshot());
  // apply it: the same call as the arrows were made with
  await ev(`() => window.__sketch.handlers.suggest("rel:on")`);
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
  // the other way: one part selected, a vertex just off its edge: the selected circle goes to the vertex, the vertex stays (`in_1639`)
  await ev(`() => {
    const s = structuredClone(window.__sketch.snapshot()), k = Object.keys(s)[0];
    s[k] = { arcs: [], circles: [{ c: "P1", id: "K1", r: 5 }], constraints: [], lines: [{ a: "P2", b: "P3", id: "L1" }],
      points: [{ id: "P1", x: 10, y: 12 }, { id: "P2", x: 12, y: 30 }, { id: "P3", x: 15.2, y: 12 }] };
    window.__sketch.restore(s);
  }`);
  await page.waitForTimeout(400);
  await click(10, 17); // the circle's top edge
  await page.waitForTimeout(400);
  const near = (await ev<any[]>(`() => window.__sketch.marks(performance.now()).map((m) => m.mark)`)).find((m) =>
    m.id.startsWith("near:on"),
  );
  ok(
    near?.moves?.length === 1 && Math.abs(near.moves[0].from[0] - 15) < 0.05,
    `one circle selected, a vertex near its edge: one arrow, for the circle's edge: ${JSON.stringify(near?.moves)}`,
  );
  const b2 = await pts();
  await ev(`() => window.__sketch.handlers.suggest(${JSON.stringify(near?.id)})`);
  await page.waitForTimeout(300);
  const a2 = await pts();
  ok(
    Math.hypot(a2.P3![0] - b2.P3![0], a2.P3![1] - b2.P3![1]) < 1e-6 && Math.abs((await radius()) - 5.2) < 0.01,
    `and applied, the vertex stays and the circle's size goes to it: ${await radius()}`,
  );
  // the human's file (`in_1648`, `in_1652`): a vertex 0.14 mm off a circle, the middle of a tangent line: "on the circle" would turn the line 14 degrees, so it is not offered with the circle selected
  await ev(`() => {
    const s = structuredClone(window.__sketch.snapshot()), k = Object.keys(s)[0];
    s[k] = { arcs: [], circles: [{ c: "P1", id: "K1", r: 4.5256 }],
      constraints: [{ id: "c1", kind: "tangent", parts: ["L1", "K1"] }, { id: "c2", kind: "on", parts: ["P5", "L1"] }, { id: "c3", kind: "midpoint", parts: ["P5", "L1"] }],
      lines: [{ a: "P2", b: "P3", id: "L1" }, { a: "P4", b: "P5", id: "L2" }],
      points: [{ id: "P1", x: 18.0676, y: 21.9759 }, { id: "P2", x: 8.5385, y: 29.5809 }, { id: "P3", x: 28.0529, y: 23.688 }, { id: "P4", x: 21.4769, y: 39.1988 }, { id: "P5", x: 18.2957, y: 26.6345 }] };
    window.__sketch.restore(s);
  }`);
  await page.waitForTimeout(400);
  await click(18.0676, 21.9759 + 4.5256 * -1); // the circle's lower edge
  await page.waitForTimeout(400);
  const turn = (await ev<any[]>(`() => window.__sketch.marks(performance.now()).map((m) => m.mark)`)).filter((m) =>
    m.id.startsWith("near:on"),
  );
  ok(
    turn.length === 0,
    `the offer that would swing a tangent line 14 degrees is not made: ${JSON.stringify(turn.map((m) => m.id))}`,
  );
  // a line alone is offered level (or upright), whatever its angle, and applying it turns the line (`in_1662`)
  await ev(`() => {
    const s = structuredClone(window.__sketch.snapshot()), k = Object.keys(s)[0];
    s[k] = { arcs: [], circles: [], constraints: [], lines: [{ a: "P1", b: "P2", id: "L1" }],
      points: [{ id: "P1", x: 10, y: 10 }, { id: "P2", x: 30, y: 21 }] };
    window.__sketch.restore(s);
  }`);
  await page.waitForTimeout(400);
  await click(20, 15.5);
  await page.waitForTimeout(400);
  const lm = (await ev<any[]>(`() => window.__sketch.marks(performance.now()).map((m) => m.mark)`)).find(
    (m) => m.id === "rel:horizontal",
  );
  ok(
    !!lm && lm.moves?.length > 0,
    `a line 30 degrees up is offered level, with the turn it would make: ${JSON.stringify(lm?.moves)}`,
  );
  await ev(`() => window.__sketch.handlers.suggest("rel:horizontal")`);
  await page.waitForTimeout(300);
  const lp = await pts();
  ok(Math.abs(lp.P1![1] - lp.P2![1]) < 1e-6, `and applying it makes the line level: ${JSON.stringify(lp)}`);
  ok(errors.length === 0, `no errors in the page ${errors.join("; ")}`);
  await close();
} finally {
  await S.stop();
}
finish();
