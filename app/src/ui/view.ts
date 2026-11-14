// The three.js view (`dec_clean_engine_design` section 8): it reads the scene, the selection and the camera, and draws. It never changes them.
// The pieces are in `view/`: `content` (the scene), `highlight` (ring, teal, amber), `pen` (thick lines and shapes); the world dressing is `world.ts`.
import * as THREE from "three";
import { studio } from "./view/studio.ts";
import type { Scene, Vec3 } from "../interaction/api.ts";
import { settings } from "../interaction/api.ts";
import type { Camera } from "../interaction/camera.ts";
import { basis, position, projector, mixOf, eyeDistance, ORTHO_MIX } from "../interaction/camera.ts";
import type { Grid } from "../interaction/api.ts";
import { createWorld } from "./world.ts";
import { createPen, clearGroup, ringOf, sphereAt } from "./view/pen.ts";
import { buildContent } from "./view/content.ts";
import type { BodyMesh, Shift, SharpShape, ArcShape } from "./view/content.ts";
import { buildHighlight, TEAL } from "./view/highlight.ts";
import { buildGizmo } from "./view/gizmo.ts";
import type { GizmoView } from "./view/gizmo.ts";
import type { Highlight } from "./view/highlight.ts";

/** Put the matrix on `obj` that stretches everything k times across an axis through `c` (along it nothing changes, whichever way it points): 1 + (k - 1)(1 - a aT), about `c`. One copy for the walls and the roundings (`in_282`). */
function stretchAcross(obj: THREE.Object3D, c: readonly number[], axis: readonly number[], k: number): void {
  const U = new THREE.Vector3(axis[0]!, axis[1]!, axis[2]!).normalize();
  const lin = new THREE.Matrix4().set(
    1 + (k - 1) * (1 - U.x * U.x), -(k - 1) * U.x * U.y, -(k - 1) * U.x * U.z, 0,
    -(k - 1) * U.x * U.y, 1 + (k - 1) * (1 - U.y * U.y), -(k - 1) * U.y * U.z, 0,
    -(k - 1) * U.x * U.z, -(k - 1) * U.y * U.z, 1 + (k - 1) * (1 - U.z * U.z), 0,
    0, 0, 0, 1);
  obj.matrix.makeTranslation(c[0]!, c[1]!, c[2]!).multiply(lin).multiply(new THREE.Matrix4().makeTranslation(-c[0]!, -c[1]!, -c[2]!));
  obj.matrixWorldNeedsUpdate = true;
}

export type { Highlight };
type Preview = { segments: [Vec3, Vec3][]; circle: { center: Vec3; radius: number; normal: Vec3 } | null; cursor: Vec3 | null };

