// The controller: it turns what the page and the browser report (intents, keys, time) into calls on the world view's pure functions (view.ts),
// keeps the state they return, and tells the drawing and the page what to show.
// Everything about how the view behaves is in view.ts; what is here is the wiring, and the few things only the browser can do (the pointer
// lock, the ring that marks game mode). On top of the world and camera: the right-click ring, one sketch plane placed anywhere, and the mover orb on it.
import { createBadge } from "./badgedraw.ts";
import { createBodyMove } from "./bodymovecontrol.ts";
import { createAutoHandles } from "./autohandles.ts";
import { createBodyOps } from "./bodyops.ts";
import type { Mark } from "./bodyselect.ts";
import { createBodySelect } from "./bodyselect.ts";
import { forward, project, type Axis } from "./camera.ts";
import * as dev from "./dev.ts";
import { flushPull, planesOf, type PlaneRef } from "./engine/flush.ts";
import type { SketchParams } from "./engine/sketch.ts";
import type { Step } from "./engine/steps.ts";
import { faceAxes } from "./engine/vec.ts";
import { chooseFile, download, fromBase64 } from "./filesdraw.ts";
import { createGame } from "./game.ts";
import { createInfoBar } from "./infobardraw.ts";
import { attach } from "./input.ts";
import { DocError, fromFile, toFile } from "./interaction/files.ts";
import { moreItems } from "./interaction/moremenu.ts";
import { createNotices } from "./interaction/notices.ts";
import { extrudeOp, type Source } from "./interaction/operations.ts";
import { editNumber, rowsOf } from "./interaction/steplist.ts";
import { GROUPS, TOOLS } from "./interaction/toolspec.ts";
import { Undo } from "./interaction/undo.ts";
import { SEE_THROUGH } from "./looks.ts";
import { createMarkDraw } from "./markdraw.ts";
import { createMenu, type MenuItem } from "./menu.ts";
import { createMoreMenu } from "./moremenu.ts";
import { createNoticeStack } from "./notifydraw.ts";
import { createOperations } from "./operationcontrol.ts";
import { createOrbControl } from "./orbcontrol.ts";
import { facingCamera, vOf, worldFrame, type Frame } from "./planes.ts";
import { createSelection } from "./selection.ts";
import { focusOf, gridLevel, gridLevelAt } from "./sense.ts";
import { to3, type ToolKind } from "./sketch.ts";
import { createSketch } from "./sketchcontrol.ts";
import { createStepList } from "./steplistdraw.ts";
import { createStudio } from "./studio.ts";
import { createToolControl } from "./toolcontrol.ts";
import { createUi } from "./ui.ts";
import { add, dot, scale, sub, unit } from "./vec.ts";
import * as view from "./view.ts";
import { bodyThings, lookedAt, withMoved, type Scene } from "./scene.ts";
import type { BodyPick, RegionPick } from "./selection.ts";
import { createWorld } from "./world.ts";

const params = new URLSearchParams(location.search);
dev.tuneFromAddress(params);
const model = dev.sceneFromAddress(params);
const canvas = document.getElementById("view") as HTMLCanvasElement;
const ring = document.getElementById("ring")!;
const world = createWorld(canvas, model);
const game = createGame();

let s = view.initial(model);
let pointer: view.Pointer | null = null;
/** what the camera looks at: the stand-in things and a box for each body the engine made, made again only when the engine's bodies change (`scene.ts`) */
let looked: { standIns: readonly unknown[]; bodies: readonly unknown[]; scene: Scene } | null = null;
const cameraScene = (): Scene => {
  const bodies = studio.state().meshes;
  if (!looked || looked.standIns !== model.things || looked.bodies !== bodies)
    looked = { standIns: model.things, bodies, scene: lookedAt(model, bodyThings(bodies)) };
  return withMoved(looked.scene, bmove.preview()); // (a body shown moved by the orb's draft is looked at where it is shown)
};
const env = (now = performance.now()): view.Env => ({
  model: cameraScene(),
  w: canvas.clientWidth || innerWidth,
  h: canvas.clientHeight || innerHeight,
  now,
  gameOn: game.on,
});

