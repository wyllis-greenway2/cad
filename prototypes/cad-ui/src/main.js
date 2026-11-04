// 3D view with infinite XYZ planes in paper gray and charcoal (no blue), with distance fog; the world axes keep their
// colors. Click a plane: it becomes the sketch plane and the camera goes face-on to it. Orbiting away drops the sketch
// plane (back to the 3D view, where any plane can be hovered and clicked). Sketching and extruding come next.
import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { settings as S } from "./settings.js";
import { initTuning } from "./tune.js";
import { SketchStore } from "./sketchstore.mjs";
import { SketchSession } from "./interaction.mjs";
import { navAction, keyAction } from "./keymap.mjs";
import { circlePolygon } from "./sketch.mjs";
import { PLANES, shortest, cameraOffset, cameraUp, clamp, easeInOut, isNormal, projectOnto, pickPlane } from "./viewmath.mjs";

const $ = (id) => document.getElementById(id);
const G = S.grid;
const V = S.view;
const F = S.fog;
let themeName = S.themeName;
const T = () => S.themes[themeName];
const toHex = (c) => (Math.round(c[0] * 255) << 16) | (Math.round(c[1] * 255) << 8) | Math.round(c[2] * 255);

// ---------------------------------------------------------------- state
const view = { a: V.homeAzimuth, e: V.homeElevation, dist: V.homeDistance, target: new THREE.Vector3() };
let selected = null; // "XY" | "XZ" | "YZ" | null  (non-null = sketch mode)
let hovered = null;
let pinnedHover = null; // tuning only: keep a plane's hover preview showing without the mouse
let anim = null;

