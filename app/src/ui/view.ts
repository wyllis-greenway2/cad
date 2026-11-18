// The three.js view (`dec_clean_engine_design` section 8): it reads the scene, the selection and the camera, and draws. It never changes them.
// The pieces are in `view/`: `content` (the scene), `highlight` (ring, teal, amber), `pen` (thick lines and shapes); the world dressing is `world.ts`.
import * as THREE from "three";
import { studio } from "./view/studio.ts";
import type { Scene, Vec3, StandIn } from "../interaction/api.ts";
import { settings } from "../interaction/api.ts";
import type { Camera } from "../interaction/camera.ts";
import { basis, position, projector, mixOf, eyeDistance, ORTHO_MIX } from "../interaction/camera.ts";
import type { Grid } from "../interaction/api.ts";
import { createWorld } from "./world.ts";
import { createPen, clearGroup, ringOf, sphereAt } from "./view/pen.ts";
import { buildContent } from "./view/content.ts";
import type { BodyMesh } from "./view/content.ts";
import { buildHighlight, highlightKey, TEAL } from "./view/highlight.ts";
import { sectionClip } from "./orb.ts";
import { buildGizmo } from "./view/gizmo.ts";
import type { ToolpathView } from "../interaction/api.ts";
import type { GizmoView } from "./view/gizmo.ts";
import type { Highlight } from "./view/highlight.ts";