function endGame() {
  game.end();
  if (document.pointerLockElement) document.exitPointerLock();
  ring.style.display = "none";
}
/** Game mode on: the view is made fully perspective first if it is not, and the pointer is held at the middle of the view. */
function startGame() {
  s = view.startGame(s, env());
  game.start();
  Promise.resolve(canvas.requestPointerLock?.()).catch(lockRefused); // (newer browsers answer with a promise that fails; older ones fire `pointerlockerror`)
}
/** The browser would not hold the pointer (a second request right after Esc, say): game mode is given up, not left on with a mouse that does nothing. */
function lockRefused() {
  if (game.on) endGame();
}
document.addEventListener("pointerlockerror", lockRefused);
function reset() {
  if (game.on) endGame();
  s = view.reset(s, env());
}

// ---- the sketch plane: the world's X, Y, Z planes, or one placed anywhere; the view turns straight to it, and the orb moves and turns the placed one ----
let placed: Frame | null = null,
  placedKey: string | null = null; // (`placedKey`: the plane lies on a face of a body: its key in `facePlanes`; it is not moved by the orb)
function lookAt(axis: Axis) {
  if (game.on) endGame();
  placed = null;
  placedKey = null;
  s = view.lookAt(s, env(), axis);
}
function addSketchPlane() {
  if (game.on) endGame();
  const e = env();
  placed = facingCamera(s.c, focusOf(cameraScene(), s.c, e.w, e.h));
  placedKey = null;
  orbc.forget("sketch");
  s = view.lookAlong(s, e, scale(placed.normal, -1)); // (a sketch is drawn looking straight at its plane, orthographic)
}
const planeNow = () =>
  placed ? { key: placedKey ?? "placed", frame: placed } : { key: `world:${s.plane}`, frame: worldFrame(s.plane) };
const orbc = createOrbControl({
  // the orb's subject: the body being moved (a task's draft), else the sketch plane placed (out of the way while a drawing tool is on)
  target: () => bmove.target() ?? (placed && !placedKey && !sk.active() ? { id: "sketch", frame: placed } : null),
  set: (_id, f) => {
    if (bmove.on()) bmove.set(f);
    else placed = { origin: f.origin, normal: f.normal, u: f.u };
  },
  copy: () => null,
  view: () => {
    const e = env();
    return { cam: s.c, w: e.w, h: e.h };
  },
});

// ---- sketching: a tool is chosen from the ring and draws on the plane that is on, which the view is first turned straight to ----
// every sentence the page says goes through the notices (`dec_three_surfaces`): temporary ones report what happened, persistent ones belong to something going on
const notices = createNotices(),
  noticeStack = createNoticeStack(document.body),
  notify = notices.notify;
const selection = createSelection(); // (the page's one selection: parts of a sketch, or what is picked on a body)
const sk = createSketch(
  {
    selection,
    notify,
    startEdit: (id, initial) => markdraw.startEdit(id, initial) || infobar.startEdit(id, initial),
    editing: () => markdraw.editing() || infobar.editing(),
    view: () => {
      const e = env();
      return { cam: s.c, w: e.w, h: e.h };
    },
    planes: () => {
      const all = new Map<string, Frame>([0, 1, 2].map((a) => [`world:${a}`, worldFrame(a as Axis)] as const));
      for (const [k, v] of facePlanes) all.set(k, v.frame);
      if (placed && !placedKey) all.set("placed", placed);
      return {
        all,
        on: planeNow().key,
        step: placed
          ? gridLevelAt(s.c, Math.abs(dot(sub(s.c.eye, placed.origin), placed.normal))).step
          : gridLevel(s.c, s.plane).step,
      };
    },
    ray: (x, y) => view.rayAt(s, env(), x, y),
  },
  (label, merge) => record(label, merge),
);

