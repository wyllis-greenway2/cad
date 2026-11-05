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
import { frameOf } from "./interaction/frame.ts";
import { appRows, nextScrollMode, isScrollMode } from "./interaction/appmenu.ts";
import type { AppState } from "./interaction/controller.ts";
import { projector } from "./interaction/camera.ts";
import { candidatesAt } from "./interaction/picking.ts";
import { kernel, initKernelWeb, drawRectangle, nextId } from "./interaction/api.ts";
import type { Ref, Command, Vec3 } from "./interaction/api.ts";
import { createView } from "./ui/view.ts";
import { createMenu } from "./ui/menu.ts";
import { createChip } from "./ui/chip.ts";
import { createControls } from "./ui/controls.ts";
import { createBubbles } from "./ui/bubbles.ts";

const host = document.getElementById("view")!;
const statusEl = document.getElementById("status")!;
const view = createView(host);
const chip = createChip(document.body, {
  entry: (field, text) => dispatch({ type: "entry", field, text }),
  enter: () => dispatch({ type: "typed", key: "Enter", shift: false }),
  cancel: () => dispatch({ type: "escape" }),
});
const bubbles = createBubbles(document.body, {
  focus: (id) => dispatch({ type: "relation", act: "focus", id }),
  remove: (id) => dispatch({ type: "relation", act: "remove", id }),
  lock: (id) => dispatch({ type: "relation", act: "lock", id }),
  set: (id, value) => dispatch({ type: "relation", act: "set", id, value }),
  measure: (value) => dispatch({ type: "relation", act: "measure", id: null, value }),
  mode: (name) => dispatch({ type: "begin", name: name as "edge" }),
});
const bus = createBus<{ input: RawInput }>();
const recognizer = createRecognizer();
let state: AppState;
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
  else dispatch({ type: "runAction", id });
});

const controls = createControls(document.body, {
  menu: (x, y) => dispatch({ type: "menu", x, y, button: true }),
  look: (plane) => dispatch({ type: "look", plane }),
});
const env = () => ({ w: view.size().w, h: view.size().h, now: performance.now() });
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
  if (i.type === "menu") menu.show(i.x, i.y, state.menu?.items ?? [], appRows(recognizer.scrollMode, typeof __BUILD__ === "string" ? __BUILD__ : ""));
  else if (menu.open && !["hover", "hoverEnd", "runAction"].includes(i.type)) menu.hide(); // pointing around does not close the menu; any other intent does
  dirty = true;
}
bus.on("input", (raw) => {
  for (const i of recognizer.feed(raw)) dispatch(i);
});
attachInput(host, bus);

async function boot() {
  statusEl.textContent = "loading the geometry kernel…";
  await initKernelWeb();
  statusEl.textContent = "";
  let session = createSession(kernel);
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
    dispatch, run: (c: Command) => { state = { ...state, session: run(state.session, c) }; dirty = true; },
  };
  requestAnimationFrame(frame);
}
function frame(now: number) {
  if (state.anim || state.pendingLook || state.flash) { state = advance(state, now); dirty = true; }
  const spreading = state.spread && now - state.spread.startMs < settings.orb.fillMs + 50;
  if (dirty || spreading || state.flash) {
    const size = view.size();
    const f = frameOf(state, size, now);
    const page = host.getBoundingClientRect();
    view.setScene(f.scene, f.mesh);
    view.setHighlight(f.highlight, state.cam, now);
    view.setPreview(f.preview, state.cam);
    view.setGizmo(f.gizmo, state.cam);
    const project = projector(state.cam, size.w, size.h).project;
    bubbles.update(f.annotations, (p) => { const q = project(p); return [q[0] + page.left, q[1] + page.top]; }, f.flash);
    view.setNotes(f.annotations.flatMap((a) => a.lines));
    const onPage = (p: Vec3 | null | undefined): [number, number] | null => { if (!p) return null; const q = project(p); return [q[0] + page.left, q[1] + page.top]; };
    chip.update(f.entry?.fields ?? null, f.entry?.unit ?? "mm", onPage(f.entry?.at), onPage(f.entry?.from));
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
