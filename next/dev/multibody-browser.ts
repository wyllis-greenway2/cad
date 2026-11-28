// A dev check in the real page (not a test, `in_1444`): several bodies in one answer are picked whole one by one (a double click, Shift adds or takes out), the orb stands in the middle of those picked, and a move
// carries them: all of them as "all", some by name (the engine's own scoping, `engine/scope.ts`). Shown moved while the orb has it (`bodydraw.ts`, one thing for each body).
//   node --experimental-strip-types dev/multibody-browser.ts [screenshot-dir]
import { S, dir, ok, finish, evalIn } from "./page-lib.ts";
import { writeFileSync } from "node:fs";
try {
  const { page, errors, close } = await S.open("");
  const ev = evalIn(page);
  const box = (n: string, x: number) => [
    {
      id: `s${n}`,
      kind: "sketchPolygon",
      params: {
        points: [
          [x, 0],
          [x + 10, 0],
          [x + 10, 10],
          [x, 10],
        ],
      },
      inputs: [],
    },
    { id: `E${n}`, kind: "extrude", params: { d: 10 }, inputs: [`s${n}`] },
  ];
  const steps = [
    ...box("1", 0),
    ...box("2", 30),
    { id: "J", kind: "combine", params: { mode: "add" }, inputs: ["E1", "E2"] },
  ];
  await ev(`() => { window.__studio.change(${JSON.stringify(steps)}); return 1; }`);
  await ev(`() => window.__studio.settled()`);
  await page.waitForTimeout(900);
  const p3 = (p: number[]) => ev<[number, number]>(`() => window.__proj3([${p}])`);
  const state = () =>
    ev<any>(
      `() => ({ b: window.__bodies.debug(), mv: window.__bmove.debug(), steps: window.__studio.state().steps.map((s) => [s.kind, s.params.body ? "named" : ""]) , n: window.__studio.state().meshes[0].bodies.length })`,
    );
  const wait = (ms = 700) => page.waitForTimeout(ms);
  let s = await state();
  ok(s.n === 2, `the engine answers with two bodies: ${s.n}`);
  const [ax, ay] = await p3([5, 5, 10]);
  const [bx, by] = await p3([35, 5, 10]);
  await page.mouse.click(ax, ay);
  await page.mouse.click(ax, ay);
  await wait();
  s = await state();
  ok(
    s.b.sel?.whole.length === 1 && s.mv !== null,
    `two clicks take one body whole and its orb shows: ${JSON.stringify(s.b.sel?.whole)}`,
  );
  const o1 = s.mv.now.origin;
  ok(Math.abs(o1[0] - 5) < 0.5, `the orb stands in the middle of that body alone: ${JSON.stringify(o1)}`);
  await page.keyboard.down("Shift");
  await page.mouse.click(bx, by);
  await page.keyboard.up("Shift");
  await wait();
  s = await state();
  ok(s.b.sel?.whole.length === 2, `Shift adds the other body: ${JSON.stringify(s.b.sel?.whole)}`);
  writeFileSync(`${dir}/multi-whole.png`, await page.screenshot());
  await page.keyboard.down("Shift");
  await page.mouse.click(bx, by);
  await page.keyboard.up("Shift");
  await wait();
  s = await state();
  ok(s.b.sel?.whole.length === 1, "and Shift again takes it out");
  // one body moved: a step that names it
  const before = s.steps.length;
  await ev(
    `() => { const t = window.__bmove.target().frame; window.__bmove.set({ ...t, origin: [t.origin[0], t.origin[1] + 20, t.origin[2]] }); return 1; }`,
  );
  await wait(300);
  writeFileSync(`${dir}/multi-moving.png`, await page.screenshot());
  await page.mouse.click(1000, 650);
  await wait(1500);
  s = await state();
  ok(
    s.steps.length === before + 1 && s.steps.at(-1)[0] === "move" && s.steps.at(-1)[1] === "named",
    `a move of one body is a step that names it: ${JSON.stringify(s.steps.slice(before))}`,
  );
  const lo = await ev<number[]>(
    `() => { const m = window.__studio.state().meshes[0]; const out = []; for (const b of m.bodies) { let y = Infinity; for (const f of m.faces) if (f.body === b.key) for (let k = f.start; k < f.start + f.count; k++) y = Math.min(y, m.positions[3 * m.indices[k] + 1]); out.push(Math.round(y * 100) / 100); } return out.sort((a, b) => a - b); }`,
  );
  ok(lo[0] === 0 && lo[1] === 20, `only that body moved (lowest y of each: ${lo})`);
  ok(errors.length === 0, `no errors in the page ${errors.join(" | ").slice(0, 300)}`);
  await close();
} finally {
  await S.stop();
}
finish();