/** the planes that lie on a face of a body, by the key the sketch controller keeps their drawings under */
const facePlanes = new Map<string, { frame: Frame; source: Source }>();
/** what a sketch on a face is made from, as long as the body it was drawn on is still in the recipe: when the body is gone the sketch is a free drawing, as `dec_sketch_on_face_follows_body` says (an extrude of it must not name a step that is not there) */
/** what a file holds is what there is: no drawing with nothing in it, no plane on a face that nothing is drawn on (unless it is the one being drawn on) */
const documentNow = (): string => {
  const drawings = Object.fromEntries(Object.entries(sk.snapshot()).filter(([, v]) => v.points.length)),
    faces = Object.fromEntries([...facePlanes].filter(([k]) => drawings[k] || k === placedKey));
  return toFile({ steps: studio.state().steps, drawings, faces: faces as never });
};
const liveSource = (key: string): Source | null => {
  const f = facePlanes.get(key);
  return f && studio.state().steps.some((x) => x.id === f.source.body) ? f.source : null;
};
// ---- the engine's worker (the recipe and the bodies it makes) and the Extrude tool ----
const studio = createStudio();
let shown: readonly unknown[] = [];
studio.subscribe(() => {
  const m = studio.state().meshes;
  if (m !== shown) {
    shown = m;
    world.setBodies(m);
    bodies.reset();
  }
});
/** the extrude of a closed figure of a drawing: what the Extrude tool opens when the figure is clicked, and what a figure picked opens by itself (`autohandles.ts`) */
const extrudeOfRegion = (r: NonNullable<ReturnType<typeof sk.regionAt>>) => {
  const base = to3(r.frame, r.region.centre),
    snap = (d: number, reach: number) => {
      const f = flushPull({ p: base, n: r.frame.normal }, scenePlanes(), d, reach);
      return f && { d: f.d, tie: f.to.face };
    };
  return extrudeOp({ ...r, source: liveSource(r.key), snap });
};
const ext = createOperations({
  view: () => {
    const e = env();
    return { cam: s.c, w: e.w, h: e.h };
  },
  pick: (x, y) => {
    const r = sk.regionAt(x, y);
    return r ? extrudeOfRegion(r) : null;
  },
  recipe: () => studio.state().steps,
  change: (steps) => {
    studio.change(steps);
    record("Extrude");
    selection.clear(); // (the figure was picked to be made: it is a body now)
  },
  ask: (a) => studio.ask(a),
  say: (t) => say(t),
  tilt: (f, c, size) => {
    const e = env(),
      v = vOf(f),
      n = f.normal,
      el = 0.9;
    s = view.lookObliqueAt(
      s,
      e,
      c,
      unit(add(scale(unit(add(scale(f.u, 0.4), scale(v, 0.8))), Math.cos(el)), scale(n, -Math.sin(el)))),
      Math.max(70, size * 3.2),
    );
  },
});
// ---- what is picked on the bodies (a face or edges), and what can be done with it ----
const bodies = createBodySelect({
  view: () => {
    const e = env();
    return { cam: s.c, w: e.w, h: e.h };
  },
  meshes: () => studio.state().meshes,
  press: (id) =>
    tools.arm(
      (
        {
          "body:sketch": "sketch-face",
          "body:pull": "pull",
          "body:round": "round",
          "body:chamfer": "chamfer",
        } as Record<string, string>
      )[id] ?? id,
    ),
  selection,
});
// ---- the helper bar: the page has one, and it says what the sketch's selection or the body's pick offers (`in_1576`) ----
const badge = createBadge(document.body); // (the tool that is armed, following the pointer)
const markdraw = createMarkDraw(document.body); // (the constraints and numbers standing on the parts of a sketch: `dec_marks_on_things`)
const infobar = createInfoBar(document.body); // (the one bar: what is so of the subject, and what could be added)
/** the engine's facts about a face of the body: where it faces (out of the body) */
const faceFacts = (body: string, id: string) =>
  studio
    .state()
    .snapshot.find((x) => x.id === body)
    ?.faces.find((f) => f.id === id) ?? null;
