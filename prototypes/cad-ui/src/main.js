// 3D view with infinite XYZ planes in paper gray and charcoal (no blue), with distance fog; the world axes keep their
// colors. Click a plane: it becomes the sketch plane and the camera goes face-on to it. Orbiting away drops the sketch
// plane (back to the 3D view, where any plane can be hovered and clicked). Sketching and extruding come next.
import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { settings as S } from "./settings.js";
import { SketchStore } from "./sketchstore.mjs";
import { SketchSession } from "./interaction.mjs";
import { navAction, keyAction } from "./keymap.mjs";
import { circlePolygon, regionsOf, paramOnAxisFromRay } from "./sketch.mjs";
import { ExtrudeSession } from "./extrude.mjs";
import { buildGraph } from "./features.mjs";
import { createBody } from "./body.js";
import { PLANES, planeDef, addFacePlane, basisOf, frameOf, shortest, cameraOffset, cameraUp, clamp, easeInOut, isNormal, projectOnto, pickPlane } from "./viewmath.mjs";

const $ = (id) => document.getElementById(id);
const G = S.grid;
const V = S.view;
const F = S.fog; // world fog (objects)
const A = S.sheetArea; // how far a sheet's light, grid and axes reach
let themeName = S.themeName;
const T = () => S.themes[themeName];
const toHex = (c) => (Math.round(c[0] * 255) << 16) | (Math.round(c[1] * 255) << 8) | Math.round(c[2] * 255);

// ---------------------------------------------------------------- state
const view = { a: V.homeAzimuth, e: V.homeElevation, dist: V.homeDistance, target: new THREE.Vector3() };
let selected = null; // "XY" | "XZ" | "YZ" | null  (non-null = sketch mode)
let hovered = null;
let pinnedHover = null; // tuning only: keep a plane's preview showing without the mouse
let pinnedStyle = "hover"; // ...in the "hover" or the "selected" look
let anim = null;

// ---------------------------------------------------------------- renderer, camera
const canvas = $("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.autoClear = false;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x000000, 1, 1000); // world fog for objects; near/far follow the camera distance each frame (see updatePlanes)
const persp = new THREE.PerspectiveCamera(V.fovDeg, 1, 0.1, 1000);
const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000); // used face-on to a plane: no perspective, so the plane is seen flat
let camera = persp;
let aspect = 1;

