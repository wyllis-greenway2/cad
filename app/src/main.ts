// The composition root: wires the layers together and nothing else. Device events (platform) become intents (interaction), the controller changes the state,
// and the view and the menu (ui) draw it. No behaviour decisions live here (`inv_no_logic_in_ui`).
import { typedLength } from "./shared/units.ts";
import { createBus } from "./shared/events.ts";
import type { RawInput } from "./shared/input.ts";
import type { Intent } from "./shared/input.ts";
import { settings } from "./shared/settings.ts";
import { attachInput } from "./platform/dom-input.ts";
import { createRecognizer } from "./interaction/recognizer.ts";
import { mateStatus } from "./operation/mates.ts";
import { createSession, openSession, saveText, run, scene, selection, refresh } from "./interaction/session.ts";
import type { Session } from "./interaction/session.ts";
import type { ReceiverValues, ReceiverPlan } from "./interaction/addpart.ts";
import { pickPlace, dragTarget, rowOf, movedBy, movedTarget } from "./interaction/holemove.ts";
import type { Annotation } from "./interaction/annotations.ts";
import { canExport } from "./interaction/exportstl.ts";
import { canExportFlat } from "./interaction/exportsketch.ts";
import { laserDialog, runLaser, findingsDialog, machineChoices, machineDialog, startValues, projectMachines, recordCommands, tableRows, rowFrom, tableDialog, layersDialog, layersCommand, whyNoLayers, marksSummary } from "./interaction/manufacture.ts";
import { parseLibrary, libraryText, saveMachine, removeMachine, saveSettings, removeSettings } from "./interaction/library.ts";
import { flatSnapshot } from "./interaction/partsnapshot.ts";
import type { LaserValues } from "./interaction/manufacture.ts";
import { pathRepeatTarget, pathRepeatDialog, pathRepeatCommand, pathRepeatStart, pathRepeatValuesFor } from "./interaction/pathrepeat.ts";
import { receiverStart, receiverKinds, receiverSizes, receiverContext, receiverPlan, cutReceiver, makeHolePoints, whyNoReceiver, placesPicked } from "./interaction/addpart.ts";
import { materialStart, materialDialog, materialCommand, whyNoMaterial } from "./interaction/material.ts";
import { nameFor } from "./interaction/sniff.ts";
import { exportDialog, exportWith, fitExport, importDialog, importWith, KIND_OF, EXPORT_DEFAULTS, IMPORT_DEFAULTS, IMPORT_KINDS } from "./interaction/transfer.ts";
import type { ExportOptions } from "./interaction/transfer.ts";
import type { ImportOptions } from "./interaction/importfile.ts";
import { createDialog } from "./ui/dialog.ts";
import type { Values } from "./ui/dialog.ts";
import type { ExportFormat } from "./interaction/exportfile.ts";
import { aboutOf } from "./operation/file.ts";
import { webFiles, webStore } from "./platform/web-files.ts";
import { createAutosave } from "./platform/autosave.ts";
import { ghostsFromProject } from "./compiler/projectghosts.ts";
import type { StandIn } from "./interaction/standin.ts";
import { createState, reduce, advance, stopView, afterTakenBack } from "./interaction/controller.ts";
import { frameOf } from "./interaction/frame.ts";
import { requestOverlap } from "./interaction/overlap.ts";
import { clearanceBetween } from "./interaction/clearance.ts";
import { appRows, fabricateRows, viewRows, isScrollMode } from "./interaction/appmenu.ts";
import { createSettings } from "./ui/settings.ts";
import type { Change } from "./ui/settings.ts";
import { keysFromText, keysToText } from "./interaction/preferences.ts";
import { units } from "./shared/units.ts";
import { snapshotOf, logEntry } from "./interaction/snapshot.ts";
import { createTiming } from "./interaction/timing.ts";
import { buildStats } from "./ui/view/content.ts";
import type { AppState } from "./interaction/controller.ts";
import { projector, position, basis } from "./interaction/camera.ts";
import { candidatesAt } from "./interaction/picking.ts";
import { createAsyncKernel } from "./kernel-async.ts";
import { createWarmer } from "./sections-warm.ts";
import { openResultStore } from "./platform/result-store.ts";
import type { Kernel, KernelResult } from "./compiler/kernel/adapter.ts";
import { drawRectangle, nextId, STANDIN_MS } from "./interaction/api.ts";
import type { Ref, Command, Vec3 } from "./interaction/api.ts";
import { createView } from "./ui/view.ts";
import { createMenu } from "./ui/menu.ts";
import { createRing } from "./ui/ring.ts";
import { createAddChip } from "./ui/addchip.ts";
import { createPreviewBar } from "./ui/previewbar.ts";
import { createMotionBar } from "./ui/motionbar.ts";
import { tickMotion, motionHolds } from "./interaction/motion.ts";
import { solveContact } from "./interaction/contact.ts";
import { createAhead } from "./contact-ahead.ts";
import { createChip } from "./ui/chip.ts";
import { createSheetChips } from "./ui/sheetchips.ts";
import { createWorldOrb } from "./ui/worldorb.ts";
import { createHardMarks } from "./ui/hardmarks.ts";
import { createPanel } from "./ui/panel.ts";
import { hiddenBodyUnder } from "./ui/bodychips.ts";
import { createControls } from "./ui/controls.ts";
import { createGearBox } from "./ui/gearbox.ts";
import { createHolePanel } from "./ui/holepanel.ts";
import type { HolePanelView } from "./ui/holepanel.ts";
import { holesView } from "./interaction/holepreview.ts";
import type { ToolpathView } from "./interaction/toolpathview.ts";
import { createToolChip } from "./ui/toolchip.ts";
import { createToolCursor } from "./ui/toolcursor.ts";
import { createNotices } from "./ui/notices.ts";
import { createResetView } from "./ui/resetview.ts";
import { createCrosshair } from "./ui/crosshair.ts";
import { createModeSwitch } from "./ui/modeswitch.ts";
import { createSuggest } from "./ui/suggest.ts";
import { createHints } from "./ui/hint.ts";
import { createStandInLabels } from "./ui/standinlabel.ts";
import { createBoxView } from "./ui/boxview.ts";
import { createTouchCursor } from "./ui/touchcursor.ts";
import { createCutParts } from "./ui/cutparts.ts";
import { createBubbles } from "./ui/bubbles.ts";
import { installTouchTips } from "./ui/tips.ts";

const host = document.getElementById("view")!;
const statusEl = document.getElementById("status")!;
const view = createView(host);
const chipHandlers = {
  entry: (field: number, text: string) => dispatch({ type: "entry", field, text }),
  enter: () => {
    dispatch({ type: "typed", key: "Enter", shift: false });
    // a finger applies a typed size and puts the tool away with it, as a tap that applies does (`in_290`)
    if (lastDevice === "touch" && state.tool && !state.tool.points.length) dispatch({ type: "escape" });
  },
  cancel: () => dispatch({ type: "escape" }),
};
const gearBox = createGearBox(document.body, chipHandlers); // (the gear tool's numbers: a labelled panel that stands still, `in_685`)
const chips: ReturnType<typeof createChip>[] = []; // one value bubble, or several (a linear repeat has one on each axis)
const chipAt = (i: number) => (chips[i] ??= createChip(document.body, chipHandlers));
const bubbles = createBubbles(document.body, {
  focus: (id) => dispatch({ type: "relation", act: "focus", id }),
  remove: (id) => dispatch({ type: "relation", act: "remove", id }),
  lock: (id) => dispatch({ type: "relation", act: "lock", id }),
  set: (id, value) => dispatch({ type: "relation", act: "set", id, value }),
  measure: (value, id) => (id === "hole:moved" ? holesSetDistance(value) : dispatch({ type: "relation", act: "measure", id: id ?? null, value })),
});
installTouchTips(); // (a held press shows the title of a button, for a finger has no hover, `in_300`)
const bus = createBus<{ input: RawInput }>();
const recognizer = createRecognizer();
const panel = createPanel(document.body, {
  row: (id, act) => dispatch({ type: "panelRow", id, act }),
  action: (id) => dispatch({ type: "panelAction", id }),
  insert: () => dispatch({ type: "stepInsert" }),
  tab: (id) => dispatch({ type: "panel", name: id as "bodies" | "history" | "sketches" | "parameters" | "constraints" | "measure" }),
  go: (id) => dispatch({ type: "stepGo", id }),
  edit: (id) => dispatch({ type: "stepEdit", id }),
  set: (id, key, value) => dispatch({ type: "stepSet", id, key, value }),
  link: (id, key, expr) => dispatch({ type: "stepLink", id, key, expr }),
  param: (name, expr) => dispatch({ type: "paramSet", name, expr }),
  unparam: (name) => dispatch({ type: "paramRemove", name }),
  undo: () => dispatch({ type: "undo" }),
  redo: () => dispatch({ type: "redo" }),
  close: () => dispatch({ type: "panel", name: state.panel ?? "bodies" }),
});
let state: AppState;
let lastFrame: ReturnType<typeof frameOf> | null = null;
const timing = createTiming();
let drawnAt: number | null = null; // (when the last frame that drew was done: the next frame starts after the browser has handed it to the graphics card, `in_498`)
let staleSince: number | null = null; // (when the picture began to wait for the kernel's answer: the time until that answer is drawn is what an edit makes you wait)
/** What stands in for the kernel until `boot` has one (nothing asks it anything before). */
const notReady: Kernel = {
  name: "not started",
  init: async () => undefined,
  evaluate: () => { throw new Error("the kernel has not started yet"); },
  exportMesh: async () => ({ ok: false, error: "the kernel has not started yet" }),
  exportStep: async () => ({ ok: false, error: "the kernel has not started yet" }),
};
let engine: Kernel = notReady; // the kernel in use: on its own thread when that could start (`boot`), else the one in this page (loaded only then: it is most of the app's code, `in_990`)
let dirty = true;