// ---------------------------------------------------------------- renderer, camera
const canvas = $("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.autoClear = false;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(V.fovDeg, 1, 0.1, 1000);

function applyCamera() {
  const o = cameraOffset(view.a, view.e);
  const up = cameraUp(view.a, view.e);
  camera.position.set(view.target.x + view.dist * o[0], view.target.y + view.dist * o[1], view.target.z + view.dist * o[2]);
  camera.up.set(up[0], up[1], up[2]);
  camera.lookAt(view.target);
  camera.fov = V.fovDeg;
  camera.near = Math.max(0.01, view.dist * V.nearFactor);
  camera.far = view.dist * V.farFactor + 100;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}

// ---------------------------------------------------------------- infinite planes (shader)
const VERT = /* glsl */ `
varying vec3 vPos;
void main() {
  vPos = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0);
}`;
const FRAG = /* glsl */ `
uniform vec3 uCam; uniform float uDist;
uniform int uAxis; uniform vec3 uCol; uniform vec3 uColU; uniform vec3 uColV;
uniform float uLineA; uniform float uFillA; uniform float uAxisA;
uniform vec3 uLineCol;
uniform float uLodDiv; uniform float uStyleMin; uniform float uFineMul; uniform float uMinCellPx;
uniform float uFogNear; uniform float uFogFar; uniform float uAxisFogFar; uniform float uFogK;
uniform float uAxisW;
varying vec3 vPos;

float gridLine(vec2 c, float s) {
  vec2 q = c / s;
  vec2 fw = max(fwidth(q), vec2(1e-6));
  vec2 g = abs(fract(q - 0.5) - 0.5) / fw;
  float cellPx = 1.0 / max(fw.x, fw.y); // size of one cell on screen, in pixels
  return (1.0 - min(min(g.x, g.y), 1.0)) * smoothstep(uMinCellPx, uMinCellPx * 2.5, cellPx);
}
void main() {
  vec2 c; vec3 n;
  if (uAxis == 2) { c = vPos.xy; n = vec3(0.0, 0.0, 1.0); }
  else if (uAxis == 1) { c = vPos.xz; n = vec3(0.0, 1.0, 0.0); }
  else { c = vPos.yz; n = vec3(1.0, 0.0, 0.0); }

  // grid: three levels 10x apart that cross-fade as you zoom. A level's weight depends only on its spacing
  // relative to the view, so it is continuous across zoom steps (this is what shows you are zooming).
  float lg = log(uDist / uLodDiv) / log(10.0);
  float lod = floor(lg);
  float f = lg - lod;
  float s0 = pow(10.0, lod);
  float x0 = -f; float x1 = 1.0 - f;
  float w0 = clamp(x0 + 1.0, 0.0, 1.0) * mix(uStyleMin, 1.0, clamp((x0 + 1.0) / 2.0, 0.0, 1.0)) * uFineMul; // finest level only where wanted
  float w1 = mix(uStyleMin, 1.0, clamp((x1 + 1.0) / 2.0, 0.0, 1.0));
  float w2 = f;
  float grid = max(max(gridLine(c, s0) * w0, gridLine(c, s0 * 10.0) * w1), gridLine(c, s0 * 100.0) * w2);

  vec2 w = fwidth(c);
  float axU = 1.0 - min(abs(c.y) / (max(w.y, 1e-6) * uAxisW), 1.0); // v = 0 runs along the u axis
  float axV = 1.0 - min(abs(c.x) / (max(w.x, 1e-6) * uAxisW), 1.0); // u = 0 runs along the v axis

  // World fog by distance from the camera: a smooth fall-off that never has a hard end, so a plane seen at a low angle
  // stays a solid plane that recedes all the way to the horizon (no fade with viewing angle).
  float dc = distance(uCam, vPos);
  float t = max(dc - uDist * uFogNear, 0.0) / (uDist * (uFogFar - uFogNear));
  float ta = max(dc - uDist * uFogNear, 0.0) / (uDist * (uAxisFogFar - uFogNear));
  float fog = exp(-uFogK * t * t);
  float axFog = exp(-uFogK * ta * ta);

#if PASS == 0
  // Backlight: the sheet adds light ("screen" blending) to whatever is behind it, so it looks lighter and brighter
  // but stays see-through. With distance the light fades away, leaving the dark world (that is the fog).
  gl_FragColor = vec4(uCol * uFillA * fog, 1.0);
#else
  float a = grid * uLineA * fog;                                      // grid lines
  float ax = max(axU, axV) * uAxisA * axFog;                          // world axis lines
  vec3 col = mix(uLineCol, mix(uColU, uColV, step(axU, axV)), step(a, ax)); // an axis line wins where it is stronger
  gl_FragColor = vec4(col, max(a, ax));
#endif
}`;

const planeMeshes = {}; // name -> { glow, lines }
for (const [name, def] of Object.entries(PLANES)) {
  const axisCol = [T().axisX, T().axisY, T().axisZ];
  const makeMat = (pass) => new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    defines: { PASS: pass },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    ...(pass === 0
      ? { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcColorFactor } // screen: src + dst * (1 - src)
      : {}),
    uniforms: {
      uCam: { value: new THREE.Vector3() }, uDist: { value: 1 },
      uAxis: { value: def.axis }, uCol: { value: new THREE.Vector3(...T().sheet) },
      uColU: { value: new THREE.Vector3(...axisCol[def.u]) }, uColV: { value: new THREE.Vector3(...axisCol[def.v]) },
      uLineA: { value: 0 }, uFillA: { value: 0 }, uAxisA: { value: G.axisAlpha },
      uLodDiv: { value: G.lodDivisor }, uStyleMin: { value: G.fineLineStrength }, uFineMul: { value: 0 }, uMinCellPx: { value: G.minCellPx },
      uLineCol: { value: new THREE.Vector3() },
      uFogNear: { value: F.nearFactor }, uFogFar: { value: F.farFactor }, uAxisFogFar: { value: F.axisFarFactor }, uFogK: { value: F.sharpness },
      uAxisW: { value: G.axisWidthPx },
    },
  });
  const geo = new THREE.PlaneGeometry(1, 1);
  const glow = new THREE.Mesh(geo, makeMat(0));
  const lines = new THREE.Mesh(geo, makeMat(1));
  glow.renderOrder = 1;
  lines.renderOrder = 2;
  for (const mesh of [glow, lines]) {
    if (def.axis === 1) mesh.rotation.x = Math.PI / 2;
    if (def.axis === 0) mesh.rotation.y = Math.PI / 2;
    mesh.frustumCulled = false;
    scene.add(mesh);
  }
  planeMeshes[name] = { glow, lines };
}

/** Keep each plane's quad centered on the target (projected onto the plane) and sized to the view, so it looks
 *  infinite and vertex positions stay small (float precision). Grid lines are in world coordinates. */
function updatePlanes() {
  for (const [name, pair] of Object.entries(planeMeshes)) {
   for (const mesh of [pair.glow, pair.lines]) {
    const c = projectOnto(name, view.target.toArray());
    mesh.position.set(c[0], c[1], c[2]);
    mesh.scale.setScalar(view.dist * G.extentFactor);
    const u = mesh.material.uniforms;
    u.uCam.value.copy(camera.position);
    u.uDist.value = view.dist;
    u.uLodDiv.value = G.lodDivisor;
    u.uStyleMin.value = G.fineLineStrength;
    u.uMinCellPx.value = G.minCellPx;
    u.uAxisW.value = G.axisWidthPx;
    u.uAxisA.value = G.axisAlpha;
    u.uFogNear.value = F.nearFactor;
    u.uFogFar.value = F.farFactor;
    u.uAxisFogFar.value = F.axisFarFactor;
    u.uFogK.value = F.sharpness;
    // Only the selected plane is shown (full grid); the hovered plane previews whenever it can be picked. The rest are hidden.
    const states = T().states;
    const state = selected === name ? states.selected : (pinnedHover && !selected ? pinnedHover : hovered) === name ? states.hover : states.base;
    const th = T();
    u.uCol.value.set(...th.sheet);
    u.uLineCol.value.set(...th.gridLine);
    u.uLineA.value = state.line;
    u.uFillA.value = state.fill;
    u.uFineMul.value = state.fine; // the densest grid level is only shown on the sketch plane
   }
  }
}