function applyCamera() {
  const o = cameraOffset(view.a, view.e);
  const up = cameraUp(view.a, view.e);
  const useOrtho = !!selected && !extrude && isNormal(view, selected, V.normalToleranceRad);
  camera = useOrtho ? ortho : persp;
  camera.position.set(view.target.x + view.dist * o[0], view.target.y + view.dist * o[1], view.target.z + view.dist * o[2]);
  camera.up.set(up[0], up[1], up[2]);
  camera.lookAt(view.target);
  camera.near = Math.max(0.01, view.dist * V.nearFactor);
  camera.far = view.dist * V.farFactor + 100;
  if (useOrtho) {
    // same visible height at the target as the perspective view, so nothing jumps when switching
    const h = view.dist * Math.tan(THREE.MathUtils.degToRad(V.fovDeg / 2));
    ortho.left = -h * aspect;
    ortho.right = h * aspect;
    ortho.top = h;
    ortho.bottom = -h;
  } else {
    persp.fov = V.fovDeg;
    persp.aspect = aspect;
  }
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
uniform float uLineA; uniform float uBright; uniform float uOpacity; uniform float uAxisA;
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
  // Paint layer: the sheet's color at the chosen opacity, so opacity says how much of what is behind it is hidden.
  gl_FragColor = vec4(uCol, uOpacity * fog);
#elif PASS == 1
  // Glow layer (brightness): light added with "screen" blending, out = light + behind * (1 - light). It brightens what is
  // behind the sheet without clipping it to white, so a bright sheet can still be see-through. Independent of opacity.
  gl_FragColor = vec4(min(uCol * uBright * fog, vec3(1.0)), 1.0);
#else
  float a = grid * uLineA * fog;                                      // grid lines
  float ax = max(axU, axV) * uAxisA * axFog;                          // world axis lines
  vec3 col = mix(uLineCol, mix(uColU, uColV, step(axU, axV)), step(a, ax)); // an axis line wins where it is stronger
  gl_FragColor = vec4(col, max(a, ax));
#endif
}`;

const planeMeshes = {}; // name -> { paint, glow, lines, back }
const backdropScene = new THREE.Scene(); // the cream sheets: drawn first, then the scene over them, so a sheet never covers an object
for (const [name, def] of Object.entries(PLANES)) {
  const axisCol = [T().axisX, T().axisY, T().axisZ];
  const makeMat = (pass) => new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    defines: { PASS: pass },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    ...(pass === 1
      ? { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcColorFactor } // screen: light + dst * (1 - light)
      : {}),
    uniforms: {
      uCam: { value: new THREE.Vector3() }, uDist: { value: 1 },
      uAxis: { value: def.axis }, uCol: { value: new THREE.Vector3(...T().sheet) },
      uColU: { value: new THREE.Vector3(...axisCol[def.u]) }, uColV: { value: new THREE.Vector3(...axisCol[def.v]) },
      uLineA: { value: 0 }, uBright: { value: 0 }, uOpacity: { value: 0 }, uAxisA: { value: G.axisAlpha },
      uLodDiv: { value: G.lodDivisor }, uStyleMin: { value: G.fineLineStrength }, uFineMul: { value: 0 }, uMinCellPx: { value: G.minCellPx },
      uLineCol: { value: new THREE.Vector3() },
      uFogNear: { value: A.nearFactor }, uFogFar: { value: A.farFactor }, uAxisFogFar: { value: A.axisFarFactor }, uFogK: { value: A.sharpness },
      uAxisW: { value: G.axisWidthPx },
    },
  });
  const geo = new THREE.PlaneGeometry(1, 1);
  const paint = new THREE.Mesh(geo, makeMat(0));
  const glow = new THREE.Mesh(geo, makeMat(1));
  const lines = new THREE.Mesh(geo, makeMat(2));
  paint.renderOrder = 1;
  glow.renderOrder = 2;
  lines.renderOrder = 3;
  for (const mesh of [paint, glow, lines]) {
    if (def.axis === 1) mesh.rotation.x = Math.PI / 2;
    if (def.axis === 0) mesh.rotation.y = Math.PI / 2;
    mesh.frustumCulled = false;
    scene.add(mesh);
  }
  const back = new THREE.Mesh(geo, makeMat(0));
  back.material.depthTest = false;
  back.frustumCulled = false;
  if (def.axis === 1) back.rotation.x = Math.PI / 2;
  if (def.axis === 0) back.rotation.y = Math.PI / 2;
  backdropScene.add(back);
  planeMeshes[name] = { paint, glow, lines, back };
}

/** Keep each plane's quad centered on the target (projected onto the plane) and sized to the view, so it looks
 *  infinite and vertex positions stay small (float precision). Grid lines are in world coordinates. */
const mix3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
/** How a plane looks right now: the selected plane shows fully, the hovered plane previews, the rest are hidden. */
function stateOf(name) {
  const states = T().states;
  const pinned = pinnedHover && !selected && pinnedHover === name;
  const selBase = selected ? planeDef(selected).base ?? selected : null; // a face plane shows the sheet of its own orientation
  return selBase === name ? states.selected : pinned ? states[pinnedStyle] : hovered === name && !pinnedHover ? states.hover : states.base;
}
/** Is this plane the one being sketched on or pointed at? (Its surface and lines lean blue.) */
const hotOf = (plane) => plane === selected || plane === hovered || (!!pinnedHover && !selected && plane === pinnedHover);
function updatePlanes() {
  scene.fog.near = view.dist * F.nearFactor;
  scene.fog.far = view.dist * F.farFactor;
  const B = S.backdrop;
  const th = T();
  for (const [name, pair] of Object.entries(planeMeshes)) {
   const state = stateOf(name);
   const shown = state.line > 0 || state.bright > 0 || state.opacity > 0;
   const sheet = mix3(th.sheet, th.blueSurface, state.blue);
   const lineCol = mix3(th.gridLine, th.blueLine, Math.min(1, state.blue * 3));
   const ax = PLANES[name].axis;
   const off = selected && (planeDef(selected).base ?? selected) === name ? planeDef(selected).offset ?? 0 : 0; // sketching on a face: the sheet sits on that face
   const side = Math.sign(camera.position.getComponent(ax) - off) || 1;
   pair.back.visible = B.enabled;
   for (const mesh of [pair.paint, pair.glow, pair.lines, pair.back]) {
    const c = projectOnto(name, view.target.toArray());
    mesh.position.set(c[0], c[1], c[2]);
    mesh.position.setComponent(ax, off);
    if (mesh === pair.back) mesh.position.setComponent(ax, off - side * view.dist * B.offsetFactor); // behind the plane, seen from the camera
    mesh.scale.setScalar(view.dist * G.extentFactor);
    const u = mesh.material.uniforms;
    u.uCam.value.copy(camera.position);
    u.uDist.value = view.dist;
    u.uLodDiv.value = G.lodDivisor;
    u.uStyleMin.value = G.fineLineStrength;
    u.uMinCellPx.value = G.minCellPx;
    u.uAxisW.value = G.axisWidthPx;
    u.uAxisA.value = G.axisAlpha;
    u.uFogNear.value = A.nearFactor;
    u.uFogFar.value = A.farFactor;
    u.uAxisFogFar.value = A.axisFarFactor;
    u.uFogK.value = mesh === pair.back ? A.sharpness * B.fogScale : A.sharpness;
    u.uCol.value.set(...sheet);
    u.uLineCol.value.set(...lineCol);
    u.uLineA.value = state.line;
    u.uFineMul.value = state.fine; // the densest grid level is only shown on the sketch plane
    if (B.enabled) {
      u.uBright.value = 0;
      u.uOpacity.value = mesh === pair.back ? (shown ? B.alpha : 0) : mesh === pair.paint && shown ? B.planeOpacity : 0;
    } else {
      u.uBright.value = state.bright;
      u.uOpacity.value = mesh === pair.back ? 0 : state.opacity;
    }
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
  scene.fog.color.setHex(t.background); // the fog is the world color itself
  document.documentElement.style.setProperty("--bg", `#${t.background.toString(16).padStart(6, "0")}`);
  document.documentElement.style.setProperty("--fg", t.text);
  for (const [name, pair] of Object.entries(planeMeshes)) {
    for (const mesh of [pair.paint, pair.glow, pair.lines]) {
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
    body.updateLights(camera, view.target, view.dist);
    updatePlanes();
    renderer.setViewport(0, 0, w, h);
    renderer.clear();
    if (inSketchView() !== sketchWasFlat) (sketchWasFlat = inSketchView()), (sketchDirty = true);
    if (sketchDirty) rebuildSketchViz();
    if (S.backdrop.enabled) {
      renderer.render(backdropScene, camera);
      renderer.clearDepth();
    }
    updateAxisArrows();
    updateOriginPill();
    updateDims();
    syncBody();
    updateExtrudeViz();
    renderer.render(scene, camera);
  });
}
function resize() {
  renderer.setPixelRatio(devicePixelRatio);
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  aspect = canvas.clientWidth / canvas.clientHeight;
  requestRender();
}
addEventListener("resize", resize);