const SCROLL_KEY = "cad.scrollMode";
const savedScroll = webStore.get(SCROLL_KEY);
if (isScrollMode(savedScroll)) recognizer.setScrollMode(savedScroll);

const OUTLINE_KEY = "cad.outlines";
if (webStore.get(OUTLINE_KEY) === "0") settings.theme.outlines = false;
const PAN_KEY = "cad.panScale";
const savedPan = Number(webStore.get(PAN_KEY));
if (Number.isFinite(savedPan) && savedPan > 0) settings.input.trackpadPanScale = savedPan;

const KEYS_KEY = "cad.keys";
const UNITS_KEY = "cad.units";
const USUAL_KEYS: Record<string, string[]> = JSON.parse(JSON.stringify(settings.input.keys));
settings.input.keys = keysFromText(webStore.get(KEYS_KEY), USUAL_KEYS);
if (webStore.get(UNITS_KEY) === "in") units.system = "in";

/** The settings page (`dec_settings_page`, `in_661`): each change is made and kept as it is made. */
const settingsPage = createSettings(document.body, () => ({ units: units.system, outlines: settings.theme.outlines, scrollMode: recognizer.scrollMode, panScale: settings.input.trackpadPanScale, keys: settings.input.keys, usualKeys: USUAL_KEYS }), (c: Change) => {
  if (c.what === "units") { units.system = c.value; webStore.set(UNITS_KEY, c.value); }
  else if (c.what === "outlines") { settings.theme.outlines = c.value; webStore.set(OUTLINE_KEY, c.value ? "1" : "0"); view.rebuild(); }
  else if (c.what === "scrollMode") { recognizer.setScrollMode(c.value); webStore.set(SCROLL_KEY, c.value); }
  else if (c.what === "panScale") { settings.input.trackpadPanScale = c.value; webStore.set(PAN_KEY, String(c.value)); }
  else { settings.input.keys = c.value; webStore.set(KEYS_KEY, keysToText(c.value, USUAL_KEYS)); }
  dirty = true;
});

let menuAt: [number, number] = [0, 0]; // (where the ⋯ list was opened, for the lists under it)
const fabricateList = () => fabricateRows({ laser: canExportFlat(state.session), laserLayers: !whyNoLayers(state.session), laserTable: parseLibrary(webStore.get("cad.library")).library.settings.length > 0 }, scene(state.session).clearance ?? 0);
const menu = createMenu(document.body, (id) => {
  menu.hide();
  if (state.menu) { state = { ...state, menu: null }; dirty = true; } // (a row that opens a dialog or sets something does not close the ⋯ menu's state on its own: the first Esc afterwards would only have closed that)
  if (id === "view:game") { input.toggleGame(); return; } // (game mode is the input's: it holds the pointer, `in_391`)
  if (id === "settings") settingsPage.open();
  else if (id === "constraints") dispatch({ type: "runAction", id: "constraints" });
  else if (id === "export") void exportDialogFlow();
  else if (id === "import") void importDialogFlow();
  else if (id === "view") { menu.show(menuAt[0], menuAt[1], [], viewRows({ wireframe: state.wireframe, constraints: state.showAllConstraints, cuts: state.showCuts })); } // (a list of its own, in the same place: what was under the eye, `in_1387`)
  else if (id === "fabricate") { menu.show(menuAt[0], menuAt[1], [], fabricateList()); } // (a list of its own, in the same place: Fabricate, `in_1083`)
  else if (id === "laser") void laserDialogFlow();
  else if (id === "laserTable") void laserTableFlow();
  else if (id === "laserLayers") void laserLayersFlow();
  else if (id === "clearAnswers") void resultStore?.clear();
  else if (id === "bodies" || id === "history" || id === "groups") dispatch({ type: "panel", name: id });
  else if (id === "undo" || id === "redo") dispatch({ type: id });
  else dispatch({ type: "runAction", id });
}, (why) => dispatch({ type: "runAction", id: `say:${why}` }));

/** The ring's items as rows of the ⋯ list: each category's items under it, one group each. */

const ring = createRing(document.body, (id) => {
  ring.hide();
  if (id === "view:game") { input.toggleGame(); return; }
  if (id === "repeat:path") { void pathRepeatFlow(); return; } // (`dec_path_repeat`)
  if (id === "fab:material") { void materialDialogFlow(); return; } // (Shape, Fabricate, `in_1083`)
  if (id === "tool:fasteners") { holesOpen(); return; } // (the tool is a panel and a preview in the model view, `dec_parts_tool`)
  dispatch({ type: "runAction", id });
}, (id) => dispatch({ type: "runAction", id: `why:${id}` }), (id) => { if (id === "sketch") dispatch({ type: "runAction", id: "sketch:open" }); }); // (the pencil opened: sketch mode, square to the surface the right click was on, `in_1385`; a dimmed option pressed: its reason is said and the ring stays, `in_538`)

const hintIcons = createHints(document.body);
const autosave = createAutosave(typeof localStorage === "undefined" ? null : localStorage); // (a copy of the project as it is worked, and of the session before: a crash does not lose it, `in_997`)
const sections = createWarmer(); // (a wheel's sections are worked out in a thread of their own, `in_899`)
const standLabels = createStandInLabels(document.body); // (the words on the discs that stand for gear bodies not made yet, `in_847`)
let lastStandSecs: number | null = null;
let lastIcon: [number, number] | null = null;
let touchRects: DOMRect[] = []; // (where the drag icons of a finger stood on the last frame: the bubbles and the suggestions keep off them, `in_292`)
const touchHandle = createTouchCursor(document.body);
const boxView = createBoxView(document.body);