export type { Highlight };
type Preview = { segments: [Vec3, Vec3][]; guides?: [Vec3, Vec3][]; circle: { center: Vec3; radius: number; normal: Vec3 } | null; cursor: Vec3 | null; red?: true; orange?: true };

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
  const toolpath = new THREE.Group(); // (a manufacturing route's toolpath over the drawing, `in_570`)
  const standGroup = new THREE.Group(); // (the discs that stand for gear bodies the kernel has not made yet, `dec_gear_standin`)
  const thinGroup = new THREE.Group(); // (the places too thin to print, while the Measure tab is open: `in_626`)
  scene3.add(content, overlay, marks, preview, gizmo, notes, toolpath, thinGroup, standGroup);
  const world = createWorld(scene3, host);
  const pen = createPen();
  const envMap = new THREE.PMREMGenerator(renderer).fromScene(studio(), 0.04).texture; // a soft studio, only reflected in the body
  let lastScene: Scene | null = null;
  let occluders: THREE.Object3D[] | null = null; // (the meshes of what is drawn, which the axis labels are hidden behind: found again when it is built again)
  const collectMeshes = (g: THREE.Object3D): THREE.Object3D[] => { const out: THREE.Object3D[] = []; g.traverse((o) => { if ((o as THREE.Mesh).isMesh) out.push(o); }); return out; };
  let sceneStamp = 0; // (counts the times what is drawn was built again: the highlight is built from it)
  let highlightWas: string | null = null; // (what the highlight on the screen was built from, or null if it moves)
  /** What is drawn is built again at the next frame (a look setting changed, `in_459`). */
  const rebuild = (): void => { lastScene = null; };
  let lastMesh: BodyMesh | null = null;
  let size = { w: 1, h: 1 };

  /** Rebuild what is drawn from the scene (called when the scene changes). */
  function setScene(s: Scene, mesh: BodyMesh | null) {
    if (s === lastScene) return;
    lastScene = s;
    sceneStamp++;
    occluders = null;
    lastMesh = mesh;
    const built = buildContent(content, s, mesh, pen, envMap);
    bodyMat = built ? built.material : null;
    bodyGroup = built ? built.body : null;
    splitter = built ? built.split : null;
    hider = built ? built.hide : null;
    hider?.(hiddenNow);
    moverGroup = built ? built.mover : null;
    moversOf = built ? built.movers : null;
    ghoster = built ? built.ghost : null;
    ghoster?.(hiddenOn);
    splitNow = null;
    if (bodyGroup) { bodyGroup.matrix.fromArray(bodyMatrix ?? IDENTITY); bodyGroup.matrixWorldNeedsUpdate = true; }
    if (moverGroup) moverGroup.matrix.fromArray(IDENTITY);
    applyFade();
    if (clips.length) applyClip();
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
  let hider: ((items: { tris: [number, number][] }[] | null) => void) | null = null;
  let hiddenNow: { tris: [number, number][] }[] | null = null; // (the hidden bodies, `dec_hidden_bodies`: kept so a picture built again has them)
  /** The bodies that are hidden: drawn very faintly, out of the body. */
  function setHiddenBodies(items: { tris: [number, number][] }[] | null) { hiddenNow = items && items.length ? items : null; hider?.(hiddenNow); }
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
  let clips: THREE.Plane[] = []; // (every sheet that is cutting, `in_459`): the body is clipped by these, each a hair on the cut-away side so a face that lies exactly in the plane stays whole and the hatch is drawn over it, not flickering with it (`in_466`)
  let tight: THREE.Plane[] = []; // (the same, a hair the other way: the stencil count leaves out a face that lies in the plane)
  let secs: { at: Vec3; n: Vec3; corners: Vec3[] }[] = [];
  const sectionGroup = new THREE.Group(); // (the stencil passes, the solid cut face with its hatching, and the faint plane, `in_394`)
  scene3.add(sectionGroup);
  /** The cross section (`in_392`, `in_394`): the part of the body and its lines on the normal's side of the plane is not drawn; both faces of what is cut are shown; where the plane cuts a solid the cut face is drawn
   * solid and hatched with parallel lines, as a cut part is in an engineering drawing (the stencil counts, along each pixel's line of sight, how many faces of the body lie behind the plane: odd is inside the solid). */
  function applyClip() {
    content.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      for (const mat of Array.isArray(m) ? m : m ? [m] : []) { mat.clippingPlanes = clips.length ? clips : null; if (mat instanceof THREE.MeshBasicMaterial || mat instanceof THREE.MeshPhysicalMaterial || mat instanceof THREE.MeshStandardMaterial) { if (clips.length) { mat.userData.side ??= mat.side; mat.side = THREE.DoubleSide; } else if (mat.userData.side !== undefined) mat.side = mat.userData.side as THREE.Side; } mat.needsUpdate = true; }
    });
    clearGroup(sectionGroup);
    if (!clips.length || !bodyGroup) return;
    const body = bodyGroup;
    secs.forEach((secNow, idx) => {
    const clip = clips[idx]!;
    const others = clips.filter((_, j) => j !== idx); // (the cut face of a sheet is cut by the others, `in_459`)
    const planes = [tight[idx]!];
    const stencil = (side: THREE.Side, op: THREE.StencilOp) => new THREE.MeshBasicMaterial({ side, colorWrite: false, depthWrite: false, depthTest: false, clippingPlanes: planes, stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, stencilFail: op, stencilZFail: op, stencilZPass: op });
    const back = stencil(THREE.BackSide, THREE.IncrementWrapStencilOp);
    const front = stencil(THREE.FrontSide, THREE.DecrementWrapStencilOp);
    body.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const [mat, order] of [[back, 1 + idx * 0.2], [front, 1 + idx * 0.2]] as const) { // (each sheet's stencil pass and cut face come one after the other, the stencil put back to nothing by the cut face)
        const twin = new THREE.Mesh(mesh.geometry, mat);
        twin.matrixAutoUpdate = false;
        mesh.updateWorldMatrix(true, false);
        twin.matrix.copy(mesh.matrixWorld);
        twin.renderOrder = order;
        sectionGroup.add(twin);
      }
    });
    const n = new THREE.Vector3(...secNow.n).normalize();
    const u = new THREE.Vector3().crossVectors(Math.abs(n.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0), n).normalize();
    const v = new THREE.Vector3().crossVectors(n, u);
    const cut = new THREE.Mesh(new THREE.PlaneGeometry(1e4, 1e4), new THREE.ShaderMaterial({
      uniforms: { cl: { value: Array.from({ length: 8 }, (_, i) => { const q = others[i]; return q ? new THREE.Vector4(q.normal.x, q.normal.y, q.normal.z, q.constant) : new THREE.Vector4(); }) }, cc: { value: Math.min(8, others.length) }, u: { value: u }, v: { value: v }, at: { value: new THREE.Vector3(...secNow.at) }, pitch: { value: Math.max(0.3, bodySize() / 50) } },
      vertexShader: "varying vec3 w; void main(){ vec4 p = modelMatrix * vec4(position, 1.0); w = p.xyz; gl_Position = projectionMatrix * viewMatrix * p; }",
      // solid grey, a little darker than a face of the part, with slanting parallel lines close together (45 degrees, as a cut part is hatched in a drawing, `in_680`)
      fragmentShader: "uniform vec4 cl[8]; uniform int cc; uniform vec3 u; uniform vec3 v; uniform vec3 at; uniform float pitch; varying vec3 w; void main(){ for(int i=0;i<8;i++){ if(i>=cc) break; if(dot(cl[i].xyz, w) + cl[i].w < 0.0) discard; } vec3 d = w - at; float a = (dot(d, u) + dot(d, v)) / pitch; float line = smoothstep(0.43, 0.47, abs(fract(a) - 0.5)); gl_FragColor = vec4(mix(vec3(0.80, 0.81, 0.84), vec3(0.53, 0.55, 0.60), line), 1.0); }",
      side: THREE.DoubleSide, depthTest: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6, // (a face of the part like any other: what is in front of it hides it, `in_396`)
      stencilWrite: true, stencilRef: 0, stencilFunc: THREE.NotEqualStencilFunc, stencilFail: THREE.ReplaceStencilOp, stencilZFail: THREE.ReplaceStencilOp, stencilZPass: THREE.ReplaceStencilOp,
    }));
    cut.position.copy(new THREE.Vector3(...secNow.at));
    cut.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, v, n));
    cut.renderOrder = 1.1 + idx * 0.2;
    sectionGroup.add(cut);
    });
  }
  const planesGroup = new THREE.Group(); // (the cross section planes in the part: faint when not selected, fainter still when they are cutting, `in_396`)
  scene3.add(planesGroup);
  let planesKey = "";
  const setSectionPlanes = (list: { guide?: true; selected: boolean; cutting: boolean; hidden?: boolean; corners: Vec3[] }[]) => {
    const key = JSON.stringify(list);
    if (key === planesKey) return;
    planesKey = key;
    clearGroup(planesGroup);
    for (const p of list) {
      const c = p.corners;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute([...c[0]!, ...c[1]!, ...c[2]!, ...c[0]!, ...c[2]!, ...c[3]!], 3));
      // a sheet is translucent grey like the little world panes (`in_459`); its invisible mode is fainter still; a guide a tool draws (the mirror's plane) stays teal
      const hidden = !!p.hidden;
      const colour = p.guide ? new THREE.Color(0x1ab8b3) : new THREE.Color().setRGB(settings.theme.pane[0], settings.theme.pane[1], settings.theme.pane[2], THREE.SRGBColorSpace);
      const fillOpacity = p.guide ? 0.07 : hidden ? 0.03 : p.selected ? settings.world.paneActiveOpacity * 0.7 : settings.world.paneOpacity;
      const quad = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: fillOpacity, side: THREE.DoubleSide, depthWrite: false, depthTest: true, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 })); // (a plane in the part, hidden by the part where the part is in front of it, `in_416`)
      quad.renderOrder = 3;
      planesGroup.add(quad);
      const edge = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(c.map((q) => new THREE.Vector3(...q))), new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity: p.guide ? 0.55 : hidden ? 0.3 : p.selected ? 0.9 : 0.5, depthTest: true }));
      edge.renderOrder = 3;
      planesGroup.add(edge);
    }
  };
  const bodySize = () => { if (!lastMesh) return 40; const v = lastMesh.vertices; const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i + 2 < v.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k]!, v[i + k]!); hi[k] = Math.max(hi[k]!, v[i + k]!); } return Math.max(hi[0]! - lo[0]!, hi[1]! - lo[1]!, hi[2]! - lo[2]!); };
  const setSection = (list: { at: Vec3; n: Vec3; corners: Vec3[] }[]) => {
    const key = JSON.stringify(list);
    if (key === sectionKey) return;
    sectionKey = key;
    secs = list;
    const eps = Math.max(bodySize(), 1) * 2e-4;
    const exact = list.map((sec) => new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(...sec.n).negate(), new THREE.Vector3(...sec.at)));
    clips = exact.map((q) => new THREE.Plane(q.normal.clone(), q.constant + eps));
    tight = exact.map((q) => new THREE.Plane(q.normal.clone(), q.constant - eps));
    sectionClip.clCount.value = Math.min(8, clips.length);
    clips.slice(0, 8).forEach((q, i) => sectionClip.clPlanes.value[i]!.set(q.normal.x, q.normal.y, q.normal.z, q.constant)); // (the teal and the ring of the pointer are cut where the part is, `in_680`)
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
  const setHighlight = (h: Highlight, cam: Camera, nowMs: number) => {
    // turning the view changes nothing the highlight is made from (only a zoom does, by the size of its balls): it is not built again while it is the same
    const key = highlightKey(h, nowMs, cam.distance, `${sceneStamp}|${sectionKey}`);
    if (key !== null && key === highlightWas) return;
    highlightWas = key;
    buildHighlight(overlay, marks, lastScene, lastMesh, h, cam, pen, nowMs);
    // what is selected or pointed at is cut where the part is: the teal of a face stops at the section plane, it does not go on into the cut-away space (`in_680`)
    if (clips.length) for (const g of [overlay, marks]) g.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined; for (const mat of Array.isArray(m) ? m : m ? [m] : []) if (!(mat instanceof THREE.ShaderMaterial) || mat.clipping) mat.clippingPlanes = clips; });
  };
  /** The figure being drawn, or the prism an extrude would make (lines; not part of the scene). */
  function setPreview(p: Preview | null, cam: Camera) {
    clearGroup(preview);
    pen.build("preview", () => {
      if (!p) return;
      const colour = p.red ? 0xe5484d : p.orange ? 0xf59e0b : TEAL; // (a gear whose number was just put right flashes red, `in_690`)
      if (p.cursor) preview.add(sphereAt(p.cursor, cam.distance * settings.pick.vertexScale, TEAL));
      for (const [a, b] of p.segments) preview.add(pen.line([...a, ...b], colour, 2, false));
      for (const [a, b] of p.guides ?? []) preview.add(pen.dashed([...a, ...b], TEAL, 1.5, cam.distance * 0.012)); // (alignment guides are dashed so they read differently from the figure, `in_381`)
      if (p.circle) preview.add(pen.line(ringOf(p.circle.center, p.circle.radius, p.circle.normal), TEAL, 2, false));
    });
  }

  /** The lines that go with constraints: the arc of an angle, the segment a distance measures. */
  function setNotes(lines: Vec3[][], dashed: Vec3[][] = [], dash = 1) {
    clearGroup(notes);
    pen.build("notes", () => {
    for (const l of dashed) { const m = pen.dashed(l.flat(), 0x55575c, 1.4, dash); m.renderOrder = 4; notes.add(m); } // (the lines from an arc's centre to its ends, `in_463`)
    for (const l of lines) {
      const m = pen.line(l.flat(), 0x55575c, 1.6, false);
      m.renderOrder = 4;
      notes.add(m);
    }
    });
  }
  let thinShown: number[] | null = null;
  /** Mark the triangles (nine numbers each) that are too thin to print, in the colour of `settings.measure`; none to put the marks away. The same list is not built again. */
  let standKey = "";
  /** The discs for gear bodies still being made, drawn translucent and ghosted so they read as place holders (`dec_gear_standin`); `show` is false until the wait has lasted a little. */
  function setStandIns(list: StandIn[], show: boolean): void {
    const key = show ? JSON.stringify(list) : "";
    if (key === standKey) return;
    standKey = key;
    clearGroup(standGroup);
    if (!show) return;
    for (const d of list) {
      if (d.path) { // a swept body: a tube along its path (`in_850`)
        const curve = new THREE.CatmullRomCurve3(d.path.map((q) => new THREE.Vector3(...q)), false, "centripetal");
        const geo = new THREE.TubeGeometry(curve, Math.min(400, d.path.length * 6), d.radius, 16, false);
        const body = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x9aa0a6, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }));
        body.renderOrder = 2;
        standGroup.add(body);
        continue;
      }
      const shape = new THREE.Shape();
      shape.absarc(0, 0, d.radius, 0, Math.PI * 2, false);
      if (d.hole > 0) { const h = new THREE.Path(); h.absarc(0, 0, d.hole, 0, Math.PI * 2, true); shape.holes.push(h); }
      const geo = new THREE.ExtrudeGeometry(shape, { depth: Math.abs(d.depth), bevelEnabled: false, curveSegments: 64 });
      if (d.depth < 0) geo.translate(0, 0, d.depth);
      const body = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x9aa0a6, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }));
      const rim = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), new THREE.LineBasicMaterial({ color: 0x6b7280, transparent: true, opacity: 0.55 }));
      for (const o of [body, rim]) { o.position.set(...d.centre); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...d.normal)); o.renderOrder = 2; standGroup.add(o); }
    }
  }
  function setThin(tris: number[] | null): void {
    if (tris === thinShown) return;
    thinShown = tris;
    clearGroup(thinGroup);
    if (!tris || !tris.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(tris), 3));
    const mat = new THREE.MeshBasicMaterial({ color: settings.measure.thinColor, transparent: true, opacity: settings.measure.thinOpacity, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 3;
    thinGroup.add(mesh);
  }
  const setWorldHidden = (on: boolean): void => world.setOff(on);
  const setPanes = (p: Parameters<typeof world.setPanes>[0]): boolean => world.setPanes(p);
  const setGizmo = (g: GizmoView | null, cam: Camera) => buildGizmo(gizmo, g, cam.distance, pen);
  /** The toolpath preview (`in_570`): what is done in full colour, what is still to come faint, travel pale grey, the head a dot. Drawn again only when the view of it changes. */
  let lastToolpath: ToolpathView | null = null;
  let lastToolpathDistance = 0;
  const setToolpath = (v: ToolpathView | null, cam: Camera) => {
    if (v === lastToolpath && (v === null || cam.distance === lastToolpathDistance)) return; // (the head's dot is sized by the zoom, so a zoom draws it again)
    lastToolpath = v;
    lastToolpathDistance = cam.distance;
    clearGroup(toolpath);
    pen.build("toolpath", () => {
    if (!v) return;
    const colourOf = (layer: string): number => (layer === "travel" ? settings.theme.previewTravel : layer === "wire" ? settings.theme.previewWire : layer === "score" ? settings.theme.markScore : layer === "engrave" ? settings.theme.markEngrave : settings.theme.previewCut);
    for (const [lines, faint] of [[v.rest, true], [v.done, false]] as const) {
      for (const [layer, pairs] of Object.entries(lines)) {
        if (!pairs.length) continue;
        const m = pen.segments(pairs, colourOf(layer), layer === "travel" ? 1 : layer === "wire" ? 1.3 : 2.2, false);
        m.renderOrder = faint ? 3 : 4;
        m.raycast = () => {}; // (not something the axis labels hide behind)
        if (faint) { const mat = m.material as import("three/addons/lines/LineMaterial.js").LineMaterial; mat.transparent = true; mat.opacity = layer === "travel" ? 0.35 : 0.28; }
        toolpath.add(m);
      }
    }
    if (v.stock.length) { const m = pen.segments(v.stock, settings.theme.previewSheet, 1.4, false); m.renderOrder = 2; m.raycast = () => {}; toolpath.add(m); } // (the sheet's edge, so a layout can be seen against it)
    if (v.head) { const dot = sphereAt(v.head, cam.distance * 0.006, settings.theme.previewCut, false); dot.raycast = () => {}; toolpath.add(dot); }
    });
  };

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
    occluders ??= content.children.length ? collectMeshes(content) : [];
    world.update(cam, size, occluders, `${sceneStamp}|${bodyMatrix?.join(",") ?? ""}|${hiddenNow ? 1 : 0}|${sectionKey}`);
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
  return { rebuild, setWorldHidden, setScene, setHiddenBodies, setThin, setStandIns, setHiddenEdges, setBodyMatrix, setHighlight, setPreview, setGizmo, setToolpath, setPanes, setBodyFade, setWireframe, setSection, setSectionPlanes, setNotes, render, resize, size: () => size, canvas: renderer.domElement };
}