// ---------------------------------------------------------------- camera animation
function animateTo({ a, e, target, dist }, ms) {
  const from = { a: view.a, e: view.e, target: view.target.clone(), dist: view.dist };
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
    if (dist !== undefined) view.dist = from.dist + (dist - from.dist) * m;
    updateStatus();
    requestRender();
    if (k < 1) requestAnimationFrame(step);
    else (anim = null), refreshHover();
  };
  requestAnimationFrame(step);
}

function goNormal(plane) {
  const def = planeDef(plane);
  animateTo({ a: def.view.a, e: def.view.e, target: new THREE.Vector3(...projectOnto(plane, view.target.toArray())) }, V.transitionMs);
}
/** Return to the origin: the camera target glides back to (0, 0, 0), keeping the viewing direction (so a sketch stays face-on),
 *  and the distance is brought into a sensible range. */
function returnToOrigin() {
  const dist = clamp(view.dist, S.view.originMinDistance, S.view.originMaxDistance);
  animateTo({ a: view.a, e: view.e, target: new THREE.Vector3(), dist }, V.transitionMs);
}
/** Is the origin lost? (fogged out, or far from where you are looking and off screen) */
function originInfo() {
  const dc = camera.position.length();
  const t = Math.max(dc - view.dist * A.nearFactor, 0) / (view.dist * (A.axisFarFactor - A.nearFactor));
  const fog = Math.exp(-A.sharpness * t * t);
  const p = new THREE.Vector3().project(camera);
  const off = p.z > 1 || Math.abs(p.x) > 1.05 || Math.abs(p.y) > 1.05;
  const far = view.target.length() > S.view.originFarFactor * view.dist;
  return { fog: +fog.toFixed(3), off, awayMm: Math.round(view.target.length()), lost: fog < S.view.originLostFog || (off && far) };
}
function updateOriginPill() {
  const info = originInfo();
  const tooClose = view.dist < V.extremeNear;
  const tooFar = view.dist > V.extremeFar;
  const btn = $("originBtn");
  const label = info.lost ? "Origin is far away: return (O)" : tooClose ? "Zoomed very close: reset view (O)" : tooFar ? "Zoomed very far out: reset view (O)" : "";
  if (btn.textContent !== label && label) btn.textContent = label;
  const show = label ? "inline-block" : "none";
  if (btn.style.display !== show) btn.style.display = show;
}
/** The spacing of the main grid lines at the current zoom, as text (so you always know the scale you are looking at). */
function gridScaleText() {
  const spacing = 10 ** (Math.floor(Math.log10(view.dist / G.lodDivisor)) + 1);
  return spacing >= 1000 ? `${spacing / 1000} m` : spacing >= 1 ? `${spacing} mm` : `${+spacing.toPrecision(2)} mm`;
}
function goHome() {
  exitSketch();
  animateTo({ a: V.homeAzimuth, e: V.homeElevation, target: new THREE.Vector3() }, V.transitionMs);
}