export function createView(host: HTMLElement) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(settings.theme.background);
  host.appendChild(renderer.domElement);
  const scene3 = new THREE.Scene();
  const persp = new THREE.PerspectiveCamera(settings.view.fovDeg, 1, 0.1, 10000);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10000);
  // lights ride with the camera (to one side and above it), so the sheen moves as you orbit
  scene3.add(new THREE.AmbientLight(0xffffff, settings.light.ambient * Math.PI));
  const key = new THREE.DirectionalLight(0xffffff, settings.light.key);
  const fill = new THREE.DirectionalLight(0xffffff, settings.light.fill);
  scene3.add(key, key.target, fill);

  const content = new THREE.Group();
  const overlay = new THREE.Group();
  const marks = new THREE.Group(); // (the middle dots of circles and arcs: never moved by the matrix of a body being dragged)
  const preview = new THREE.Group();
  const gizmo = new THREE.Group();
  const notes = new THREE.Group();
  scene3.add(content, overlay, marks, preview, gizmo, notes);
  const world = createWorld(scene3, host);
  const pen = createPen();
  const envMap = new THREE.PMREMGenerator(renderer).fromScene(studio(), 0.04).texture; // a soft studio, only reflected in the body
  let lastScene: Scene | null = null;
  let lastMesh: BodyMesh | null = null;
  let size = { w: 1, h: 1 };

  /** Rebuild what is drawn from the scene (called when the scene changes). */
  function setScene(s: Scene, mesh: BodyMesh | null) {
    if (s === lastScene) return;
    lastScene = s;
    lastMesh = mesh;
    const built = buildContent(content, s, mesh, pen, envMap);
    bodyMat = built ? built.material : null;
    bodyGroup = built ? built.body : null;
    shifter = built ? built.shift : null;
    splitter = built ? built.split : null;
    moverGroup = built ? built.mover : null;
    splitNow = null;
    shiftedFace = null;
    faceKeys = null;
    wallSig = "";
    roundSig = null;
    roundGroups = null;
    if (bodyGroup) { bodyGroup.matrix.fromArray(bodyMatrix ?? IDENTITY); bodyGroup.matrixWorldNeedsUpdate = true; }
    if (moverGroup) moverGroup.matrix.fromArray(IDENTITY);
    applyFade();
  }
  let bodyMat: import("three").MeshPhysicalMaterial | null = null;
  let bodyGroup: import("three").Group | null = null;
  let bodyMatrix: number[] | null = null;
  let shifter: ((keys: Set<string> | null, how: Shift) => void) | null = null;
  let splitter: ((tris: [number, number][] | null, box: { min: readonly number[]; max: readonly number[] } | null) => void) | null = null;
  let moverGroup: import("three").Group | null = null;
  let splitNow: { tris: [number, number][]; box: { min: readonly number[]; max: readonly number[] } } | null = null;
  let shiftedFace: string | null = null;
  let faceKeys: Set<string> | null = null;
  let roundSig: string | null = null;
  let roundGroups: { keys: Set<string>; sharp: SharpShape }[] | null = null;
  const IDENTITY = new Array<number>(16).fill(0).map((_, i) => (i % 5 === 0 ? 1 : 0));
  overlay.matrixAutoUpdate = false;
  /** The body (and, when what is selected is the body, its highlight) drawn moved by a matrix: a body being dragged is not worked out again by the kernel for every move of the pointer (`in_216`). */
  /** A face of the body pulled or pushed along its normal, drawn at once (`in_217`): the points that lie where the face's do move by `by`, and what is selected (the face) with them. */
  function setFaceShift(f: { face: string; by?: [number, number, number]; radial?: { center: readonly number[]; axis: readonly number[]; dr: number; r0: number }; rounds?: { k: number; groups: { face: string; sharp: SharpShape }[] }; arcs?: { arcWall: ArcShape; items: { at: readonly number[]; by: readonly number[] }[] }; columns?: { axis: readonly number[]; items: { at: readonly number[]; by: readonly number[] }[]; arcWalls: { face: string; arc: ArcShape }[]; edge: { a: readonly number[]; da: readonly number[]; b: readonly number[]; db: readonly number[] } | null }; withOverlay: boolean } | null) {
    if (!shifter) return;
    if (!f) { overlay.visible = true; if (shiftedFace !== null) { shifter(null, { by: [0, 0, 0] }); shiftedFace = null; } return; }
    overlay.visible = true;
    const p = lastScene?.parts[f.face as never] as { mesh?: readonly number[] } | undefined;
    if (!p?.mesh) return;
    if (shiftedFace !== f.face || !faceKeys) { faceKeys = new Set<string>(); for (let i = 0; i + 2 < p.mesh.length; i += 3) faceKeys.add(`${Math.round(p.mesh[i]! * 1e3)},${Math.round(p.mesh[i + 1]! * 1e3)},${Math.round(p.mesh[i + 2]! * 1e3)}`); }
    let how: Shift | null = f.by ? { by: f.by } : f.arcs ? { arcWall: f.arcs.arcWall, items: f.arcs.items } : f.radial ?? (f.columns ? { axis: f.columns.axis, items: f.columns.items, arcWalls: columnWalls(f.columns.arcWalls) } : null);
    if (f.rounds) {
      // each rounding face with its sharp edge (found once for the faces, not on every move)
      const sig = f.rounds.groups.map((g) => g.face).join("|");
      if (roundSig !== sig || !roundGroups) {
        roundSig = sig;
        roundGroups = f.rounds.groups.map((g) => {
          const q = lastScene?.parts[g.face as never] as { mesh?: readonly number[] } | undefined;
          const keys = new Set<string>();
          for (let i = 0; q?.mesh && i + 2 < q.mesh.length; i += 3) keys.add(`${Math.round(q.mesh[i]! * 1e3)},${Math.round(q.mesh[i + 1]! * 1e3)},${Math.round(q.mesh[i + 2]! * 1e3)}`);
          return { keys, sharp: g.sharp };
        });
      }
      how = { k: f.rounds.k, groups: roundGroups };
    }
    if (!how) return;
    shifter(faceKeys, how);
    shiftedFace = f.face;
    if (f.withOverlay && f.arcs) overlay.visible = false; // (a wall changing its span is not one matrix: what is selected is not drawn while it is dragged)
    if (f.withOverlay && f.radial) {
      // what is selected (the wall) widens with it: a stretch across the axis, about the axis
      const { center: c, axis: a, dr, r0 } = f.radial;
      const k = (r0 + dr) / r0;
      stretchAcross(overlay, c, a, k);
    }
    const mine = f.rounds?.groups.find((g) => g.face === f.face)?.sharp;
    if (f.withOverlay && f.rounds && (mine?.kind === "circle" || mine?.kind === "point" || (mine?.kind === "line" && (mine.cornerA || mine.cornerB)))) overlay.visible = false; // (a stretch about a circle is not one matrix: what is selected is not drawn while it is dragged)
    if (f.withOverlay && f.rounds && mine?.kind === "line" && !mine.cornerA && !mine.cornerB) {
      // what is selected (the rounding) is scaled the same way: across the sharp edge, about it
      const { point: c, dir: u } = mine;
      const k = f.rounds.k;
      stretchAcross(overlay, c, u, k);
    }
    if (f.withOverlay && f.columns?.edge) {
      // what is selected (the side) goes where its two corners go: its own edge is carried, the way the sketch was extruded stays
      const { a, da, b, db } = f.columns.edge;
      const [ax, ay, az] = f.columns.axis;
      const V = (u: readonly number[]) => new THREE.Vector3(u[0]!, u[1]!, u[2]!);
      const t = V(b).sub(V(a));
      const t2 = V(b).add(V(db)).sub(V(a).add(V(da)));
      const e = new THREE.Vector3(ax!, ay!, az!);
      const w = new THREE.Vector3().crossVectors(t, e);
      if (w.lengthSq() > 1e-12) {
        const before = new THREE.Matrix4().makeBasis(t, e, w);
        const after = new THREE.Matrix4().makeBasis(t2, e, w);
        const to = V(a).add(V(da));
        overlay.matrix.makeTranslation(to.x, to.y, to.z).multiply(after).multiply(before.invert()).multiply(new THREE.Matrix4().makeTranslation(-a[0]!, -a[1]!, -a[2]!));
        overlay.matrixWorldNeedsUpdate = true;
      }
    }
    if (f.withOverlay && f.by) { overlay.matrix.makeTranslation(f.by[0], f.by[1], f.by[2]); overlay.matrixWorldNeedsUpdate = true; }
  }
  /** The walls of the arcs that change with a pulled side: each with the points of its face (found once, kept while the same faces stay). */
  let wallSig = "";
  let wallKeys: { keys: Set<string>; arc: ArcShape }[] = [];
  function columnWalls(walls: { face: string; arc: ArcShape }[]): { keys: Set<string>; arc: ArcShape }[] {
    const sig = walls.map((w) => w.face).join("|");
    if (sig !== wallSig) {
      wallSig = sig;
      wallKeys = walls.map((w) => {
        const q = lastScene?.parts[w.face as never] as { mesh?: readonly number[] } | undefined;
        const keys = new Set<string>();
        for (let i = 0; q?.mesh && i + 2 < q.mesh.length; i += 3) keys.add(`${Math.round(q.mesh[i]! * 1e3)},${Math.round(q.mesh[i + 1]! * 1e3)},${Math.round(q.mesh[i + 2]! * 1e3)}`);
        return { keys, arc: w.arc };
      });
    }
    return wallKeys.map((w, i) => ({ keys: w.keys, arc: walls[i]!.arc })); // (the faces are found once; the maps change with the pointer)
  }
  function setBodyMatrix(m: number[] | null, withOverlay: boolean, only: { tris: [number, number][]; box: { min: readonly number[]; max: readonly number[] } } | null = null) {
    bodyMatrix = m;
    // one body of several: only its triangles and outline move (`in_273`); else the whole body does
    splitNow = m && only ? only : null;
    splitter?.(splitNow?.tris ?? null, splitNow?.box ?? null);
    if (bodyGroup) { bodyGroup.matrix.fromArray(m && !splitNow ? m : IDENTITY); bodyGroup.matrixWorldNeedsUpdate = true; }
    if (moverGroup) { moverGroup.matrix.fromArray(m && splitNow ? m : IDENTITY); moverGroup.matrixWorldNeedsUpdate = true; }
    overlay.matrix.fromArray(m && withOverlay ? m : IDENTITY);
    overlay.matrixWorldNeedsUpdate = true;
  }
  let fade = false;
  /** The body see-through (the sketch plane is looked at straight and the body is between it and the camera) or as it was (`in_194`). */
  function applyFade() {
    if (!bodyMat) return;
    bodyMat.transparent = fade;
    bodyMat.opacity = fade ? settings.theme.bodyFadeOpacity : 1;
    bodyMat.depthWrite = !fade;
    bodyMat.needsUpdate = true;
  }
  const setBodyFade = (on: boolean) => { if (on !== fade) { fade = on; applyFade(); } };
  const setHighlight = (h: Highlight, cam: Camera, nowMs: number) => buildHighlight(overlay, marks, lastScene, lastMesh, h, cam, pen, nowMs);
  /** The figure being drawn, or the prism an extrude would make (lines; not part of the scene). */
  function setPreview(p: Preview | null, cam: Camera) {
    clearGroup(preview);
    if (!p) return;
    if (p.cursor) preview.add(sphereAt(p.cursor, cam.distance * settings.pick.vertexScale, TEAL));
    for (const [a, b] of p.segments) preview.add(pen.line([...a, ...b], TEAL, 2, false));
    if (p.circle) preview.add(pen.line(ringOf(p.circle.center, p.circle.radius, p.circle.normal), TEAL, 2, false));
  }

  /** The lines that go with constraints: the arc of an angle, the segment a distance measures. */
  function setNotes(lines: Vec3[][]) {
    clearGroup(notes);
    for (const l of lines) {
      const m = pen.line(l.flat(), 0x55575c, 1.6, false);
      m.renderOrder = 4;
      notes.add(m);
    }
  }
  const setPanes = (p: Parameters<typeof world.setPanes>[0]) => world.setPanes(p);
  const setGizmo = (g: GizmoView | null, cam: Camera) => buildGizmo(gizmo, g, cam.distance, pen);

  function resize() {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    size = { w, h };
    renderer.setSize(w, h);
    pen.setSize(w, h);
  }
  /** Draw the frame. */
  function render(cam: Camera, grid: Grid | null) {
    world.setGrid(grid);
    world.update(cam, size, content);
    const b = basis(cam);
    const eye = position(cam);
    const m = mixOf(cam);
    const flat = m <= ORTHO_MIX;
    const active = flat ? ortho : persp;
    if (flat) {
      const hh = projector(cam, size.w, size.h).halfH;
      ortho.left = -hh * (size.w / size.h);
      ortho.right = hh * (size.w / size.h);
      ortho.top = hh;
      ortho.bottom = -hh;
    } else {
      persp.aspect = size.w / size.h;
      persp.fov = (2 * Math.atan(Math.tan((settings.view.fovDeg * Math.PI) / 360) * m) * 180) / Math.PI; // (while the view goes between flat and perspective the lens is narrowed and the eye is back: the target keeps its size)
    }
    const away = eyeDistance(cam);
    active.near = away * settings.view.nearFactor;
    active.far = away * settings.view.farFactor + (away - cam.distance);
    active.position.set(...eye);
    active.up.set(...b.up);
    active.lookAt(...cam.target);
    active.updateProjectionMatrix();
    key.position.set(...([0, 1, 2].map((i) => eye[i]! + b.right[i]! * -0.7 * cam.distance + b.up[i]! * 0.9 * cam.distance) as unknown as Vec3));
    key.target.position.set(...cam.target);
    fill.position.set(...eye);
    pen.setSize(size.w, size.h);
    renderer.render(scene3, active);
  }
  resize();
  return { setScene, setBodyMatrix, setFaceShift, setHighlight, setPreview, setGizmo, setPanes, setBodyFade, setNotes, render, resize, size: () => size, canvas: renderer.domElement };
}