// ---------------------------------------------------------------- axis arrows (on the world axis lines)
const axisDirs = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
const axisLabels = [$("lx"), $("ly"), $("lz")];
const arrowHeads = ["ax", "ay", "az"].map((id) => $(id));

/** Arrowheads sit on the +X/+Y/+Z world lines as flat triangles of constant on-screen size that follow each
 *  line's projected direction; the axis letter sits just beyond, nudged beside the line. An axis seen
 *  (almost) end-on has no visible length, so its arrow and letter are hidden. */
function updateAxisArrows() {
  const A = S.axisArrow;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const viewDir = view.target.clone().sub(camera.position).normalize();
  const L = A.lengthFactor * view.dist * Math.tan(THREE.MathUtils.degToRad(V.fovDeg / 2));
  const toScreen = (p) => {
    const v = p.clone().project(camera);
    return [((v.x + 1) / 2) * w, ((1 - v.y) / 2) * h];
  };
  axisDirs.forEach((d, i) => {
    const poly = arrowHeads[i];
    const label = axisLabels[i];
    const p0 = d.clone().multiplyScalar(L);
    const [x0, y0] = toScreen(p0);
    const [x1, y1] = toScreen(p0.clone().addScaledVector(d, L * 0.05));
    const len = Math.hypot(x1 - x0, y1 - y0);
    const hide = Math.abs(d.dot(viewDir)) > A.hideCos || len < 1e-3;
    poly.style.display = label.style.display = hide ? "none" : "block";
    if (hide) return;
    const ux = (x1 - x0) / len; // screen direction of the axis
    const uy = (y1 - y0) / len;
    const px = -uy; // perpendicular
    const py = ux;
    const tipX = x0 + ux * A.sizePx;
    const tipY = y0 + uy * A.sizePx;
    const hw = A.sizePx * 0.32;
    poly.setAttribute("points", `${tipX},${tipY} ${x0 + px * hw},${y0 + py * hw} ${x0 - px * hw},${y0 - py * hw}`);
    label.style.left = `${tipX + ux * A.labelGapPx + px * A.labelSidePx}px`;
    label.style.top = `${tipY + uy * A.labelGapPx + py * A.labelSidePx}px`;
  });
}

// ---------------------------------------------------------------- theme (light / dark)
function applyTheme() {
  const t = T();
  const axes = [t.axisX, t.axisY, t.axisZ];
  renderer.setClearColor(t.background);
  document.documentElement.style.setProperty("--bg", `#${t.background.toString(16).padStart(6, "0")}`);
  document.documentElement.style.setProperty("--fg", t.text);
  for (const [name, pair] of Object.entries(planeMeshes)) {
    for (const mesh of [pair.glow, pair.lines]) {
      mesh.material.uniforms.uColU.value.set(...axes[PLANES[name].u]);
      mesh.material.uniforms.uColV.value.set(...axes[PLANES[name].v]);
    }
  }
  arrowHeads.forEach((p, i) => p.setAttribute("fill", `#${toHex(axes[i]).toString(16).padStart(6, "0")}`));
  axisLabels.forEach((l, i) => (l.style.color = `#${toHex(axes[i]).toString(16).padStart(6, "0")}`));
  requestRender();
}

// ---------------------------------------------------------------- render loop (on demand)
let dirty = false;
function requestRender() {
  if (dirty) return;
  dirty = true;
  requestAnimationFrame(() => {
    dirty = false;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    applyCamera();
    updatePlanes();
    renderer.setViewport(0, 0, w, h);
    renderer.clear();
    if (sketchDirty) rebuildSketchViz();
    updateAxisArrows();
    renderer.render(scene, camera);
  });
}
function resize() {
  renderer.setPixelRatio(devicePixelRatio);
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  camera.aspect = canvas.clientWidth / canvas.clientHeight;
  requestRender();
}
addEventListener("resize", resize);

// ---------------------------------------------------------------- camera animation
function animateTo({ a, e, target }, ms) {
  const from = { a: view.a, e: view.e, target: view.target.clone() };
  const da = shortest(from.a, a);
  const t0 = performance.now();
  const id = Symbol();
  anim = id;
  const step = (now) => {
    if (anim !== id) return;
    const k = Math.min(1, (now - t0) / Math.max(1, ms));
    const m = easeInOut(k);
    view.a = from.a + da * m;
    view.e = from.e + (e - from.e) * m;
    view.target.lerpVectors(from.target, target, m);
    updateStatus();
    requestRender();
    if (k < 1) requestAnimationFrame(step);
    else anim = null;
  };
  requestAnimationFrame(step);
}