/** the face a pull is flush with, lit orange while it is (`operationcontrol.ts` `tie`) */
const tieMarks = (): Mark[] => {
  const id = ext.tie();
  if (!id) return [];
  for (const m of studio.state().meshes) {
    const f = m.faces.find((x) => x.id === id);
    if (f) return [{ body: m.id, faces: [{ start: f.start, count: f.count }], edges: [], strength: "tie" }];
  }
  return [];
};
/** the flat faces of the scene, as planes: what a pull can be flush with (`engine/flush.ts`) */
const scenePlanes = (): PlaneRef[] => {
  const last = [...studio.state().snapshot].reverse().find((x) => x.output === "body");
  return last ? planesOf(last.faces) : [];
};
const bodyOps = createBodyOps({ studio, faceFacts, planes: scenePlanes });
const bmove = createBodyMove({
  meshes: () => studio.state().meshes,
  bodies: () => studio.state().snapshot.at(-1)?.bodies.length ?? 0,
  recipe: () => studio.state().steps,
  change: (steps) => {
    studio.change(steps);
    record("Move");
  },
  say: (t) => notify(t, { kind: "warn", ttl: 4000 }),
  forget: (id) => orbc.forget(id),
});
/** what a pick shows by itself: a face its pull arrow, edges their round arrow, a whole body the mover orb (`autohandles.ts`) */
const auto = createAutoHandles({
  pick: () => {
    const p = selection.get();
    return p && p.kind !== "sketch" ? p : null;
  },
  busy: () => sk.active() || tools.armed() !== null || ext.active() || bmove.on(),
  operation: (action, pick) => {
    if (action !== "region:extrude") return bodyOps.operationFor(action, pick as BodyPick);
    const p = pick as RegionPick,
      r = sk.regionIn(p.key, p.at);
    return Promise.resolve(r ? extrudeOfRegion(r) : null);
  },
  show: (op) => ext.open(op, true),
  drop: () => ext.drop(),
  draft: {
    on: () => ext.draft(),
    apply: () => {
      if (ext.valid()) ext.apply();
      else ext.cancel();
    },
    cancel: () => ext.cancel(),
  },
  mover: {
    bodies: () => studio.state().snapshot.at(-1)?.bodies.length ?? 0,
    start: (body) => bmove.start(body),
    on: () => bmove.on(),
    moved: () => bmove.moved(),
    commit: () => bmove.commit(),
    cancel: () => bmove.cancel(),
  },
});
/** a sketch on a face: the plane is the face's (the engine's own frame of it), the view turns straight to it */
function sketchOnFace(sel: import("./bodyselect.ts").Selection) {
  const f = sel.faces[0];
  if (!f) return;
  const ff = faceFacts(sel.body, f.id);
  if (!ff) return;
  const n = ff.ne as [number, number, number],
    fr: Frame = {
      origin: ff.ce as [number, number, number],
      normal: n,
      u: [...faceAxes(n).u] as [number, number, number],
    },
    key = `face:${f.id}`;
  facePlanes.set(key, { frame: fr, source: { face: f.ref, body: sel.body } });
  placed = fr;
  placedKey = key;
  selection.clear();
  s = view.lookAlong(s, env(), scale(n, -1));
  record("Plane on a face");
}
// ---- undo and redo of the drawings and the recipe together, and the step list with its numbers ----
interface App {
  sketches: Record<string, SketchParams>;
  steps: readonly Step[];
  faces: ReadonlyMap<string, { frame: Frame; source: Source }>;
}
const undo = new Undo<App>({ sketches: {}, steps: [], faces: new Map() });
function record(label: string, merge?: string) {
  undo.do({ sketches: sk.snapshot(), steps: studio.state().steps, faces: new Map(facePlanes) }, label, merge);
}
function restore(a: App | null) {
  if (!a) return;
  ext.cancel();
  bmove.cancel();
  selection.clear();
  facePlanes.clear();
  for (const [k, v] of a.faces) facePlanes.set(k, v);
  if (placedKey && !facePlanes.has(placedKey)) {
    placed = null;
    placedKey = null;
  }
  sk.restore(a.sketches);
  if (a.steps !== studio.state().steps) studio.change([...a.steps]);
}
const list = createStepList(document.body, {
  edit(id, key, value) {
    const next = editNumber(studio.state().steps, id, key, value);
    if (next) {
      studio.change(next);
      record("Number", `s:${id}:${key}`);
    }
  },
});
// ---- the "..." menu: new, open, save, export ----
const say = (text: string, ms = 5000) => {
  notify(text, { ttl: ms });
};
let historyOpen = false;
const hasBody = () => studio.state().meshes.length > 0,
  hasModel = () => studio.state().steps.length > 0 || sk.hasDrawing();
