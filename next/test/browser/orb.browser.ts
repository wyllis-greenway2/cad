import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { start, type Session } from "./harness.ts";

let session: Session;
before(async () => { session = await start(); });
after(async () => { await session.stop(); });

type P = Awaited<ReturnType<Session["open"]>>["page"];
/** A cut plane with its orb, seen from 60 mm off so the orb is in the middle of the view. */
async function withOrb(page: P) {
  await page.mouse.click(300, 520, { button: "right" });
  await page.click("div[title='Cut plane']");
  await page.evaluate(() => { const w: any = (window as any).__cad, o = w.planes.P.cuts[0].origin, c = w.cam; const f = [Math.cos(c.pitch) * Math.cos(c.yaw), Math.cos(c.pitch) * Math.sin(c.yaw), Math.sin(c.pitch)]; w.set({ eye: o.map((v: number, i: number) => v - f[i]! * 60), yaw: c.yaw, pitch: c.pitch }); });
  await page.waitForTimeout(300);
}
/** Where a handle of the orb is on the screen (its middle), from the page's own modules. */
const MODULES = { orb: "/src/orb.ts", cam: "/src/camera.ts", mover: "/src/mover.ts" };
const where = (page: P, id: string) => page.evaluate(async ({ id, mods }: { id: string; mods: typeof MODULES }) => {
  const orb = await import(/* @vite-ignore */ mods.orb), cam = await import(/* @vite-ignore */ mods.cam), mover = await import(/* @vite-ignore */ mods.mover); const w: any = (window as any).__cad, st = w.planes, k = st.P.cuts[0];
  const pose = (st.poses.find((p: any) => p[0] === k.id) ?? [0, mover.newPose()])[1], centre = mover.centreOf(k, pose);
  if (id === "centre") { const q = cam.project(w.cam, centre, innerWidth, innerHeight); return [q.x, q.y]; }
  const h = orb.handlesOf({ centre, frame: pose.frame, held: [] }, w.cam).find((x: any) => x.id === id)!, m = h.points[h.points.length >> 1];
  const q = cam.project(w.cam, m, innerWidth, innerHeight); return [q.x, q.y];
}, { id, mods: MODULES }).then((r) => r as unknown as [number, number]);
const state = (page: P) => page.evaluate(() => { const st = (window as any).__cad.planes, k = st.P.cuts[0], q = (st.poses.find((p: any) => p[0] === k.id) ?? [0, { offset: [0, 0, 0] }])[1]; return { origin: k.origin as number[], normal: k.normal as number[], offset: q.offset as number[], orient: st.orient as boolean, chosen: st.chosen as string[], cuts: st.P.cuts.length as number }; });
const drag = async (page: P, from: [number, number], dx: number, dy: number) => { await page.mouse.move(from[0], from[1]); await page.mouse.down(); await page.mouse.move(from[0] + dx, from[1] + dy, { steps: 6 }); await page.mouse.up(); };

test("[O11] a new cut plane shows its orb, and its Orient button puts it away and brings it back", async () => {
  const { page, errors, close } = await session.open("");
  await withOrb(page);
  const orbShown = () => page.evaluate(async () => { const w: any = (window as any).__cad; return w.planes.sel.length === 1; });
  assert.ok(await orbShown());
  const at = await where(page, "move:X"), before = await state(page);
  await drag(page, at, 30, 10);
  assert.notDeepEqual((await state(page)).origin, before.origin, "with the orb shown a press on an arrow moves the plane");
  await page.click("div[title='Put the mover away']");
  const gone = await where(page, "move:X"), o2 = (await state(page)).origin;
  await drag(page, gone, 30, 10);
  assert.deepEqual((await state(page)).origin, o2, "with the orb put away the same press moves nothing");
  assert.deepEqual(errors, []);
  await close();
});