function goNormal(plane) {
  const def = PLANES[plane];
  animateTo({ a: def.view.a, e: def.view.e, target: new THREE.Vector3(...projectOnto(plane, view.target.toArray())) }, V.transitionMs);
}
function goHome() {
  exitSketch();
  animateTo({ a: V.homeAzimuth, e: V.homeElevation, target: new THREE.Vector3() }, V.transitionMs);
}

// ---------------------------------------------------------------- sketch model + drawing in the scene
const store = new SketchStore();
const session = new SketchSession(S, store);
const BASIS = { XY: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], XZ: [[1, 0, 0], [0, 0, 1], [0, -1, 0]], YZ: [[0, 1, 0], [0, 0, 1], [1, 0, 0]] }; // u, v, normal
const toWorld = (plane, [u, v]) => {
  const [U, W] = BASIS[plane];
  return new THREE.Vector3(U[0] * u + W[0] * v, U[1] * u + W[1] * v, U[2] * u + W[2] * v);
};
const basisMatrix = (plane, at) => {
  const [U, W, N] = BASIS[plane];
  return new THREE.Matrix4().makeBasis(new THREE.Vector3(...U), new THREE.Vector3(...W), new THREE.Vector3(...N)).setPosition(at);
};
const sketchGroup = new THREE.Group();
scene.add(sketchGroup);
let sketchDirty = true;
const markSketch = () => ((sketchDirty = true), requestRender());
const pxPerMm = () => canvas.clientHeight / (2 * view.dist * Math.tan(THREE.MathUtils.degToRad(V.fovDeg / 2))); // face-on to the plane

function stroke(pts3, { color, width, closed = false, order = 5, alpha = 1, dashed = false }) {
  const flat = [];
  for (const p of closed ? [...pts3, pts3[0]] : pts3) flat.push(p.x, p.y, p.z);
  const geo = new LineGeometry();
  geo.setPositions(flat);
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const mat = new LineMaterial({ color, linewidth: width * renderer.getPixelRatio(), transparent: true, opacity: alpha, depthWrite: false, dashed, dashSize: 3, gapSize: 2 });
  mat.resolution.set(size.x, size.y);
  const line = new Line2(geo, mat);
  if (dashed) line.computeLineDistances();
  line.renderOrder = order;
  return line;
}
function disc(plane, p, radiusMm, color, order, alpha = 1) {
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(radiusMm, 20), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: alpha, depthWrite: false }));
  mesh.matrixAutoUpdate = false;
  mesh.matrix.copy(basisMatrix(plane, toWorld(plane, p)));
  mesh.renderOrder = order;
  return mesh;
}
function fillShape(plane, polygon, color, alpha) {
  const shape = new THREE.Shape(polygon.map((p) => new THREE.Vector2(p[0], p[1])));
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: alpha, depthWrite: false, side: THREE.DoubleSide }));
  mesh.matrixAutoUpdate = false;
  mesh.matrix.copy(basisMatrix(plane, new THREE.Vector3()));
  mesh.renderOrder = 3;
  return mesh;
}
const outline = (e) => {
  if (e.type === "rect") return { pts: [[e.x0, e.y0], [e.x1, e.y0], [e.x1, e.y1], [e.x0, e.y1]], closed: true };
  if (e.type === "circle") return { pts: circlePolygon(e.cx, e.cy, e.r, 96), closed: true };
  return { pts: e.points, closed: !!e.closed };
};
const clearGroup = (grp) => {
  for (const c of [...grp.children]) {
    grp.remove(c);
    c.geometry?.dispose();
    c.material?.dispose();
  }
};

/** Rebuild everything sketch-related that is drawn in the scene: committed shapes (on their planes, always), and,
 *  in the sketch view, the shape being drawn, placed points, inference guides and the snap marker. */
