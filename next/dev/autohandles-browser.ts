// A dev check in the real page (not a test, `in_1444`): what a pick shows by itself, as the old app did (`dec_body_look_and_feel`, `src/autohandles.ts`): a face its pull arrow, edges their round arrow, a whole body (a double click) the mover orb.
//   node --experimental-strip-types dev/autohandles-browser.ts [screenshot-dir]
import { S, dir, ok, finish, evalIn } from "./page-lib.ts";
import { writeFileSync } from "node:fs";
try {
  const { page, errors, close } = await S.open("");
  const ev = evalIn(page);
  await ev(
    `() => { window.__studio.change([{ id: "s1", kind: "sketchPolygon", params: { points: [[-20, -10], [20, -10], [20, 10], [-20, 10]] }, inputs: [] }, { id: "e1", kind: "extrude", params: { d: 20 }, inputs: ["s1"] }]); return 1; }`,
  );
  await ev(`() => window.__studio.settled()`);
  await page.waitForTimeout(600);
  const p3 = (p: number[]) => ev<[number, number]>(`() => window.__proj3([${p}])`);
  const state = () =>
    ev<any>(
      `() => ({ b: window.__bodies.debug(), pull: window.__ext.debug().pull, mv: window.__bmove.debug(), steps: window.__studio.state().steps.length })`,
    );
  const wait = (ms = 700) => page.waitForTimeout(ms);
  const [fx, fy] = await p3([0, 0, 20]);
  const [gx, gy] = await p3([12, 4, 20]); // another place on the same face (the arrow stands at the middle, a press there is its grab)

  // a face: its pull arrow, where it was clicked
  await page.mouse.click(gx, gy);
  await wait();
  let s = await state();
  ok(
    s.pull?.mode === "push" && s.b.sel.faces.length === 1,
    `a face picked shows its pull arrow by itself: ${JSON.stringify(s.pull?.arrow)}`,
  );
  const [bx0, by0] = await ev<[number, number]>(`() => window.__proj3(${JSON.stringify(s.pull.arrow.base)})`);
  const away = Math.hypot(bx0 - gx, by0 - gy);
  ok(
    Math.abs(s.pull.arrow.base[2] - 20) < 1e-6 && away > 25 && away < 90,
    `and it stands on the face a little way from where it was clicked (${Math.round(away)} px), not under the click`,
  );

  // an untouched arrow is put away by the next click, which does its own work (here: an edge)
  const [ex, ey] = await p3([0, -10, 20]);
  await page.mouse.click(ex, ey);
  await wait();
  s = await state();
  ok(
    s.pull?.mode === "round" && s.b.sel.edges.length === 1 && s.b.sel.faces.length === 0,
    `the click picked the edge and its round arrow replaced the pull arrow: ${s.pull?.mode}`,
  );

  // a touched arrow is a draft: Esc throws it away
  await ev(`() => window.__ext.option("chamfer")`);
  await page.keyboard.press("Escape");
  await wait(300);
  s = await state();
  ok(s.pull === null && s.b.sel.edges.length === 1, "Esc throws the draft away and keeps the pick");
  await page.keyboard.press("Escape");
  await wait(300);
  s = await state();
  ok(s.b.sel === null && s.pull === null, "a second Esc puts the pick away");

  // with an arrow showing and nothing typed, Arrow Up and Down change the value by a tenth
  await page.mouse.click(gx, gy);
  await wait(700);
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowUp");
  await wait(200);
  s = await state();
  ok(Math.abs(s.pull?.d - 0.3) < 1e-9, `Arrow Up three times makes 0.3: ${s.pull?.d}`);
  await page.keyboard.press("ArrowDown");
  await wait(200);
  ok(Math.abs((await state()).pull?.d - 0.2) < 1e-9, "and Arrow Down takes a tenth off");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.mouse.click(1000, 600);
  await wait(400);
  // a corner is picked as a ball (corners come before edges and faces), Shift adds another, and no arrow or orb comes of it
  await page.mouse.click(1000, 600);
  await wait(400);
  const [c1x, c1y] = await p3([20, -10, 20]);
  await page.mouse.click(c1x, c1y);
  await wait(700);
  s = await state();
  ok(
    s.b.sel?.vertices.length === 1 &&
      s.b.sel.faces.length === 0 &&
      s.b.sel.edges.length === 0 &&
      s.pull === null &&
      s.mv === null,
    `a click on a corner picks the corner: ${JSON.stringify(s.b.sel)}`,
  );
  const [c2x, c2y] = await p3([20, 10, 20]);
  await page.keyboard.down("Shift");
  await page.mouse.click(c2x, c2y);
  await page.keyboard.up("Shift");
  await wait(500);
  s = await state();
  ok(s.b.sel?.vertices.length === 2, `Shift adds a second corner: ${s.b.sel?.vertices.length}`);
  writeFileSync(`${dir}/corners.png`, await page.screenshot());
  await page.mouse.click(1000, 600);
  await wait(400);
  // a box drawn round the top face takes the four edges that lie in it and are seen (edges first); the Select section's All faces takes every face
  await ev(`() => { window.__box.arm(); return 1; }`);
  const tops = await Promise.all(
    [
      [-20, -10, 20],
      [20, -10, 20],
      [20, 10, 20],
      [-20, 10, 20],
    ].map((q) => p3(q)),
  );
  const xs = tops.map((t) => t[0]),
    ys = tops.map((t) => t[1]);
  await page.mouse.move(Math.min(...xs) - 12, Math.min(...ys) - 12);
  await page.mouse.down();
  await page.mouse.move(Math.max(...xs) + 12, Math.max(...ys) + 12, { steps: 6 });
  await page.mouse.up();
  await wait(500);
  s = await state();
  ok(
    s.b.sel?.edges.length === 4 && s.b.sel.faces.length === 0,
    `a box round the top face takes its four edges: ${s.b.sel?.edges.length}`,
  );
  await page.mouse.click(1000, 600);
  await wait(400);
  // both buttons down and dragged draw the same box with nothing armed (it does not turn the view)
  const cam0 = await ev<string>(`() => JSON.stringify(window.__cad.cam)`);
  await page.mouse.move(Math.min(...xs) - 12, Math.min(...ys) - 12);
  await page.mouse.down();
  await page.mouse.down({ button: "right" });
  await page.mouse.move(Math.max(...xs) + 12, Math.max(...ys) + 12, { steps: 6 });
  await page.mouse.up({ button: "right" });
  await page.mouse.up();
  await wait(500);
  s = await state();
  ok(
    s.b.sel?.edges.length === 4,
    `both buttons dragged round the top face take its four edges: ${s.b.sel?.edges.length}`,
  );
  ok((await ev<string>(`() => JSON.stringify(window.__cad.cam)`)) === cam0, "and the view did not turn");
  await page.mouse.click(1000, 600);
  await wait(400);
  // a box that goes over the whole body picks the body whole (`in_1738`)
  await ev(`() => { window.__box.arm(); return 1; }`);
  await page.mouse.move(40, 40);
  await page.mouse.down();
  await page.mouse.move(1050, 660, { steps: 6 });
  await page.mouse.up();
  await wait(600);
  s = await state();
  ok(
    s.b.sel?.whole.length === 1 && s.mv !== null,
    `a box over the whole body picks it whole and its orb shows: ${JSON.stringify(s.b.sel?.whole)}`,
  );
  await page.mouse.click(1000, 600);
  await wait(400);
  await ev(`() => { window.__bodies.selectAll("faces"); return 1; }`);
  await wait(600);
  s = await state();
  ok(
    s.b.sel?.faces.length === 6 && s.pull?.mode === "push",
    `All faces takes the six faces and their pull opens together: ${s.b.sel?.faces.length}`,
  );
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.mouse.click(1000, 600);
  await wait(400);
  // a click again on the same place goes down what is under it: the corner, then an edge ("2 of 5 here", `MD-3`); a corner has no arrow standing on the place, as an edge or a face has once picked
  const [e1x, e1y] = await p3([20, -10, 20]);
  await page.mouse.click(e1x, e1y);
  await wait(700);
  s = await state();
  ok(s.b.sel?.vertices.length === 1, "a click on a corner picks the corner");
  await page.mouse.click(e1x, e1y);
  await wait(700);
  s = await state();
  ok(
    s.b.sel?.edges.length === 1 && s.b.sel.vertices.length === 0,
    `a click again on the same place takes the next, an edge: ${JSON.stringify(s.b.sel)}`,
  );
  await page.mouse.click(1000, 600);
  await wait(500);
  // a click on a body picked whole picks just that face: a press is a click until it clearly drags (`interaction/gesture.ts`), and only a drag carries the body
  await page.mouse.click(1000, 600);
  await wait(400);
  await page.mouse.click(gx, gy);
  await wait(500);
  await page.mouse.click(gx, gy, { clickCount: 2 });
  await wait(600);
  s = await state();
  ok(s.b.sel?.whole.length === 1 && s.mv !== null, "the body is picked whole");
  const [fx2, fy2] = await p3([-12, -4, 20]);
  await page.mouse.click(fx2, fy2);
  await wait(700);
  s = await state();
  ok(
    s.b.sel?.faces.length === 1 && s.b.sel.whole.length === 0 && s.mv === null,
    `a click on it picks that face alone: ${JSON.stringify(s.b.sel)}`,
  );
  await page.mouse.click(1000, 600);
  await wait(400);
  // an edge nearer the pointer than an orb handle is picked, with the body picked whole and the orb up (the orb's arrows do not eat the click)
  await page.mouse.click(gx, gy);
  await wait(500);
  await page.mouse.click(gx, gy, { clickCount: 2 });
  await wait(600);
  const [ex3, ey3] = await p3([-20 + 40 * 0.65, 10, 20]); // (on the top front edge, near the orb's upright arrow)
  await page.mouse.click(ex3, ey3);
  await wait(700);
  s = await state();
  ok(
    s.b.sel?.edges.length === 1 && s.b.sel.whole.length === 0,
    `with the body picked whole, a click on its edge picks the edge: ${JSON.stringify(s.b.sel?.edges?.length)}`,
  );
  await page.mouse.click(1000, 600);
  await wait(400);
  // two quick clicks on the arrow's own place take the whole body as anywhere else does: the second press is a click's, not the arrow's
  await page.mouse.click(1000, 600);
  await wait(400);
  await page.mouse.click(gx, gy);
  await wait(800);
  const base = (await state()).pull.arrow.base as number[];
  const [bx, by] = await p3(base);
  await page.mouse.click(bx, by);
  await page.mouse.click(bx, by);
  await wait(800);
  s = await state();
  ok(
    s.b.sel?.faces.length === 0 && s.b.sel?.edges.length === 0 && s.pull === null && s.mv !== null,
    "two quick clicks on the arrow's own place take the whole body",
  );
  await page.mouse.click(1000, 600);
  await wait(500);
  // a double click takes the whole body: the mover orb, at once
  await page.mouse.click(gx, gy);
  await wait(400);
  await page.mouse.click(gx, gy, { clickCount: 2 });
  await wait();
  s = await state();
  ok(
    s.b.sel?.faces.length === 0 && s.b.sel?.edges.length === 0 && s.pull === null,
    "a double click picks the whole body, and no pull arrow",
  );
  ok(
    !!s.mv && Math.abs(s.mv.now.origin[2] - 10) < 1e-6,
    `the mover orb stands in the middle of the body: ${JSON.stringify(s.mv?.now.origin)}`,
  );
  const orb = await ev<any>(`() => !!window.__orb()`);
  ok(orb, "and it is drawn");

  // a click on nothing with the orb untouched: it goes, no step is made
  const before = s.steps;
  await page.mouse.click(1000, 600);
  await wait(400);
  s = await state();
  ok(s.mv === null && s.b.sel === null && s.steps === before, "a click on nothing puts it away and makes no step");

  // an orb taken somewhere is made when the pick goes
  await page.mouse.click(gx, gy);
  await wait(400);
  await page.mouse.click(gx, gy, { clickCount: 2 });
  await wait();
  await ev(
    `() => { const t = window.__bmove.target().frame; window.__bmove.set({ ...t, origin: [t.origin[0] + 8, t.origin[1], t.origin[2]] }); return 1; }`,
  );
  await page.mouse.click(1000, 600);
  await wait(900);
  s = await state();
  ok(
    s.mv === null && s.steps > before,
    `taken 8 mm along X and let go, it is made as a step (${before} steps, then ${s.steps})`,
  );
  // the orb's ball has modes (`in_1733`): normal (a drag on the body turns the view, the arrows move it), free move (pressed once: a drag on the body carries it), orient (pressed again: the orb itself moves, it pulses blue), normal again
  const [hx, hy] = await p3([24, -6, 20]); // (the body is 8 mm along X now: away from where its arrow stands)
  await page.mouse.click(hx, hy);
  await wait(400);
  await page.mouse.click(hx, hy, { clickCount: 2 });
  await wait();
  const o0 = (await state()).mv.now.origin;
  const steps0 = (await state()).steps;
  const mode = () => ev<any>(`() => ({ free: window.__cad.planes.free, orient: window.__cad.planes.orient })`);
  const cam1 = await ev<string>(`() => JSON.stringify(window.__cad.cam)`);
  await page.mouse.move(hx, hy);
  await page.mouse.down();
  await page.mouse.move(hx + 60, hy + 10, { steps: 6 });
  s = await state();
  ok(
    Math.hypot(...s.mv.now.origin.map((v: number, i: number) => v - o0[i])) < 1e-6 &&
      (await ev<string>(`() => JSON.stringify(window.__cad.cam)`)) !== cam1,
    "in normal a drag on the body does not move it: the view turns",
  );
  await page.mouse.up();
  await wait(300);
  const [bx1, by1] = await p3(o0);
  await page.mouse.click(bx1, by1); // (the ball: free move)
  await wait(300);
  ok((await mode()).free === true, "a press on the ball goes into free move");
  const [hx2, hy2] = await p3([24, -6, 20]); // (the view turned: the body is somewhere else on the screen)
  await page.mouse.move(hx2, hy2);
  await page.mouse.down();
  await page.mouse.move(hx2 + 60, hy2 + 10, { steps: 6 });
  s = await state();
  ok(
    s.mv && Math.hypot(...s.mv.now.origin.map((v: number, i: number) => v - o0[i])) > 5,
    `in free move a drag on the body takes it along: ${JSON.stringify(s.mv?.now.origin)}`,
  );
  await page.mouse.up();
  await wait(300);
  const [bx2, by2] = await p3(s.mv.now.origin);
  await page.mouse.click(bx2, by2);
  await wait(300);
  ok(
    (await mode()).orient === true && (await mode()).free === false,
    "a second press on the ball: the orb pulses blue (orient)",
  );
  await page.mouse.click(bx2, by2);
  await wait(300);
  ok((await mode()).orient === false && (await mode()).free === false, "a third: back to normal");
  await page.mouse.click(1000, 600);
  await wait(900);
  s = await state();
  ok(
    s.mv === null && s.steps === steps0 + 1,
    `and the move is one step when the pick goes (${steps0}, then ${s.steps})`,
  );
  await page.keyboard.press("Escape");
  // Shift adds a face: two faces pulled together by one number, one step each, with no Move kind
  await page.mouse.click(1000, 600);
  await wait();
  const [sx, sy] = await p3([20, 0, 10]);
  await page.mouse.click(gx, gy);
  await wait();
  await page.keyboard.down("Shift");
  await page.mouse.click(sx, sy);
  await page.keyboard.up("Shift");
  await wait();
  s = await state();
  ok(
    s.b.sel?.faces.length === 2 && s.pull?.mode === "push",
    `Shift adds a second face and the pull stays: ${s.b.sel?.faces.length} faces`,
  );
  const before2 = s.steps;
  await page.keyboard.type("3");
  await page.keyboard.press("Enter");
  await wait(900);
  s = await state();
  ok(s.steps === before2 + 2, `a number pulls both together: one step each (${before2}, then ${s.steps})`);
  // a touched arrow is a draft, and a click that does not move makes it (a drag turns the view): a number typed, then a click on nothing
  await page.mouse.click(1000, 600);
  await wait(400);
  const [dx3, dy3] = await p3([12, 4, 23]); // (the top is 3 mm higher now: the two faces were pulled)
  await page.mouse.click(dx3, dy3);
  await wait(700);
  const recipe = () => ev<string>(`() => JSON.stringify(window.__studio.state().steps)`),
    recipeBefore = await recipe(); // (a pull of the face a step made, Move, changes that step's number)
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowUp");
  await wait(200);
  await page.mouse.click(1000, 600);
  await wait(1200);
  s = await state();
  ok(s.pull === null && (await recipe()) !== recipeBefore, "a click on nothing makes the draft: the recipe is changed");
  // three quick clicks take that face alone and turn the view square to it (the old app's), looking straight down at a top face
  await page.mouse.click(1000, 600);
  await wait(500);
  const [t3x, t3y] = await p3([5, 3, 20]);
  for (let i = 0; i < 3; i++) await page.mouse.click(t3x, t3y);
  await wait(1800);
  const cam = await ev<any>(`() => window.__cad.cam`);
  s = await state();
  ok(s.b.sel?.faces.length === 1, "three clicks pick the face alone");
  ok(
    cam.ortho !== null && Math.abs(Math.abs(cam.pitch) - Math.PI / 2) < 0.05,
    `and the view is square to it: ${JSON.stringify({ ortho: cam.ortho, pitch: cam.pitch })}`,
  );
  ok(errors.length === 0, `no errors in the page ${errors.join(" | ").slice(0, 300)}`);
  void fx;
  void fy;
  await close();
} finally {
  await S.stop();
}
finish();
