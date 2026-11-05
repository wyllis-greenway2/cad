// The composition root: wires the layers together and nothing else. Device events (platform) become intents (interaction), the controller changes the state,
// and the view and the menu (ui) draw it. No behaviour decisions live here (`inv_no_logic_in_ui`).
import { createBus } from "./shared/events.ts";
import type { RawInput } from "./shared/input.ts";
import type { Intent } from "./shared/input.ts";
import { settings } from "./shared/settings.ts";
import { attachInput } from "./platform/dom-input.ts";
import { createRecognizer } from "./interaction/recognizer.ts";
import { createSession, openSession, saveText, run, scene, selection } from "./interaction/session.ts";
import type { Session } from "./interaction/session.ts";
import { webFiles, webStore } from "./platform/web-files.ts";
import { createState, reduce, advance } from "./interaction/controller.ts";
import type { AppState } from "./interaction/controller.ts";
import { projector } from "./interaction/camera.ts";
import { candidatesAt } from "./interaction/picking.ts";
import { kernel, initKernelWeb, drawRectangle, nextId } from "./interaction/api.ts";
import type { Ref, Command } from "./interaction/api.ts";
import { createView } from "./ui/view.ts";
import { createMenu } from "./ui/menu.ts";
import { createChip } from "./ui/chip.ts";
import { createBadges } from "./ui/badges.ts";
import { badgesFor, focusParts, suggestMeasure, anchorOf } from "./interaction/api.ts";
import { entryOf, previewFor } from "./interaction/api.ts";

const host = document.getElementById("view")!;
const statusEl = document.getElementById("status")!;
const view = createView(host);
const chip = createChip(document.body);
const badges = createBadges(document.body, {
  focus: (id) => dispatch({ type: "relation", act: "focus", id }),
  remove: (id) => dispatch({ type: "relation", act: "remove", id }),
  lock: (id) => dispatch({ type: "relation", act: "lock", id }),
  edit: (id) => dispatch({ type: "relation", act: "edit", id }),
  measure: () => dispatch({ type: "begin", name: "dimension" }),
});
let pointer: [number, number] = [0, 0]; // where the pointer is, for placing the number chip
const bus = createBus<{ input: RawInput }>();
const recognizer = createRecognizer();
let state: AppState;
let dirty = true;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let lastSaved: unknown = null;
let autosave = true; // off for the demo, so trying it never overwrites your own work

const SCROLL_KEY = "cad.scrollMode";
try {
  const saved = localStorage.getItem(SCROLL_KEY);
  if (saved === "auto" || saved === "pan" || saved === "zoom") recognizer.setScrollMode(saved);
} catch { /* storage may be unavailable */ }
const SCROLL_NEXT = { auto: "pan", pan: "zoom", zoom: "auto" } as const;
const SCROLL_LABEL = { auto: "Scroll: trackpad pans, wheel zooms", pan: "Scroll: always pans", zoom: "Scroll: always zooms" } as const;

const menu = createMenu(document.body, (id) => {
  if (id === "scrollMode") {
    const next = SCROLL_NEXT[recognizer.scrollMode];
    recognizer.setScrollMode(next);
    try { localStorage.setItem(SCROLL_KEY, next); } catch { /* ignore */ }
    menu.hide();
    return;
  }
  if (id === "save" || id === "open") { dispatch({ type: id }); menu.hide(); return; }
  dispatch({ type: "runAction", id });
  menu.hide();
});
const fileRows = () => [{ id: "save", label: "Save", enabled: true, why: null }, { id: "open", label: "Open…", enabled: true, why: null }];
const scrollRow = () => ({ id: "scrollMode", label: SCROLL_LABEL[recognizer.scrollMode], enabled: true, why: null });