function rebuildSketchViz() {
  sketchDirty = false;
  clearGroup(sketchGroup);
  const th = T();
  const ink = toHex(th.sketchInk);
  const halo = toHex(th.sketchHalo);
  const SK = S.sketch;
  for (const plane of Object.keys(PLANES)) {
    for (const e of store.entities(plane)) {
      const o = outline(e);
      const pts = o.pts.map((p) => toWorld(plane, p));
      const sel = plane === session.plane && e.id === session.selectedId;
      if (o.closed) sketchGroup.add(fillShape(plane, o.pts, ink, SK.regionFill));
      sketchGroup.add(stroke(pts, { color: halo, width: SK.haloWidthPx * (sel ? 1.5 : 1), closed: o.closed, order: 4 }));
      sketchGroup.add(stroke(pts, { color: ink, width: SK.lineWidthPx * (sel ? 1.7 : 1), closed: o.closed, order: 5 }));
    }
  }
  if (!inSketchView() || session.tool === "select") return;
  const plane = session.plane;
  const k = 1 / pxPerMm();
  const d = session.draftShape();
  if (d) {
    const o = outline(d);
    if (d.type === "rect") sketchGroup.add(fillShape(plane, o.pts, ink, SK.regionFill * 0.6));
    const pts = o.pts.map((p) => toWorld(plane, p));
    sketchGroup.add(stroke(pts, { color: halo, width: SK.haloWidthPx, closed: o.closed, order: 6, alpha: 0.9 }));
    sketchGroup.add(stroke(pts, { color: ink, width: SK.lineWidthPx, closed: o.closed, order: 7, alpha: 0.8 }));
    for (const p of session.draft.pts) {
      sketchGroup.add(disc(plane, p, (SK.markerPx + 2) * k, halo, 8));
      sketchGroup.add(disc(plane, p, SK.markerPx * k, ink, 9));
    }
  }
  const info = session.snapInfo;
  if (info && session.cursor) {
    for (const gd of info.guides) {
      const line = gd.axis === "v" ? [[gd.value, -2000], [gd.value, 2000]] : [[-2000, gd.value], [2000, gd.value]];
      sketchGroup.add(stroke(line.map((p) => toWorld(plane, p)), { color: ink, width: 1.4, order: 6, alpha: 0.55, dashed: true }));
    }
    if (info.kind !== "free") {
      const s = SK.snapSquarePx * k;
      const [x, y] = info.point;
      const sq = [[x - s, y - s], [x + s, y - s], [x + s, y + s], [x - s, y + s]].map((p) => toWorld(plane, p));
      sketchGroup.add(stroke(sq, { color: halo, width: 5, closed: true, order: 8 }));
      sketchGroup.add(stroke(sq, { color: ink, width: 2, closed: true, order: 9 }));
    }
  }
}

// ---------------------------------------------------------------- status text (the only text on screen besides the typing field)
let flash = null; // a short message that replaces the status for a moment (e.g. why a click was ignored)
function flashMessage(text) {
  flash = text;
  updateStatus();
  setTimeout(() => ((flash = null), updateStatus()), 2600);
}
function updateStatus() {
  let text = "3D view   hover a plane and click it to sketch   right-click for the menu";
  if (flash) text = flash;
  else if (selected) text = inSketchView() ? `Sketching on ${selected}   ${session.prompt()}` : `Going to ${selected}...`;
  $("statusText").textContent = text;
  $("exitBtn").style.display = selected && !flash ? "inline-block" : "none";
}

// ---------------------------------------------------------------- picking
/** Looking straight at the selected plane = sketch view. Anything else (orbited away, or nothing selected) = 3D view. */
const inSketchView = () => !!selected && isNormal(view, selected, V.normalToleranceRad);
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function setRay(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  applyCamera();
  raycaster.setFromCamera(ndc, camera);
}
function pickAt(clientX, clientY) {
  setRay(clientX, clientY);
  return pickPlane(raycaster.ray.origin.toArray(), raycaster.ray.direction.toArray(), { maxDist: view.dist * F.farFactor, minCos: G.grazeMinCos, only: inSketchView() ? selected : null });
}
/** The point under the cursor on the sketch plane, in local (u, v) mm. */
function localPoint(clientX, clientY) {
  if (!selected) return null;
  const hit = pickPlane(...((setRay(clientX, clientY), [raycaster.ray.origin.toArray(), raycaster.ray.direction.toArray()])), { minCos: 1e-3, only: selected });
  return hit ? [hit.point[PLANES[selected].u], hit.point[PLANES[selected].v]] : null;
}

// ---------------------------------------------------------------- actions (shared by hotkeys and the right-click menu)
let prePose = null; // the 3D camera pose to return to when leaving the sketch
function enterSketch(plane, tool = "select") {
  if (!selected) prePose = { a: view.a, e: view.e, dist: view.dist, target: view.target.clone() };
  selected = plane;
  session.setPlane(plane);
  session.setTool(tool);
  goNormal(plane);
  hovered = null;
  updateStatus();
  markSketch();
}
/** Leave the sketch. With animate, the camera glides back to the 3D view it came from (or a default oblique view if that
 *  was already face-on); orbiting out does not animate (the user is steering). */
