// A dev check in the real page (not a test, `in_1444`): the Move / turn tool for a body, with the mover orb as its handle (`dec_task_handles`): it asks for the body, the orb stands on it, a drag of an arrow shows the body moved, the right click makes the steps, Esc puts it back.
//   node --experimental-strip-types dev/move-browser.ts [screenshot-dir]
import { S, ok, finish, evalIn } from "./page-lib.ts";
try {
  const { page, errors, close } = await S.open(""), ev = evalIn(page);
  const notices = () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-notice]")].map((e) => `${e.dataset.persistent === "true" ? "*" : ""}${e.textContent}`));
  await ev(`() => window.__studio.change([{ id: "s1", kind: "sketchPolygon", params: { points: [[0, 0], [40, 0], [40, 25], [0, 25]] }, inputs: [] }, { id: "e1", kind: "extrude", params: { d: 10 }, inputs: ["s1"] }])`); await ev(`() => window.__studio.settled()`); await page.waitForTimeout(700);
  const box = () => ev<number[]>(`() => { const m = window.__studio.state().meshes[0]; const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < m.positions.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], m.positions[i + k]); hi[k] = Math.max(hi[k], m.positions[i + k]); } return [...lo, ...hi]; }`);
  const arrow = async (id: string) => { const d = await ev<any>(`() => window.__orb()`); const h = d.handles.find((x: any) => x.id === id); const [a, b] = await Promise.all(h.points.map((p: number[]) => ev<[number, number]>(`() => window.__proj3([${p}])`))); return { a: a!, b: b! }; };
  const before = await box();
  await ev(`() => window.__tool("move")`); await page.waitForTimeout(300);
  ok((await notices()).includes("*Select the body to move or turn"), `the tool asks for the body: ${JSON.stringify(await notices())}`);
  ok((await ev<any>(`() => window.__orb()`)) === null, "no orb until a body is picked");
  const [fx, fy] = await ev<[number, number]>(`() => window.__proj3([20, 12.5, 10])`); await page.mouse.click(fx, fy); await page.waitForTimeout(500);
  ok((await notices()).some((n) => /^\*Drag the arrows to move/.test(n)), `a body picked: the orb is on it and the notice says what to do: ${JSON.stringify(await notices())}`);
  const orb = await ev<any>(`() => window.__orb()`); ok(!!orb && orb.handles.some((h: any) => h.id === "move:X"), "the orb stands on the body");
  // drag the X arrow along itself
  const ax = await arrow("move:X"), mx = (ax.a[0] + ax.b[0]) / 2, my = (ax.a[1] + ax.b[1]) / 2, dx = ax.b[0] - ax.a[0], dy = ax.b[1] - ax.a[1];
  await page.mouse.move(mx, my); await page.mouse.down(); await page.mouse.move(mx + dx * 0.5, my + dy * 0.5, { steps: 6 }); await page.mouse.move(mx + dx, my + dy, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(200);
  const now = await ev<any>(`() => window.__bmove.debug()`);
  ok(!!now && Math.abs(now.now.origin[0] - 20) > 1 && Math.abs(now.now.origin[1] - 12.5) < 0.5, `the arrow moved the body along x only: ${JSON.stringify(now?.now.origin)}`);
  await page.mouse.click(700, 520, { button: "right" }); await ev(`() => window.__studio.settled()`); await page.waitForTimeout(700);
  const s = await ev<any>(`() => window.__studio.state().steps.map((x) => x.kind).join()`), after = await box();
  ok(s === "sketchPolygon,extrude,move" && Math.abs(after[0]! - before[0]!) > 1 && Math.abs(after[3]! - before[3]! - (after[0]! - before[0]!)) < 1e-6 && Math.abs(after[1]! - before[1]!) < 1e-6, `the right click made the move: ${s}, the body is at x ${after[0]} (was ${before[0]})`);
  ok((await ev<any>(`() => window.__bmove.on()`)) === false && (await ev<any>(`() => window.__tools.armed()`)) === null, "and the tool is put away");
  // a turn: the curved arrow about z; then Esc puts it back
  await ev(`() => window.__tool("move")`); await page.mouse.click(fx + 0, fy + 0); await page.waitForTimeout(300);
  const [px, py] = await ev<[number, number]>(`() => window.__proj3([${(after[0]! + after[3]!) / 2}, 12.5, 10])`); await page.mouse.click(px, py); await page.waitForTimeout(500);
  const t = await arrow("turn:Z").catch(() => null);
  if (t) { const mx2 = (t.a[0] + t.b[0]) / 2, my2 = (t.a[1] + t.b[1]) / 2; await page.mouse.move(mx2, my2); await page.mouse.down(); await page.mouse.move(mx2 + 30, my2 + 10, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(200); ok(Math.abs((await ev<any>(`() => window.__bmove.debug()`)).now.normal[2]) > 0.99 && Math.abs((await ev<any>(`() => window.__bmove.debug()`)).now.u[0]) < 0.9999, "a turn about z changes where the body's x points"); }
  await page.keyboard.press("Escape"); await page.waitForTimeout(200);
  ok((await ev<any>(`() => window.__bmove.on()`)) === false && (await ev<any>(`() => window.__studio.state().steps.length`)) === 3, "Esc put it back: no step made");
  ok(errors.length === 0, "no errors in the page: " + errors.join("; ")); await close();
} finally { await S.stop(); }
finish();
