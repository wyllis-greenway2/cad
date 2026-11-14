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
import { exportStl, canExport, selectedBodies } from "./interaction/exportstl.ts";
import { webFiles, webStore } from "./platform/web-files.ts";
import { createState, reduce, advance } from "./interaction/controller.ts";
import { frameOf } from "./interaction/frame.ts";
import { appRows, nextScrollMode, isScrollMode } from "./interaction/appmenu.ts";
import { snapshotOf, logEntry } from "./interaction/snapshot.ts";
import { createTiming } from "./interaction/timing.ts";
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
import { createHelper } from "./ui/helper.ts";
import { createBusy } from "./ui/busy.ts";
import { createControls } from "./ui/controls.ts";
import { createToolChip } from "./ui/toolchip.ts";
import { createToolCursor } from "./ui/toolcursor.ts";
import { createSimilarChip } from "./ui/similarchip.ts";
import { createModeSwitch } from "./ui/modeswitch.ts";
import { createSuggest } from "./ui/suggest.ts";
import { createHints } from "./ui/hint.ts";
import { createBoxView } from "./ui/boxview.ts";
import { createTouchCursor } from "./ui/touchcursor.ts";
import { createUndoBar } from "./ui/undobar.ts";
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
const timing = createTiming();
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
  } else if (id === "constraints") dispatch({ type: "runAction", id: "constraints" });
  else if (id === "share") shareState();
  else if (id === "exportStl") void exportModel();
  else if (id === "exportBody") void exportModel(selectedBodies(state.session));
  else if (id === "save" || id === "open") dispatch({ type: id });
  else if (id === "bodies" || id === "history" || id === "groups") dispatch({ type: "panel", name: id });
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
let lastIcon: [number, number] | null = null;
const touchHandle = createTouchCursor(document.body);
const boxView = createBoxView(document.body);
const helper = createHelper(document.body);
const busySign = createBusy(document.body);

