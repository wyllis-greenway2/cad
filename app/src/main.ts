// The composition root: wires the layers together and nothing else. Device events (platform) become intents (interaction), the controller changes the state,
// and the view and the menu (ui) draw it. No behaviour decisions live here (`inv_no_logic_in_ui`).
import { createBus } from "./shared/events.ts";
import type { RawInput } from "./shared/input.ts";
import type { Intent } from "./shared/input.ts";
import { settings } from "./shared/settings.ts";
import { attachInput } from "./platform/dom-input.ts";
import { createRecognizer } from "./interaction/recognizer.ts";
import { createSession, openSession, saveText, run, scene, selection, refresh } from "./interaction/session.ts";
import type { Session } from "./interaction/session.ts";
import { webFiles, webStore } from "./platform/web-files.ts";
import { createState, reduce, advance } from "./interaction/controller.ts";
import { frameOf } from "./interaction/frame.ts";
import { appRows, nextScrollMode, isScrollMode } from "./interaction/appmenu.ts";
import type { AppState } from "./interaction/controller.ts";
import { projector } from "./interaction/camera.ts";
import { candidatesAt } from "./interaction/picking.ts";
import { createAsyncKernel } from "./kernel-async.ts";
import type { Kernel } from "./compiler/kernel/adapter.ts";
import { kernel, initKernelWeb, drawRectangle, nextId } from "./interaction/api.ts";
import type { Ref, Command, Vec3 } from "./interaction/api.ts";
import { createView } from "./ui/view.ts";
import { createMenu } from "./ui/menu.ts";
import type { Row } from "./ui/menu.ts";
import type { MenuItem } from "./interaction/control/state.ts";
import { createRing } from "./ui/ring.ts";
import { createChip } from "./ui/chip.ts";
import { createPanel } from "./ui/panel.ts";
import { createApplyBar } from "./ui/applybar.ts";
import { createControls } from "./ui/controls.ts";
import { createToolChip } from "./ui/toolchip.ts";
import { createHints } from "./ui/hint.ts";
import { createTouchCursor } from "./ui/touchcursor.ts";
import { createBubbles } from "./ui/bubbles.ts";

const host = document.getElementById("view")!;
const statusEl = document.getElementById("status")!;
const view = createView(host);
const chipHandlers = {
  entry: (field: number, text: string) => dispatch({ type: "entry", field, text }),
  enter: () => dispatch({ type: "typed", key: "Enter", shift: false }),
  cancel: () => dispatch({ type: "escape" }),
};
const chips: ReturnType<typeof createChip>[] = []; // one value bubble, or several (a linear repeat has one on each axis)
const chipAt = (i: number) => (chips[i] ??= createChip(document.body, chipHandlers));
const bubbles = createBubbles(document.body, {
  focus: (id) => dispatch({ type: "relation", act: "focus", id }),
  remove: (id) => dispatch({ type: "relation", act: "remove", id }),
  lock: (id) => dispatch({ type: "relation", act: "lock", id }),
  set: (id, value) => dispatch({ type: "relation", act: "set", id, value }),
  measure: (value) => dispatch({ type: "relation", act: "measure", id: null, value }),
});
const bus = createBus<{ input: RawInput }>();
const recognizer = createRecognizer();
const panel = createPanel(document.body, {
  row: (id, act) => dispatch({ type: "panelRow", id, act }),
  undo: () => dispatch({ type: "undo" }),
  redo: () => dispatch({ type: "redo" }),
  close: () => dispatch({ type: "panel", name: state.panel ?? "bodies" }),
});
let state: AppState;
let engine: Kernel = kernel; // the kernel in use: on its own thread when that could start (`boot`), else the one in this page
let dirty = true;

const SCROLL_KEY = "cad.scrollMode";
const savedScroll = webStore.get(SCROLL_KEY);
if (isScrollMode(savedScroll)) recognizer.setScrollMode(savedScroll);

const menu = createMenu(document.body, (id) => {
  menu.hide();
  if (id === "scrollMode") {
    const next = nextScrollMode(recognizer.scrollMode);
    recognizer.setScrollMode(next);
    webStore.set(SCROLL_KEY, next);
  } else if (id === "save" || id === "open") dispatch({ type: id });
  else if (id === "bodies" || id === "history") dispatch({ type: "panel", name: id });
  else if (id === "undo" || id === "redo") dispatch({ type: id });
  else dispatch({ type: "runAction", id });
});

/** The ring's items as rows of the ⋯ list: each category's items under it, one group each. */
const rowsOf = (items: MenuItem[], group = ""): Row[] => items.flatMap((it) => it.children ? rowsOf(it.children, it.id) : [{ id: it.id, label: it.label, enabled: it.enabled, why: it.why, group: group || it.id }]);

const ring = createRing(document.body, (id) => {
  ring.hide();
  dispatch({ type: "runAction", id });
});

const hintIcons = createHints(document.body);
const touchHandle = createTouchCursor(document.body);
const applyBar = createApplyBar(document.body, { apply: () => dispatch({ type: "repeatApply" }), cancel: () => dispatch({ type: "repeatCancel" }) });