async function chooseMore(id: import("./interaction/moremenu.ts").MoreItem["id"]) {
  if (game.on) endGame();
  if (id === "history") {
    historyOpen = !historyOpen;
    return;
  }
  if (id === "new") {
    ext.cancel();
    restore({ sketches: {}, steps: [], faces: new Map() });
    record("New");
    say("A new model; undo brings the last one back");
  } else if (id === "save") {
    const text = documentNow();
    download("model.cad", text, "application/json");
    say("Saved as model.cad");
  } else if (id === "open") {
    const f = await chooseFile();
    if (!f) return;
    try {
      const { model, warnings } = fromFile(f.text);
      restore({ sketches: model.drawings, steps: model.steps, faces: new Map(Object.entries(model.faces) as never) });
      record("Open");
      say(warnings.length ? `Opened ${f.name}. ${warnings.join("; ")}` : `Opened ${f.name}`);
    } catch (x) {
      notify(
        x instanceof DocError ? `${f.name}: ${x.message}` : `${f.name} could not be opened: ${(x as Error).message}`,
        { kind: "error", ttl: 8000 },
      );
    }
  } else {
    const step = studio.state().meshes[0]?.id;
    if (!step) {
      say("There is no body yet: extrude something first");
      return;
    }
    const format = id === "export:step" ? "step" : "stl",
      r = await studio.ask({ what: "export", step, format });
    if (!r.ok) {
      notify(`The export did not work: ${r.why}`, { kind: "error", ttl: 8000 });
      return;
    }
    const d = r.data as { base64: string; bytes: number };
    download(`model.${format}`, fromBase64(d.base64), "application/octet-stream");
    say(`Exported model.${format} (${Math.round((d.bytes / 1024) * 10) / 10} kB)`);
  }
}
const more = createMoreMenu(document.body, (id) => {
  void chooseMore(id);
});
function startTool(kind: ToolKind) {
  ext.cancel();
  if (game.on) endGame();
  const f = planeNow().frame,
    straight = s.c.ortho !== null && !s.go && Math.abs(dot(forward(s.c), f.normal)) > 0.9999;
  if (!straight)
    s = placed
      ? view.lookAlong(s, env(), scale(f.normal, dot(sub(s.c.eye, f.origin), f.normal) >= 0 ? -1 : 1))
      : view.lookAt(s, env(), s.plane);
  sk.start(kind);
}

// ---- the tools, run the one way: the ring's items are the registry (`interaction/toolspec.ts`), a click arms one, a right click finishes it (`toolcontrol.ts`) ----
const tools = createToolControl({
  notify,
  selection,
  draw: (kind) => startTool(kind as ToolKind),
  drawStep: () => sk.drawStep(),
  drawStop: () => sk.stop(),
  extrude: {
    start: () => {
      while (sk.stop()) {
        /* the sketch tool is put away */
      }
      sk.dismissOffers();
      selection.clear();
      ext.start();
    },
    active: () => ext.active(),
    open: () => ext.pulling(),
    valid: () => ext.valid(),
    apply: () => ext.apply(),
    cancel: () => ext.cancel(),
    words: () => ext.words(),
    show: (op) => {
      while (sk.stop()) {
        /* the sketch tool is put away */
      }
      sk.dismissOffers();
      ext.open(op);
    },
  },
  mover: {
    start: (body) => bmove.start(body),
    on: () => bmove.on(),
    commit: () => bmove.commit(),
    cancel: () => bmove.cancel(),
  },
  plane: addSketchPlane,
  sketchFace: sketchOnFace,
  bodyOp: (action, pick) => bodyOps.operationFor(action, pick),
  selectedKinds: () => sk.selectedKinds(),
  relate: (rel) => sk.constrain(rel),
  orient: {
    on: () => orbc.orienting(),
    keep: () => {
      orbc.keep();
      return true;
    },
    cancel: () => orbc.cancel(),
  },
  endGame: () => {
    if (game.on) endGame();
  },
});
/** how every body is drawn: solid, or as a wireframe (the See-through look, `dec_body_look_and_feel`); the View section of the circle menu turns it */
let wireframe = false;
const menu = createMenu(document.body, (id) => {
  if (id.startsWith("tool:")) tools.arm(id.slice(5));
  else if (id === "view:wireframe") {
    wireframe = !wireframe;
    notify(wireframe ? "Wireframe view" : "Solid view", { ttl: 1500 });
  }
});
/** every tool, always shown and always chosen: by group, and the words in a tooltip (`dec_three_surfaces`) */
const menuItems = (): MenuItem[] => [
  ...GROUPS.map((g) => ({
    id: `group:${g.id}`,
    label: g.label,
    icon: g.icon,
    children: TOOLS.filter((t) => t.group === g.id).map((t) => ({ id: `tool:${t.id}`, label: t.label, icon: t.icon })),
  })),
  {
    id: "group:view",
    label: "View",
    icon: "eye",
    children: [{ id: "view:wireframe", label: wireframe ? "Solid" : "Wireframe", icon: "wireframe" }],
  },
];

const ui = createUi(document.body, {
  look: lookAt,
  reset,
  toggleWorld: () => {
    s = view.toggleWorld(s);
  },
});

