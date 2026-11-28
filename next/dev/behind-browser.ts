// A dev check in the real page (not a test, `in_1444`): what is behind a body's surface cannot be picked: a line of a drawing under a body is not selected by a click on the body (`in_1739`: it was, through the face). And the orb's orient mode puts the orb where a surface is clicked (the old app's), and free move shows its icon over the ball.
//   node --experimental-strip-types dev/behind-browser.ts
import { S, ok, finish, evalIn } from "./page-lib.ts";
try {
  const { page, errors, close } = await S.open("");
  const ev = evalIn(page);
  const sq = (a: number, b: number) => ({
    arcs: [],
    circles: [],
    constraints: [],
    lines: [
      { id: "L1", a: "P1", b: "P2" },
      { id: "L2", a: "P2", b: "P3" },
      { id: "L3", a: "P3", b: "P4" },
      { id: "L4", a: "P4", b: "P1" },
    ],
    points: [
      { id: "P1", x: a, y: a },
      { id: "P2", x: b, y: a },
      { id: "P3", x: b, y: b },
      { id: "P4", x: a, y: b },
    ],
  });
  const steps = [
    {
      id: "s1",
      kind: "sketchPolygon",
      params: {
        points: [
          [-10, -10],
          [40, -10],
          [40, 30],
          [-10, 30],
        ],
      },
      inputs: [],
    },
    { id: "e1", kind: "extrude", params: { d: 20 }, inputs: ["s1"] },
  ];
  await ev(
    `() => { window.__restore({ sketches: ${JSON.stringify({ "world:2": sq(0, 30) })}, steps: ${JSON.stringify(steps)}, faces: new Map() }); return 1; }`,
  );
  await ev(`() => window.__studio.settled()`);
  await page.waitForTimeout(900);
  const p3 = (p: number[]) => ev<[number, number]>(`() => window.__proj3([${p}])`);
  const sel = () => ev<any>(`() => window.__selection.get()`);
  // the drawing's line from (0,0) to (30,0) lies on the ground under the body: a click where it seems to be, through the body, picks the body
  const [lx, ly] = await p3([15, 0, 0]);
  await page.mouse.move(lx, ly);
  await page.waitForTimeout(300);
  await page.mouse.click(lx, ly);
  await page.waitForTimeout(500);
  const s = await sel();
  ok(s?.kind === "body", `a click over a line of a drawing under the body picks the body, not the line: ${s?.kind}`);
  // orient: the whole body, the ball twice, then a click on the top face puts the orb there
  await page.mouse.click(1000, 650);
  await page.waitForTimeout(300);
  const [tx, ty] = await p3([20, 10, 20]);
  await page.mouse.click(tx, ty);
  await page.waitForTimeout(500);
  await page.mouse.click(tx, ty, { clickCount: 2 });
  await page.waitForTimeout(700);
  const ball = async () => ev<number[]>(`() => window.__orb().handles.find((h) => h.kind === "ball").points[0]`);
  const [bx, by] = await p3(await ball());
  await page.mouse.click(bx, by);
  await page.waitForTimeout(400);
  ok(
    await page.evaluate(
      () => getComputedStyle(document.querySelector("[data-badge='move4']") as Element).display !== "none",
    ),
    "free move shows the pan arrows over the ball",
  );
  await page.mouse.click(bx, by);
  await page.waitForTimeout(400);
  const [fx, fy] = await p3([30, 5, 20]);
  await page.mouse.click(fx, fy);
  await page.waitForTimeout(500);
  const b = await ball();
  ok(
    Math.hypot(b[0]! - 30, b[1]! - 5, b[2]! - 20) < 0.6,
    `in orient a click on the top face puts the orb there: ${JSON.stringify(b.map((v) => Math.round(v * 10) / 10))}`,
  );
  ok(errors.length === 0, `no errors in the page ${errors.join(" | ").slice(0, 300)}`);
  await close();
} finally {
  await S.stop();
}
finish();
