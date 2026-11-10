// A random user (`in_251`): drives the real controller with the intents the app gets (clicks, drags, keys, tools, operations, undo, redo, Esc, delete...) from a seeded random generator, and after every
// intent checks what must always be true of the state. A failure names the seed and step and gives the intents that led to it, so it can be run again.
import { kernel } from "../../src/compiler/kernel/index.ts";
import { worldRef } from "../../src/shared/ref.ts";
import type { Ref } from "../../src/shared/ref.ts";
import type { Vec3 } from "../../src/math/vec.ts";
import type { Intent } from "../../src/shared/input.ts";
import { createSession, run, scene, saveText, openSession, undoLast, redoLast, selection } from "../../src/interaction/session.ts";
import type { Session } from "../../src/interaction/session.ts";
import { createState, reduce, advance } from "../../src/interaction/controller.ts";
import type { AppState } from "../../src/interaction/controller.ts";
import { frameOf } from "../../src/interaction/frame.ts";
import { actionsFor } from "../../src/interaction/actions.ts";
import { homeCamera, lookStraight, projector } from "../../src/interaction/camera.ts";
import { drawSquaredRectangle, drawCircle } from "../../src/operation/build.ts";
import { nextId } from "../../src/operation/scene.ts";
import type { Scene } from "../../src/operation/scene.ts";
import { pointOf, segmentOf, circleOf, loopPoints } from "../../src/operation/part.ts";
import { BODY_OBJECT } from "../../src/compiler/body.ts";

export interface Failure { seed: number; step: number; what: string; log: string[] }
const W = 900, H = 600;

/** A small seeded generator (the same numbers for the same seed, on any machine). */
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { next, int: (n: number) => Math.floor(next() * n), pick: <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]!, chance: (p: number) => next() < p };
}

/** The place on screen that stands for a part (to click on it), or null. */
function anchor(sc: Scene, ref: Ref, kernelBox: { min: number[]; max: number[] } | null): Vec3 | null {
  const get = (r: Ref) => sc.parts[r];
  const p = sc.parts[ref];
  if (!p) return ref === BODY_OBJECT && kernelBox ? [0, 1, 2].map((i) => (kernelBox.min[i]! + kernelBox.max[i]!) / 2) as unknown as Vec3 : null;
  if (p.kind === "corner") return p.at;
  if (p.kind === "line") { const s = segmentOf(get, ref); return s ? [(s[0][0] + s[1][0]) / 2, (s[0][1] + s[1][1]) / 2, (s[0][2] + s[1][2]) / 2] : null; }
  if (p.kind === "circle") { const c = circleOf(get, ref); const pl = sc.parts[p.plane ?? ""]; return c && pl?.kind === "plane" ? [c.center[0] + pl.u[0] * c.radius, c.center[1] + pl.u[1] * c.radius, c.center[2] + pl.u[2] * c.radius] : null; }
  if (p.kind === "face") { const pts = p.disk ? [] : loopPoints(get, p.loop, p.corners); const c = p.disk ? circleOf(get, p.disk)?.center : pts.length ? [0, 1, 2].map((i) => pts.reduce((a, q) => a + q[i]!, 0) / pts.length) as unknown as Vec3 : null; return c ?? null; }
  if (p.kind === "plane" && p.origin === "body" && p.mesh && p.mesh.length >= 9) return [0, 1, 2].map((i) => (p.mesh![i]! + p.mesh![3 + i]! + p.mesh![6 + i]!) / 3) as unknown as Vec3;
  return null;
}

/** A start: empty, or with a box, or with a circle and a rectangle (drawn, not extruded). */
function start(r: ReturnType<typeof rng>): Session {
  let s = createSession(kernel);
  const kind = r.pick([0, 1, 1, 1, 2, 3]); // (empty; a box; a rectangle and a circle drawn)
  if (kind >= 1) {
    const rect = drawSquaredRectangle(scene(s), worldRef("XY"), [0, 0, 0], [30, 20, 0], [1, 0, 0], [0, 1, 0]);
    s = run(s, rect.command);
    if (kind === 1) s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: rect.lines, params: { depth: 10 } } });
    if (kind >= 2) s = run(s, drawCircle(scene(s), worldRef("XY"), [45, 10, 0], 6).command);
  }
  return s;
}