attach(
  canvas,
  {
    dragStart: (x, y) => {
      s = view.startDrag(s, env(), x, y);
    },
    orbit: (dx, dy) => {
      s = view.orbit(s, env(), dx, dy);
    },
    pan: (dx, dy) => {
      s = view.pan(s, env(), dx, dy);
    },
    zoom: (factor, x, y) => {
      s = view.zoom(s, env(), factor, x, y);
    },
    gesture: (dx, dy, factor, x, y) => {
      s = view.gesture(s, env(), dx, dy, factor, x, y);
    },
    dragEnd: () => {
      s = view.endDrag(s);
    },
    hover: (x, y) => {
      pointer = { x, y };
      if (!game.on && !sk.active() && !ext.active()) {
        // a closed figure of a drawing under the pointer comes before a body behind it; parts of the drawing before either
        if (sk.hoverRegion(x, y)) bodies.leave();
        else bodies.hover(x, y);
      }
    },
    leave: () => {
      pointer = null;
      bodies.leave();
      sk.leaveRegion();
    },
    click: (x, y, count) => {
      pointer = { x, y };
      if (menu.isOpen()) {
        menu.close();
        return;
      }
      if (ext.click(x, y)) return;
      if (sk.click(x, y, count, shiftHeld || tools.additive())) return;
      if (!sk.active() && bodies.click(x, y, shiftHeld || tools.additive(), count)) return; // (a tool is on: a click is a point of its figure)
      const next = view.click(s, env(), x, y); // (a pane of a world plane: it is the sketch plane now)
      if (next !== s) {
        placed = null;
        placedKey = null;
        s = next;
      }
    },
    grab: (x, y, shift) => {
      if (game.on) return false;
      if (ext.grab(x, y)) return true;
      if (ext.active()) return false;
      return orbc.grab(x, y, shift) || sk.grab(x, y, shift || tools.additive());
    },
    grabMove: (x, y) => {
      ext.grabMove(x, y);
      orbc.grabMove(x, y);
      sk.grabMove(x, y);
    },
    grabEnd: () => {
      ext.grabEnd();
      orbc.grabEnd();
      sk.grabEnd();
    },
    menu: (x, y) => {
      pointer = { x, y };
      if (auto.finish() || tools.finish()) return;
      menu.open(x, y, menuItems());
    }, // (a right click finishes what is armed or open: what is valid is kept, the rest thrown away, the tool put away; with none, it opens the ring)
    look: (dx, dy) => game.look(dx, dy),
    space: () => {
      if (game.on) endGame();
      else startGame();
    },
  },
  () => document.pointerLockElement === canvas,
);

let shiftHeld = false;
addEventListener("keydown", (e) => {
  shiftHeld = e.shiftKey;
});
addEventListener("keyup", (e) => {
  shiftHeld = e.shiftKey;
});
addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.code === "KeyZ" || e.code === "KeyY")) {
    e.preventDefault();
    restore(e.code === "KeyY" || e.shiftKey ? undo.redo() : undo.undo());
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (ext.key(e.code)) {
    e.preventDefault();
    return;
  }
  if (sk.key(e.code)) {
    e.preventDefault();
    return;
  } // (Delete, and D with something selected, are the sketch's before they are the game's)
  if (game.moves(e.code) && !game.on && !e.repeat) startGame(); // (W A S D turn the game on too, and the key that did it moves the eye)
  if (game.key(e.code, true)) return;
  if (orbc.orienting() && e.code === "Enter") {
    orbc.keep();
    return;
  }
  if (e.code === "Escape") {
    if (more.isOpen()) {
      more.close();
      return;
    }
    if (tools.cancel() || auto.cancel()) return;
    if (menu.isOpen()) menu.close();
    else if (game.on) endGame();
    else if (!selection.clear()) orbc.release();
  }
});
addEventListener("keyup", (e) => {
  game.key(e.code, false);
});
document.addEventListener("pointerlockchange", () => {
  if (document.pointerLockElement !== canvas && game.on) endGame();
});

/** the notices that belong to the state of the page, not to an event: the engine's problem, and "Making..." while it takes a moment */
let problem = { text: "", handle: null as ReturnType<typeof notify> | null },
  busySince = 0,
  making: ReturnType<typeof notify> | null = null;