test("[O2 O9] a press on a handle is the orb's: it moves the plane along the axis and does not turn the view; a press elsewhere is the view's", async () => {
  const { page, close } = await session.open("");
  await withOrb(page);
  const cam = () => page.evaluate(() => JSON.stringify((window as any).__cad.cam));
  const c0 = await cam(), o0 = (await state(page)).origin, at = await where(page, "move:Z");
  await drag(page, at, 0, -18);
  const s = await state(page);
  assert.equal(await cam(), c0, "the view did not move");
  assert.ok(Math.abs(s.origin[0]! - o0[0]!) < 1e-6 && Math.abs(s.origin[1]! - o0[1]!) < 1e-6 && Math.abs(s.origin[2]! - o0[2]!) > 0.5, `only z changed: ${o0} -> ${s.origin}`);
  await drag(page, [150, 600], 120, 0); // empty space
  assert.notEqual(await cam(), c0, "a press on empty space turns the view");
  await close();
});

test("[O3] a curved arrow turns the plane about its axis, the plane's middle staying where the orb is", async () => {
  const { page, close } = await session.open("");
  await withOrb(page);
  const s0 = await state(page), at = await where(page, "turn:Z");
  await drag(page, at, 25, 8);
  const s1 = await state(page);
  assert.notDeepEqual(s1.normal, s0.normal, "the plane turned");
  assert.ok(Math.abs(s1.normal[2]!) < 1e-9, "about Z: the normal stays level");
  await close();
});

test("[O6] Shift chooses more arrows and a drag moves on all of them together; Esc lets them go", async () => {
  const { page, close } = await session.open("");
  await withOrb(page);
  const o0 = (await state(page)).origin, x = await where(page, "move:X"), y = await where(page, "move:Y");
  await page.mouse.click(x[0], x[1]);
  assert.deepEqual((await state(page)).chosen, ["move:X"]);
  await page.keyboard.down("Shift"); await page.mouse.click(y[0], y[1]); await page.keyboard.up("Shift");
  assert.deepEqual((await state(page)).chosen, ["move:X", "move:Y"]);
  await drag(page, await where(page, "move:X"), 35, 28);
  const o1 = (await state(page)).origin;
  assert.ok(Math.abs(o1[0]! - o0[0]!) > 0.5 && Math.abs(o1[1]! - o0[1]!) > 0.5, "it moved in X and Y together");
  assert.ok(Math.abs(o1[2]! - o0[2]!) < 1e-6, "and not in Z");
  await page.keyboard.press("Escape");
  assert.deepEqual((await state(page)).chosen, []);
  await close();
});

test("[O12 O13] a click on the ball pulses it and puts the orb in orient mode: it moves without the plane; Enter keeps it, Esc puts it back; then the orb stays with the plane", async () => {
  const { page, close } = await session.open("");
  await withOrb(page);
  const s0 = await state(page);
  await page.mouse.click(...(await where(page, "centre")));
  assert.equal((await state(page)).orient, true, "orient mode");
  assert.ok(await page.evaluate(() => [...document.querySelectorAll("span")].some((e) => e.textContent === "Orient the mover" && (e.parentElement as HTMLElement).style.display !== "none")), "the bar says so");
  await drag(page, await where(page, "move:X"), 30, 10);
  let s = await state(page);
  assert.deepEqual(s.origin, s0.origin, "the plane stayed"); assert.deepEqual(s.normal, s0.normal);
  assert.ok(Math.abs(s.offset[0]!) > 0.5, "the orb moved");
  await page.keyboard.press("Enter");
  s = await state(page); assert.equal(s.orient, false); const kept = s.offset;
  await page.mouse.click(...(await where(page, "centre")));
  await drag(page, await where(page, "move:Y"), 15, -20);
  await page.keyboard.press("Escape");
  s = await state(page); assert.equal(s.orient, false); assert.deepEqual(s.offset, kept, "Esc put the orb back as it was when orienting began");
  // out of orient mode the orb is rigid with the plane: a move takes it along
  const o = s.origin;
  await drag(page, await where(page, "move:Z"), 0, -15);
  s = await state(page);
  assert.ok(Math.abs(s.origin[2]! - o[2]!) > 0.5, "the plane moved"); assert.deepEqual(s.offset, kept, "the orb is the same offset from it");
  await close();
});