const suggest = createSuggest(document.body, (id, part) => dispatch({ type: "runAction", id, ...(part ? { part: part as never } : {}) })); // (the helpful bar: the icons of what is selected, the suggested constraints, `in_1160`)
const crosshair = createCrosshair(document.body);
const hardMarks = createHardMarks(document.body, (id) => dispatch({ type: "runAction", id }));
const worldOrb = createWorldOrb(document.body, () => dispatch({ type: "runAction", id: "world:toggle" }));
const sheetChips = createSheetChips(document.body, (id) => dispatch({ type: "runAction", id }));
const resetView = createResetView(document.body, () => dispatch({ type: "resetView" }));
const notices = createNotices(document.body, statusEl, (i) => dispatch(i)); // (every message, refusal, help and the working sign, `in_665`)
const previewBar = createPreviewBar(document.body, (at) => dispatch({ type: "previewAt", at }), () => dispatch({ type: "previewClose" }));
const motionBar = createMotionBar(document.body, (i) => dispatch(i));
const addChip = createAddChip(document.body, () => dispatch({ type: "runAction", id: "select:add" }));
const modeSwitch = createModeSwitch(document.body, (to) => dispatch(to === "invert" ? { type: "runAction", id: "hollow:invert" } : to === "linear" || to === "circular" ? { type: "runAction", id: `op:${to}` } : { type: "begin", name: to }));
const toolCursor = createToolCursor(document.body);
const cutParts = createCutParts(document.body, (mask) => dispatch({ type: "cut", act: "toggle", mask }));
const toolChip = createToolChip(document.body, () => dispatch({ type: "escape" }), () => dispatch({ type: "typed", key: "Enter", shift: false }), (o) => dispatch(o.intent), () => dispatch({ type: "undo" }), () => dispatch({ type: "redo" }), () => dispatch({ type: "exitSketch" }), () => dispatch({ type: "sketchCut" }), () => dispatch({ type: "keepNormal" }));
const controls = createControls(document.body, {
  menu: (x, y) => dispatch({ type: "menu", x, y, button: true }),
  look: (plane) => dispatch({ type: "look", plane }),
});
const env = () => ({ w: view.size().w, h: view.size().h, now: performance.now() });
const FILE_NAME = "model.cad.json";
/** A ring opened in game mode is at the middle of the view and the view is fixed while it is open (`in_467`): the wheel lights one option after another, the mouse turns round it in clicks, a click chooses the lit one wherever the pointer is; a right click, or a click with none lit, closes it. */
let wasGame = false; // (game mode was on at the last frame)
let tilt: [number, number] = [0, 0]; // (how far the view has been tilted to look at a menu option, in swivel units)
let ringAnchor: Vec3 | null = null; // (where a ring opened in game mode stands in the world)
const inGame = (): boolean => recognizer.game && document.pointerLockElement !== null;
let panesFading = false; // (the world panes are fading in or out: keep drawing, `in_442`)
/** The boxes of the parts of a project that is being opened, drawn while its commands are replayed (`dec_progressive_open`, `in_1058`); null when nothing is being opened or the project has none. */
let openingGhosts: StandIn[] | null = null;
const nextPaint = () => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
/** Open a project's text: a box for each of its parts at once (from the commands alone, in a few milliseconds), the picture drawn, and then the commands are replayed, which takes seconds for a big project and freezes the page while it does. */
async function openProjectText(text: string) {
  const parts = ghostsFromProject(text);
  if (parts) { openingGhosts = parts.map((g): StandIn => ({ step: g.id, centre: [0, 0, 0], normal: [0, 0, 1], depth: 0, radius: 0, hole: 0, box: g.box })); dirty = true; await nextPaint(); }
  let tried = sections.attempt(() => openSession(engine, text));
  while (!tried.ok) { say("working out the wheel…"); await tried.ready; tried = sections.attempt(() => openSession(engine, text)); } // (a project with a worm wheel: its sections first, off the page's thread, `in_990`)
  return tried.value;
}
function adopt(session: Session) { openingGhosts = null; state = { ...createState(session), cam: state.cam }; menu.hide(); ring.hide(); dirty = true; }
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
/** The project as the text of a file: the model and its history (`saveText`) and, under `state`, what the page knew when it was saved (the view, the selection, what the kernel answered, the last things done): one file to send when something is to be looked into (`in_1083`). */
function projectText(): string {
  const at = new Date();
  const snap = snapshotOf(state, { intents: intentLog, viewport: { w: view.size().w, h: view.size().h, dpr: window.devicePixelRatio }, device: lastDevice, userAgent: navigator.userAgent, build: typeof __BUILD__ === "string" ? __BUILD__ : "", scrollMode: recognizer.scrollMode, timing: timing.summary(), at: at.toISOString(), pointer });
  return saveText(state.session, { app: "CAD", build: typeof __BUILD__ === "string" ? __BUILD__ : "", saved: at.toISOString() }, { state: snap }); // (what made the file is written at its top, `in_528`)
}
const EXPORT_KEY = "cad.exportOptions";
const dialog = createDialog(document.body);
const say = (message: string) => { state = { ...state, session: { ...state.session, message } }; dirty = true; };
/** Export (`dec_export_stl`, `dec_export_formats`, `dec_export_flat`, `dec_import_export_menu`): a dialog asks the format and its options (the last choices are remembered), then the file is made (the kernel on its own thread for a mesh or an exact solid) and offered as a download; the result line says what was made. */
async function exportDialogFlow() {
  let saved = EXPORT_DEFAULTS;
  try { saved = { ...EXPORT_DEFAULTS, ...JSON.parse(webStore.get(EXPORT_KEY) ?? "{}") }; } catch { /* not kept, or not readable: the usual */ }
  saved = { ...saved, units: units.system, format: "project" }; // (the units start from the number system of the settings page; a different choice here is for this file only, `in_677`; the first format is the project: what is saved most, `in_1083`)
  const answers = await dialog.open((v) => exportDialog(state.session, v as unknown as ExportOptions), (({ name: _name, ...rest }) => rest)(fitExport(state.session, { ...saved, name: "" })) as unknown as Values); // (the file name is not asked as an answer to begin with: the dialog offers its own)
  if (!answers) return;
  const o = fitExport(state.session, answers as unknown as ExportOptions);
  if (o.format === "project") { const name = `${o.name || FILE_NAME.replace(/\.json$/, "")}.json`; webFiles.save(name, projectText()); say(`saved ${name}`); return; }
  webStore.set(EXPORT_KEY, JSON.stringify({ format: o.format, quality: o.quality, what: "all", perBody: o.perBody, joined: o.joined, schema: o.schema, iges: o.iges, name: "" }));
  say(`making the ${FLAT_OR_NOT(o.format)} file…`);
  const r = await exportWith(state.session, engine, o);
  if (!r.ok) return say(r.error);
  webFiles.saveBytes(r.name, r.bytes, r.mime);
  say(r.message);
}
/** Path repeat (`dec_path_repeat`, `in_843`): the figure and the lines of the path selected, a dialog for the rules (with a picture of where the copies stand), and the repeat made (or the rules of the one selected changed). */
async function pathRepeatFlow() {
  const t = pathRepeatTarget(state.session);
  if (!t.ok) return say(t.error);
  const target = t.value;
  const answers = await dialog.open((v) => pathRepeatDialog(state.session, target, v as unknown as ReturnType<typeof pathRepeatStart>), pathRepeatValuesFor(target) as unknown as Values);
  if (!answers) return;
  const c = pathRepeatCommand(state.session, target, answers as unknown as ReturnType<typeof pathRepeatStart>);
  if (!c.ok) return say(c.error);
  const next = run(state.session, c.value);
  if (next.message) return say(next.message);
  state = { ...state, session: next };
  dirty = true;
  say(target.edit || target.body?.step ? "path repeat changed" : "path repeat made");
}
/**
 * Fastener Holes in the model view (`dec_parts_tool`, `in_879` to `in_881`): the tool is a panel of settings that stands beside the view, the selection is the click (the face, and with Shift the corners, circles and lines that place the
 * holes), and what would be cut is drawn over the model as the settings change. Cut makes the holes (one undo) and the tool stays on; Close, or Esc, leaves it.
 */