function syncNotices(now: number) {
  const st = studio.state();
  if ((st.problem || "") !== problem.text) {
    problem.handle?.clear();
    problem = {
      text: st.problem || "",
      handle: st.problem ? notify(st.problem, { kind: "error", persistent: true }) : null,
    };
  }
  if (st.busy) {
    if (!busySince) busySince = now;
    if (!making && now - busySince > 300) making = notify("Making…", { persistent: true });
  } else {
    busySince = 0;
    making?.clear();
    making = null;
  }
}
let last = performance.now();
function frame(now: number) {
  auto.update();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  s = view.advance(s, env(now), dt);
  const g = game.tick(dt);
  if (game.on && view.flightReady(s)) s = view.fly(s, env(now), dt, g);
  ring.style.display = game.on ? "block" : "none";
  const e = env(now),
    d = view.drawing(s, e, pointer),
    orb = orbc.drawing(game.on ? null : pointer);
  canvas.style.cursor = orb?.hover ? "grab" : "";
  const regions = sk.litRegions(),
    bodyOrbs = bodies.orbs();
  world.render({
    ...d,
    ...(placed
      ? {
          grid: gridLevelAt(s.c, Math.abs(dot(sub(s.c.eye, placed.origin), placed.normal))),
          sketch: { origin: placed.origin, u: placed.u, v: vOf(placed), n: placed.normal },
        }
      : {}),
    orb: ext.drawing(game.on ? null : pointer) ?? orb,
    ghost: ext.ghost(),
    moved: bmove.preview(),
    marks: [...bodies.marks(), ...tieMarks()],
    regions: regions.lit,
    faceOrb: game.on
      ? undefined
      : { hover: regions.orb.hover ?? bodyOrbs.hover, spread: regions.orb.spread ?? bodyOrbs.spread },
    fills: sk.fills(),
    lines: sk.lines(game.on ? null : pointer),
    ...(wireframe || sk.active()
      ? {
          looks: Object.fromEntries(
            [...model.things.map((t) => t.id), ...(wireframe ? studio.state().meshes.map((m) => m.id) : [])].map(
              (id) => [id, SEE_THROUGH],
            ),
          ),
        }
      : {}),
    cut: placed && !placedKey ? { origin: placed.origin, n: placed.normal } : null, // (made once with the plane, from the side the camera looked from; it turns and moves with the plane, and does not change with the camera)
  });
  badge.show(tools.armed()?.icon ?? null, game.on ? null : pointer);
  {
    const sub = game.on ? null : (ext.subject() ?? bodies.subject(sk.active() || ext.active())),
      e = env();
    infobar.show(sub?.info ?? null, sub?.at ?? null, sub?.on ?? null, e.w, e.h);
    markdraw.show(game.on ? [] : sk.marks(now), sk.handlers);
  }
  {
    const st = studio.state();
    list.show({ rows: historyOpen ? rowsOf(st.steps, st.snapshot) : [] });
  }
  more.show(moreItems({ hasModel: hasModel(), hasBody: hasBody(), history: historyOpen }));
  sk.frame(now);
  tools.update(now);
  syncNotices(now);
  noticeStack.show(notices.visible(now));
  ui.update(view.pageState(s, e));
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

Object.assign(window, {
  __sketch: sk,
  __ext: ext,
  __studio: studio,
  __startExtrude: () => tools.arm("extrude"),
  __bodies: bodies,
  __selection: selection,
  __more: chooseMore,
  __record: record,
  __undo: undo,
  __restore: restore,
  __proj3: (p: [number, number, number]) => {
    const e = env(),
      q = project(s.c, p, e.w, e.h);
    return [q.x, q.y];
  },
  __tool: (k: string) => tools.arm(k),
  __tools: tools,
  __facePlanes: () => [...facePlanes.entries()].map(([k, v]) => [k, v.source.body]),
  __doc: documentNow,
  __orb: () => orbc.drawing(null),
  __bmove: bmove,
  __px: (p: [number, number]) => {
    const e = env(),
      q = project(s.c, to3(planeNow().frame, p), e.w, e.h);
    return [q.x, q.y];
  },
}); // (for the dev checks in a page)
dev.install({
  planes: () => ({ sketch: placed, drawn: sk.debug(), ...orbc.debug() }),
  model,
  rebuild: world.rebuild,
  state: () => s,
  put: (next) => {
    s = next;
  },
  pointer: () => pointer,
  game,
  gizmoScale: () => view.gizmoScale(s),
});
