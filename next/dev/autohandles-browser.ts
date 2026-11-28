// A dev check in the real page (not a test, `in_1444`): what a pick shows by itself, as the old app did (`dec_body_look_and_feel`, `src/autohandles.ts`): a face its pull arrow, edges their round arrow, a whole body (a double click) the mover orb.
//   node --experimental-strip-types dev/autohandles-browser.ts [screenshot-dir]
import { S, ok, finish, evalIn } from "./page-lib.ts";
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

  // a face: its pull arrow, in the middle of the face
  await page.mouse.click(gx, gy);
  await wait();
  let s = await state();
  ok(
    s.pull?.mode === "push" && s.b.sel.faces.length === 1,
    `a face picked shows its pull arrow by itself: ${JSON.stringify(s.pull?.arrow)}`,
  );
  ok(
    Math.hypot(s.pull.arrow.base[0], s.pull.arrow.base[1]) < 1e-6 && Math.abs(s.pull.arrow.base[2] - 20) < 1e-6,
    "and it stands in the middle of the face, not where the click was",
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

  // a touched arrow is a draft: a click elsewhere does nothing to it; Esc throws it away
  await ev(`() => window.__ext.option("chamfer")`);
  await page.mouse.click(gx, gy);
  await wait(300);
  s = await state();
  ok(
    s.pull?.mode === "round" && s.b.sel.edges.length === 1,
    "a kind chosen makes it a draft: a click elsewhere leaves it, and the pick",
  );
  await page.keyboard.press("Escape");
  await wait(300);
  s = await state();
  ok(s.pull === null && s.b.sel.edges.length === 1, "Esc throws the draft away and keeps the pick");
  await page.keyboard.press("Escape");
  await wait(300);
  s = await state();
  ok(s.b.sel === null && s.pull === null, "a second Esc puts the pick away");

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
  ok(errors.length === 0, `no errors in the page ${errors.join(" | ").slice(0, 300)}`);
  void fx;
  void fy;
  await close();
} finally {
  await S.stop();
}
finish();