const suggest = createSuggest(document.body, (id) => dispatch({ type: "runAction", id }));
const similarChip = createSimilarChip(document.body, (rule) => dispatch({ type: "similarRule", rule: rule as "kind" }));
const modeSwitch = createModeSwitch(document.body, (to) => dispatch({ type: "begin", name: to }));
const toolCursor = createToolCursor(document.body);
const undoBar = createUndoBar(document.body, () => dispatch({ type: "undo" }), () => dispatch({ type: "redo" }));
const toolChip = createToolChip(document.body, () => dispatch({ type: "escape" }), () => dispatch({ type: "typed", key: "Enter", shift: false }));
const controls = createControls(document.body, {
  menu: (x, y) => dispatch({ type: "menu", x, y, button: true }),
  look: (plane) => dispatch({ type: "look", plane }),
});
const env = () => ({ w: view.size().w, h: view.size().h, now: performance.now() });
const FILE_NAME = "model.cad.json";
function adopt(session: Session) { state = { ...createState(session), cam: state.cam }; menu.hide(); ring.hide(); dirty = true; }
// the last things done, kept so that a snapshot can show them (`in_200`): hovering is only kept as its last position
const intentLog: unknown[] = [];
let pointer: { x: number; y: number } | null = null;
function logIntent(i: Intent) {
  if (i.type === "hover") pointer = { x: i.x, y: i.y };
  const entry = logEntry(i, state, performance.now());
  const last = intentLog[intentLog.length - 1] as { type?: string } | undefined;
  if (i.type === "hover" && last?.type === "hover") intentLog[intentLog.length - 1] = entry;
  else intentLog.push(entry);
  if (intentLog.length > 400) intentLog.shift();
}
/** A file of everything about the state of the page, to send for a bug report (the project in it can be opened again). */
function shareState() {
  const at = new Date();
  const snap = snapshotOf(state, { intents: intentLog, viewport: { w: view.size().w, h: view.size().h, dpr: window.devicePixelRatio }, device: lastDevice, userAgent: navigator.userAgent, build: typeof __BUILD__ === "string" ? __BUILD__ : "", scrollMode: recognizer.scrollMode, timing: timing.summary(), at: at.toISOString(), pointer });
  const name = `cad-state-${at.toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`;
  webFiles.save(name, JSON.stringify(snap, null, 1));
  state = { ...state, session: { ...state.session, message: `saved ${name}: send that file` } };
  dirty = true;
}
/** Save the body as an STL file (`dec_export_stl`): the kernel makes the fine mesh (on its thread when it has one), then it is offered as a download; the result line says what was made. */
async function exportModel(only?: string[]) {
  const say = (message: string) => { state = { ...state, session: { ...state.session, message } }; dirty = true; };
  say("making the STL file…");
  const r = await exportStl(state.session, engine, only ? `model-${only.join("-")}.stl` : undefined, only);
  if (!r.ok) return say(r.error);
  webFiles.saveBytes(r.name, r.bytes, "model/stl");
  say(r.message);
}
function dispatch(i: Intent) {
  logIntent(i);
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
    if (i.button) { ring.hide(); menu.show(i.x, i.y, rowsOf(state.menu?.items ?? []), appRows(recognizer.scrollMode, typeof __BUILD__ === "string" ? __BUILD__ : "", { undo: state.session.history.cursor > 0, redo: state.session.history.cursor < state.session.history.commands.length, exportStl: canExport(state.session), exportBody: !!selectedBodies(state.session) }, state.showAllConstraints)); }
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
      const c = session.conflict;
      state = { ...state, session, ...(session.history.cursor < before ? { op: null, drag: null } : {}), ...(c && c !== state.session.conflict ? { flash: { ...c, at: performance.now() } } : {}) }; // (a step taken back with its reason: what is the problem flashes red, `in_266`)
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
    snapshot: () => snapshotOf(state, { intents: intentLog, viewport: { w: view.size().w, h: view.size().h, dpr: window.devicePixelRatio }, device: lastDevice, userAgent: navigator.userAgent, build: "", scrollMode: recognizer.scrollMode, timing: timing.summary(), at: new Date().toISOString(), pointer }),
    dispatch, run: (c: Command) => { state = { ...state, session: run(state.session, c) }; dirty = true; },
  };
  requestAnimationFrame(frame);
}
function frame(now: number) {
  if (state.anim || state.flash || state.mixT0 !== null) { state = advance(state, now); dirty = true; }
  const spreading = state.spread && now - state.spread.startMs < settings.orb.fillMs + 50;
  if (dirty || spreading || state.flash) {
    const size = view.size();
    const tFrame = performance.now();
    engine.draft = !!(state.drag && state.op && state.op.kind !== "edge"); // (a new fillet is made once, fine, and scaled) // (a rough mesh while a size is dragged, the fine one when it is let go, `in_216`)
    const f = frameOf(state, size, now);
    engine.draft = false;
    const tMade = performance.now();
    const page = host.getBoundingClientRect();
    view.setScene(f.scene, f.mesh);
    view.setBodyMatrix(f.bodyMatrix, f.selectionMoves, f.bodySplit);
    view.setFaceShift(f.faceShift ? { face: f.faceShift.face, ...(f.faceShift.by ? { by: [...f.faceShift.by] as [number, number, number] } : {}), ...(f.faceShift.radial ? { radial: f.faceShift.radial } : {}), ...(f.faceShift.columns ? { columns: f.faceShift.columns } : {}), ...(f.faceShift.rounds ? { rounds: f.faceShift.rounds } : {}), ...(f.faceShift.arcs ? { arcs: f.faceShift.arcs } : {}), withOverlay: f.highlight.selection.length === 1 && f.highlight.selection[0] === f.faceShift.face } : null);
    view.setHighlight(f.highlight, state.cam, now);
    view.setPreview(f.preview, state.cam);
    view.setGizmo(f.gizmo, state.cam);
    view.setPanes(f.panes);
    view.setBodyFade(f.fadeBody);
    toolChip.update(f.tool, f.confirm, lastDevice === "touch");
    undoBar.update(lastDevice === "touch", f.undoRedo);
    similarChip.update(f.similar);
    toolCursor.update(f.tool ? f.tool.kind : null);
    const project = projector(state.cam, size.w, size.h).project;
    // what comes before the constraint bubbles: the ring, and the number bubbles (and the helper bubble, the suggestions and the hint icons), as they stood on the last frame
    const inFront = [ring.rect(), ...chips.map((c) => c.rect()), helper.rect(), hintIcons.rect()].flatMap((r) => (r ? [[r.left, r.top, r.right, r.bottom] as [number, number, number, number]] : []));
    if (bubbles.update(f.annotations, (p) => { const q = project(p); return [q[0] + page.left, q[1] + page.top]; }, f.flash, f.avoid, inFront)) dirty = true; // (a bubble still sliding to its place: another frame)
    view.setNotes(f.annotations.flatMap((a) => a.lines));
    panel.update(f.panel);
    const onPage = (p: Vec3 | null | undefined): [number, number] | null => { if (!p) return null; const q = project(p); return [q[0] + page.left, q[1] + page.top]; };
    // the icon stands at the upper left of the handles, out of the way of the arrows and rings (`in_215`)
    const corner = f.modeSwitch ? f.modeSwitch.pts.map((p) => onPage(p)!).reduce<[number, number]>((c, q) => [Math.min(c[0], q[0]), Math.min(c[1], q[1])], [Infinity, Infinity]) : null;
    suggest.update(f.suggest ? f.suggest.items : null, f.suggest ? onPage(f.suggest.at) : null, [ring.rect(), ...chips.map((c) => c.rect()), helper.rect(), ...bubbles.rects()].flatMap((r) => (r ? [[r.left, r.top, r.right, r.bottom] as [number, number, number, number]] : [])));
    const valueBubbles = f.entries.length ? f.entries : f.entry ? [f.entry] : [];
    valueBubbles.forEach((e, i) => chipAt(i).update(e.fields, e.unit || "mm", onPage(e.at), onPage(e.from), !!state.tool));
    for (let i = valueBubbles.length; i < chips.length; i++) chips[i]!.update(null, "mm", null);
    modeSwitch.update(f.modeSwitch, corner && Number.isFinite(corner[0]) ? corner : null, chips.flatMap((c) => c.rect() ?? [])); // (after the bubbles: it keeps off them, `in_231`)
    helper.update(f.helper ? f.helper.text : null, f.helper ? onPage(f.helper.at) : null);
    const working = busySign.update(f.busy, now);
    controls.hint(f.lookHint);
    hintIcons.update(f.hint?.kinds ?? [], onPage(f.hint?.at));
    // a finger has no hover and cannot drag small arrows: it is offered a drag icon (it moves the cursor of a figure being drawn, or drags the arrow or ring that was tapped) and a check (sets the point, or applies the operation); a tap anywhere else cancels (`in_283`, `in_284`)
    const th = lastDevice === "touch" ? f.touchHelper : null;
    const anchor = th ? project(th.at) : null;
    const clampTo = (q: [number, number]): [number, number] => [Math.max(30, Math.min(size.w - 30, q[0])), Math.max(30, Math.min(size.h - 30, q[1]))];
    let icon: [number, number] | null = null;
    if (th && anchor) {
      if (state.drag && "handle" in state.drag && lastIcon) icon = lastIcon; // (the icon stays where the finger took it while an arrow is being dragged)
      else if (th.kind === "cursor") icon = clampTo([anchor[0] + 66, anchor[1] + 66]);
      else { const below = clampTo([anchor[0], anchor[1] + 76]); icon = below[1] - anchor[1] < 40 ? clampTo([anchor[0], anchor[1] - 76]) : below; } // (below the arrow, or above it where there is no room)
    }
    lastIcon = icon;
    recognizer.setTouchHelper(th && anchor && icon ? { kind: th.kind, anchor: [anchor[0], anchor[1]], icon, closes: th.kind === "handle" && th.applies, handles: th.handles.map((p) => p.map((q) => { const r = project(q); return [r[0], r[1]] as [number, number]; })) } : null);
    touchHandle.update(icon ? [icon[0] + page.left, icon[1] + page.top] : null);
    boxView.update(f.box, page.left, page.top);
    host.style.cursor = f.cursor;
    const tBuilt = performance.now();
    view.render(state.cam, f.grid);
    const tEnd = performance.now();
    timing.add("frame: work out (frameOf)", tMade - tFrame);
    timing.add("frame: build what is drawn", tBuilt - tMade);
    timing.add("frame: draw (render)", tEnd - tBuilt);
    timing.add("frame: all", tEnd - tFrame);
    controls.update(window.innerWidth, window.innerHeight, settings.buttons.marginPx, settings.buttons.sizePx);
    statusEl.textContent = f.message;
    dirty = !!f.flash || working || !!f.highlight.temp?.length; // keep drawing while a refused change flashes, the "working" sign turns, or the copies of a repeat pulse
  }
  requestAnimationFrame(frame);
}
window.addEventListener("resize", () => { view.resize(); dirty = true; });
void boot();