const canon = (sc: Scene): string => JSON.stringify({
  parts: Object.values(sc.parts).filter((p) => p.origin === "drawn" && !("derived" in p && p.derived) && p.kind !== "face").sort((a, b) => (a.ref < b.ref ? -1 : 1)),
  relations: sc.relations, steps: sc.steps,
}, (_, v) => (typeof v === "number" ? Math.round(v * 1e5) / 1e5 : v));

/** What must always be true. Throws a message when something is not. */
function check(st: AppState, label: string): void {
  const sc = scene(st.session);
  const fail = (m: string): never => { throw new Error(`${m} (after ${label})`); };
  // numbers
  for (const p of Object.values(sc.parts)) {
    const nums = p.kind === "corner" ? p.at : p.kind === "circle" ? [p.radius] : [];
    if (nums.some((v) => !Number.isFinite(v))) fail(`a part has a number that is not finite: ${p.ref} ${JSON.stringify(nums)}`);
  }
  const c = st.cam;
  if (![...c.target, c.distance, c.azimuth, c.elevation].every(Number.isFinite) || c.distance <= 0) fail(`the camera is broken: ${JSON.stringify(c)}`);
  // references
  const has = (r: Ref) => r in sc.parts;
  for (const p of Object.values(sc.parts)) {
    const refs: (Ref | undefined | null)[] = p.kind === "line" ? [p.a, p.b, p.center] : p.kind === "circle" ? [p.center] : p.kind === "face" ? [...p.loop, ...p.corners] : [];
    if (p.origin === "drawn" && p.kind !== "face") for (const r of refs) if (r && !has(r)) fail(`${p.ref} refers to ${r}, which is not there`);
    if (p.origin === "drawn" && p.plane && !has(p.plane)) fail(`${p.ref} is on the plane ${p.plane}, which is not there`);
  }
  const ids = new Set<string>();
  for (const r of sc.relations) {
    if (ids.has(r.id)) fail(`two relations are called ${r.id}`);
    ids.add(r.id);
    for (const q of r.parts) if (!has(q)) fail(`relation ${r.id} (${r.kind}) is about ${q}, which is not there`);
  }
  for (const stp of sc.steps) {
    const missing = stp.parts.filter((q) => !has(q) && q.startsWith("d/") && !q.includes("@")); // (a body's edge or face is named by where it is: a step that names one that moved is found another way)
    if (missing.length && !st.session.outcome.errors[stp.id]) fail(`step ${stp.id} (${stp.type}) uses ${missing.join(",")}, which is not there, and nothing says it is broken`);
  }
  // the state
  for (const r of selection(st.session)) if (!has(r)) fail(`${r} is selected and is not there`);
  if (st.tool && st.op) fail("a tool and an operation are open together");
  if (st.tool?.plane && !has(st.tool.plane)) fail(`the tool is on the plane ${st.tool.plane}, which is not there`);
  if (st.op) for (const q of st.op.parts) if (q.startsWith("d/") && !q.includes("@") && !has(q)) fail(`the open ${st.op.kind} works on ${q}, which is not there`);
  const h = st.session.history;
  if (h.cursor < 0 || h.cursor > h.commands.length || h.snapshots.length !== h.commands.length + 1 && h.snapshots.length < h.cursor + 1) fail(`the history is inconsistent: cursor ${h.cursor}, ${h.commands.length} commands, ${h.snapshots.length} scenes`);
  if (h.snapshots[h.cursor] !== h.scene) fail("the history's scene is not the one at its cursor");
  // what is drawn can be worked out
  const f = frameOf(st, { w: W, h: H });
  for (const a of f.annotations) if (!a.at.every(Number.isFinite)) fail(`an annotation is somewhere that is not a number: ${a.id}`);
}

