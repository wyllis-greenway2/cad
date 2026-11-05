// The page. TEMPORARY wiring for phase 4: mouse and keys are read here only so the view can be tried; phase 5 replaces this with the device tables
// (`prin_input_agnostic`) in the platform and interaction layers. Nothing here decides anything about parts.
import { settings, kernel, initKernelWeb, drawRectangle, nextId, lookup, outlineOf, depthOf } from "../interaction/api.ts";
import type { Vec3, Ref } from "../interaction/api.ts";
import { createSession, run, undoLast, redoLast, clickOn, hoverOn, clearSelection, scene, selection } from "../interaction/session.ts";
import type { Session } from "../interaction/session.ts";
import { refsAt, candidatesAt } from "../interaction/picking.ts";
import { homeCamera, orbit, pan, zoom, projector, lookAlternating, blend, easeInOut } from "../interaction/camera.ts";
import type { Camera } from "../interaction/camera.ts";
import { createView } from "./view.ts";
import type { Highlight } from "./view.ts";

const host = document.getElementById("view")!;
const statusEl = document.getElementById("status")!;
const view = createView(host);
let session: Session;
let cam: Camera = homeCamera();
let anim: { from: Camera; to: Camera; t0: number } | null = null;
let spread: Highlight["spread"] = null;
let hoverPoint: Vec3 | null = null;
let dirty = true;

const px = (e: PointerEvent | MouseEvent) => {
  const r = view.canvas.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top] as const;
};
const pickOpts = { pointTol: settings.pick.pointPx, lineTol: settings.pick.linePx };
const pointerView = (x: number, y: number) => projector(cam, view.size().w, view.size().h).view(x, y);

/** The middle of the model in view: the body's bounding box, else the camera target. */
const pivot = (): Vec3 | undefined => {
  const b = session.outcome.kernel?.bbox;
  return b ? [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2] : undefined;
};
const set = (s: Session) => {
  session = s;
  dirty = true;
};
const lookAt = (normal: Vec3, u: Vec3) => {
  anim = { from: cam, to: lookAlternating(cam, normal, u), t0: performance.now() };
  dirty = true;
};

// ---- pointer ----
let down: { x: number; y: number; button: number; moved: boolean; shift: boolean } | null = null;
host.addEventListener("contextmenu", (e) => e.preventDefault());
host.addEventListener("pointerdown", (e) => {
  host.setPointerCapture(e.pointerId);
  const [x, y] = px(e);
  down = { x, y, button: e.button, moved: false, shift: e.shiftKey };
});
host.addEventListener("pointermove", (e) => {
  const [x, y] = px(e);
  if (down) {
    const dx = x - down.x;
    const dy = y - down.y;
    if (!down.moved && Math.hypot(dx, dy) < settings.view.clickMovePx) return;
    down.moved = true;
    anim = null;
    if (down.button === 1 || (down.button === 2 && down.shift)) cam = pan(cam, dx, dy, view.size().h);
    else cam = orbit(cam, -dx * settings.view.orbitRadPerPx, dy * settings.view.orbitRadPerPx, pivot());
    down.x = x;
    down.y = y;
    dirty = true;
    return;
  }
  const pv = pointerView(x, y);
  const c = candidatesAt(scene(session), pv, pickOpts)[0];
  const ref = c?.ref;
  hoverPoint = null;
  if (c && c.rank === 2 && pv.ray) {
    const t = c.score;
    hoverPoint = [pv.ray.o[0] + pv.ray.d[0] * t, pv.ray.o[1] + pv.ray.d[1] * t, pv.ray.o[2] + pv.ray.d[2] * t];
  }
  set(hoverOn(session, ref));
});
host.addEventListener("pointerup", (e) => {
  const d = down;
  down = null;
  if (!d || d.moved || d.button !== 0) return;
  const [x, y] = px(e);
  const pv = pointerView(x, y);
  const cands = candidatesAt(scene(session), pv, pickOpts);
  const refs: Ref[] = cands.map((c) => c.ref);
  const s = clickOn(session, refs, e.shiftKey);
  const top = selection(s).at(-1);
  const hit = cands.find((c) => c.ref === top);
  spread = hit && hit.rank === 2 && pv.ray ? { ref: hit.ref, point: [pv.ray.o[0] + pv.ray.d[0] * hit.score, pv.ray.o[1] + pv.ray.d[1] * hit.score, pv.ray.o[2] + pv.ray.d[2] * hit.score], startMs: performance.now() } : null;
  set(s);
});
host.addEventListener("wheel", (e) => {
  e.preventDefault();
  cam = zoom(cam, Math.exp(e.deltaY * settings.view.zoomPerWheel));
  dirty = true;
}, { passive: false });

// ---- keys ----
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === "z") return set(e.shiftKey ? redoLast(session) : undoLast(session));
  if (e.ctrlKey || e.metaKey) return;
  const get = lookup(scene(session));
  const plane = (ref: Ref) => get(ref)!;
  if (k === "z") lookAt([0, 0, 1], [1, 0, 0]);
  else if (k === "y") lookAt([1, 0, 0], [0, 1, 0]);
  else if (k === "x") lookAt([0, -1, 0], [1, 0, 0]);
  else if (k === "h") { anim = { from: cam, to: homeCamera(), t0: performance.now() }; dirty = true; }
  else if (k === "escape") set(clearSelection(session));
  void plane;
});

// ---- boot ----
async function boot() {
  statusEl.textContent = "loading the geometry kernel…";
  await initKernelWeb();
  statusEl.textContent = "";
  session = createSession(kernel);
  if (new URLSearchParams(location.search).get("demo") === "box") {
    const r = drawRectangle(scene(session), "w/XY" as Ref, [-20, -10, 0], [20, 10, 0], [1, 0, 0], [0, 1, 0]);
    session = run(session, r.command);
    session = run(session, { type: "addStep", step: { id: nextId(scene(session), "s"), type: "extrude", parts: r.lines, params: { depth: 20 } } });
  }
  (window as unknown as { __cad: unknown }).__cad = {
    get session() { return session; },
    set: (s: Session) => set(s),
    get cam() { return cam; },
    setCam: (c: Camera) => { cam = c; dirty = true; },
    pointerView, candidatesAt: (x: number, y: number) => candidatesAt(scene(session), pointerView(x, y), pickOpts), refsAt: (x: number, y: number) => refsAt(scene(session), pointerView(x, y), pickOpts),
    run: (c: never) => set(run(session, c)), size: () => view.size(), outlineOf, depthOf,
  };
  requestAnimationFrame(frame);
}
function frame(now: number) {
  if (anim) {
    const k = Math.min(1, (now - anim.t0) / settings.view.transitionMs);
    cam = blend(anim.from, anim.to, easeInOut(k));
    if (k >= 1) { cam = anim.to; anim = null; }
    dirty = true;
  }
  const animating = spread && now - spread.startMs < settings.orb.fillMs + 50;
  if (dirty || animating || hoverPoint) {
    const o = session.outcome;
    view.setScene(scene(session), o.kernel?.mesh ?? null);
    view.setHighlight({ hover: session.hover, hoverPoint, selection: selection(session), spread }, cam, now);
    view.render(cam);
    statusEl.textContent = session.message ?? Object.values(o.errors)[0] ?? "";
    dirty = false;
  }
  requestAnimationFrame(frame);
}
window.addEventListener("resize", () => { view.resize(); dirty = true; });
void boot();