function exitSketch(animate = false) {
  const plane = selected;
  selected = null;
  session.reset();
  if (animate && plane) {
    const back = prePose && !isNormal(prePose, plane, V.normalToleranceRad) ? prePose : { a: V.homeAzimuth, e: V.homeElevation, dist: view.dist, target: view.target.clone() };
    animateTo({ a: back.a, e: back.e, target: back.target }, V.transitionMs);
    view.dist = back.dist;
  }
  updateStatus();
  updateReadout();
  markSketch();
}
function setTool(tool) {
  if (inSketchView()) {
    session.setTool(tool);
  } else if (!selected && hovered) {
    enterSketch(hovered, tool); // hotkey while hovering a plane in the 3D view: start sketching on it with that tool
  } else return false;
  updateStatus();
  updateReadout();
  markSketch();
  return true;
}
function doUndo() {
  if (session.draft || session.entry) return session.escape(), updateStatus(), updateReadout(), markSketch();
  const cmd = store.undo();
  if (cmd && session.selectedId && !store.entities(session.plane ?? "XY").some((e) => e.id === session.selectedId)) session.selectedId = null;
  markSketch();
  return cmd;
}
function doRedo() {
  store.redo();
  markSketch();
}
function doEscape() {
  if (menuOpen()) return hideMenu();
  if (!inSketchView()) return selected ? exitSketch(true) : undefined;
  if (!session.escape()) exitSketch(true);
  updateStatus();
  updateReadout();
  markSketch();
}
const ACTIONS = {
  select: () => setTool("select"),
  line: () => setTool("line"),
  rect: () => setTool("rect"),
  circle: () => setTool("circle"),
  home: () => goHome(),
  undo: () => doUndo(),
  redo: () => doRedo(),
  cancel: () => doEscape(),
  delete: () => (inSketchView() && session.deleteSelected() ? (updateStatus(), markSketch()) : false),
  extrude: () => flashMessage("Extrude comes in the next stage"),
  dimension: () => flashMessage("Dimensions come after extrude"),
};

// ---------------------------------------------------------------- the typing field next to the cursor
let lastPointer = { x: 0, y: 0 };
function updateReadout() {
  const el = $("readout");
  const segs = inSketchView() && session.tool !== "select" ? session.readout() : [];
  el.replaceChildren();
  if (!segs.length) return void (el.style.display = "none");
  for (const s of segs) {
    const span = document.createElement("span");
    span.className = `f${s.active ? " act" : ""}${s.invalid ? " bad" : ""}${s.typed ? " typed" : ""}`;
    const b = document.createElement("b");
    b.textContent = s.label;
    span.append(b, ` ${s.text}`);
    el.appendChild(span);
  }
  el.style.display = "block";
  el.style.left = `${lastPointer.x + 18}px`;
  el.style.top = `${lastPointer.y + 18}px`;
}

// ---------------------------------------------------------------- right-click menu (no permanent toolbar)
const menuEl = $("menu");
const menuOpen = () => menuEl.style.display === "block";
function hideMenu() {
  menuEl.style.display = "none";
}
function menuItems() {
  const K = S.input.keys;
  const key = (a) => [].concat(K[a])[0].replace("mod", "Ctrl").replace(/\b\w/g, (c) => c.toUpperCase()).replace("Escape", "Esc");
  const items = [];
  if (inSketchView()) {
    for (const [label, a] of [["Select", "select"], ["Line", "line"], ["Rectangle", "rect"], ["Circle", "circle"]]) items.push({ label, hint: key(a), run: ACTIONS[a], on: session.tool === a });
    items.push("sep");
  } else if (!selected && hovered) {
    items.push({ label: `Sketch on ${hovered} plane`, hint: "click", run: () => enterSketch(hovered) }, "sep");
  }
  items.push({ label: "Undo", hint: key("undo"), run: ACTIONS.undo, off: !store.canUndo() }, { label: "Redo", hint: key("redo"), run: ACTIONS.redo, off: !store.canRedo() }, "sep");
  items.push({ label: "Home view", hint: key("home"), run: ACTIONS.home });
  if (selected) items.push({ label: "Back to 3D view", hint: key("cancel"), run: () => exitSketch(true) });
  return items;
}
function showMenu(x, y) {
  menuEl.replaceChildren();
  for (const it of menuItems()) {
    if (it === "sep") {
      menuEl.appendChild(Object.assign(document.createElement("hr")));
      continue;
    }
    const b = document.createElement("button");
    b.className = it.on ? "on" : "";
    b.disabled = !!it.off;
    b.innerHTML = `<span></span><kbd></kbd>`;
    b.firstChild.textContent = it.label;
    b.lastChild.textContent = it.hint ?? "";
    b.addEventListener("click", () => (hideMenu(), it.run()));
    menuEl.appendChild(b);
  }
  menuEl.style.display = "block";
  const r = menuEl.getBoundingClientRect();
  menuEl.style.left = `${Math.min(x, innerWidth - r.width - 8)}px`;
  menuEl.style.top = `${Math.min(y, innerHeight - r.height - 8)}px`;
}