let hardware: { values: ReceiverValues } | null = null;
let holesKey = "";
let holesNow: { bar: HolePanelView; view: ToolpathView | null } | null = null;
let holesPlan: ReceiverPlan | null = null; // (the holes the pointer can pick up and move, `in_965`)
let holesPicked: number | null = null; // (the number in the row of the hole last picked: Delete takes it out, `in_1013`)
let holesDrag: { index: number; row: number } | null = null; // (the hole picked up and the line it is meant to be on, `in_1012`)
let holesMovesFor = ""; // (the selection the moved holes belong to)
let lastHolesScene: ReturnType<typeof scene> | null = null;
const holeBar = createHolePanel(document.body, {
  change(v) {
    if (!hardware) return;
    const before = hardware.values as unknown as Record<string, unknown>;
    const rowKeys = ["by", "value", "ends", "corners", "offset", "shift", "rows", "rowCount", "rowGap"]; // (what makes the row: a hole moved by hand is kept only while it stays)
    const changed = rowKeys.some((k) => k in v && (v as unknown as Record<string, unknown>)[k] !== before[k]);
    hardware = { values: { ...hardware.values, ...v, ...(changed ? { moved: {}, removed: [] } : {}) } };
    if (changed) holesPicked = null;
    holesKey = ""; dirty = true;
  },
  commit() { holesCut(); },
  close() { holesClose(); },
  points() { holesPoints(); },
  moveBy(along, across) { // the hole picked moved by typed distances from where the rules put it (`in_1051`)
    if (!hardware || !holesPlan || holesPicked === null) return;
    const pos = holesPlan.index.indexOf(holesPicked);
    const [a, c] = [along.trim() === "" ? 0 : typedLength(along), across.trim() === "" ? 0 : typedLength(across)];
    if (pos < 0 || a === null || c === null) return;
    const t = movedTarget(holesPlan, pos, a, c);
    if (t) { hardware = { values: { ...hardware.values, moved: { ...(hardware.values.moved ?? {}), [holesPicked]: t } } }; holesKey = ""; dirty = true; }
  },
  putBack() {
    if (!hardware || holesPicked === null) return;
    const moved = { ...(hardware.values.moved ?? {}) };
    delete moved[holesPicked];
    hardware = { values: { ...hardware.values, moved } };
    holesKey = ""; dirty = true;
  },
});
function holesOpen(): void {
  if (hardware) return;
  hardware = { values: receiverStart() };
  holesKey = "";
  holesPlan = null; holesDrag = null;
  dirty = true;
}
function holesClose(): void { hardware = null; holesPlan = null; holesDrag = null; holesKey = ""; holesNow = null; holeBar.update(null); dirty = true; }
/** What the selection says for the holes: a line (or lines) selected: along them; a face: along its outline moved in by the inset; corners or circles picked: at them; nothing usable yet: say what to select. */
function holesValues(): { values: ReceiverValues; mode: HolePanelView["mode"] } {
  const ctx = receiverContext(state.session);
  const v = hardware!.values.kind === "tapped" || hardware!.values.kind === "nutPocket" || hardware!.values.kind === "drillTap" ? { ...hardware!.values, far: "none" } : hardware!.values; // (a nut on the far side goes with a hole right through)
  if (!ctx) return { values: v, mode: "none" };
  if (ctx.places) return { values: { ...v, place: "picked" }, mode: "picked" };
  if (ctx.lines) return { values: { ...v, place: "lines", corners: "ignore" }, mode: "line" }; // (a line has no corners to keep: its ends are its ends)
  // a face: the lines its edges give (`in_958`): the edges stepped in, or one edge stepped in (an edge selected with the face, else the longest), or that edge stepped in to the middle of the face
  const rows = v.rows === "edge" || v.rows === "midline" || v.rows === "outline" ? v.rows : ctx.edges ? "edge" : "auto";
  return { values: { ...v, place: rows, ...(v.by === "count" && v.corners === "inward" ? { corners: "each" } : {}) }, mode: "face" }; // (counting the holes with a hole at every corner: the corners are some of the count; working in from the corners needs a distance)
}
/** Points at the holes, selected with the face, so that the move tools can place them exactly (`in_980`). */
function holesPoints(): void {
  if (!hardware) return;
  const { values } = holesValues();
  const r = makeHolePoints(state.session, values);
  if (!r.ok) return say(r.error);
  state = { ...state, session: r.value };
  holesKey = "";
  dirty = true;
  say("points made at the holes: move them with the move tools, and the holes follow them");
}
/** The bubble of the distance the hole picked is moved by hand from where the rules put it, like the one on a diameter (`in_1075`): its number can be typed over, and the hole then stands that far from its origin in the way it was moved. */
function holeNotes(): Annotation[] {
  if (!hardware || !holesPlan || holesPicked === null) return [];
  const pos = holesPlan.index.indexOf(holesPicked);
  const [b, c] = [holesPlan.base[pos], holesPlan.spots[pos]?.centre];
  if (pos < 0 || !b || !c) return [];
  const d = Math.hypot(c[0] - b[0], c[1] - b[1], c[2] - b[2]);
  if (d < 1e-6) return [];
  return [{ id: "hole:moved", relationId: null, kind: "tape", label: "distance moved by hand", at: [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2, (b[2] + c[2]) / 2], value: d, unit: "mm", locked: false, editable: true, readOnly: false, broken: false, open: false, measureId: "hole:moved", tag: "moved", others: [], lines: [] }];
}
function holesSetDistance(d: number): void {
  if (!hardware || !holesPlan || holesPicked === null || !(d > 0)) return;
  const pos = holesPlan.index.indexOf(holesPicked);
  const [b, c] = [holesPlan.base[pos], holesPlan.spots[pos]?.centre];
  if (pos < 0 || !b || !c) return;
  const now = Math.hypot(c[0] - b[0], c[1] - b[1], c[2] - b[2]);
  if (now < 1e-9) return; // (not moved: no way to go in)
  const t: Vec3 = [b[0] + ((c[0] - b[0]) / now) * d, b[1] + ((c[1] - b[1]) / now) * d, b[2] + ((c[2] - b[2]) / now) * d];
  hardware = { values: { ...hardware.values, moved: { ...(hardware.values.moved ?? {}), [holesPicked]: t } } };
  holesKey = ""; dirty = true;
}
function holesCut(): void {
  if (!hardware) return;
  const { values } = holesValues();
  const places = placesPicked(state.session);
  const r = cutReceiver(state.session, values);
  if (!r.ok) return say(r.error);
  state = { ...state, session: r.value };
  holesKey = "";
  dirty = true;
  say(`cut: ${values.size} ${String(values.kind)}${places > 1 ? ` at ${places} places` : ""}`);
}
/** The bar and the preview for the selection and the numbers as they are, made again only when one of them changes. */
function holesOptions(): { bar: HolePanelView; view: ToolpathView | null } {
  const session = state.session;
  const sc = scene(session);
  const key = `${selection(session).join(",")}|${JSON.stringify(hardware?.values)}|${holesPicked}`;
  if (holesNow && key === holesKey && lastHolesScene === sc) return holesNow;
  const { values, mode } = holesValues();
  const sel = selection(session).join(",");
  if (hardware && holesMovesFor !== sel) { holesMovesFor = sel; holesPicked = null; if (Object.keys(hardware.values.moved ?? {}).length || (hardware.values.removed ?? []).length) hardware = { values: { ...hardware.values, moved: {}, removed: [] } }; } // (another selection: the holes moved by hand are let go)
  const plan = mode === "none" ? null : receiverPlan(session, { ...values, ...(hardware ? { moved: hardware.values.moved, removed: hardware.values.removed } : {}) });
  holesPlan = plan?.ok ? plan.value : null;
  const problem = mode !== "none" && plan && !plan.ok ? plan.error : null; // (nothing selected is not an error: it is said in the plain line below)
  const none = receiverContext(session)?.curved ? "Select a line drawn across the round face, or corners and circles on it, for the next holes." : "Select a flat face of a body (or a line drawn on one) for the next holes.";
  const note = mode === "none" ? none : plan?.ok ? `${plan.value.places.length} hole${plan.value.places.length === 1 ? "" : "s"}${plan.value.spacing !== null ? `, ${Math.round(plan.value.spacing * 100) / 100} mm apart` : ""}${plan.value.auto ? `. Automatic: ${plan.value.auto}` : plan.value.insetUsed !== undefined ? `. The inset is cut down to ${plan.value.insetUsed} mm: the face is too small for ${values.offset} mm` : ""}${plan.value.depthNote ? `. Depth: ${plan.value.depthNote}` : ""}${plan.value.insert?.screw ? `. Screw ${values.size} x ${plan.value.insert.screw.length} mm: ${plan.value.insert.screw.length > plan.value.insert.screw.room + 1e-9 ? "the shortest standard length that reaches through" : "the longest standard length that fits"} the ${plan.value.insert.screw.room} mm the hole has` : ""}` : "";
  const v = hardware!.values;
  let pickedInfo: HolePanelView["picked"];
  if (plan?.ok && holesPicked !== null) { // the hole picked up: how far it is moved from where the rules put it
    const pos = plan.value.index.indexOf(holesPicked);
    const mv = pos >= 0 ? movedBy(plan.value, pos) : null;
    if (mv) { const r2 = (x: number): string => String(Math.round(x * 100) / 100); pickedInfo = { number: holesPicked, along: r2(mv.along), across: r2(mv.across), moved: Math.hypot(mv.along, mv.across) > 1e-6 }; }
  }
  holesNow = {
    bar: { ...(pickedInfo ? { picked: pickedInfo } : {}), kinds: receiverKinds(), sizes: receiverSizes(), values: { kind: v.kind, size: v.size, by: v.by ?? "distance", value: v.value ?? "30", ends: v.ends ?? "fit", corners: v.corners ?? "each", offset: v.offset ?? "10", shift: v.shift ?? "0", depth: v.depth, far: v.far ?? "none", rows: v.rows ?? "auto", rowCount: v.rowCount ?? "1", rowGap: v.rowGap ?? "8", washer: v.washer ?? "none", drill: v.drill ?? "", insert: v.insert ?? "none", length: v.length ?? "" }, mode, round: !!receiverContext(session)?.curved, ...(plan?.ok ? { reach: { body: plan.value.reach, stack: plan.value.stack } } : {}), note, problem },
    view: plan?.ok ? holesView(plan.value, holesPicked !== null ? plan.value.index.indexOf(holesPicked) : -1) : null,
  };
  holesKey = key;
  lastHolesScene = sc;
  return holesNow;
}
// Enter cuts and Esc leaves while the bar is open (before the page's own keys: Esc would clear the selection)
window.addEventListener("keydown", (e) => {
  if (!hardware || dialog.isOpen) return;
  const typing = e.target instanceof HTMLInputElement && !holeBar.contains(e.target);
  if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); holesClose(); }
  else if (e.key === "Enter" && !typing) { e.preventDefault(); e.stopPropagation(); holesCut(); }
  else if ((e.key === "Delete" || e.key === "Backspace") && !typing && holesPicked !== null) { // the hole picked is taken out of the row (not a part of the model)
    e.preventDefault(); e.stopPropagation();
    hardware = { values: { ...hardware.values, removed: [...(hardware.values.removed ?? []), holesPicked] } };
    holesPicked = null; holesKey = ""; dirty = true;
  }
}, true);
/** What a body is made of (`in_565`): a dialog asks for the name, and the selected bodies are tagged with it (one step to undo). */
async function materialDialogFlow() {
  const why = whyNoMaterial(state.session);
  if (why) return say(why);
  const answers = await dialog.open((v) => materialDialog(state.session, v as unknown as { material: string }), materialStart(state.session) as unknown as Values);
  if (!answers) return;
  const c = materialCommand(state.session, String(answers.material ?? ""));
  if (!c.ok) return say(c.error);
  state = { ...state, session: run(state.session, c.value) };
  say(String(answers.material ?? "").trim() ? `material set: ${String(answers.material).trim()}` : "material tag taken off");
}
const LASER_KEY = "cad.laserOptions";
const LIB_KEY = "cad.library";
/** Laser cut (`in_569`, `in_571`, `dec_laser_outline_route`): which machine (the project's copy of the last one used, the user's own, or a new one), a dialog made from the route's own settings and started from the last plan for this drawing, the route run, the findings read before the file is saved; the project keeps a copy of the machine and the plan, the library keeps the machine. */
async function laserDialogFlow() {
  const part = flatSnapshot(state.session);
  if (!part.ok) return say(part.error);
  let lib = parseLibrary(webStore.get(LIB_KEY)).library;
  const sc = scene(state.session);
  const choices = machineChoices(sc, lib, part.value.id);
  let choice = choices[0]!;
  if (choices.length > 1) {
    const which = await dialog.open((v) => machineDialog(choices, v as unknown as { machine: string; remove: boolean }), { machine: choice.id, remove: false } as unknown as Values);
    if (!which) return;
    choice = choices.find((c) => c.id === which.machine) ?? choice;
    if (which.remove && choice.from === "library" && choice.machine) {
      lib = removeMachine(lib, choice.machine.id);
      webStore.set(LIB_KEY, libraryText(lib));
      return say(`${choice.machine.name} is out of your library (projects that used it keep their copy)`);
    }
  }
  let last: LaserValues = {};
  try { last = JSON.parse(webStore.get(LASER_KEY) ?? "{}"); } catch { /* not kept, or not readable: the usual */ }
  const rows = tableRows(lib.settings, choice.machine?.id ?? "");
  const layers = marksSummary(sc, part.value.id);
  const answers = await dialog.open((v) => laserDialog(v as LaserValues, rows, layers), startValues(sc, part.value.id, choice, last) as unknown as Values);
  if (!answers) return;
  webStore.set(LASER_KEY, JSON.stringify(answers));
  const r = runLaser(state.session, answers as LaserValues, [...lib.machines, ...projectMachines(sc)], lib.settings);
  if (!r.ok) return say(r.error);
  const { run: ran, file, summary, machine } = r.value;
  state = { ...state, session: run(state.session, { type: "batch", commands: recordCommands(r.value) }) }; // (the project keeps the machine's copy and the plan)
  if (answers.remember !== false) { const kept = saveMachine(lib, machine); if (kept.ok) { lib = kept.value; webStore.set(LIB_KEY, libraryText(lib)); } }
  const row = rowFrom(answers as LaserValues, machine, lib.settings); // (the person's own numbers, kept under a material and a thickness, `in_573`)
  if (!row.ok) say(row.error);
  else if (row.value) { const kept = saveSettings(lib, row.value); if (kept.ok) { lib = kept.value; webStore.set(LIB_KEY, libraryText(lib)); } }
  if (!file) return say("nothing was planned: " + (ran.findings[0]?.message ?? "no lines to cut"));
  if (ran.toolpath) { state = { ...state, preview: { toolpath: ran.toolpath, at: 1 } }; dirty = true; } // (the toolpath is shown over the drawing while the findings are read and after the file is saved, `in_570`)
  if (ran.findings.length || ran.warnings.length) {
    const go = await dialog.open(() => findingsDialog(ran.findings, summary), {});
    if (!go) return say("the file was not saved");
  }
  webFiles.saveBytes(file.name, file.bytes, file.mime);
  say(`laser file saved: ${summary}`);
}
/** Laser layers (`in_603`): what the selected lines are for in the laser route (cut, scored, engraved). It is the route's own mark, kept in the project's manufacturing section: the drawing does not change (`prin_manufacture_agnostic`). */
async function laserLayersFlow() {
  const why = whyNoLayers(state.session);
  if (why) return say(why);
  const a = await dialog.open((v) => layersDialog(state.session, v as unknown as { role: string }), { role: "score" } as unknown as Values);
  if (!a) return;
  const c = layersCommand(state.session, String(a.role));
  if (!c.ok) return say(c.error);
  state = { ...state, session: run(state.session, c.value) };
  say(a.role === "cut" ? "the selected lines are cut again (no mark)" : `the selected lines are ${a.role === "score" ? "scored" : "engraved"} in the laser route`);
}
/** The person's laser table (`in_573`): the rows of numbers they have kept, and a way to take one out. Rows are added from the laser dialog. */
async function laserTableFlow() {
  let lib = parseLibrary(webStore.get(LIB_KEY)).library;
  if (!lib.settings.length) return say("your table has no rows yet: keep one from the laser cut dialog (\"Save these numbers as material\")");
  const a = await dialog.open((v) => tableDialog(lib.settings, v as unknown as { row: string; remove: boolean }), { row: lib.settings[0]!.id, remove: false } as unknown as Values);
  if (!a || !a.remove) return;
  lib = removeSettings(lib, String(a.row));
  webStore.set(LIB_KEY, libraryText(lib));
  say("the row is out of your table");
}
// Dropping files on the page imports them, one after the other, each asking its own options (`dec_exchange_gaps`).
let dropping = false;
window.addEventListener("dragover", (e) => { if (e.dataTransfer?.types.includes("Files")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } });
window.addEventListener("drop", (e) => {
  const files = Array.from(e.dataTransfer?.files ?? []);
  if (!files.length) return;
  e.preventDefault();
  if (dropping) return say("a file is being imported: drop the next one when its dialog is done");
  dropping = true;
  void (async () => {
    try { for (const f of files) await importDialogFlow({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }); } finally { dropping = false; }
  })();
});
const FLAT_OR_NOT = (f: string): string => (f === "3mf" ? "3MF" : f.toUpperCase());
/** Import (`dec_import`, `dec_import_mesh`, `dec_import_export_menu`): choose a file, say how it is to come in (units, scale, where), and it is added as one step to undo. */
async function importDialogFlow(given?: { name: string; bytes: Uint8Array }) {
  const picked = given ?? (await webFiles.pick(IMPORT_KINDS));
  if (!picked) return;
  if (/\.json$/i.test(picked.name) || new TextDecoder().decode(picked.bytes.slice(0, 40)).includes("cad-project")) { // a project (what Export writes first): opened as it was, with the state it carries ignored (`in_1083`)
    const text = new TextDecoder().decode(picked.bytes);
    const r = await openProjectText(text);
    if (r.ok) { adopt(r.value); const a = aboutOf(text); say(a ? `opened a project saved by ${a.app}${a.build ? ` build ${a.build}` : ""} on ${a.saved.slice(0, 10)}` : "opened the project"); } else { openingGhosts = null; say(r.error); }
    return;
  }
  const name = await nameFor(picked.name, picked.bytes, KIND_OF); // (a file with no ending, or a wrong one, is read as what is in it, `dec_exchange_gaps`)
  if (!KIND_OF(name)) return say(`${picked.name} is not a file the app reads: it imports STEP (.step, .stp), IGES (.igs, .iges), BREP (.brep), FreeCAD (.FCStd), STL, 3MF, OBJ, SVG and DXF`);
  const answers = await dialog.open((v) => importDialog(name, v as unknown as ImportOptions), { ...IMPORT_DEFAULTS } as unknown as Values);
  if (!answers) return;
  say(`reading ${name}…`);
  const r = await importWith(state.session, name, picked.bytes, answers as unknown as ImportOptions);
  state = { ...state, session: r.ok ? { ...r.session, message: r.message } : { ...state.session, message: r.error } };
  dirty = true;
}
function dispatch(i: Intent, again = false) {
  if (!again) logIntent(i);
  if (i.type === "save") { void exportDialogFlow(); return; } // (Save and Open are Export and Import: every file going out or coming in, `in_1083`)
  if (i.type === "open") { void importDialogFlow(); return; }
  if (i.type === "menuTurn") { if (ring.open) ring.turn(i.dx, i.dy); dirty = true; return; }
  if (ring.open && recognizer.game) {
    if (i.type === "click") { if (!ring.pickSelected()) ring.hide(); dirty = true; return; }
    if (i.type === "menu" && !i.button) { ring.hide(); dirty = true; return; }
  }
  // the ⋯ button again closes its menu (`in_294`)
  if (i.type === "menu" && i.button && menu.open) { menu.hide(); dirty = true; return; }
  const tried = sections.attempt(() => reduce(state, i, env()));
  if (!tried.ok) { // a wheel whose sections are not worked out yet: they are worked out in a thread of their own and the same thing is done again (`in_899`)
    say("working out the wheel…");
    void tried.ready.then(() => dispatch({ ...i }, true));
    return;
  }
  state = tried.value;
  recognizer.setDrawing(!!state.tool, state.cam.straight); // (with a sketch tool in hand a click that wanders is still a click: up to the drag that would leave a straight view, `in_463`)
  if (i.type === "menu") {
    // the ⋯ button opens the settings and options; a right click or a long press opens the ring of operations round the pointer (`in_133`)
    // (the ⋯ list holds only what the ring does not: the app's own things; the operations are the ring's, a right click or a long press, `in_291`)
    if (i.button) { ring.hide(); menuAt = [i.x, i.y]; menu.show(i.x, i.y, [], appRows(typeof __BUILD__ === "string" ? __BUILD__ : "", { clearAnswers: !!resultStore, undo: state.session.history.cursor > 0, redo: state.session.history.cursor < state.session.history.commands.length })); }
    else {
      menu.hide();
      if (state.menu && inGame()) { // game mode: the ring stands in the world, ahead of the eye, where it was opened (`in_463`, `in_471`)
        const pg = host.getBoundingClientRect();
        const eye = position(state.cam);
        const fwd = basis(state.cam).forward;
        ringAnchor = [0, 1, 2].map((k) => eye[k]! + fwd[k]! * state.cam.distance * 0.6) as unknown as Vec3;
        ring.show(pg.left + pg.width / 2, pg.top + pg.height / 2, state.menu.items, true);
      } // game mode: the ring stands at the middle and the view is fixed (`in_467`)
      else if (state.menu) ring.show(i.x, i.y, state.menu.items); else ring.hide();

    } // (no menu: a right click that applied the mover's orient mode, `in_439`)
  } else {
    // pointing around does not close a menu; any other intent does
    if (menu.open && !["hover", "hoverEnd", "runAction"].includes(i.type)) menu.hide();
    if (ring.open && !recognizer.game && !["hover", "hoverEnd", "runAction"].includes(i.type)) ring.hide(); // (in game mode keys and the view do not close it, `in_441`, `in_467`)
  }
  dirty = true;
}
// which kind of device was used last: a laptop can have a mouse and a touch screen, so it is the event itself that says, not the machine (`in_160`)
let lastDevice: "mouse" | "touch" | "pen" = "mouse";
/** A hole of the fastener tool's preview picked up with the pointer and moved over the surface (`in_965`); true when the pointer's event was for it and the view is not to have it. */
function holesPointer(raw: { kind: string; x?: number; y?: number; mods?: { alt: boolean } }): boolean {
  if (!hardware || !holesPlan || dialog.isOpen) return false;
  const [x, y] = [raw.x ?? 0, raw.y ?? 0];
  const pj = projector(state.cam, view.size().w, view.size().h);
  if (raw.kind === "down") {
    const i = pickPlace(holesPlan, pj.project, x, y);
    if (i < 0) return false;
    holesDrag = { index: i, row: rowOf(holesPlan, i) };
    holesPicked = holesPlan.index[i] ?? null;
    holesKey = ""; dirty = true;
    return true;
  }
  if (holesDrag === null) return false;
  if (raw.kind === "move") {
    const mmPerPx = (pj.halfH * 2) / Math.max(1, view.size().h);
    const base = holesPlan.base[holesDrag.index];
    const snap = !raw.mods?.alt ? { row: holesDrag.row, mm: holesDrag.row >= 0 ? 22 * mmPerPx : -1, ...(base ? { origin: base, originMm: 14 * mmPerPx } : {}) } : undefined; // (drawn to its line within 22 px, and back to where the rules put it within 14; Alt holds it free)
    const t = dragTarget(holesPlan, holesDrag.index, pj.ray(x, y), snap);
    if (t) { hardware = { values: { ...hardware.values, moved: { ...(hardware.values.moved ?? {}), [holesPlan.index[holesDrag.index] ?? holesDrag.index]: t } } }; holesKey = ""; dirty = true; }
    return true;
  }
  if (raw.kind === "up" || raw.kind === "cancel") { holesDrag = null; return true; }
  return false;
}
bus.on("input", (raw) => {
  if ("device" in raw && raw.device !== lastDevice) { lastDevice = raw.device; dirty = true; }
  if ((raw.kind === "down" || raw.kind === "move" || raw.kind === "up" || raw.kind === "cancel") && holesPointer(raw)) return; // (a previewed hole moved by hand is not a click or a drag of the view)
  const escRing = raw.kind === "key" && raw.key === "Escape" && raw.down && ring.open;
  for (const i of recognizer.feed(raw)) dispatch(i);
  // Esc ends the ring too: in game mode the key leaves the game and sends no intent of its own, so the ring would stay up (`in_542`)
  if (escRing && ring.open) { ring.hide(); dispatch({ type: "escape" }); }
});
const input = attachInput(host, bus);