const env = () => ({ w: view.size().w, h: view.size().h, now: performance.now() });
const AUTOSAVE_KEY = "cad.autosave";
const FILE_NAME = "model.cad.json";
function adopt(session: Session) { state = { ...createState(session), cam: state.cam }; menu.hide(); dirty = true; }
function dispatch(i: Intent) {
  if (i.type === "save") { webFiles.save(FILE_NAME, saveText(state.session)); return; }
  if (i.type === "open") {
    void webFiles.open().then((text) => {
      if (text === null) return;
      const r = openSession(kernel, text);
      if (r.ok) adopt(r.value);
      else state = { ...state, session: { ...state.session, message: r.error } }, (dirty = true);
    });
    return;
  }
  state = reduce(state, i, env());
  if (i.type === "menu") menu.show(i.x, i.y, state.menu?.items ?? [], [...fileRows(), scrollRow()]);
  else if (menu.open && !["hover", "hoverEnd", "runAction"].includes(i.type)) menu.hide(); // pointing around does not close the menu; any other intent does
  dirty = true;
}
bus.on("input", (raw) => {
  if (raw.kind === "move" || raw.kind === "down") { const r = host.getBoundingClientRect(); pointer = [raw.x + r.left, raw.y + r.top]; }
  for (const i of recognizer.feed(raw)) dispatch(i);
});
attachInput(host, bus);

async function boot() {
  statusEl.textContent = "loading the geometry kernel…";
  await initKernelWeb();
  statusEl.textContent = "";
  let session = createSession(kernel);
  const demo = new URLSearchParams(location.search).get("demo") === "box";
  autosave = !demo;
  const saved = demo ? null : webStore.get(AUTOSAVE_KEY);
  if (saved) {
    const r = openSession(kernel, saved);
    if (r.ok) session = r.value;
  }
  if (demo) {
    const r = drawRectangle(scene(session), "w/XY" as Ref, [-20, -10, 0], [20, 10, 0], [1, 0, 0], [0, 1, 0]);
    session = run(session, r.command);
    session = run(session, { type: "addStep", step: { id: nextId(scene(session), "s"), type: "extrude", parts: r.lines, params: { depth: 20 } } });
  }
  state = createState(session);
  // a hook for scripted checks in a browser (not used by the app)
  (window as unknown as { __cad: unknown }).__cad = {
    get state() { return state; },
    size: () => view.size(),
    project: (p: [number, number, number]) => projector(state.cam, view.size().w, view.size().h).project(p),
    candidatesAt: (x: number, y: number) => candidatesAt(scene(state.session), projector(state.cam, view.size().w, view.size().h).view(x, y), { pointTol: settings.pick.pointPx, lineTol: settings.pick.linePx }),
    dispatch, run: (c: Command) => { state = { ...state, session: run(state.session, c) }; dirty = true; },
  };
  requestAnimationFrame(frame);
}
function frame(now: number) {
  if (state.anim) { state = advance(state, now); dirty = true; }
  const spreading = state.spread && now - state.spread.startMs < settings.orb.fillMs + 50;
  if (dirty || spreading) {
    if (autosave && state.session.history !== lastSaved) {
      lastSaved = state.session.history;
      if (saveTimer) clearTimeout(saveTimer);
      const h = state.session;
      saveTimer = setTimeout(() => webStore.set(AUTOSAVE_KEY, saveText(h)), 600); // the autosave: what you were doing is back after a refresh
    }
    const o = state.session.outcome;
    view.setScene(scene(state.session), o.kernel?.mesh ?? null);
    const sc = scene(state.session);
    const sel = selection(state.session);
    view.setHighlight({ hover: state.session.hover, hoverPoint: state.hoverPoint, selection: sel, amber: focusParts(sc, sel, state.focus), spread: state.spread }, state.cam, now);
    const anchor = anchorOf(sc, sel);
    const px = anchor ? projector(state.cam, view.size().w, view.size().h).project(anchor) : null;
    const r = host.getBoundingClientRect();
    badges.update(state.tool || state.op ? [] : badgesFor(sc, sel, state.focus), state.tool || state.op ? null : suggestMeasure(sc, sel), px ? [px[0] + r.left, px[1] + r.top] : null);
    view.setPreview(previewFor(scene(state.session), state.tool, state.op));
    const en = entryOf(scene(state.session), state.tool, state.op);
    chip.update(en?.fields ?? null, en?.unit ?? "mm", pointer[0], pointer[1]);
    host.style.cursor = state.tool ? "crosshair" : "";
    view.render(state.cam);
    statusEl.textContent = state.session.message ?? Object.values(o.errors)[0] ?? "";
    dirty = false;
  }
  requestAnimationFrame(frame);
}
window.addEventListener("resize", () => { view.resize(); dirty = true; });
void boot();