// ---------------------------------------------------------------- mouse input
const preset = () => S.input.navPresets[S.input.navPreset];
let g = null; // the gesture in progress: { kind: "orbit" | "pan" | "draw" | "click", x, y, x0, y0, button, moved }
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("pointerdown", (ev) => {
  hideMenu();
  canvas.setPointerCapture(ev.pointerId);
  const nav = navAction(ev, preset());
  const base = { x: ev.clientX, y: ev.clientY, x0: ev.clientX, y0: ev.clientY, button: ev.button, moved: false };
  if (nav) return void (g = { kind: nav, ...base });
  if (ev.button !== 0) return;
  if (selected && !inSketchView()) return; // gliding to the plane: ignore clicks until it is face-on
  if (!inSketchView()) return void (g = { kind: "click", ...base }); // a click picks a plane; a drag orbits
  const p = localPoint(ev.clientX, ev.clientY);
  if (!p) return;
  session.scale = pxPerMm();
  if (session.tool === "select") return void (g = { kind: "selectclick", p, shift: ev.shiftKey, ...base }); // a click selects; a drag orbits
  const had = !!session.draft;
  const msg = session.click(p, { shift: ev.shiftKey });
  if (msg) flashMessage(msg);
  // press-and-drag also draws a rectangle or circle: if this press started the shape, releasing far away finishes it
  if (!had && session.draft && (session.tool === "rect" || session.tool === "circle")) g = { kind: "draw", ...base };
  updateStatus();
  updateReadout();
  markSketch();
});
canvas.addEventListener("pointermove", (ev) => {
  lastPointer = { x: ev.clientX, y: ev.clientY };
  if (g && (g.kind === "orbit" || g.kind === "pan" || g.kind === "click" || g.kind === "selectclick")) {
    if (!g.moved && Math.hypot(ev.clientX - g.x0, ev.clientY - g.y0) < V.clickMovePx) return;
    if (g.kind === "click" || g.kind === "selectclick") g.kind = "orbit"; // dragging with the left button and no tool action: orbit
    g.moved = true;
    anim = null; // the user took over the camera
    const dx = ev.clientX - g.x;
    const dy = ev.clientY - g.y;
    g.x = ev.clientX;
    g.y = ev.clientY;
    if (g.kind === "pan") {
      const k = (2 * view.dist * Math.tan(THREE.MathUtils.degToRad(V.fovDeg / 2))) / canvas.clientHeight;
      const m = camera.matrixWorld.elements;
      view.target.x += -m[0] * dx * k + m[4] * dy * k;
      view.target.y += -m[1] * dx * k + m[5] * dy * k;
      view.target.z += -m[2] * dx * k + m[6] * dy * k;
    } else {
      view.a -= dx * V.orbitRadPerPx;
      view.e = clamp(view.e + dy * V.orbitRadPerPx, -Math.PI / 2, Math.PI / 2);
      if (selected && !isNormal(view, selected, V.normalToleranceRad)) exitSketch(false); // orbiting out of the face-on view = back to the 3D view
    }
    updateStatus();
    markSketch();
    return;
  }
  if (inSketchView()) {
    const p = localPoint(ev.clientX, ev.clientY);
    if (p && session.tool !== "select") {
      session.scale = pxPerMm();
      session.move(p, { shift: ev.shiftKey });
      updateReadout();
      markSketch();
    }
    canvas.style.cursor = session.tool === "select" ? "default" : "crosshair";
    return;
  }
  if (g) return;
  const h = selected ? null : pickAt(ev.clientX, ev.clientY)?.plane ?? null;
  if (h !== hovered) {
    hovered = h;
    canvas.style.cursor = h ? "pointer" : "default";
    requestRender();
  }
});
canvas.addEventListener("pointerup", (ev) => {
  const was = g;
  g = null;
  if (!was) return;
  if (was.kind === "orbit" && !was.moved && was.button === 2) return void showMenu(ev.clientX, ev.clientY); // right-click without dragging
  if (was.kind === "draw" && session.draft && Math.hypot(ev.clientX - was.x0, ev.clientY - was.y0) >= S.sketch.dragFinishPx) {
    const p = localPoint(ev.clientX, ev.clientY);
    if (p) {
      session.scale = pxPerMm();
      session.click(p, { shift: ev.shiftKey });
      updateStatus();
      updateReadout();
      markSketch();
    }
    return;
  }
  if (was.kind === "selectclick" && !was.moved) {
    session.click(was.p, { shift: was.shift });
    updateStatus();
    markSketch();
    return;
  }
  if (was.kind === "click" && !was.moved && !selected) {
    const hit = pickAt(ev.clientX, ev.clientY);
    if (hit) enterSketch(hit.plane);
  }
});
canvas.addEventListener("pointerleave", () => {
  if (hovered) (hovered = null), requestRender();
});
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const oldDist = view.dist;
    const newDist = clamp(oldDist * Math.exp(e.deltaY * (e.ctrlKey ? S.input.pinchZoomPerWheel : V.zoomPerWheel)), V.minDistance, V.maxDistance);
    if (S.input.zoomToCursor) {
      // Keep the point under the cursor fixed on screen. Prefer the plane point you are pointing at; otherwise the point
      // on the camera-facing plane through the target. Any point on the cursor ray works for the math below.
      const planeHit = pickAt(e.clientX, e.clientY);
      let P = planeHit ? new THREE.Vector3(...planeHit.point) : null;
      if (!P) {
        const n = camera.getWorldDirection(new THREE.Vector3());
        const denom = raycaster.ray.direction.dot(n);
        if (Math.abs(denom) > 1e-6) P = raycaster.ray.origin.clone().addScaledVector(raycaster.ray.direction, view.target.clone().sub(raycaster.ray.origin).dot(n) / denom);
      }
      if (P) {
        const offset = view.target.clone().sub(P); // computed BEFORE the target is overwritten
        view.target.copy(P).addScaledVector(offset, newDist / oldDist);
      }
    }
    view.dist = newDist;
    markSketch();
  },
  { passive: false },
);
$("exitBtn").addEventListener("click", () => exitSketch(true));
addEventListener("pointerdown", (ev) => {
  if (menuOpen() && !menuEl.contains(ev.target)) hideMenu();
});