// ---------------------------------------------------------------- sketch model + drawing in the scene
const store = new SketchStore();
const session = new SketchSession(S, store);
/** The point of a plane where the world origin projects onto it (local (0, 0)); planes are axis-aligned, so only one coordinate is non-zero. */
const originOf = (plane) => {
  const d = planeDef(plane);
  return new THREE.Vector3().setComponent(d.axis, d.offset ?? 0);
};
const toWorld = (plane, [u, v]) => {
  const [U, W] = basisOf(plane);
  return originOf(plane).add(new THREE.Vector3(U[0] * u + W[0] * v, U[1] * u + W[1] * v, U[2] * u + W[2] * v));
};
const basisMatrix = (plane, at = originOf(plane)) => {
  const [U, W, N] = basisOf(plane);
  return new THREE.Matrix4().makeBasis(new THREE.Vector3(...U), new THREE.Vector3(...W), new THREE.Vector3(...N)).setPosition(at);
};
const sketchGroup = new THREE.Group();
const body = createBody(scene, S, () => T());
body.request({ params: {}, ops: [] }); // warms the geometry kernel up (it is a large download)
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
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: alpha, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  mesh.matrixAutoUpdate = false;
  mesh.matrix.copy(basisMatrix(plane));
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
/** Has this sketch shape been extruded? (Then the body shows it; only unextruded closed shapes get a see-through face.) */
const isExtruded = (plane, e) => {
  const { id, ...shape } = e;
  const k = JSON.stringify(shape);
  return store.features.some((f) => f.plane === plane && JSON.stringify(f.shape) === k);
};
let sketchWasFlat = false;
function rebuildSketchViz() {
  buildSketchViz();
  if (inSketchView()) sketchGroup.traverse((o) => o.material && (o.material.depthTest = false)); // drawing on a plane: your lines stay visible even with a body in front
}
function buildSketchViz() {
  sketchDirty = false;
  clearGroup(sketchGroup);
  const th = T();
  const ink = toHex(th.sketchInk);
  const halo = toHex(th.sketchHalo);
  const SK = S.sketch;
  const cream = th.sheet;
  for (const plane of Object.keys(store.sketches)) {
    const blue = hotOf(plane) ? SK.lineBlue : 0; // a hovered or selected plane leans blue
    const inkC = toHex(mix3(th.sketchInk, th.blueInk, blue));
    const haloC = toHex(mix3(th.sketchHalo, th.blueHalo, blue));
    for (const e of store.entities(plane)) {
      const o = outline(e);
      const pts = o.pts.map((p) => toWorld(plane, p));
      const sel = plane === session.plane && e.id === session.selectedId;
      const hov = plane === session.plane && session.tool === "extrude" && e.id === session.hoverId;
      if (o.closed && !isExtruded(plane, e)) sketchGroup.add(fillShape(plane, o.pts, toHex(mix3(cream, th.blueSurface, hov ? SK.regionHoverBlue : 0)), SK.regionFill));
      sketchGroup.add(stroke(pts, { color: haloC, width: SK.haloWidthPx * (sel ? 1.5 : 1), closed: o.closed, order: 4 }));
      sketchGroup.add(stroke(pts, { color: inkC, width: SK.lineWidthPx * (sel ? 1.7 : 1), closed: o.closed, order: 5 }));
    }
  }
  if (!inSketchView() || session.tool === "select") return;
  const plane = session.plane;
  const k = 1 / pxPerMm();
  if (session.tool === "dimension") {
    session.scale = pxPerMm();
    for (const d of session.dims(SK.dimOffsetPx * k)) {
      const lines = [[d.a, d.b], ...d.ext];
      for (const [a, b] of lines) {
        const w = [toWorld(plane, a), toWorld(plane, b)];
        sketchGroup.add(stroke(w, { color: halo, width: SK.dimLineWidthPx + 3, order: 6, alpha: 0.85 }));
        sketchGroup.add(stroke(w, { color: ink, width: SK.dimLineWidthPx, order: 7, alpha: d.active ? 1 : 0.75 }));
      }
    }
    return;
  }
  const d = session.draftShape();
  if (d) {
    const o = outline(d);
    if (d.type === "rect") sketchGroup.add(fillShape(plane, o.pts, toHex(cream), SK.regionFill * 0.5));
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
    if (info.kind !== "free" && session.tool !== "dimension") {
      const s = SK.snapSquarePx * k;
      const [x, y] = info.point;
      const sq = [[x - s, y - s], [x + s, y - s], [x + s, y + s], [x - s, y + s]].map((p) => toWorld(plane, p));
      sketchGroup.add(stroke(sq, { color: halo, width: 5, closed: true, order: 8 }));
      sketchGroup.add(stroke(sq, { color: ink, width: 2, closed: true, order: 9 }));
    }
  }
}