/** The heavier ones, now and then: undo and redo are inverses, saving and opening give the same model, deriving twice gives the same. */
function checkDeep(st: AppState, label: string): void {
  const fail = (m: string): never => { throw new Error(`${m} (after ${label})`); };
  const s = st.session;
  if (st.op || st.repeat || st.tool) return; // (something is open: the history is its to change)
  const here = canon(scene(s));
  if (s.history.cursor > 0 && !s.lagging) {
    const back = undoLast(s);
    if (back.history.cursor !== s.history.cursor - 1) fail(`undo moved the cursor from ${s.history.cursor} to ${back.history.cursor}`);
    const again = redoLast(back);
    if (canon(scene(again)) !== here) fail("undo then redo did not give back the same model");
    if (again.history.cursor !== s.history.cursor) fail("undo then redo did not give back the same cursor");
  }
  const text = saveText(s);
  const o = openSession(kernel, text);
  if (!o.ok) return fail(`a model saved cannot be opened: ${(o as { error: string }).error}`);
  if (canon(scene(o.value)) !== here) fail("save then open did not give the same model");
  if (o.value.history.cursor !== s.history.cursor) fail(`save then open changed the cursor: ${s.history.cursor} to ${o.value.history.cursor}`);
  const h = s.history;
  if (canon(h.derive(h.scene)) !== here) fail("deriving the scene again changed it");
}

const VIEW_ONLY = new Set<Intent["type"]>(["hover", "hoverEnd", "zoom", "pan", "look", "home"]);
/** What one intent may and may not have done, by looking at the state before and after. */
function between(a: AppState, b: AppState, i: Intent): void {
  const fail = (m: string): never => { throw new Error(`${m} (after ${JSON.stringify(i)})`); };
  if (VIEW_ONLY.has(i.type) && b.session.history !== a.session.history) fail("a move of the pointer or the view changed the model");
  // Esc on an operation that is open takes back what it made (`in_244`)
  if (i.type === "escape" && a.op && a.opBase !== null && !a.menu && !a.focus && !a.box && !a.repeat) {
    if (b.op) fail("Esc did not put the open operation away");
    if (b.session.history.cursor !== a.opBase) fail(`Esc left the history at ${b.session.history.cursor}, where the operation began at ${a.opBase}`);
  }
  // a change that was refused (it says so) leaves the model as it was
  if (b.session.message && b.session.conflict && b.session.history !== a.session.history && b.session.history.cursor > a.session.history.cursor) fail("a change that was refused was made as well");
}