/** The kernel's answers are kept between sessions in a built app, or with `?cache=1` while developing (the stamp of the kernel is found when the app is built: a change made after the dev server started would not be seen, `dec_description_cache`). `?cache=0` turns it off. */
let resultStore: ReturnType<typeof openResultStore<KernelResult>> = null;
const resultStoreOn = (): boolean => { const q = new URLSearchParams(location.search).get("cache"); return q === "1" || (q !== "0" && !import.meta.env.DEV); };

async function boot() {
  notices.say("loading the geometry kernel…");
  // the kernel works on its own thread so a heavy model does not freeze the page; if that cannot start, it runs here instead
  try {
    const worked = createAsyncKernel(() => {
      const before = state.session.history.cursor;
      const session = refresh(state.session);
      // the answer for the last step was an error and it was taken back: what was being worked on is over
      const c = session.conflict;
      state = { ...afterTakenBack({ ...state, session }, before), ...(c && c !== state.session.conflict ? { flash: { ...c, at: performance.now() } } : {}) }; // (a step taken back with its reason: what is the problem flashes red, `in_266`)
      dirty = true;
    }, undefined, { store: (resultStore = resultStoreOn() ? openResultStore<KernelResult>(typeof __KERNEL__ === "string" ? __KERNEL__ : "unstamped") : null) });
    await worked.init();
    engine = worked;
  } catch {
    const web = await import("./compiler/kernel/web.ts"); // (the kernel in this page: not in the app's own code, which does not need it when the thread starts)
    await web.initKernelWeb();
    engine = web.kernel;
  }
  notices.say("");
  let session = createSession(engine);
  if (new URLSearchParams(location.search).get("demo") === "box") {
    const r = drawRectangle(scene(session), "w/XY" as Ref, [-20, -10, 0], [20, 10, 0], [1, 0, 0], [0, 1, 0]);
    session = run(session, r.command);
    session = run(session, { type: "addStep", step: { id: nextId(scene(session), "s"), type: "extrude", parts: r.lines, params: { depth: 20 } } });
  }
  state = createState(session);
  { const kept = autosave.previous(); if (kept) say(`a copy of your last session was kept (${kept.steps} steps, ${Math.max(1, Math.round((Date.now() - kept.savedAt) / 60000))} min ago): ⋯ then Restore session`); } // (`in_997`)
  // a hook for scripted checks in a browser (not used by the app)
  (window as unknown as { __cad: unknown }).__cad = {
    get state() { return state; },
    get lastFrame() { return lastFrame; }, // (what the app itself drew last, so a script need not work a frame out again)
    settings,
    size: () => view.size(),
    project: (p: [number, number, number]) => projector(state.cam, view.size().w, view.size().h).project(p),
    candidatesAt: (x: number, y: number) => candidatesAt(scene(state.session), projector(state.cam, view.size().w, view.size().h).view(x, y), { pointTol: settings.pick.pointPx, lineTol: settings.pick.linePx }),
    frame: () => frameOf(state, view.size()),
    get opening() { return openingGhosts?.length ?? 0; },
    openText: async (text: string) => { const r = await openProjectText(text); if (r.ok) adopt(r.value); else openingGhosts = null; return r.ok ? true : r.error; }, // (for scripted checks: as the open button does it)
    load: (text: string) => { const r = openSession(engine, text); if (r.ok) adopt(r.value); return r.ok ? true : r.error },
    snapshot: () => snapshotOf(state, { intents: intentLog, viewport: { w: view.size().w, h: view.size().h, dpr: window.devicePixelRatio }, device: lastDevice, userAgent: navigator.userAgent, build: "", scrollMode: recognizer.scrollMode, timing: timing.summary(), at: new Date().toISOString(), pointer }),
    select: (refs: string[]) => { state = { ...state, session: { ...state.session, click: { ...state.session.click, selection: refs as never } } }; dirty = true; }, // (for scripted checks)
    flash: (victims: string[]) => { state = { ...state, flash: { victims, culprits: [], at: performance.now() } as never }; dirty = true; }, // (a refused change's flash, for scripted checks)
    dispatch, run: (c: Command): void => { const tried = sections.attempt(() => run(state.session, c)); if (tried.ok) { state = { ...state, session: tried.value }; dirty = true; } else { void tried.ready.then(() => (window as unknown as { __cad: { run(c: Command): void } }).__cad.run(c)); } }, // (for scripted checks: a wheel's sections come from their own thread, as for a person's own command)
  };
  requestAnimationFrame(frame);
}
addEventListener("pagehide", () => autosave.flush());
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") autosave.flush(); });
let keptHistory: unknown = null;
const ahead = createAhead(() => new Worker(new URL("./contact-worker.ts", import.meta.url), { type: "module" })); // (the push worked out ahead of the picture, `in_1096`)
let lastPlayFrame = 0;
const PLAY_FRAME_MS = 26; // (a motion that plays is drawn about 38 times a second, not as fast as the screen refreshes: the play is by the clock, so it is as quick, and the processor and the graphics card work a third less)
function frame(now: number) {
  if (state.motion) { const held = motionHolds(scene(state.session), state.motion); if (held !== state.motion) { state = { ...state, motion: held }; dirty = true; } } // (what it moves was deleted or undone: the motion stops and its bar goes, `in_1129`)
  if (state.motion?.playing && now - lastPlayFrame < PLAY_FRAME_MS) { requestAnimationFrame(frame); return; }
  if (state.motion?.playing) lastPlayFrame = now;
  const tStart = performance.now();
  engine.eye = [...position(state.cam)] as [number, number, number]; // (the kernel makes a model of many parts apart nearest the eye first, `dec_progressive_open`)
  if (state.session.history !== keptHistory) { keptHistory = state.session.history; const h = state.session.history; autosave.remember(() => saveText(state.session), h.commands.length, (why) => say(why)); } // (a moment after the last change, `in_997`)
  if (drawnAt !== null) { timing.add("browser: from a drawn frame to the next one (commit, the graphics card, the screen's refresh)", tStart - drawnAt); drawnAt = null; }
  if (state.anim || state.flash || state.mixT0 !== null) { state = advance(state, now); dirty = true; }
  if (state.motion && !state.motion.playing && state.motion.contact?.target != null) { state = { ...state, motion: solveContact(scene(state.session), { ...state.motion, amount: state.motion.contact.target }, state.session.outcome) }; dirty = true; } // (a scrub the time ran out on goes on to where it was asked, a part each frame)
  if (state.motion?.playing) { // (a joint that is being played: the clock moves it on, and the picture is made again every frame, `dec_mechanism_motion`)
    // the push is worked out ahead in a thread of its own; the play never goes past the places it has sent back (it goes slower, evenly, when it comes to them), and works its own steps out when there is no thread (`contactahead.ts`)
    const [sc, oc] = [scene(state.session), state.session.outcome];
    let mo = tickMotion(state.motion, now);
    if (mo.contact) { ahead.ensure(sc, oc, state.motion); const reach = ahead.extent(sc, oc, state.motion); if (reach !== null && mo.amount > reach) mo = { ...mo, amount: reach, from: reach, startedAt: null }; }
    state = { ...state, motion: solveContact(sc, mo, oc) }; dirty = true;
  } else if (!state.motion?.playing) ahead.stop(); // (paused or closed: the thread has nothing to work ahead for, and stops using the processor)
  const spreading = state.spread && now - state.spread.startMs < settings.orb.fillMs + 50;
  if (dirty || spreading || state.flash) {
    const size = view.size();
    const tFrame = performance.now();
    // while a size is dragged, what is drawn is the kernel's own result for every size, newest request winning: rough and with no faces or edges, the fine and whole one comes when the pointer is let go (`in_358`, `in_362`)
    const dragging = !!state.drag && !!state.op;
    engine.draft = dragging;
    engine.lite = dragging;
    const f = frameOf(state, size, now);
    lastFrame = f;
    engine.draft = false;
    engine.lite = false;
    const tMade = performance.now();
    const page = host.getBoundingClientRect();
    const buildsBefore = buildStats.runs;
    view.setScene(f.scene, f.mesh);
    view.setHiddenBodies(f.hiddenBodies);
    view.setThin(f.thin);
    view.setClash(f.clash);
    view.setCutGhosts(f.cutGhosts);
    const standShown = staleSince !== null && performance.now() - staleSince >= STANDIN_MS; // (the discs for gear bodies the kernel has not made: after a short wait, `dec_gear_standin`)
    view.setStandIns(openingGhosts ?? f.standIns, standShown || !!openingGhosts || f.standIns.some((d) => d.box)); // (the parts of a model made in pieces are drawn at once: there is nothing to wait for, `dec_progressive_open`)
    const pageAt = projector(state.cam, size.w, size.h).project;
    const onPageAt = (p: Vec3): [number, number] | null => { const q = pageAt(p); return q && q[0] > -50 && q[1] > -50 && q[0] < size.w + 50 && q[1] < size.h + 50 ? [q[0] + page.left, q[1] + page.top] : null; };
    const waitSecs = staleSince === null ? 0 : Math.floor((performance.now() - staleSince) / 1000);
    const shownSecs = standLabels.update(f.standIns.filter((d) => !d.box).map((d) => onPageAt([d.centre[0] + d.normal[0] * d.depth / 2, d.centre[1] + d.normal[1] * d.depth / 2, d.centre[2] + d.normal[2] * d.depth / 2])), waitSecs, standShown); // (the label on each disc, and its seconds, `in_847`)
    if (shownSecs !== null && shownSecs !== lastStandSecs) { lastStandSecs = shownSecs; dirty = true; }
    if (buildStats.runs !== buildsBefore) { timing.add("geometry: built again (buildContent)", buildStats.totalMs); timing.add("geometry: of it the sharp edges (cornerEdges)", buildStats.cornersMs); timing.add("geometry: triangles built", buildStats.triangles); }
    view.setBodyMatrix(f.bodyMatrix, f.selectionMoves, f.bodySplit, f.followers.map((q) => ({ matrix: q.matrix, only: q.split })), f.selectionMatrix);
    view.setHiddenEdges(f.hiddenEdges);
    view.setBehindPlane(f.behindPlane);
    view.setHighlight(f.highlight, state.cam, now);
    view.setPreview(f.preview, state.cam);
    view.setGizmo(f.gizmo, state.cam);
    panesFading = view.setPanes(f.panes);
    view.setBodyFade(f.fadeBody);
    view.setWireframe(f.wireframe);
    view.setSectionPlanes(f.sectionPlanes);
    view.setSection(f.sections);
    view.setUnclipped(f.unclipped);
    view.setWorldHidden(f.worldHidden);
    { const pg = host.getBoundingClientRect(); const pr = projector(state.cam, size.w, size.h); hardMarks.update(f.hardMarks, (q) => { const c = pr.project(q); return c && c[0] > -10 && c[1] > -10 && c[0] < size.w + 10 && c[1] < size.h + 10 ? [c[0] + pg.left, c[1] + pg.top] : null; }); }
    { const pg = host.getBoundingClientRect(); const c = projector(state.cam, size.w, size.h).project([0, 0, 0]); worldOrb.update(c && c[0] > -20 && c[1] > -20 && c[0] < size.w + 20 && c[1] < size.h + 20 ? [c[0] + pg.left, c[1] + pg.top] : null, f.worldHidden, view.originHidden(state.cam)); }
    { const pg = host.getBoundingClientRect(); const pr = projector(state.cam, size.w, size.h); sheetChips.update(f.sectionPlanes.filter((p) => !p.guide && p.hidden && !p.selected).map((p) => ({ ref: p.ref, mode: p.mode, hidden: p.hidden, move: p.move, selected: p.selected, corners: p.corners })), (q) => { const c = pr.project(q); return c ? [c[0] + pg.left, c[1] + pg.top] : null; }, pointer ? [pointer.x + pg.left, pointer.y + pg.top] : null); }
    const pgE = host.getBoundingClientRect(), prE = projector(state.cam, size.w, size.h);
    const eyeOver = hiddenBodyUnder(f.bodyEyes, (q) => { const c = prE.project(q); return c ? [c[0] + pgE.left, c[1] + pgE.top] : null; }, pointer ? [pointer.x + pgE.left, pointer.y + pgE.top] : null); // (a hidden body the pointer is over: its eye is in the bar, `in_1177`)
    toolChip.update(f.tool, f.confirm, lastDevice === "touch", f.options, f.undoRedo, f.sketching, f.sketchCut, f.keepNormal);
    { const pg = host.getBoundingClientRect(); const pj = projector(state.cam, size.w, size.h).project; cutParts.update(f.cut ? f.cut.parts.map((p) => { const q = pj(p.at); return { ...p, at: [q[0] + pg.left, q[1] + pg.top] as [number, number] }; }) : null); }
    { const h = hardware ? holesOptions() : null; holeBar.update(h ? h.bar : null); view.setToolpath(h && h.view ? h.view : f.toolpath, state.cam); } // (the holes the panel would cut are drawn over the model, `dec_parts_tool`)
    previewBar.update(f.previewBar);
    motionBar.update(f.motionBar);
    addChip.update(f.adding);
    resetView.update(f.resetView);
    // game mode and the straight (orthographic) view, in and out, cleanly (`in_467`, `in_469`, `in_471`): going in while a straight view is on or on its way puts it away smoothly (the animation is given up
    // properly, so no half-made view is left); a view that becomes straight or goes on its way to it while in game mode ends the game mode
    if (recognizer.game && !wasGame) {
      if (state.anim?.to.straight) state = stopView(state);
      if (state.cam.straight) state = { ...state, cam: { ...state.cam, straight: false, mix: 0.03 }, mixT0: -1, mixBase: 0.03, orthoDebt: 0 };
    } else if (recognizer.game && (state.cam.straight || state.anim?.to.straight)) input.toggleGame();
    wasGame = recognizer.game;
    recognizer.setMenu(ring.open && recognizer.game); // (a menu open in game mode fixes the view against the mouse and the keys: the mouse turns the selection round it, `in_467`)
    // a ring opened in game mode stands where it was opened, in the world; the view tilts, just enough, to bring the lit option under the crosshair, and comes back when the menu goes (`in_471`)
    {
      const pg = host.getBoundingClientRect();
      let want: [number, number] = [0, 0]; // (the tilt that is wanted, in swivel units)
      if (ringAnchor && !ring.open) ringAnchor = null;
      if (ringAnchor) {
        const eye = position(state.cam);
        const fwd = basis(state.cam).forward;
        const ahead = [0, 1, 2].reduce((t, k) => t + (ringAnchor![k]! - eye[k]!) * fwd[k]!, 0);
        const p = ahead > 0.05 ? projector(state.cam, size.w, size.h).project(ringAnchor) : null;
        if (!p || p[0] < 0 || p[1] < 0 || p[0] > size.w || p[1] > size.h) { ring.hide(); ringAnchor = null; }
        else {
          ring.moveTo(pg.left + p[0], pg.top + p[1]);
          // the view follows the mouse smoothly (the crosshair goes where the mouse's stick points, in no steps); which option is lit is decided from the same stick, in steps, and a click chooses it (`in_518`)
          const stick = ring.stickOffset();
          if (stick) {
            const focal = size.h / 2 / Math.tan((settings.view.fovDeg * Math.PI) / 360); // (pixels from the eye to the picture, so a number of pixels is an angle)
            const k = focal * settings.view.orbitRadPerPx;
            want = [tilt[0] + (pg.left + p[0] + stick[0] - (pg.left + pg.width / 2)) / k, tilt[1] + (pg.top + p[1] + stick[1] - (pg.top + pg.height / 2)) / k];
          } else want = tilt;
        }
      }
      if (!ringAnchor) want = [0, 0]; // (the ring is gone: the view comes back)
      const d: [number, number] = [(want[0] - tilt[0]) * 0.25, (want[1] - tilt[1]) * 0.25];
      if (Math.abs(d[0]) > 0.02 || Math.abs(d[1]) > 0.02) { state = reduce(state, { type: "swivel", dx: d[0], dy: d[1] }, env()); tilt = [tilt[0] + d[0], tilt[1] + d[1]]; dirty = true; }
      else if (!ringAnchor && (tilt[0] !== 0 || tilt[1] !== 0)) tilt = [0, 0];
    }
    { const pg = host.getBoundingClientRect(); crosshair.update(recognizer.game && document.pointerLockElement !== null, { x: pg.left + pg.width / 2, y: pg.top + pg.height / 2 }); }
    toolCursor.update(f.tool ? f.tool.kind : null);
    const project = projector(state.cam, size.w, size.h).project;
    // what comes before the constraint bubbles: the ring, and the number bubbles (and the helper bubble, the suggestions and the hint icons), as they stood on the last frame
    const inFront = [ring.rect(), ...chips.map((c) => c.rect()), notices.helpRect(), hintIcons.rect(), ...touchRects].flatMap((r) => (r ? [[r.left, r.top, r.right, r.bottom] as [number, number, number, number]] : []));
    if (bubbles.update([...f.annotations, ...holeNotes()], (p) => { const q = project(p); return [q[0] + page.left, q[1] + page.top]; }, f.flash, f.avoid, inFront)) dirty = true; // (a bubble still sliding to its place: another frame)
    view.setNotes(f.annotations.flatMap((a) => a.lines), f.annotations.flatMap((a) => a.dashed ?? []), state.cam.distance * 0.012);
    { // the Measure tab with two overlapping bodies selected asks the kernel for the volume they share, once; the answer is drawn when it comes (`dec_measure_report`, `in_622`)
      const sc = scene(state.session);
      const two = selection(state.session).filter((r) => sc.parts[r]?.kind === "body");
      if (state.panel === "measure" && two.length === 2 && !state.session.outcome.kernel?.stale && clearanceBetween(sc, two[0]!, two[1]!)?.kind === "overlap") requestOverlap(engine, sc, two[0]!, two[1]!, () => { dirty = true; });
    }
    panel.update(f.panel);
    const onPage = (p: Vec3 | null | undefined): [number, number] | null => { if (!p) return null; const q = project(p); return [q[0] + page.left, q[1] + page.top]; };
    // the icon stands at the upper left of the handles, out of the way of the arrows and rings (`in_215`)
    const corner = f.modeSwitch ? f.modeSwitch.pts.map((p) => onPage(p)!).reduce<[number, number]>((c, q) => [Math.min(c[0], q[0]), Math.min(c[1], q[1])], [Infinity, Infinity]) : null;
    suggest.update(eyeOver ? { icons: [...(f.bar?.icons ?? []), { id: `body:eye:${eyeOver.ref}`, icon: "eyeOff", title: "Hidden: show this body" }], gear: f.bar?.gear ?? null } : f.bar, f.suggest ? f.suggest.items : null, f.suggest ? onPage(f.suggest.at) : f.bar?.at ? ((q) => (q ? [q[0], q[1] - 112] as [number, number] : null))(onPage(f.bar.at)) : eyeOver ? [eyeOver.at[0], eyeOver.at[1] - 88] : null, [ring.rect(), ...chips.map((c) => c.rect()), notices.helpRect(), ...touchRects, ...bubbles.rects()].flatMap((r) => (r ? [[r.left, r.top, r.right, r.bottom] as [number, number, number, number]] : [])), pointer ? [pointer.x + pgE.left - 90, pointer.y + pgE.top - 60, pointer.x + pgE.left + 90, pointer.y + pgE.top + 70] as [number, number, number, number] : null); // (the bar opens clear of where the pointer is, not under the click; once it is open it stays, so it can be hovered and clicked, `in_1345`)
    gearBox.update(f.entry?.panel ? f.entry : null);
    const valueBubbles = (f.entries.length ? f.entries : f.entry ? [f.entry] : []).filter((e) => !e.panel);
    valueBubbles.forEach((e, i) => chipAt(i).update(e.fields, e.unit || "mm", onPage(e.at), onPage(e.from), !!state.tool && lastDevice !== "touch", lastDevice === "touch", !!e.constraint, e.opacity ?? 1)); // (a mouse draws through the bubble: a finger can tap into it to type a size, `in_289`)
    for (let i = valueBubbles.length; i < chips.length; i++) chips[i]!.update(null, "mm", null);
    modeSwitch.update(f.modeSwitch, corner && Number.isFinite(corner[0]) ? corner : null, chips.flatMap((c) => c.rect() ?? [])); // (after the bubbles: it keeps off them, `in_231`)
    const working = notices.update(f.notices, { onPage, bubble: (id) => bubbles.rectOf(id), touch: lastDevice === "touch", now });
    controls.hint(f.lookHint);
    controls.menuOpen(menu.open);
    controls.facing(f.facing);
    hintIcons.update(f.hint?.kinds ?? [], onPage(f.hint?.at));
    // a finger has no hover and cannot drag small arrows: each point of a figure being drawn (the ones set, and the next one, held) has a drag icon, joined to it by a dotted line, and so has an arrow or ring that was tapped; a tap anywhere else sets the point held, or applies (`in_283`..`in_288`)
    const th = lastDevice === "touch" ? f.touchHelper : null;
    const clampTo = (q: [number, number]): [number, number] => [Math.max(30, Math.min(size.w - 30, q[0])), Math.max(30, Math.min(size.h - 30, q[1]))];
    const anchors = th ? th.points.map((p) => ({ index: p.index, anchor: project(p.at) as [number, number] })) : [];
    const icons = anchors.map((a, k) => {
      if (th!.kind === "handle") {
        if (state.drag && "handle" in state.drag && lastIcon) return { ...a, icon: lastIcon }; // (the icon stays where the finger took it while an arrow is being dragged)
        const below = clampTo([a.anchor[0], a.anchor[1] + 76]);
        return { ...a, icon: below[1] - a.anchor[1] < 40 ? clampTo([a.anchor[0], a.anchor[1] - 76]) : below }; // (below the arrow, or above it where there is no room)
      }
      // a point of a figure: the icon stands on the side away from the other points, so the icons do not cover each other or the figure
      const others = anchors.filter((_, j) => j !== k);
      const [cx, cy] = others.length ? [others.reduce((t, o) => t + o.anchor[0], 0) / others.length, others.reduce((t, o) => t + o.anchor[1], 0) / others.length] : [a.anchor[0] - 1, a.anchor[1] - 1];
      const [dx, dy] = [a.anchor[0] - cx, a.anchor[1] - cy];
      const len = Math.hypot(dx, dy) || 1;
      return { ...a, icon: clampTo([a.anchor[0] + (dx / len) * 66, a.anchor[1] + (dy / len) * 66]) };
    });
    lastIcon = th?.kind === "handle" && icons[0] ? icons[0].icon : null;
    recognizer.setTouchHelper(th ? { kind: th.kind, icons: icons.map((c) => ({ anchor: c.anchor, icon: c.icon, index: c.index })), closes: th.kind === "handle" && th.applies, handles: th.handles.map((p) => p.map((q) => { const r = project(q); return [r[0], r[1]] as [number, number]; })) } : null);
    const rects = icons.map((c) => new DOMRect(c.icon[0] + page.left - 26, c.icon[1] + page.top - 26, 52, 52));
    const touchMoved = JSON.stringify(rects) !== JSON.stringify(touchRects); // (the bubbles and suggestions are laid out again round them next frame)
    touchRects = rects;
    touchHandle.update(icons.map((c) => ({ icon: [c.icon[0] + page.left, c.icon[1] + page.top] as [number, number], target: [c.anchor[0] + page.left, c.anchor[1] + page.top] as [number, number], vertex: th?.kind === "figure" })));
    boxView.update(f.box, page.left, page.top);
    host.style.cursor = f.cursor;
    const tBuilt = performance.now();
    view.render(state.cam, f.grid);
    const tEnd = performance.now();
    timing.add("frame: work out (frameOf)", tMade - tFrame);
    timing.add("frame: build what is drawn", tBuilt - tMade);
    timing.add("frame: draw (render)", tEnd - tBuilt);
    timing.add("frame: all", tEnd - tFrame);
    drawnAt = tEnd;
    const waiting = !!state.session.outcome.kernel?.stale;
    if (waiting && staleSince === null) staleSince = tFrame;
    else if (!waiting && staleSince !== null) { timing.add("edit: waiting for the kernel until its answer is drawn", tEnd - staleSince); staleSince = null; }
    if (state.building && !waiting) { dispatch({ type: "buildNext" }); dirty = true; } // (a model made a part at a time: the part that was made is drawn, now the next, `dec_gear_models`)
    controls.update(window.innerWidth, window.innerHeight, settings.buttons.marginPx, settings.buttons.sizePx);
    dirty = panesFading || !!f.flash || !!f.gizmo?.pulse || f.entries.some((e) => e.opacity !== undefined && e.opacity < 1) || working || !!f.highlight.temp?.length || touchMoved || (f.standIns.length > 0 && !standShown); // keep drawing while a refused change flashes, the "working" sign turns, or the copies of a repeat pulse
  }
  requestAnimationFrame(frame);
}
window.addEventListener("resize", () => { view.resize(); dirty = true; });
void boot();
