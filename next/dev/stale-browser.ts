// A dev check in the real page (not a test, `in_1444`): no step is made on a picture that is not yet of the steps before it (`in_1745`, `model_10.cad`: five moves each made from the same body, so only the last showed, the part seemed not to move): a move cannot begin while the last change is still being made; once it is made, the next move takes the body that move made.
//   node --experimental-strip-types dev/stale-browser.ts
import { S, ok, finish, evalIn } from "./page-lib.ts";
try {
  const { page, errors, close } = await S.open("");
  const ev = evalIn(page);
  const steps = [
    {
      id: "s1",
      kind: "sketchPolygon",
      params: {
        points: [
          [0, 0],
          [20, 0],
          [20, 10],
          [0, 10],
        ],
      },
      inputs: [],
    },
    { id: "e1", kind: "extrude", params: { d: 10 }, inputs: ["s1"] },
  ];
  await ev(
    `() => { window.__restore({ sketches: {}, steps: ${JSON.stringify(steps)}, faces: new Map() }); return 1; }`,
  );
  await ev(`() => window.__studio.settled()`);
  await page.waitForTimeout(800);
  const move = (cur: string) =>
    ev<boolean>(
      `() => { const ok = window.__bmove.start(${JSON.stringify(cur)}, []); if (!ok) return false; const t = window.__bmove.target().frame; window.__bmove.set({ ...t, origin: [t.origin[0], t.origin[1] + 5, t.origin[2]] }); window.__bmove.commit(); return true; }`,
    );
  ok(await move("e1"), "a move begins when nothing is being made");
  ok(!(await move("e1")), "a second move cannot begin at once, while the first is still being made");
  await ev(`() => window.__studio.settled()`);
  await page.waitForTimeout(600);
  const cur = await ev<string>(`() => window.__studio.state().current`);
  ok(cur === "m1", `the body is now the first move's: ${cur}`);
  ok(await move(cur), "and then the next move begins");
  await ev(`() => window.__studio.settled()`);
  await page.waitForTimeout(500);
  const inputs = await ev<string[][]>(
    `() => window.__studio.state().steps.filter((s) => s.kind === "move").map((s) => s.inputs)`,
  );
  ok(
    JSON.stringify(inputs) === JSON.stringify([["e1"], ["m1"]]),
    `the second move takes the first, not the body before it: ${JSON.stringify(inputs)}`,
  );
  ok(errors.length === 0, `no errors in the page ${errors.join(" | ").slice(0, 300)}`);
  await close();
} finally {
  await S.stop();
}
finish();