/** A gesture: the intents of one thing a person does. */
function gesture(st: AppState, r: ReturnType<typeof rng>): Intent[] {
  const sc = scene(st.session);
  const pr = projector(st.cam, W, H);
  const k = st.session.outcome.kernel;
  const box = k?.bbox ? { min: [...k.bbox.min], max: [...k.bbox.max] } : null;
  const parts = Object.values(sc.parts).filter((p) => p.kind !== "plane" || p.origin === "body").map((p) => p.ref);
  const screenOf = (ref: Ref): [number, number] | null => { const a = anchor(sc, ref, box); if (!a) return null; const q = pr.project(a); return q.every(Number.isFinite) && q[0] > 0 && q[0] < W && q[1] > 0 && q[1] < H ? q : null; };
  const onPart = (): [number, number] | null => { for (let i = 0; i < 8; i++) { const q = screenOf(r.pick(parts.length ? parts : [BODY_OBJECT as Ref])); if (q) return q; } return null; };
  const anywhere = (): [number, number] => [20 + r.int(W - 40), 20 + r.int(H - 40)];
  const spot = (): [number, number] => (r.chance(0.7) ? onPart() ?? anywhere() : anywhere());
  const sel = selection(st.session);
  const avail = actionsFor(sc, sel).filter((a) => a.enabled).map((a) => a.id);
  const kinds = [
    ["click", 14], ["hover", 6], ["multi", 4], ["shift", 3], ["tool", 7], ["draw", 8], ["op", 8], ["menu", 3], ["action", 8], ["typed", 9], ["entry", 3],
    ["drag", 7], ["undo", 6], ["redo", 3], ["escape", 4], ["enter", 3], ["delete", 3], ["view", 3], ["panel", 2], ["relation", 3], ["box", 1],
    ["shape", 10], ["operate", 12], ["constrain", 8], ["typenumber", 5],
  ] as const;
  const total = kinds.reduce((a, b) => a + b[1], 0);
  let roll = r.int(total);
  let kind = kinds[0][0] as string;
  for (const [n, w] of kinds) { if (roll < w) { kind = n; break; } roll -= w; }
  const [x, y] = spot();
  switch (kind) {
    case "click": return [{ type: "hover", x, y }, { type: "click", x, y, count: 1, shift: false }];
    case "hover": return [{ type: "hover", x, y }];
    case "multi": return [{ type: "click", x, y, count: r.pick([2, 3] as const), shift: false }];
    case "shift": return [{ type: "click", x, y, count: 1, shift: true }];
    case "tool": return [{ type: "begin", name: r.pick(["rect", "circle", "line", "arc", "trim"] as const) }];
    case "draw": { const [x2, y2] = anywhere(); const [x3, y3] = anywhere(); return [{ type: "hover", x, y }, { type: "click", x, y, count: 1, shift: false }, { type: "hover", x: x2, y: y2 }, { type: "click", x: x2, y: y2, count: 1, shift: false }, ...(r.chance(0.4) ? [{ type: "hover", x: x3, y: y3 } as Intent, { type: "click", x: x3, y: y3, count: 1, shift: false } as Intent] : [])]; }
    case "op": return [r.chance(0.5) ? { type: "begin", name: r.pick(["pushpull", "extrude", "edge", "move", "rotate", "scale", "dimension"] as const) } : { type: "runAction", id: r.pick(["op:offset", "op:linear", "op:circular", "op:copy", "op:move", "op:rotate", "op:scale", "op:pushpull", "op:edge"]) }];
    case "menu": return [{ type: "menu", x, y, button: r.chance(0.5) }];
    case "action": return avail.length ? [{ type: "runAction", id: r.pick(avail) }] : [{ type: "runAction", id: r.pick(["look", "constraints"]) }];
    case "typed": return Array.from({ length: 1 + r.int(4) }, () => ({ type: "typed", key: r.pick(["0", "1", "2", "3", "5", "7", "9", ".", "-", "Backspace", "Tab"]), shift: false } as Intent));
    case "entry": return [{ type: "entry", field: r.int(3), text: r.pick(["0", "1", "5", "12.5", "40", "-3", "", "."]) }];
    case "drag": {
      const handles = frameOf(st, { w: W, h: H }).gizmo?.handles ?? [];
      const from: [number, number] | null = handles.length ? (() => { const h = r.pick(handles); const a = h.points[0]!, b = h.points[h.points.length - 1]!; const q = pr.project([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]); return q.every(Number.isFinite) ? [q[0], q[1]] : null; })() : null;
      const [x0, y0] = from ?? spot();
      const [dx, dy] = [r.int(160) - 80, r.int(160) - 80];
      const steps = 2 + r.int(4);
      const out: Intent[] = [{ type: "hover", x: x0, y: y0 }];
      let [lx, ly] = [x0, y0];
      for (let i = 1; i <= steps; i++) { const nx = x0 + (dx * i) / steps, ny = y0 + (dy * i) / steps; out.push({ type: "orbit", dx: i === 1 ? nx - x0 : nx - lx, dy: i === 1 ? ny - y0 : ny - ly, x: nx, y: ny }); [lx, ly] = [nx, ny]; }
      out.push({ type: "dragEnd" });
      return out;
    }
    case "undo": return Array.from({ length: 1 + r.int(3) }, () => ({ type: "undo" } as Intent));
    case "redo": return [{ type: "redo" }];
    case "escape": return [{ type: "escape" }];
    case "enter": return [{ type: "typed", key: "Enter", shift: false }];
    case "delete": return [{ type: "delete" }];
    case "view": return [r.pick<Intent>([{ type: "look", plane: "X" }, { type: "look", plane: "Y" }, { type: "look", plane: "Z" }, { type: "home" }, { type: "zoom", factor: 0.8, x, y }, { type: "zoom", factor: 1.25, x, y }, { type: "pan", dx: 30, dy: -20 }])];
    case "panel": { const steps = sc.steps; return steps.length && r.chance(0.5) ? [{ type: "panelRow", id: r.pick(steps).id, act: r.pick(["remove", "sketch"] as const) }] : [{ type: "panel", name: r.pick(["bodies", "history"] as const) }]; }
    case "relation": { const rel = sc.relations; return rel.length ? [{ type: "relation", act: r.pick(["focus", "remove", "lock"] as const), id: r.pick(rel).id }] : [{ type: "escape" }]; }
    // a figure drawn with a tool, start to finish
    case "shape": {
      const tool = r.pick(["rect", "circle", "line", "arc"] as const);
      const pts = Array.from({ length: tool === "arc" ? 3 : 2 + (tool === "line" ? r.int(2) : 0) }, () => anywhere());
      const out: Intent[] = [{ type: "begin", name: tool }];
      for (const [px, py] of pts) out.push({ type: "hover", x: px, y: py }, { type: "click", x: px, y: py, count: 1, shift: false });
      if (tool === "line") out.push({ type: "typed", key: "Enter", shift: false });
      return out;
    }
    // select something and run an operation on it: pull an arrow, type a number, then accept or cancel
    case "operate": {
      const out: Intent[] = [{ type: "hover", x, y }, { type: "click", x, y, count: r.pick([1, 1, 2, 3]), shift: false }];
      out.push({ type: "runAction", id: r.pick(["op:move", "op:rotate", "op:scale", "op:pushpull", "op:edge", "op:offset", "op:linear", "op:circular", "op:copy"]) });
      const how = r.int(4);
      if (how === 0) out.push(...Array.from({ length: 1 + r.int(3) }, () => ({ type: "typed", key: r.pick(["1", "2", "5", "8", ".", "0"]), shift: false } as Intent)));
      if (how === 1) out.push({ type: "entry", field: r.int(3), text: r.pick(["2", "5", "12", "30"]) });
      if (how >= 2) { const hs = frameOf(st, { w: W, h: H }).gizmo?.handles ?? []; void hs; out.push({ type: "orbit", dx: 20 + r.int(60), dy: r.int(60) - 30, x: x + 40, y: y }, { type: "dragEnd" }); }
      out.push(r.pick<Intent>([{ type: "typed", key: "Enter", shift: false }, { type: "escape" }, { type: "menu", x, y }, { type: "escape" }]));
      return out;
    }
    // two parts selected, a constraint applied
    case "constrain": {
      const [x2, y2] = onPart() ?? anywhere();
      return [{ type: "hover", x, y }, { type: "click", x, y, count: 1, shift: false }, { type: "hover", x: x2, y: y2 }, { type: "click", x: x2, y: y2, count: 1, shift: true }, ...(avail.length ? [{ type: "runAction", id: r.pick(avail) } as Intent] : [])];
    }
    // a number typed for what is selected (a length, a diameter, a distance), and locked
    case "typenumber": return [{ type: "hover", x, y }, { type: "click", x, y, count: 1, shift: false }, ...Array.from({ length: 1 + r.int(3) }, () => ({ type: "typed", key: r.pick(["1", "2", "3", "5", "8", "0", "."]), shift: false } as Intent)), { type: "typed", key: "Enter", shift: false }];
    case "box": { const [x2, y2] = anywhere(); return [{ type: "hold", x, y, shift: false }, { type: "orbit", dx: x2 - x, dy: y2 - y, x: x2, y: y2 }, { type: "dragEnd" }]; }
  }
  return [];
}

/** One run: the same seed gives the same run. Returns null, or what went wrong. */
export function fuzz(seed: number, steps: number, probe?: (st: AppState) => void): Failure | null {
  const r = rng(seed);
  const log: string[] = [];
  let st: AppState = { ...createState(start(r)), cam: r.chance(0.5) ? homeCamera() : lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]) };
  let now = 0;
  const show = (i: Intent) => JSON.stringify(i);
  try {
    check(st, "the start");
    for (let step = 0; step < steps; step++) {
      for (const intent of gesture(st, r)) {
        now += 40;
        log.push(show(intent)); if (process.env.FUZZ_TRACE) process.stderr.write(show(intent) + "\n");
        const before = st;
        st = advance(reduce(st, intent, { w: W, h: H, now }), now);
        check(st, show(intent));
        between(before, st, intent);
        probe?.(st);
      }
      if (step % 4 === 3) checkDeep(st, `step ${step}`);
      if (log.length > 60) log.splice(0, log.length - 60);
    }
    return null;
  } catch (e) {
    return { seed, step: log.length, what: (e as Error).stack?.split("\n").slice(0, 6).join(" | ") ?? String(e), log: log.slice(-14) };
  }
}