// ---------------------------------------------------------------- extrude (pull a closed shape; positive adds, negative cuts)
let extrude = null; // { sess: ExtrudeSession, plane, centroid: [u, v], polygon }
const ghostGroup = new THREE.Group(); // instant preview prism, shown until the exact result arrives
const handleGroup = new THREE.Group(); // the arrow showing the pull
scene.add(ghostGroup, handleGroup);
const normalOf = (plane) => new THREE.Vector3(...basisOf(plane)[2]);
const effective = () => {
  const v = extrude.sess.value();
  return Number.isFinite(v) ? v : extrude.sess.distance;
};
/** The features as they would be right now, including the one being pulled. */
function currentFeatures() {
  const list = store.features.map((f) => (extrude && extrude.sess.featureId === f.id ? { ...f, distance: effective() } : f));
  if (extrude && !extrude.sess.featureId && !extrude.sess.isEmpty()) list.push({ id: "f_pending", plane: extrude.plane, shape: extrude.sess.shape, distance: effective() });
  return list;
}
let seenVersion = -1;
function syncBody() {
  body.request(buildGraph(currentFeatures()));
  if (store.version !== seenVersion) {
    seenVersion = store.version;
    updateHistory();
  }
}
function clearGroup2(g) {
  for (const c of [...g.children]) {
    c.geometry?.dispose();
    c.material?.dispose?.();
    g.remove(c);
  }
}
function updateExtrudeViz() {
  clearGroup2(ghostGroup);
  clearGroup2(handleGroup);
  if (!extrude) return;
  const th = T();
  const v = effective();
  const E = S.extrude;
  const n = normalOf(extrude.plane);
  const c0 = toWorld(extrude.plane, extrude.centroid);
  const empty = Math.abs(v) < E.minMm;
  const cut = extrude.sess.mode() === "cut";
  if (!empty && !body.fresh()) {
    const shape = new THREE.Shape(extrude.polygon.map(([u, w]) => new THREE.Vector2(u, w)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: Math.abs(v), bevelEnabled: false });
    if (v < 0) geo.translate(0, 0, -Math.abs(v));
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: cut ? th.cutColor : th.addColor, transparent: true, opacity: E.ghostOpacity, side: THREE.DoubleSide, depthWrite: false }));
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(basisMatrix(extrude.plane));
    ghostGroup.add(mesh);
  }
  const len = empty ? view.dist * E.handleFactor : Math.abs(v);
  const head = Math.min(len * 0.5, view.dist * E.handleFactor * 0.45);
  const arrow = new THREE.ArrowHelper(n.clone().multiplyScalar(empty || v >= 0 ? 1 : -1), c0, len, th.handleColor, head, head * 0.55);
  for (const m of [arrow.line, arrow.cone]) {
    m.material.depthTest = false;
    m.material.transparent = true;
    m.renderOrder = 20;
  }
  handleGroup.add(arrow);
}
function startExtrude({ plane, shape, polygon, centroid, featureId = null, distance = 0, hasBody }) {
  extrude = { sess: new ExtrudeSession(S, { plane, shape, distance, featureId, hasBody }), plane, polygon, centroid };
  session.setTool("select");
  const c = toWorld(plane, centroid);
  animateTo({ a: V.homeAzimuth, e: V.homeElevation, target: c }, S.extrude.tiltMs);
  refreshUI();
}
function startExtrudeFromRegion(region) {
  const { id, ...shape } = region.entity;
  startExtrude({ plane: selected, shape, polygon: region.polygon, centroid: region.centroid, hasBody: store.features.length > 0 });
}
function editFeature(id) {
  if (extrude) return;
  const at = store.features.findIndex((f) => f.id === id);
  if (at < 0) return;
  const f = store.features[at];
  const region = regionsOf([{ ...f.shape, id: f.id }])[0];
  if (!region) return;
  if (!selected) prePose = { a: view.a, e: view.e, dist: view.dist, target: view.target.clone() };
  selected = f.plane;
  session.setPlane(f.plane);
  setHover({ plane: null, face: null });
  startExtrude({ plane: f.plane, shape: f.shape, polygon: region.polygon, centroid: region.centroid, featureId: f.id, distance: f.distance, hasBody: at > 0 });
}
function commitExtrude() {
  const v = extrude.sess.value();
  if (!Number.isFinite(v)) return flashMessage("Check the typed number.");
  if (extrude.sess.isEmpty()) return cancelExtrude();
  const { sess, plane } = extrude;
  if (sess.featureId) store.updateFeature(sess.featureId, v);
  else store.addFeature(plane, sess.shape, v, frameOf(plane));
  extrude = null;
  exitSketch(false);
}
function cancelExtrude() {
  const { plane, sess } = extrude;
  extrude = null;
  if (sess.featureId) exitSketch(false);
  else {
    session.setTool("select");
    goNormal(plane); // back to drawing on the plane
  }
  refreshUI();
}
function deleteFeatureBeingEdited() {
  const id = extrude?.sess.featureId;
  if (!id) return false;
  extrude = null;
  store.removeFeature(id);
  exitSketch(false);
  return true;
}
/** Where the mouse is along the pull axis (mm from the shape's plane), or null. */
function pullParam(clientX, clientY) {
  setRay(clientX, clientY);
  return paramOnAxisFromRay({ o: raycaster.ray.origin.toArray(), v: raycaster.ray.direction.toArray() }, toWorld(extrude.plane, extrude.centroid).toArray(), normalOf(extrude.plane).toArray());
}
const refreshUI = () => (updateStatus(), updateReadout(), markSketch());

// ---------------------------------------------------------------- history list (top left, only when there is something in it)
function updateHistory() {
  const wrap = $("history");
  const list = $("histList");
  const fs = store.features;
  wrap.style.display = fs.length ? "block" : "none";
  $("histBtn").textContent = `History (${fs.length})`;
  list.replaceChildren();
  fs.forEach((f, i) => {
    const err = body.info.ops.find((o) => o.id === `x_${f.id}`)?.error;
    const b = document.createElement("button");
    const cut = f.distance < 0 && i > 0;
    b.className = err ? "err" : "";
    b.textContent = `${i + 1}  ${cut ? "Cut" : "Extrude"}  ${f.distance > 0 ? "+" : "−"}${Math.abs(Math.round(f.distance * 100) / 100)} mm  (${f.plane})${err ? "  failed" : ""}`;
    b.title = err ?? "Click to change the distance";
    b.onclick = () => editFeature(f.id);
    const li = document.createElement("li");
    li.appendChild(b);
    list.appendChild(li);
  });
}
$("histBtn").onclick = () => $("histList").classList.toggle("open");
body.onResult(() => (updateStatus(), updateHistory(), requestRender()));