const toolChip = createToolChip(document.body, () => dispatch({ type: "escape" }));
const controls = createControls(document.body, {
  menu: (x, y) => dispatch({ type: "menu", x, y, button: true }),
  look: (plane) => dispatch({ type: "look", plane }),
});
const env = () => ({ w: view.size().w, h: view.size().h, now: performance.now() });
const FILE_NAME = "model.cad.json";
function adopt(session: Session) { state = { ...createState(session), cam: state.cam }; menu.hide(); ring.hide(); dirty = true; }
function dispatch(i: Intent) {
  if (i.type === "save") { webFiles.save(FILE_NAME, saveText(state.session)); return; }
  if (i.type === "open") {
    void webFiles.open().then((text) => {
      if (text === null) return;
      const r = openSession(engine, text);
      if (r.ok) adopt(r.value);
      else state = { ...state, session: { ...state.session, message: r.error } }, (dirty = true);
    });
    return;
  }
  state = reduce(state, i, env());
  recognizer.setDrawing(!!state.tool);
  if (i.type === "menu") {
    // the ⋯ button opens the settings and options; a right click or a long press opens the ring of operations round the pointer (`in_133`)
    // (the ⋯ list holds the same operations as the ring, in groups, above the settings: `in_148`)
    if (i.button) { ring.hide(); menu.show(i.x, i.y, rowsOf(state.menu?.items ?? []), appRows(recognizer.scrollMode, typeof __BUILD__ === "string" ? __BUILD__ : "", { undo: state.session.history.cursor > 0, redo: state.session.history.cursor < state.session.history.commands.length })); }
    else { menu.hide(); ring.show(i.x, i.y, state.menu?.items ?? []); }
  } else {
    // pointing around does not close a menu; any other intent does
    if (menu.open && !["hover", "hoverEnd", "runAction"].includes(i.type)) menu.hide();
    if (ring.open && !["hover", "hoverEnd", "runAction"].includes(i.type)) ring.hide();
  }
  dirty = true;
}
// which kind of device was used last: a laptop can have a mouse and a touch screen, so it is the event itself that says, not the machine (`in_160`)
let lastDevice: "mouse" | "touch" | "pen" = "mouse";
bus.on("input", (raw) => {
  if ("device" in raw && raw.device !== lastDevice) { lastDevice = raw.device; dirty = true; }
  for (const i of recognizer.feed(raw)) dispatch(i);
});
attachInput(host, bus);

async function boot() {
  statusEl.textContent = "loading the geometry kernel…";
  // the kernel works on its own thread so a heavy model does not freeze the page; if that cannot start, it runs here instead
  try {
    const worked = createAsyncKernel(() => {
      const before = state.session.history.cursor;
      const session = refresh(state.session);
      // the answer for the last step was an error and it was taken back: what was being worked on is over
      state = { ...state, session, ...(session.history.cursor < before ? { op: null, drag: null } : {}) };
      dirty = true;
    });
    await worked.init();
    engine = worked;
  } catch {
    await initKernelWeb();
  }
  statusEl.textContent = "";
  let session = createSession(engine);
  if (new URLSearchParams(location.search).get("demo") === "box") {
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
    frame: () => frameOf(state, view.size()),
    load: (text: string) => { const r = openSession(engine, text); if (r.ok) adopt(r.value); return r.ok },
    dispatch, run: (c: Command) => { state = { ...state, session: run(state.session, c) }; dirty = true; },
  };
  requestAnimationFrame(frame);
}
function frame(now: number) {
  if (state.anim || state.flash || state.mixT0 !== null) { state = advance(state, now); dirty = true; }
  const spreading = state.spread && now - state.spread.startMs < settings.orb.fillMs + 50;
  if (dirty || spreading || state.flash) {
    const size = view.size();
    const f = frameOf(state, size, now);
    const page = host.getBoundingClientRect();
    view.setScene(f.scene, f.mesh);
    view.setHighlight(f.highlight, state.cam, now);
    view.setPreview(f.preview, state.cam);
    view.setGizmo(f.gizmo, state.cam);
    view.setPanes(f.panes);
    toolChip.update(f.tool);
    const project = projector(state.cam, size.w, size.h).project;
    bubbles.update(f.annotations, (p) => { const q = project(p); return [q[0] + page.left, q[1] + page.top]; }, f.flash, f.avoid);
    view.setNotes(f.annotations.flatMap((a) => a.lines));
    panel.update(f.panel);
    const onPage = (p: Vec3 | null | undefined): [number, number] | null => { if (!p) return null; const q = project(p); return [q[0] + page.left, q[1] + page.top]; };
    const valueBubbles = f.entries.length ? f.entries : f.entry ? [f.entry] : [];
    valueBubbles.forEach((e, i) => chipAt(i).update(e.fields, e.unit || "mm", onPage(e.at), onPage(e.from), !!state.tool));
    for (let i = valueBubbles.length; i < chips.length; i++) chips[i]!.update(null, "mm", null);
    applyBar.update(f.bar);
    controls.hint(f.lookHint);
    hintIcons.update(f.hint?.kinds ?? [], onPage(f.hint?.at));
    // a finger has no hover: while it draws there is a cursor with a handle to drag it (the handle sits down and to the right of the cursor, kept on the screen)
    const tc = lastDevice === "touch" && f.touchCursor ? project(f.touchCursor) : null;
    const handle: [number, number] | null = tc ? [Math.max(30, Math.min(size.w - 30, tc[0] + 66)), Math.max(30, Math.min(size.h - 30, tc[1] + 66))] : null;
    recognizer.setTouchCursor(tc && handle ? { cursor: [tc[0], tc[1]], handle } : null);
    touchHandle.update(handle ? [handle[0] + page.left, handle[1] + page.top] : null);
    host.style.cursor = f.cursor;
    view.render(state.cam, f.grid);
    controls.update(window.innerWidth, window.innerHeight, settings.buttons.marginPx, settings.buttons.sizePx);
    statusEl.textContent = f.message;
    dirty = !!f.flash; // keep drawing while a refused change flashes
  }
  requestAnimationFrame(frame);
}
window.addEventListener("resize", () => { view.resize(); dirty = true; });
void boot();