// ---------------------------------------------------------------- keyboard
addEventListener("keydown", (e) => {
  const el = e.target;
  if (el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && ["text", "number", "search"].includes(el.type))) {
    if (e.key === "Escape") el.blur(); // typing in the tuning panel: Esc hands the keyboard back to the view
    return;
  }
  if (el instanceof HTMLElement && el !== document.body && !(el instanceof HTMLCanvasElement)) el.blur?.(); // sliders, colors and buttons never keep the keyboard
  // while a shape is being drawn, characters, Backspace, Tab and Enter belong to the typed-size field
  if (inSketchView() && session.draft && !e.ctrlKey && !e.metaKey) {
    if (e.key.length === 1 && session.type(e.key)) return e.preventDefault(), updateStatus(), updateReadout(), markSketch();
    if (e.key === "Backspace" && session.backspace()) return e.preventDefault(), updateStatus(), updateReadout(), markSketch();
    if (e.key === "Tab" && session.tab(e.shiftKey)) return e.preventDefault(), updateReadout(), markSketch();
    if (e.key === "Enter") {
      e.preventDefault();
      const r = session.enter();
      if (typeof r === "string") flashMessage(r);
      updateStatus();
      updateReadout();
      markSketch();
      return;
    }
  }
  const action = keyAction(e, S.input.keys);
  if (!action) return;
  if (action === "cancel" || action === "undo" || action === "redo" || action === "home" || action === "delete") e.preventDefault();
  ACTIONS[action]?.();
});

// ---------------------------------------------------------------- boot
if (new URLSearchParams(location.search).has("tune")) {
  initTuning({
    S, applyTheme, requestRender, getThemeName: () => themeName, setThemeName: (n) => ((themeName = n), applyTheme()),
    view3D: () => (selected ? exitSketch(true) : goHome()),
    sketchOn: (plane) => enterSketch(plane),
    pinHover: (plane) => ((pinnedHover = plane), requestRender()),
    addTestBoxes: () => window.__ui.addTestBox(25, 10, -14, 30, 24, 20) || window.__ui.addTestBox(-30, -20, 18, 14, 14, 36),
  });
}
applyTheme();
resize();
updateStatus();
// Hooks for the automated browser check (not used by the UI).
window.__ui = {
  session,
  store,
  inSketchView: () => inSketchView(),
  menuOpen: () => menuOpen(),
  state: () => ({ selected, hovered, tool: session.tool, draft: session.draft && session.draft.pts.length, selectedEntity: session.selectedId, a: view.a, e: view.e, dist: view.dist, target: view.target.toArray(), normal: selected ? isNormal(view, selected, V.normalToleranceRad) : null, animating: !!anim }),
  settings: S,
  addTestBox: (x, y, z, w, d, h) => {
    const light = new THREE.DirectionalLight(0xffffff, 2);
    light.position.set(30, -40, 60);
    scene.add(light, new THREE.AmbientLight(0xffffff, 0.8));
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, d, h), new THREE.MeshLambertMaterial({ color: 0x8a6f4d }));
    box.position.set(x, y, z);
    scene.add(box);
    requestRender();
  },
  pickAt,
  setView: ({ a, e, dist }) => ((view.a = a ?? view.a), (view.e = e ?? view.e), (view.dist = dist ?? view.dist), requestRender()),
  worldToScreen(x, y, z) {
    applyCamera();
    const v = new THREE.Vector3(x, y, z).project(camera);
    const r = canvas.getBoundingClientRect();
    return [r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height];
  },
};
