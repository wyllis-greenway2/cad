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
import type { BodyMesh } from "./view/content.ts";
import { buildHighlight, TEAL } from "./view/highlight.ts";
import { buildGizmo } from "./view/gizmo.ts";
import type { GizmoView } from "./view/gizmo.ts";
import type { Highlight } from "./view/highlight.ts";

export type { Highlight };
type Preview = { segments: [Vec3, Vec3][]; guides?: [Vec3, Vec3][]; circle: { center: Vec3; radius: number; normal: Vec3 } | null; cursor: Vec3 | null };

export function createView(host: HTMLElement) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true });
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
    splitter = built ? built.split : null;
    moverGroup = built ? built.mover : null;
    moversOf = built ? built.movers : null;
    ghoster = built ? built.ghost : null;
    ghoster?.(hiddenOn);
    splitNow = null;
    if (bodyGroup) { bodyGroup.matrix.fromArray(bodyMatrix ?? IDENTITY); bodyGroup.matrixWorldNeedsUpdate = true; }
    if (moverGroup) moverGroup.matrix.fromArray(IDENTITY);
    applyFade();
    if (clip) applyClip();
  }
  let ghoster: ((on: boolean) => void) | null = null;
  let hiddenOn = false;
  /** The edges of the body that are behind a face show faintly (while a sketch is being drawn, `in_324`). */
  function setHiddenEdges(on: boolean) { if (on === hiddenOn) return; hiddenOn = on; ghoster?.(on); }
  let bodyMat: import("three").MeshPhysicalMaterial | null = null;
  let bodyGroup: import("three").Group | null = null;
  let bodyMatrix: number[] | null = null;
  type Part = { tris: [number, number][]; box: { min: readonly number[]; max: readonly number[] } };
  let splitter: ((items: Part[] | null) => void) | null = null;
  let moversOf: (() => import("three").Group[]) | null = null;
  let moverGroup: import("three").Group | null = null;
  let splitNow: Part[] | null = null;
  const IDENTITY = new Array<number>(16).fill(0).map((_, i) => (i % 5 === 0 ? 1 : 0));
  overlay.matrixAutoUpdate = false;
  /** The body (and, when what is selected is the body, its highlight) drawn moved by a matrix: a body being dragged is not worked out again by the kernel for every move of the pointer (`in_216`). */
  function setBodyMatrix(m: number[] | null, withOverlay: boolean, only: Part | null = null, followers: { matrix: number[]; only: Part }[] = []) {
    bodyMatrix = m;
    // bodies of several that move on their own (the one dragged, and those that follow it, `in_341`): only their triangles and outline move, each by its own matrix; else the whole body does
    splitNow = m && only ? [only, ...followers.map((f) => f.only)] : null;
    splitter?.(splitNow);
    if (bodyGroup) { bodyGroup.matrix.fromArray(m && !splitNow ? m : IDENTITY); bodyGroup.matrixWorldNeedsUpdate = true; }
    if (moverGroup) { moverGroup.matrix.fromArray(IDENTITY); moverGroup.matrixWorldNeedsUpdate = true; }
    const matrices = [m, ...followers.map((f) => f.matrix)];
    (moversOf?.() ?? []).forEach((kid, k) => { kid.matrix.fromArray(matrices[k] ?? IDENTITY); kid.matrixWorldNeedsUpdate = true; });
    overlay.matrix.fromArray(m && withOverlay ? m : IDENTITY);
    overlay.matrixWorldNeedsUpdate = true;
  }
  let fade = false;
  let wire = false;
  let sectionKey = "";
  renderer.localClippingEnabled = true;
  let clip: THREE.Plane | null = null;
  let secNow: { at: Vec3; n: Vec3; corners: Vec3[] } | null = null;
  const sectionGroup = new THREE.Group(); // (the stencil passes, the solid cut face with its hatching, and the faint plane, `in_394`)
  scene3.add(sectionGroup);
  /** The cross section (`in_392`, `in_394`): the part of the body and its lines on the normal's side of the plane is not drawn; both faces of what is cut are shown; where the plane cuts a solid the cut face is drawn
   * solid and hatched with parallel lines, as a cut part is in an engineering drawing (the stencil counts, along each pixel's line of sight, how many faces of the body lie behind the plane: odd is inside the solid). */
  function applyClip() {
    content.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      for (const mat of Array.isArray(m) ? m : m ? [m] : []) { mat.clippingPlanes = clip ? [clip] : null; if (mat instanceof THREE.MeshBasicMaterial || mat instanceof THREE.MeshPhysicalMaterial || mat instanceof THREE.MeshStandardMaterial) { if (clip) { mat.userData.side ??= mat.side; mat.side = THREE.DoubleSide; } else if (mat.userData.side !== undefined) mat.side = mat.userData.side as THREE.Side; } mat.needsUpdate = true; }
    });
    clearGroup(sectionGroup);
    if (!clip || !secNow || !bodyGroup) return;
    const planes = [clip];
    const stencil = (side: THREE.Side, op: THREE.StencilOp) => new THREE.MeshBasicMaterial({ side, colorWrite: false, depthWrite: false, depthTest: false, clippingPlanes: planes, stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, stencilFail: op, stencilZFail: op, stencilZPass: op });
    const back = stencil(THREE.BackSide, THREE.IncrementWrapStencilOp);
    const front = stencil(THREE.FrontSide, THREE.DecrementWrapStencilOp);
    bodyGroup.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const [mat, order] of [[back, 1], [front, 1]] as const) {
        const twin = new THREE.Mesh(mesh.geometry, mat);
        twin.matrixAutoUpdate = false;
        mesh.updateWorldMatrix(true, false);
        twin.matrix.copy(mesh.matrixWorld);
        twin.renderOrder = order;
        sectionGroup.add(twin);
      }
    });
    // the half that is cut away stays as a faint ghost, so it is plain what the cut is of (`in_397`)
    const ghostMat = new THREE.MeshBasicMaterial({ color: 0x8a94a3, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false, clippingPlanes: [new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(...secNow.n).normalize(), new THREE.Vector3(...secNow.at))] });
    bodyGroup.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const twin = new THREE.Mesh(mesh.geometry, ghostMat);
      twin.matrixAutoUpdate = false;
      mesh.updateWorldMatrix(true, false);
      twin.matrix.copy(mesh.matrixWorld);
      twin.renderOrder = 4;
      sectionGroup.add(twin);
    });
    const n = new THREE.Vector3(...secNow.n).normalize();
    const u = new THREE.Vector3().crossVectors(Math.abs(n.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0), n).normalize();
    const v = new THREE.Vector3().crossVectors(n, u);
    const cut = new THREE.Mesh(new THREE.PlaneGeometry(1e4, 1e4), new THREE.ShaderMaterial({
      uniforms: { u: { value: u }, v: { value: v }, at: { value: new THREE.Vector3(...secNow.at) }, pitch: { value: Math.max(0.5, bodySize() / 34) } },
      vertexShader: "varying vec3 w; void main(){ vec4 p = modelMatrix * vec4(position, 1.0); w = p.xyz; gl_Position = projectionMatrix * viewMatrix * p; }",
      // solid light grey with slanting parallel lines (45 degrees, as a cut part is hatched in a drawing)
      fragmentShader: "uniform vec3 u; uniform vec3 v; uniform vec3 at; uniform float pitch; varying vec3 w; void main(){ vec3 d = w - at; float a = (dot(d, u) + dot(d, v)) / pitch; float line = smoothstep(0.43, 0.47, abs(fract(a) - 0.5)); gl_FragColor = vec4(mix(vec3(0.92, 0.93, 0.95), vec3(0.62, 0.64, 0.68), line), 1.0); }",
      side: THREE.DoubleSide, depthTest: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, // (a face of the part like any other: what is in front of it hides it, `in_396`)
      stencilWrite: true, stencilRef: 0, stencilFunc: THREE.NotEqualStencilFunc, stencilFail: THREE.ReplaceStencilOp, stencilZFail: THREE.ReplaceStencilOp, stencilZPass: THREE.ReplaceStencilOp,
    }));
    cut.position.copy(new THREE.Vector3(...secNow.at));
    cut.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, v, n));
    cut.renderOrder = 2;
    sectionGroup.add(cut);
  }
  const planesGroup = new THREE.Group(); // (the cross section planes in the part: faint when not selected, fainter still when they are cutting, `in_396`)
  scene3.add(planesGroup);
  let planesKey = "";
  const setSectionPlanes = (list: { selected: boolean; corners: Vec3[] }[]) => {
    const key = JSON.stringify(list);
    if (key === planesKey) return;
    planesKey = key;
    clearGroup(planesGroup);
    for (const p of list) {
      const c = p.corners;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute([...c[0]!, ...c[1]!, ...c[2]!, ...c[0]!, ...c[2]!, ...c[3]!], 3));
      const quad = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x1ab8b3, transparent: true, opacity: p.selected ? 0.05 : 0.1, side: THREE.DoubleSide, depthWrite: false, depthTest: false }));
      quad.renderOrder = 3;
      planesGroup.add(quad);
      const edge = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(c.map((q) => new THREE.Vector3(...q))), new THREE.LineBasicMaterial({ color: 0x1ab8b3, transparent: true, opacity: p.selected ? 0.5 : 0.7, depthTest: false }));
      edge.renderOrder = 3;
      planesGroup.add(edge);
    }
  };
  const bodySize = () => { if (!lastMesh) return 40; const v = lastMesh.vertices; const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i + 2 < v.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k]!, v[i + k]!); hi[k] = Math.max(hi[k]!, v[i + k]!); } return Math.max(hi[0]! - lo[0]!, hi[1]! - lo[1]!, hi[2]! - lo[2]!); };
  const setSection = (sec: { at: Vec3; n: Vec3; corners: Vec3[] } | null) => {
    const key = JSON.stringify(sec);
    if (key === sectionKey) return;
    sectionKey = key;
    secNow = sec;
    clip = sec ? new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(...sec.n).negate(), new THREE.Vector3(...sec.at)) : null;
    applyClip();
  };
  /** The body see-through (the sketch plane is looked at straight and the body is between it and the camera) or as it was (`in_194`). */
  function applyFade() {
    if (!bodyMat) return;
    bodyMat.userData.base ??= bodyMat.color.getHex(); // (its own colour, put back after a wireframe)
    // wireframe (`in_383`, `in_386`): the surfaces are nearly clear and dark, not gone, so the edges and the sketches inside show through them
    bodyMat.transparent = fade || wire;
    bodyMat.opacity = wire ? 0.14 : fade ? settings.theme.bodyFadeOpacity : 1;
    bodyMat.depthWrite = !fade && !wire;
    bodyMat.color.setHex(wire ? 0x14161a : (bodyMat.userData.base as number));
    bodyMat.visible = true;
    bodyMat.needsUpdate = true;
  }
  const setWireframe = (on: boolean) => { if (on !== wire) { wire = on; applyFade(); } };
  const setBodyFade = (on: boolean) => { if (on !== fade) { fade = on; applyFade(); } };
  const setHighlight = (h: Highlight, cam: Camera, nowMs: number) => buildHighlight(overlay, marks, lastScene, lastMesh, h, cam, pen, nowMs);
  /** The figure being drawn, or the prism an extrude would make (lines; not part of the scene). */
  function setPreview(p: Preview | null, cam: Camera) {
    clearGroup(preview);
    if (!p) return;
    if (p.cursor) preview.add(sphereAt(p.cursor, cam.distance * settings.pick.vertexScale, TEAL));
    for (const [a, b] of p.segments) preview.add(pen.line([...a, ...b], TEAL, 2, false));
    for (const [a, b] of p.guides ?? []) preview.add(pen.dashed([...a, ...b], TEAL, 1.5, cam.distance * 0.012)); // (alignment guides are dashed so they read differently from the figure, `in_381`)
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
    active.far = Math.max(away * settings.view.farFactor + (away - cam.distance), Math.hypot(...eye) * 1.5 + settings.world.axisLengthMm * 2); // (and far enough to reach the origin and its axes, so the world is not cut off after a long way from it, `in_413`)
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
  return { setScene, setHiddenEdges, setBodyMatrix, setHighlight, setPreview, setGizmo, setPanes, setBodyFade, setWireframe, setSection, setSectionPlanes, setNotes, render, resize, size: () => size, canvas: renderer.domElement };
}