// ---------------------------------------------------------------- status text (the only text on screen besides the typing field)
let flash = null; // a short message that replaces the status for a moment (e.g. why a click was ignored)
function flashMessage(text) {
  flash = text;
  updateStatus();
  setTimeout(() => ((flash = null), updateStatus()), 2600);
}
function updateStatus() {
  let text = "3D view   hover a plane or a face and click it to sketch   right-click for the menu";
  if (flash) text = flash;
  else if (extrude) text = `Extrude on ${extrude.plane}   ${extrude.sess.prompt()}`;
  else if (selected) text = inSketchView() ? `Sketching on ${selected}   ${session.prompt()}` : `Going to ${selected}...`;
  if (!body.ready() && (store.features.length || extrude)) text += "   (loading the geometry kernel...)";
  else if (body.info.error) text += `   [kernel: ${body.info.error}]`;
  $("statusText").textContent = text;
  $("scaleText").textContent = `grid ${gridScaleText()}`;
  $("exitBtn").style.display = selected && !flash && !extrude ? "inline-block" : "none";
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
let hoveredFace = null; // a flat face of the body under the cursor (3D view only): { start, count, axis, sign, offset }
/** What is under the cursor in the 3D view: the nearer of a body face and a base plane. */
function hoverAt(clientX, clientY) {
  const planeHit = pickAt(clientX, clientY);
  const faceHit = body.pick(raycaster.ray.origin, raycaster.ray.direction);
  if (faceHit && (!planeHit || faceHit.distance <= planeHit.t + 1e-6)) return { plane: null, face: faceHit.face };
  return { plane: planeHit?.plane ?? null, face: null };
}
function setHover({ plane, face }) {
  if (plane === hovered && face === hoveredFace) return false;
  hovered = plane;
  hoveredFace = face;
  body.setHighlight(face);
  canvas.style.cursor = plane || face ? "pointer" : "default";
  markSketch();
  return true;
}
/** The plane to sketch on for what is under the cursor (a face becomes a plane the first time it is used). */
const planeUnderCursor = () => (hoveredFace ? addFacePlane(hoveredFace, Math.round(view.a / (Math.PI / 2)) * (Math.PI / 2)) : hovered); // a horizontal face is drawn squared up to the nearest quarter turn
function pickAt(clientX, clientY) {
  setRay(clientX, clientY);
  return pickPlane(raycaster.ray.origin.toArray(), raycaster.ray.direction.toArray(), { maxDist: view.dist * A.farFactor, minCos: G.grazeMinCos, only: inSketchView() ? selected : null });
}
/** The point under the cursor on the sketch plane, in local (u, v) mm. */
function localPoint(clientX, clientY) {
  if (!selected) return null;
  const hit = pickPlane(...((setRay(clientX, clientY), [raycaster.ray.origin.toArray(), raycaster.ray.direction.toArray()])), { minCos: 1e-3, only: selected });
  if (!hit) return null;
  const [U, W] = basisOf(selected);
  return [hit.point[0] * U[0] + hit.point[1] * U[1] + hit.point[2] * U[2], hit.point[0] * W[0] + hit.point[1] * W[1] + hit.point[2] * W[2]];
}

// ---------------------------------------------------------------- actions (shared by hotkeys and the right-click menu)
let prePose = null; // the 3D camera pose to return to when leaving the sketch
function enterSketch(plane, tool = "select") {
  if (!selected) prePose = { a: view.a, e: view.e, dist: view.dist, target: view.target.clone() };
  selected = plane;
  session.setPlane(plane);
  session.setTool(tool);
  goNormal(plane);
  setHover({ plane: null, face: null });
  updateStatus();
  markSketch();
}
/** Leave the sketch. With animate, the camera glides back to the 3D view it came from (or a default oblique view if that
 *  was already face-on); orbiting out does not animate (the user is steering). */
/** Back in the 3D view: the plane under the mouse shows as hovered straight away (not only after the mouse moves). */
function refreshHover() {
  if (selected || !pointerSeen) return;
  setHover(hoverAt(lastPointer.x, lastPointer.y));
}
function exitSketch(animate = false) {
  const plane = selected;
  selected = null;
  session.reset();
  refreshHover();
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
  if (extrude) return false;
  if (inSketchView()) {
    session.setTool(tool);
  } else if (!selected && (hovered || hoveredFace)) {
    enterSketch(planeUnderCursor(), tool); // hotkey while hovering a plane in the 3D view: start sketching on it with that tool
  } else return false;
  updateStatus();
  updateReadout();
  markSketch();
  return true;
}
function doUndo() {
  if (extrude) return cancelExtrude();
  if (session.draft || session.entry || session.dimEdit) return session.escape(), updateStatus(), updateReadout(), markSketch();
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
  if (extrude) return cancelExtrude();
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
  origin: () => returnToOrigin(),
  undo: () => doUndo(),
  redo: () => doRedo(),
  cancel: () => doEscape(),
  delete: () => (extrude ? deleteFeatureBeingEdited() : inSketchView() && session.deleteSelected() ? (updateStatus(), markSketch()) : false),
  extrude: () => setTool("extrude"),
  dimension: () => setTool("dimension"),
};

// ---------------------------------------------------------------- dimension numbers (shown by the dimension tool)
const dimsEl = $("dims");
function updateDims() {
  const list = inSketchView() && session.tool === "dimension" ? session.dims(S.sketch.dimOffsetPx / pxPerMm()) : [];
  while (dimsEl.children.length > list.length) dimsEl.lastChild.remove();
  while (dimsEl.children.length < list.length) dimsEl.appendChild(Object.assign(document.createElement("div"), { className: "chip" }));
  list.forEach((d, i) => {
    const el = dimsEl.children[i];
    el.className = `chip${d.typed ? " typed" : ""}${d.active ? " act" : ""}`;
    el.replaceChildren();
    const b = document.createElement("b");
    b.textContent = d.label;
    el.append(b, d.text || "_");
    const [x, y, z] = toWorld(session.plane, d.pos);
    const [sx, sy] = window.__ui.worldToScreen(x, y, z);
    el.style.left = `${sx}px`;
    el.style.top = `${sy}px`;
  });
}

// ---------------------------------------------------------------- the typing field next to the cursor
let lastPointer = { x: 0, y: 0 };
let pointerSeen = false;
function updateReadout() {
  const el = $("readout");
  const segs = extrude
    ? [{ label: extrude.sess.mode() === "cut" ? "cut" : "add", text: extrude.sess.text || String(Math.round(effective() * 100) / 100), active: !!extrude.sess.text, typed: !!extrude.sess.text, invalid: extrude.sess.invalid() }]
    : inSketchView() && session.tool !== "select" ? session.readout() : [];
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
    for (const [label, a] of [["Select", "select"], ["Line", "line"], ["Rectangle", "rect"], ["Circle", "circle"], ["Dimension", "dimension"], ["Extrude", "extrude"]]) items.push({ label, hint: key(a), run: ACTIONS[a], on: session.tool === a });
    items.push("sep");
  } else if (!selected && (hovered || hoveredFace)) {
    const target = planeUnderCursor();
    items.push({ label: hoveredFace ? "Sketch on this face" : `Sketch on ${hovered} plane`, hint: "click", run: () => enterSketch(target) }, "sep");
  }
  items.push({ label: "Undo", hint: key("undo"), run: ACTIONS.undo, off: !store.canUndo() }, { label: "Redo", hint: key("redo"), run: ACTIONS.redo, off: !store.canRedo() }, "sep");
  items.push({ label: "Return to origin", hint: key("origin"), run: ACTIONS.origin }, { label: "Home view", hint: key("home"), run: ACTIONS.home });
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
  if (extrude) {
    // drag anywhere to pull: the distance follows the mouse along the arrow's axis
    const t0 = pullParam(ev.clientX, ev.clientY);
    if (t0 !== null) g = { kind: "extdrag", t0, d0: effective(), ...base };
    return;
  }
  if (selected && !inSketchView()) return; // gliding to the plane: ignore clicks until it is face-on
  if (!inSketchView()) return void (g = { kind: "click", ...base }); // a click picks a plane; a drag orbits
  const p = localPoint(ev.clientX, ev.clientY);
  if (!p) return;
  session.scale = pxPerMm();
  if (session.tool === "select") return void (g = { kind: "selectclick", p, shift: ev.shiftKey, ...base }); // a click selects; a drag orbits
  const had = !!session.draft;
  const msg = session.click(p, { shift: ev.shiftKey });
  if (msg) flashMessage(msg);
  const picked = session.takePicked();
  if (picked) return startExtrudeFromRegion(picked);
  // press-and-drag also draws a rectangle or circle: if this press started the shape, releasing far away finishes it
  if (!had && session.draft && (session.tool === "rect" || session.tool === "circle")) g = { kind: "draw", ...base };
  updateStatus();
  updateReadout();
  markSketch();
});
canvas.addEventListener("pointermove", (ev) => {
  lastPointer = { x: ev.clientX, y: ev.clientY };
  pointerSeen = true;
  if (g && g.kind === "extdrag" && extrude) {
    const t = pullParam(ev.clientX, ev.clientY);
    if (t !== null) extrude.sess.drag(g.d0 + (t - g.t0), ev.shiftKey);
    refreshUI();
    return;
  }
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
      if (selected && !extrude && !isNormal(view, selected, V.normalToleranceRad)) exitSketch(false); // orbiting out of the face-on view = back to the 3D view
    }
    updateStatus();
    markSketch();
    return;
  }
  if (extrude) return;
  if (inSketchView()) {
    const p = localPoint(ev.clientX, ev.clientY);
    if (p && session.tool !== "select") {
      session.scale = pxPerMm();
      session.move(p, { shift: ev.shiftKey });
      updateReadout();
      markSketch();
    }
    canvas.style.cursor = session.tool === "select" || session.tool === "dimension" ? "default" : "crosshair";
    return;
  }
  if (g) return;
  if (!selected) setHover(hoverAt(ev.clientX, ev.clientY));
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
    setHover(hoverAt(ev.clientX, ev.clientY));
    const target = planeUnderCursor(); // a body face, or a base plane
    if (target) enterSketch(target);
  }
});
canvas.addEventListener("pointerleave", () => {
  pointerSeen = false;
  if (hovered || hoveredFace) setHover({ plane: null, face: null });
});
let lastWheelAt = 0;
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const oldDist = view.dist;
    // A trackpad flick (with its inertia) or a free-spinning wheel sends hundreds of events. Limit the zoom SPEED, not just the range,
    // so a single gesture can never fling the view to the limits.
    const now = performance.now();
    const dt = clamp((now - lastWheelAt) / 1000, 0.008, 0.12);
    lastWheelAt = now;
    const lineScale = e.deltaMode === 1 ? 33 : 1; // some devices report lines instead of pixels
    const wanted = e.deltaY * lineScale * (e.ctrlKey ? S.input.pinchZoomPerWheel : V.zoomPerWheel);
    const limit = Math.log(S.input.maxZoomFactorPerSecond) * dt;
    const newDist = clamp(oldDist * Math.exp(clamp(wanted, -limit, limit)), V.minDistance, V.maxDistance);
    if (S.input.zoomToCursor && newDist < oldDist) {
      // Zoom IN toward the cursor. Zooming OUT is about the view center: anchoring on the cursor would multiply the offset
      // (a 50x zoom-out moves the target 50x away), which is how the origin got lost.
      // Keep the point under the cursor fixed on screen. Prefer the plane point you are pointing at; otherwise the point
      // on the camera-facing plane through the target. Any point on the cursor ray works for the math below.
      const planeHit = pickAt(e.clientX, e.clientY);
      let P = planeHit ? new THREE.Vector3(...planeHit.point) : null;
      // A far point on a plane (near the horizon) would fling the target away with every notch (and the origin gets lost):
      // only anchor on plane points reasonably close to where you are looking.
      if (P && P.distanceTo(view.target) > S.input.zoomAnchorMaxFactor * oldDist) P = null;
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
    updateStatus();
    markSketch();
  },
  { passive: false },
);
$("exitBtn").addEventListener("click", () => exitSketch(true));
$("originBtn").addEventListener("click", () => returnToOrigin());
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
  // while pulling an extrusion, digits and Enter belong to the distance (Backspace always does, so it can never delete by accident)
  if (extrude && !e.ctrlKey && !e.metaKey) {
    if (e.key === "Enter") return e.preventDefault(), commitExtrude();
    if (e.key === "Backspace") return e.preventDefault(), extrude.sess.backspace(), refreshUI();
    if (e.key.length === 1 && extrude.sess.type(e.key)) return e.preventDefault(), refreshUI();
  }
  // while a shape is being drawn, characters, Backspace, Tab and Enter belong to the typed-size field
  if (inSketchView() && session.wantsKeys() && !e.ctrlKey && !e.metaKey) {
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
  if (action === "cancel" || action === "undo" || action === "redo" || action === "home" || action === "origin" || action === "delete") e.preventDefault();
  ACTIONS[action]?.();
});

// ---------------------------------------------------------------- boot
applyTheme();
resize();
updateStatus();
// Hooks for the automated browser check (not used by the UI).
window.__ui = {
  session,
  store,
  inSketchView: () => inSketchView(),
  originInfo: () => (applyCamera(), originInfo()),
  menuOpen: () => menuOpen(),
  state: () => ({ selected, hovered, tool: session.tool, draft: session.draft && session.draft.pts.length, selectedEntity: session.selectedId, a: view.a, e: view.e, dist: view.dist, target: view.target.toArray(), normal: selected ? isNormal(view, selected, V.normalToleranceRad) : null, animating: !!anim }),
  settings: S,
  hoverInfo: () => ({ hovered, face: hoveredFace }),
  enterSketch: (pl, tool) => enterSketch(pl, tool),
  store,
  body: () => ({ ready: body.ready(), fresh: body.fresh(), ...body.info }),
  extrudeState: () => (extrude ? { plane: extrude.plane, distance: extrude.sess.distance, value: effective(), mode: extrude.sess.mode(), featureId: extrude.sess.featureId } : null),
  addTestBox: (x, y, z, w, d, h) => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, d, h), new THREE.MeshLambertMaterial({ color: 0x8a6f4d }));
    box.position.set(x, y, z);
    scene.add(box);
    requestRender();
  },
  pickAt,
  setView: ({ a, e, dist, target }) => ((view.a = a ?? view.a), (view.e = e ?? view.e), (view.dist = dist ?? view.dist), target && view.target.set(...target), requestRender()),
  worldToScreen(x, y, z) {
    applyCamera();
    const v = new THREE.Vector3(x, y, z).project(camera);
    const r = canvas.getBoundingClientRect();
    return [r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height];
  },
};
