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
import { circlePolygon, regionsOf, hitRegion, paramOnAxisFromRay } from "./sketch.mjs";
import { ExtrudeSession } from "./extrude.mjs";
import { TransformSession, AXIS_NAMES, UNITS } from "./transform.mjs";
import { buildGraph } from "./features.mjs";
import { createBody } from "./body.js";
import { PLANES, planeDef, addFacePlane, basisOf, frameOf, planeOrigin, shortest, cameraOffset, cameraUp, clamp, easeInOut, isNormal, projectOnto, pickPlane } from "./viewmath.mjs";

const $ = (id) => document.getElementById(id);
const G = S.grid;
const V = S.view;
const F = S.fog; // world fog (objects)
const A = S.sheetArea; // how far a sheet's light, grid and axes reach
let themeName = S.themeName;
const T = () => S.themes[themeName];
const hexToRgb = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
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
uniform vec3 uU; uniform vec3 uV; uniform vec3 uCol; uniform vec3 uColU; uniform vec3 uColV;
uniform float uLineA; uniform float uBright; uniform float uOpacity; uniform float uAxisA;
uniform vec3 uLineCol;
uniform float uLodDiv; uniform float uStyleMin; uniform float uFineMul; uniform float uMinCellPx;
uniform float uFogNear; uniform float uFogFar; uniform float uAxisFogFar; uniform float uFogK;
uniform float uAxisW; uniform float uGhost;
varying vec3 vPos;

float gridLine(vec2 c, float s) {
  vec2 q = c / s;
  vec2 fw = max(fwidth(q), vec2(1e-6));
  vec2 g = abs(fract(q - 0.5) - 0.5) / fw;
  float cellPx = 1.0 / max(fw.x, fw.y); // size of one cell on screen, in pixels
  return (1.0 - min(min(g.x, g.y), 1.0)) * smoothstep(uMinCellPx, uMinCellPx * 2.5, cellPx);
}
void main() {
  vec2 c = vec2(dot(vPos, uU), dot(vPos, uV)); // position in the plane's own axes (any orientation)

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
#elif PASS == 3
  // Axis lines where an object is in front of them: drawn only behind existing depth, faintly.
  float axg = max(axU, axV) * uAxisA * axFog * uGhost;
  gl_FragColor = vec4(mix(uColU, uColV, step(axU, axV)), axg);
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
    ...(pass === 3 ? { depthFunc: THREE.GreaterDepth } : {}),
    ...(pass === 1
      ? { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcColorFactor } // screen: light + dst * (1 - light)
      : {}),
    uniforms: {
      uCam: { value: new THREE.Vector3() }, uDist: { value: 1 },
      uU: { value: new THREE.Vector3(...def.basis[0]) }, uV: { value: new THREE.Vector3(...def.basis[1]) }, uCol: { value: new THREE.Vector3(...T().sheet) },
      uColU: { value: new THREE.Vector3(...axisCol[def.u]) }, uColV: { value: new THREE.Vector3(...axisCol[def.v]) },
      uLineA: { value: 0 }, uBright: { value: 0 }, uOpacity: { value: 0 }, uAxisA: { value: G.axisAlpha },
      uLodDiv: { value: G.lodDivisor }, uStyleMin: { value: G.fineLineStrength }, uFineMul: { value: 0 }, uMinCellPx: { value: G.minCellPx },
      uLineCol: { value: new THREE.Vector3() },
      uFogNear: { value: A.nearFactor }, uFogFar: { value: A.farFactor }, uAxisFogFar: { value: A.axisFarFactor }, uFogK: { value: A.sharpness },
      uAxisW: { value: G.axisWidthPx }, uGhost: { value: 0 },
    },
  });
  const geo = new THREE.PlaneGeometry(1, 1);
  const paint = new THREE.Mesh(geo, makeMat(0));
  const glow = new THREE.Mesh(geo, makeMat(1));
  const lines = new THREE.Mesh(geo, makeMat(2));
  const ghost = new THREE.Mesh(geo, makeMat(3));
  paint.renderOrder = 1;
  glow.renderOrder = 2;
  lines.renderOrder = 3;
  ghost.renderOrder = 3;
  for (const mesh of [paint, glow, lines, ghost]) {
    mesh.frustumCulled = false;
    scene.add(mesh);
  }
  const back = new THREE.Mesh(geo, makeMat(0));
  back.material.depthTest = false;
  back.frustumCulled = false;
  backdropScene.add(back);
  planeMeshes[name] = { paint, glow, lines, ghost, back };
}

/** Keep each plane's quad centered on the target (projected onto the plane) and sized to the view, so it looks
 *  infinite and vertex positions stay small (float precision). Grid lines are in world coordinates. */
const mix3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
/** How a plane looks right now: the selected plane shows fully, the hovered plane previews, the rest are hidden. */
let lastPlane = "XY"; // exactly one sheet shows at any time: the one being sketched on, else the one pointed at, else the last one that showed
const baseOf = (id) => (id ? planeDef(id).base ?? id : null);
function shownPlane() {
  const now = selected ? baseOf(selected) : baseOf(hovered ?? hoveredSketch?.plane ?? null) ?? (pinnedHover || null);
  if (now) lastPlane = now; // pointing at another plane drops the old one; pointing at nothing keeps it
  return lastPlane;
}
function stateOf(name) {
  const states = T().states;
  if (name !== shownPlane()) return states.base;
  return selected ? states.selected : pinnedHover === name ? states[pinnedStyle] : states.hover;
}
/** Is this plane the one being sketched on or pointed at? (Its surface and lines lean blue.) */
const hotOf = (plane) => plane === selected || plane === hovered || hoveredSketch?.plane === plane || (sel?.kind === "sketch" && sel.plane === plane) || (!!pinnedHover && !selected && plane === pinnedHover);
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
   // while sketching on a face, this sheet takes that face's place and orientation (any angle); otherwise it is the base plane itself
   const planeId = selected && (planeDef(selected).base ?? selected) === name ? selected : name;
   const def = planeDef(planeId);
   const nrm = new THREE.Vector3(...def.n);
   const sheetQuat = new THREE.Quaternion().setFromRotationMatrix(basisMatrix(planeId, new THREE.Vector3()));
   const center = new THREE.Vector3(...projectOnto(planeId, view.target.toArray()));
   const side = Math.sign(camera.position.clone().sub(center).dot(nrm)) || 1;
   pair.back.visible = B.enabled;
   for (const mesh of [pair.paint, pair.glow, pair.lines, pair.ghost, pair.back]) {
    mesh.quaternion.copy(sheetQuat);
    mesh.position.copy(center);
    if (mesh === pair.back) mesh.position.addScaledVector(nrm, -side * view.dist * B.offsetFactor); // behind the plane, seen from the camera
    mesh.scale.setScalar(view.dist * G.extentFactor);
    const u = mesh.material.uniforms;
    u.uU.value.set(...def.basis[0]);
    u.uV.value.set(...def.basis[1]);
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
    u.uGhost.value = G.axisGhost;
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
    const faint = body.blocked(camera.position, p0) ? S.axisArrow.faintOpacity : 1; // behind an object: only faintly visible
    poly.style.opacity = label.style.opacity = String(faint);
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
    for (const mesh of [pair.paint, pair.glow, pair.lines, pair.ghost]) {
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
    updateXformViz();
    updatePickViz();
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
/** The point of a plane where the world origin projects onto it (local (0, 0)). */
const originOf = (plane) => new THREE.Vector3(...planeOrigin(plane));
const toWorld = (plane, [u, v]) => {
  const [U, W] = basisOf(plane);
  return originOf(plane).add(new THREE.Vector3(U[0] * u + W[0] * v, U[1] * u + W[1] * v, U[2] * u + W[2] * v));
};
const basisMatrix = (plane, at = originOf(plane)) => {
  const [U, W, N] = basisOf(plane);
  return new THREE.Matrix4().makeBasis(new THREE.Vector3(...U), new THREE.Vector3(...W), new THREE.Vector3(...N)).setPosition(at);
};
const sketchGroup = new THREE.Group();
const body = createBody(scene, S, () => T(), renderer);
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
  const cream = hexToRgb(th.bodyColor);
  for (const key of [...Object.keys(store.sketches), ...(session.editKey ? [session.editKey] : [])]) {
    const plane = store.isFeatureKey(key) ? session.plane : key; // a step's own sketch is drawn on the plane it was made on
    const blue = hotOf(plane) ? SK.lineBlue : 0; // a hovered or selected plane leans blue
    const inkC = toHex(mix3(th.sketchInk, th.blueInk, blue));
    const haloC = toHex(mix3(th.sketchHalo, th.blueHalo, blue));
    for (const e of store.entities(key)) {
      const o = outline(e);
      const pts = o.pts.map((p) => toWorld(plane, p));
      const skSel = plane === session.plane && e.id === session.selectedId; // selected in the sketch view
      const hov = (plane === session.plane && session.tool === "extrude" && e.id === session.hoverId) || (hoveredSketch?.plane === plane && hoveredSketch.id === e.id);
      const picked = skSel || (sel?.kind === "sketch" && sel.plane === plane && sel.id === e.id); // stays blue until deselected, in the sketch view and in 3D
      if (o.closed && !isExtruded(plane, e)) sketchGroup.add(fillShape(plane, o.pts, toHex(mix3(cream, th.blueSurface, picked ? SK.regionSelectBlue : hov ? SK.regionHoverBlue : 0)), SK.regionFill));
      if (SK.haloWidthPx > 0) sketchGroup.add(stroke(pts, { color: haloC, width: SK.haloWidthPx * (skSel ? 1.5 : 1), closed: o.closed, order: 4 }));
      sketchGroup.add(stroke(pts, { color: inkC, width: SK.lineWidthPx * (skSel ? 1.7 : 1), closed: o.closed, order: 5 }));
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

// ---------------------------------------------------------------- extrude (pull a closed sketch shape, or push/pull a face of the body)
// positive adds, negative cuts. extrude = { sess, plane, polygon, centroid (sketch shape) | face, ref (body face), origin, normal, fromSketch }
let extrude = null;
const ghostGroup = new THREE.Group(); // instant preview, shown until the exact result arrives
const handleGroup = new THREE.Group(); // the arrow showing the pull
scene.add(ghostGroup, handleGroup);
const AXES3 = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
const normalOf = (plane) => new THREE.Vector3(...basisOf(plane)[2]);
const effective = () => {
  const v = extrude.sess.value();
  return Number.isFinite(v) ? v : extrude.sess.distance;
};
/** The features as they would be right now, including the one being pulled. */
function currentFeatures() {
  const list = store.features.map((f) => (extrude && extrude.sess.featureId === f.id ? { ...f, distance: effective() } : xform && xform.sess.featureId === f.id ? { ...f, ...xformFeature() } : f));
  if (xform && !xform.sess.featureId && !xform.sess.isEmpty()) list.push({ id: "f_pending", ...xformFeature() });
  if (extrude && !extrude.sess.featureId && !extrude.sess.isEmpty()) {
    const pending = extrude.ref
      ? { id: "f_pending", kind: "face", plane: null, ref: extrude.ref, distance: effective() }
      : { id: "f_pending", plane: extrude.plane, shape: extrude.sess.shape, distance: effective(), frame: frameOf(extrude.plane) };
    list.push(pending);
  }
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
    c.geometry?.dispose?.();
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
  const n = extrude.normal;
  const c0 = extrude.origin;
  const empty = Math.abs(v) < E.minMm;
  const cut = extrude.sess.mode() === "cut";
  if (!empty && !body.fresh()) {
    const mat = new THREE.MeshBasicMaterial({ color: cut ? th.cutColor : th.addColor, transparent: true, opacity: E.ghostOpacity, side: THREE.DoubleSide, depthWrite: false });
    if (extrude.face) {
      const geo = body.faceGeometry(extrude.face); // the face itself, moved along its normal
      if (geo) {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(n).multiplyScalar(v);
        ghostGroup.add(mesh);
      }
    } else {
      const shape = new THREE.Shape(extrude.polygon.map(([u, w]) => new THREE.Vector2(u, w)));
      const geo = new THREE.ExtrudeGeometry(shape, { depth: Math.abs(v), bevelEnabled: false });
      if (v < 0) geo.translate(0, 0, -Math.abs(v));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(basisMatrix(extrude.plane));
      ghostGroup.add(mesh);
    }
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
/** Begin pulling. Only if the view is face-on to the pull direction does the camera tilt (so there is something to pull along);
 *  otherwise the camera is left alone. */
function startExtrude(init) {
  const { origin, normal, fromSketch = false, ...rest } = init;
  const flat = inSketchView();
  extrude = { ...rest, origin, normal, fromSketch, sess: new ExtrudeSession(S, { plane: rest.plane ?? null, shape: rest.shape ?? null, distance: rest.distance ?? 0, featureId: rest.featureId ?? null, hasBody: rest.hasBody }) };
  session.setTool("select");
  sel = null;
  applySel();
  if (flat || Math.abs(camera.getWorldDirection(new THREE.Vector3()).dot(normal)) > 0.97) animateTo({ a: V.homeAzimuth, e: V.homeElevation, target: origin.clone() }, S.extrude.tiltMs);
  refreshUI();
}
function startExtrudeFromRegion(region, plane = selected) {
  const { id, ...shape } = region.entity;
  startExtrude({ plane, shape, entity: region.entity, polygon: region.polygon, centroid: region.centroid, origin: toWorld(plane, region.centroid), normal: normalOf(plane), hasBody: store.features.length > 0, fromSketch: !!selected });
}
/** Push or pull a flat face of the body. face = { start, count, axis, sign, offset, point? }. */
function startFaceExtrude(face, featureId = null, distance = 0) {
  const ref = { n: face.n, d: face.d, point: face.point ?? body.faceCenter(face).toArray() };
  const normal = new THREE.Vector3(...face.n);
  startExtrude({ face, ref, origin: body.faceCenter(face), normal, featureId, distance, hasBody: true });
}
/** Open the sketch an extrusion step owns, to resize it with the dimension tool (it cannot be extended). Later steps that change the same body are warned about. */
function editFeatureSketch(id) {
  if (extrude || xform) return;
  const at = store.features.findIndex((f) => f.id === id);
  const f = store.features[at];
  if (!f || f.kind || !f.shape) return;
  enterSketch(f.plane, "select");
  session.editKey = `feat:${id}`;
  const later = store.features.length - at - 1;
  flashMessage(`Editing the sketch of step ${at + 1}. Use D to resize it.${later ? ` ${later} later step${later > 1 ? "s" : ""} build on this and may override a change.` : ""}`);
}
function editFeature(id) {
  if (extrude || xform) return;
  const at = store.features.findIndex((f) => f.id === id);
  if (at < 0) return;
  const f = store.features[at];
  if (f.kind === "transform") return startTransform(f.mode, f.id, f.axis, f.distance);
  if (f.kind === "edge") {
    const edge = body.findEdge(f.ref);
    if (!edge) return flashMessage("That line is not there any more (the model changed since this step).");
    return startEdgeMod(f.mode, edge, f.id, f.distance);
  }
  if (f.kind === "cylRadius" || f.kind === "cylDraft") {
    const face = body.findFace(f.ref);
    if (!face) return flashMessage("That round face is not there any more (the model changed since this step).");
    return startCylinder(f.kind, face, f.id, f.distance);
  }
  if (f.kind === "faceTilt") {
    const face = body.findFace(f.ref);
    if (!face) return flashMessage("That face is not there any more (the model changed since this step).");
    return startFaceTilt({ ...face, point: f.ref.point }, f.id, f.axis, f.distance);
  }
  if (f.kind === "face") {
    const face = body.findFace(f.ref);
    if (!face) return flashMessage("That face is not there any more (the model changed since this step).");
    return startFaceExtrude({ ...face, point: f.ref.point }, f.id, f.distance);
  }
  const region = regionsOf([{ ...f.shape, id: f.id }])[0];
  if (!region) return;
  startExtrude({ plane: f.plane, shape: f.shape, polygon: region.polygon, centroid: region.centroid, origin: toWorld(f.plane, region.centroid), normal: normalOf(f.plane), featureId: f.id, distance: f.distance, hasBody: at > 0 });
}
function commitExtrude() {
  const v = extrude.sess.value();
  if (!Number.isFinite(v)) return flashMessage("Check the typed number.");
  if (extrude.sess.isEmpty()) return cancelExtrude();
  const { sess, plane, ref, fromSketch, entity } = extrude;
  if (sess.featureId) store.updateFeature(sess.featureId, v);
  else if (ref) store.addFaceFeature(ref, v);
  else store.addFeature(plane, sess.shape, v, frameOf(plane), entity ?? null); // the extrusion takes the sketch over: it leaves the plane
  extrude = null;
  if (fromSketch) exitSketch(false);
  refreshUI();
  refreshHover();
}
function cancelExtrude() {
  const { plane, sess, fromSketch } = extrude;
  extrude = null;
  if (fromSketch && sess.featureId) exitSketch(false);
  else if (fromSketch) {
    session.setTool("select");
    goNormal(plane); // back to drawing on the plane
  }
  refreshUI();
  refreshHover();
}
function deleteFeatureBeingEdited() {
  const id = extrude?.sess.featureId;
  if (!id) return false;
  const { fromSketch } = extrude;
  extrude = null;
  store.removeFeature(id);
  if (fromSketch) exitSketch(false);
  refreshUI();
  refreshHover();
  return true;
}
/** Where the mouse is along the pull axis (mm from the shape), or null. */
function pullParam(clientX, clientY) {
  setRay(clientX, clientY);
  return paramOnAxisFromRay({ o: raycaster.ray.origin.toArray(), v: raycaster.ray.direction.toArray() }, extrude.origin.toArray(), extrude.normal.toArray());
}
const refreshUI = () => (updateStatus(), updateReadout(), markSketch());

// ---------------------------------------------------------------- move / rotate / scale a whole body
let xform = null; // { sess: TransformSession, center: Vector3, size }
const xformGroup = new THREE.Group(); // the arrow or ring showing the axis
scene.add(xformGroup);
const MODES = { move: "move", rotate: "rotate", scale: "scale" };
/** Tilt a flat face about a world axis lying in it (the other two axes are allowed; the face's own normal axis is not). */
function startFaceTilt(face, featureId = null, axis = null, value = null) {
  const ref = { n: face.n, d: face.d, point: face.point ?? body.faceCenter(face).toArray() };
  const a = axis ?? face.n.map(Math.abs).reduce((best, v, i, all) => (v < all[best] ? i : best), 0); // the world axis lying most nearly in the face
  xform = { kind: "faceTilt", sess: new TransformSession(S, { mode: "rotate", axis: a, value, featureId }), center: body.faceCenter(face), size: Math.max(body.faceSize(face), 10), ref };
  refreshUI();
}
/** Round (fillet) or bevel (chamfer) one selected line. */
function startEdgeMod(mode, edge, featureId = null, value = null) {
  const ref = { a: edge.a, b: edge.b, mid: edge.mid };
  xform = { kind: "edge", edgeMode: mode, sess: new TransformSession(S, { mode, value, featureId }), center: new THREE.Vector3(...edge.mid), size: 10, ref };
  refreshUI();
}
/** Change the radius of a full round face, or taper it. kind: "cylRadius" | "cylDraft". */
function startCylinder(kind, face, featureId = null, value = null) {
  const ref = { kind: "cyl", axis: face.axis, center: face.center, radius: face.radius, lo: face.lo, hi: face.hi };
  xform = { kind, sess: new TransformSession(S, { mode: kind === "cylRadius" ? "radius" : "draft", value, featureId, base: face.radius }), center: body.faceCenter(face), size: 10, ref };
  refreshUI();
}
function startTransform(mode, featureId = null, axis = 0, value = null) {
  const b = body.info.bbox;
  if (!b) return flashMessage("There is no body yet.");
  const center = new THREE.Vector3(...[0, 1, 2].map((i) => (b.min[i] + b.max[i]) / 2));
  const size = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
  xform = { kind: "body", sess: new TransformSession(S, { mode, axis, value, featureId }), center, size };
  sel = null;
  applySel();
  refreshUI();
}
const xformValue = () => {
  const v = xform.sess.current();
  return Number.isFinite(v) ? v : xform.sess.value;
};
/** The feature fields for what is being done now (used for the live preview and when applying). */
function xformFeature() {
  const { sess, kind, ref } = xform;
  const v = xformValue();
  if (kind === "faceTilt") return { kind, plane: null, ref, axis: sess.axis, distance: v };
  if (kind === "edge") return { kind, plane: null, ref, mode: xform.edgeMode, distance: v };
  if (kind === "cylRadius" || kind === "cylDraft") return { kind, plane: null, ref, distance: v };
  return { kind: "transform", plane: null, mode: sess.mode, axis: sess.axis, distance: v };
}
function commitTransform() {
  const { sess, kind } = xform;
  const v = sess.current();
  if (!Number.isFinite(v)) return flashMessage("Check the typed number.");
  if (sess.isEmpty()) return cancelTransform();
  const f = xformFeature();
  if (sess.featureId) store.updateFeature(sess.featureId, v, kind === "faceTilt" ? { axis: sess.axis } : kind === "body" ? { axis: sess.axis, mode: sess.mode } : kind === "edge" ? { mode: xform.edgeMode } : {});
  else if (kind === "faceTilt") store.addFaceTiltFeature(f.ref, f.axis, v);
  else if (kind === "edge") store.addRefFeature("edge", f.ref, v, { mode: f.mode });
  else if (kind === "cylRadius" || kind === "cylDraft") store.addRefFeature(kind, f.ref, v);
  else store.addTransformFeature(sess.mode, sess.axis, v);
  xform = null;
  refreshUI();
  refreshHover();
}
function cancelTransform() {
  xform = null;
  refreshUI();
  refreshHover();
}
function deleteTransformBeingEdited() {
  const id = xform?.sess.featureId;
  if (!id) return false;
  xform = null;
  store.removeFeature(id);
  refreshUI();
  refreshHover();
  return true;
}
/** Where the mouse is along the move axis through the body's centre (mm). */
function moveParam(clientX, clientY) {
  setRay(clientX, clientY);
  return paramOnAxisFromRay({ o: raycaster.ray.origin.toArray(), v: raycaster.ray.direction.toArray() }, xform.center.toArray(), AXES3[xform.sess.axis].toArray());
}
function updateXformViz() {
  clearGroup2(xformGroup);
  if (!xform) return;
  const col = toHex([T().axisX, T().axisY, T().axisZ][xform.sess.axis]);
  const axis = AXES3[xform.sess.axis];
  const mode = xform.sess.mode;
  const mat = () => new THREE.LineBasicMaterial({ color: col, depthTest: false, transparent: true });
  if (mode === "move") {
    const v = xformValue();
    const len = Math.max(Math.abs(v), xform.size * 0.3);
    const arrow = new THREE.ArrowHelper(axis.clone().multiplyScalar(v < 0 ? -1 : 1), xform.center, len, col, len * 0.15, len * 0.08);
    for (const m of [arrow.line, arrow.cone]) (m.material.depthTest = false, m.renderOrder = 20);
    xformGroup.add(arrow);
  } else if (mode === "rotate") {
    const u = AXES3[(xform.sess.axis + 1) % 3];
    const w = AXES3[(xform.sess.axis + 2) % 3];
    const r = xform.size * 0.75;
    const pts = Array.from({ length: 65 }, (_, i) => xform.center.clone().addScaledVector(u, Math.cos((i / 64) * Math.PI * 2) * r).addScaledVector(w, Math.sin((i / 64) * Math.PI * 2) * r));
    const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat());
    ring.renderOrder = 20;
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([xform.center.clone().addScaledVector(axis, -r), xform.center.clone().addScaledVector(axis, r)]), mat());
    line.renderOrder = 20;
    xformGroup.add(ring, line);
  }
}

// ---------------------------------------------------------------- lines and corners under the cursor / selected (drawn in blue)
const pickGroup = new THREE.Group();
scene.add(pickGroup);
function updatePickViz() {
  clearGroup2(pickGroup);
  const color = toHex(T().blueSurface);
  const edgeLine = (edge, width, alpha) => {
    const pts = [];
    for (let i = 0; i < edge.pts.length; i += 3) pts.push(new THREE.Vector3(edge.pts[i], edge.pts[i + 1], edge.pts[i + 2]));
    pickGroup.add(stroke(pts, { color, width, order: 9, alpha }));
  };
  const dot = (v, k) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95, fog: false }));
    m.position.set(...v);
    m.scale.setScalar(view.dist * S.pick.vertexScale * k);
    m.renderOrder = 10;
    pickGroup.add(m);
  };
  if (hoveredEdge) edgeLine(hoveredEdge, 3, 0.8);
  if (hoveredVertex) dot(hoveredVertex, 1);
  if (sel?.kind === "edge") edgeLine(sel.edge, 4.5, 1);
  if (sel?.kind === "vertex") dot(sel.v, 1.35);
}
canvas.addEventListener("dblclick", (ev) => {
  if (selected || extrude || xform) return;
  const h = hoverAt(ev.clientX, ev.clientY);
  setHover(h);
  if (h.face || h.edge || h.vertex) (sel = { kind: "body" }), applySel(); // a double-click anywhere on the body selects all of it
  else if (h.plane) (sel = null), applySel(), enterSketch(h.plane); // a double-click on a world plane orients to it
});

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
    const what = f.kind === "face" ? "Move face" : cut ? "Cut" : "Extrude";
    const n = Math.round(Math.abs(f.distance) * 1000) / 1000;
    const sz = Math.round(f.distance * 1000) / 1000;
    b.textContent = f.kind === "edge" ? `${i + 1}  ${f.mode === "chamfer" ? "Chamfer" : "Fillet"} ${sz} mm${err ? "  failed" : ""}`
      : f.kind === "cylRadius" ? `${i + 1}  Radius ${f.ref.radius} → ${sz} mm${err ? "  failed" : ""}`
      : f.kind === "cylDraft" ? `${i + 1}  Taper ${sz}°${err ? "  failed" : ""}`
      : f.kind === "clear" ? `${i + 1}  Delete body`
      : f.kind === "faceTilt"
      ? `${i + 1}  Tilt face ${AXIS_NAMES[f.axis]} ${f.distance < 0 ? "−" : "+"}${n}°${err ? "  failed" : ""}`
      : f.kind === "transform"
      ? `${i + 1}  ${f.mode === "move" ? "Move" : f.mode === "rotate" ? "Rotate" : "Scale"}${f.mode === "scale" ? ` ×${f.distance}` : ` ${AXIS_NAMES[f.axis]} ${f.distance < 0 ? "−" : "+"}${n}${UNITS[f.mode]}`}${err ? "  failed" : ""}`
      : `${i + 1}  ${what}  ${f.distance > 0 ? "+" : "−"}${n} mm${f.plane ? `  (${f.plane})` : ""}${err ? "  failed" : ""}`;
    b.title = err ?? "Click to change the distance";
    b.onclick = () => editFeature(f.id);
    const li = document.createElement("li");
    li.appendChild(b);
    if (!f.kind && f.shape) {
      const sk = document.createElement("button"); // the step owns its sketch: open it here
      sk.className = "sk";
      sk.textContent = "sketch";
      sk.title = "Edit this step's sketch";
      sk.onclick = () => editFeatureSketch(f.id);
      li.appendChild(sk);
    }
    list.appendChild(li);
  });
}
$("histBtn").onclick = () => $("histList").classList.toggle("open");
body.onResult(() => {
  if (sel?.kind === "face") {
    const f = body.findFace(sel.ref); // the model was rebuilt: find the selected face again, or let go of it
    sel = f ? { ...sel, face: { ...f, point: sel.ref.point } } : null;
  }
  if (sel?.kind === "edge") sel = body.edges.find((e) => e.a.join() === sel.edge.a.join() && e.b.join() === sel.edge.b.join()) ? { kind: "edge", edge: body.edges.find((e) => e.a.join() === sel.edge.a.join() && e.b.join() === sel.edge.b.join()) } : null;
  if (sel?.kind === "vertex" && !body.vertices.some((v) => v.join() === sel.v.join())) sel = null;
  if (sel?.kind === "body" && !body.wholeBody()) sel = null;
  applySel();
  if (!selected && !extrude && !xform) refreshHover();
  updateHistory();
  requestRender();
});

// ---------------------------------------------------------------- status text (the only text on screen besides the typing field)
let flash = null; // a short message that replaces the status for a moment (e.g. why a click was ignored)
function flashMessage(text) {
  flash = text;
  updateStatus();
  setTimeout(() => ((flash = null), updateStatus()), 2600);
}
/** What can be done with a selection (for the status line). */
function selectionHint(t) {
  if (t.kind === "body") return "M move   R rotate   K scale";
  if (t.kind === "face") return t.face.type === "cyl" ? "M radius   R taper" : "M move   R tilt   S sketch on surface";
  if (t.kind === "sketch") return "E extrude   S sketch on it";
  if (t.kind === "plane") return "S sketch on it (R C L too)";
  if (t.kind === "edge") return "F fillet   B chamfer   double-click selects the whole body";
  return "double-click selects the whole body";
}
function updateStatus() {
  let text = "3D view   hover a plane or a face and click it to sketch   right-click for the menu";
  if (flash) text = flash;
  else if (xform) text = xform.sess.prompt();
  else if (extrude) text = `${extrude.ref ? "Move face" : `Extrude on ${extrude.plane}`}   ${extrude.sess.prompt()}`;
  else if (!selected && sel) text = `Selected: ${targetName(sel)}   ${selectionHint(sel)}   Esc deselect`;
  else if (session.editKey && inSketchView()) text = `Editing the sketch of step ${store.features.findIndex((f) => `feat:${f.id}` === session.editKey) + 1}   ${session.prompt()}   Esc to finish`;
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
let hoveredFace = null; // a flat face of the body under the cursor (3D view only): { start, count, axis, sign, offset, point }
let hoveredSketch = null; // an unextruded closed sketch shape under the cursor: { plane, id }
let hoveredEdge = null; // a line of the body under the cursor: { type, pts (flat xyz), a, b (end points) }
let hoveredVertex = null; // a corner of the body under the cursor: [x, y, z]
let sel = null; // the selection in the 3D view: { kind: "plane" | "face" | "sketch" | "edge" | "vertex" | "body", ... }
/** The nearest unextruded closed sketch shape (a face with no thickness) along a ray, no farther than `limit`. */
function pickSketchFace(o, d, limit) {
  let best = null;
  for (const plane of Object.keys(store.sketches)) {
    const ents = store.entities(plane).filter((e) => !isExtruded(plane, e));
    const regions = regionsOf(ents);
    if (!regions.length) continue;
    const def = planeDef(plane);
    const nv = new THREE.Vector3(...def.n);
    const dk = nv.dot(d);
    if (Math.abs(dk) < 1e-3) continue;
    const t = (def.d - nv.dot(o)) / dk;
    if (t <= 0 || t > limit + 1e-4 || (best && t >= best.t)) continue;
    const p = [o.x + t * d.x, o.y + t * d.y, o.z + t * d.z];
    const [U, W] = def.basis;
    const hit = hitRegion([p[0] * U[0] + p[1] * U[1] + p[2] * U[2], p[0] * W[0] + p[1] * W[1] + p[2] * W[2]], regions);
    if (hit) best = { plane, id: hit.id, t };
  }
  return best;
}
/** The corner or line of the body nearest the cursor within a few pixels (corners first), if it is not hidden behind the body. */
function pickNearest(clientX, clientY) {
  if (!body.vertices.length) return null;
  const r = canvas.getBoundingClientRect();
  const x = clientX - r.left;
  const y = clientY - r.top;
  applyCamera();
  const px = (p) => {
    const v = p.clone().project(camera);
    return v.z > 1 || v.z < -1 ? null : [((v.x + 1) / 2) * r.width, ((1 - v.y) / 2) * r.height];
  };
  let best = null;
  for (const v of body.vertices) {
    const p = new THREE.Vector3(...v);
    const q = px(p);
    if (!q) continue;
    const d = Math.hypot(q[0] - x, q[1] - y);
    if (d <= S.pick.vertexPx && (!best || d < best.d) && !body.blocked(camera.position, p)) best = { kind: "vertex", v, d };
  }
  if (best) return best;
  for (const edge of body.edges) {
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    for (let i = 0; i + 1 < edge.pts.length / 3; i++) {
      a.fromArray(edge.pts, i * 3);
      b.fromArray(edge.pts, (i + 1) * 3);
      const qa = px(a);
      const qb = px(b);
      if (!qa || !qb) continue;
      const dx = qb[0] - qa[0];
      const dy = qb[1] - qa[1];
      const len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - qa[0]) * dx + (y - qa[1]) * dy) / len2));
      const d = Math.hypot(qa[0] + t * dx - x, qa[1] + t * dy - y);
      if (d <= S.pick.edgePx && (!best || d < best.d)) best = { kind: "edge", edge, d, at: a.clone().lerp(b, t) };
    }
  }
  return best && !body.blocked(camera.position, best.at) ? best : null;
}
/** What is under the cursor in the 3D view, nearest first: an unextruded sketch face, a body face, or a base plane. */
function hoverAt(clientX, clientY) {
  const planeHit = pickAt(clientX, clientY);
  const near = pickNearest(clientX, clientY);
  if (near?.kind === "vertex") return { plane: null, face: null, sketch: null, edge: null, vertex: near.v };
  if (near?.kind === "edge") return { plane: null, face: null, sketch: null, edge: near.edge, vertex: null };
  const o = raycaster.ray.origin;
  const d = raycaster.ray.direction;
  const faceHit = body.pick(o, d);
  const sk = pickSketchFace(o, d, Math.min(faceHit ? faceHit.distance : Infinity, view.dist * A.farFactor));
  if (sk) return { plane: null, face: null, sketch: { plane: sk.plane, id: sk.id } };
  if (faceHit) return { plane: null, face: { ...faceHit.face, point: faceHit.point }, sketch: null }; // a body face wins over the see-through planes
  return { plane: planeHit?.plane ?? null, face: null, sketch: null };
}
function setHover({ plane = null, face = null, sketch = null, edge = null, vertex = null }) {
  if (plane === hovered && face?.start === hoveredFace?.start && face?.axis === hoveredFace?.axis && sketch?.id === hoveredSketch?.id && sketch?.plane === hoveredSketch?.plane && edge?.pts === hoveredEdge?.pts && vertex?.join() === hoveredVertex?.join()) return false;
  hovered = plane;
  hoveredFace = face;
  hoveredSketch = sketch;
  hoveredEdge = edge;
  hoveredVertex = vertex;
  body.setHighlight(face);
  canvas.style.cursor = plane || face || sketch || edge || vertex ? "pointer" : "default";
  markSketch();
  return true;
}
const hoverAsSel = () =>
  hoveredVertex ? { kind: "vertex", v: hoveredVertex }
  : hoveredEdge ? { kind: "edge", edge: hoveredEdge }
  : hoveredSketch ? { kind: "sketch", ...hoveredSketch }
  : hoveredFace ? { kind: "face", ref: hoveredFace.type === "cyl" ? { kind: "cyl", axis: hoveredFace.axis, center: hoveredFace.center, radius: hoveredFace.radius, lo: hoveredFace.lo, hi: hoveredFace.hi } : { n: hoveredFace.n, d: hoveredFace.d, point: hoveredFace.point }, face: hoveredFace }
  : hovered ? { kind: "plane", plane: hovered }
  : null;
/** What actions apply to: the selection, or else what the cursor is on. */
const currentTarget = () => sel ?? hoverAsSel();
/** The plane to sketch on for a target (a body face becomes a plane the first time it is used). */
const planeOfTarget = (t) => (t.kind === "face" && t.face.type === "cyl" ? null : t.kind === "face" ? addFacePlane(t.face, Math.round(view.a / (Math.PI / 2)) * (Math.PI / 2)) : t.plane); // a horizontal face is squared up to the nearest quarter turn
const targetName = (t) => ({ face: "face", sketch: "sketch shape", edge: "line", vertex: "corner", body: "body" }[t.kind] ?? `${t.plane} plane`);
function applySel() {
  body.setSelected(sel?.kind === "face" ? sel.face : sel?.kind === "body" ? body.wholeBody() : null);
  updateStatus();
  markSketch();
}
/** A single click selects what is on the model; a click on a world plane or on nothing deselects (and, during an operation, applies it). */
function selectFromHover() {
  const t = hoverAsSel();
  sel = t?.kind === "plane" ? null : t; // a click on a world plane (or on nothing) deselects; orienting to a world plane is a double-click
  applySel();
}
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
  sel = null;
  body.setSelected(null);
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
  sel = null;
  body.setSelected(null);
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
  if (extrude || xform) return false;
  if (session.editKey && ["line", "rect", "circle", "extrude"].includes(tool)) return flashMessage("This sketch belongs to its step: resize it with D. It cannot be extended or extruded again here.");
  if (inSketchView()) {
    session.setTool(tool);
  } else if (!selected && currentTarget() && ["plane", "face", "sketch"].includes(currentTarget().kind) && planeOfTarget(currentTarget())) {
    const t = currentTarget();
    sel = null;
    applySel();
    enterSketch(planeOfTarget(t), tool); // a sketch tool key acts on the selection: sketch on it // hotkey while hovering a plane in the 3D view: start sketching on it with that tool
  } else return false;
  updateStatus();
  updateReadout();
  markSketch();
  return true;
}
function doUndo() {
  if (extrude) return cancelExtrude();
  if (xform) return cancelTransform();
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
  if (xform) return cancelTransform();
  if (!inSketchView()) return selected ? exitSketch(true) : sel ? ((sel = null), applySel()) : undefined;
  if (!session.escape()) exitSketch(true);
  updateStatus();
  updateReadout();
  markSketch();
}
/** M, R, K: move, rotate (tilt, for a face) or scale what is selected, or switch mode while doing it. */
function bodyTransform(mode) {
  if (xform) return xform.kind === "body" ? (xform.sess.setMode(mode), refreshUI()) : undefined;
  if (extrude || selected) return;
  const t = sel;
  if (!t) return flashMessage("Select something first (click a face, or double-click the body), then M move, R rotate, K scale.");
  if (t.kind === "body") return startTransform(mode);
  if (t.kind === "face" && t.face.type === "cyl") {
    if (mode === "move") return startCylinder("cylRadius", t.face); // moving a round face = changing its radius
    if (mode === "rotate") return startCylinder("cylDraft", t.face); // tilting a round face = tapering it
    return flashMessage("Scale works on a whole body: double-click it first.");
  }
  if (t.kind === "face") {
    if (mode === "move") return startFaceExtrude(t.face); // moving a face in or out
    if (mode === "rotate") return startFaceTilt(t.face);
    return flashMessage("Scale works on a whole body: double-click it first.");
  }
  if (t.kind === "vertex" && mode === "rotate") return flashMessage("A corner cannot be rotated.");
  if (t.kind === "edge" || t.kind === "vertex") return flashMessage("Moving lines and corners is not supported yet. Faces and whole bodies can be moved and rotated.");
  flashMessage("Faces and whole bodies can be moved and rotated. E extrudes a sketch shape.");
}
/** Delete: the selected sketch shape, or the whole body (a history step, so it can be undone). */
function deleteSelection() {
  if (!sel) return false;
  if (sel.kind === "sketch") store.remove(sel.plane, sel.id);
  else if (sel.kind === "body") store.addClearFeature();
  else return flashMessage(sel.kind === "face" ? "Deleting a single face is not supported yet. Double-click the body to delete all of it." : "Only a sketch shape or a whole body can be deleted. Double-click the body to select all of it.");
  sel = null;
  applySel();
  refreshUI();
  refreshHover();
  return true;
}
/** F fillet, B chamfer: on a selected line (or switch between them while doing it). */
function edgeAction(mode) {
  if (xform) return xform.kind === "edge" ? ((xform.sess.setMode(mode), xform.edgeMode = mode), refreshUI()) : undefined;
  if (extrude || selected) return;
  if (sel?.kind === "edge") return startEdgeMod(mode, sel.edge);
  flashMessage("Click a line of the body first, then F to round it or B to bevel it.");
}
const ACTIONS = {
  fillet: () => edgeAction("fillet"),
  chamfer: () => edgeAction("chamfer"),
  select: () => setTool("select"),
  line: () => setTool("line"),
  rect: () => ((xform || (!inSketchView() && !selected && sel)) ? ACTIONS.rotate() : setTool("rect")), // R rotates what is selected (or switches to rotate while modifying); with nothing selected it is the rectangle tool
  circle: () => setTool("circle"),
  home: () => goHome(),
  origin: () => returnToOrigin(),
  undo: () => doUndo(),
  redo: () => doRedo(),
  cancel: () => doEscape(),
  delete: () => (xform ? deleteTransformBeingEdited() : extrude ? deleteFeatureBeingEdited() : inSketchView() ? (session.deleteSelected() ? (updateStatus(), markSketch()) : false) : deleteSelection()),
  move: () => bodyTransform("move"),
  rotate: () => bodyTransform("rotate"),
  scale: () => bodyTransform("scale"),
  sketch: () => {
    const t = !selected && currentTarget();
    if (!t) return flashMessage("Select a plane or a face first (click it), then press S or a sketch tool key.");
    if (!["plane", "face", "sketch"].includes(t.kind)) return flashMessage("Sketch from a plane, a face or a closed sketch shape. Click one first.");
    if (!planeOfTarget(t)) return flashMessage("Round faces cannot be sketched on yet.");
    sel = null;
    applySel();
    enterSketch(planeOfTarget(t));
  },
  extrude: () => {
    if (extrude) return;
    if (inSketchView()) {
      const r = session.tool === "select" && session.selectedId ? regionsOf(session.entities()).find((x) => x.id === session.selectedId) : null;
      return r ? startExtrudeFromRegion(r) : setTool("extrude"); // a closed shape is selected: pull it; otherwise pick one
    }
    const t = currentTarget();
    if (t?.kind === "face") return flashMessage("E extrudes sketch shapes. To move a face press M; to extrude from a face, S sketches on it first.");
    if (t?.kind === "sketch") {
      const r = regionsOf(store.entities(t.plane)).find((x) => x.id === t.id);
      return r ? startExtrudeFromRegion(r, t.plane) : undefined;
    }
    if (t && ["body", "edge", "vertex"].includes(t.kind)) return flashMessage(t.kind === "body" ? "E pulls faces and sketch shapes. For the whole body: M move, R rotate, K scale." : "E pulls faces and sketch shapes. Lines and corners cannot be modified yet.");
    flashMessage(t ? "Planes have nothing to pull: select a face or a closed sketch shape, then press E." : "Select a face or a closed sketch shape first (click it), then press E.");
  },
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
  const segs = xform
    ? [{ label: xform.sess.label(), text: `${xform.sess.text || String(Math.round(xformValue() * 1000) / 1000)}${UNITS[xform.sess.mode]}`, active: !!xform.sess.text, typed: !!xform.sess.text, invalid: xform.sess.invalid() }]
    : extrude
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
  } else if (!selected && currentTarget()) {
    const t = currentTarget();
    if (["plane", "face", "sketch"].includes(t.kind) && planeOfTarget(t)) {
      const plane = planeOfTarget(t);
      items.push({ label: t.kind === "face" ? "Sketch on surface" : `Sketch on this ${targetName(t)}`, hint: key("sketch"), run: () => (sel = null, applySel(), enterSketch(plane)) });
    }
    if (t.kind === "face" && t.face.type === "cyl") items.push({ label: "Change radius", hint: key("move"), run: () => startCylinder("cylRadius", t.face) }, { label: "Taper", hint: key("rotate"), run: () => startCylinder("cylDraft", t.face) });
    else if (t.kind === "face") items.push({ label: "Move face", hint: key("move"), run: () => startFaceExtrude(t.face) }, { label: "Tilt face", hint: key("rotate"), run: () => startFaceTilt(t.face) });
    if (t.kind === "edge") items.push({ label: "Fillet (round)", hint: key("fillet"), run: () => startEdgeMod("fillet", t.edge) }, { label: "Chamfer (bevel)", hint: key("chamfer"), run: () => startEdgeMod("chamfer", t.edge) });
    if (t.kind === "sketch") items.push({ label: "Extrude", hint: key("extrude"), run: () => (sel = t, ACTIONS.extrude()) });
    if (t.kind === "body") for (const [label, mode] of [["Move", "move"], ["Rotate", "rotate"], ["Scale", "scale"]]) items.push({ label, hint: key(mode), run: () => startTransform(mode) });
    items.push("sep");
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
    g = { kind: "extdrag", t0: pullParam(ev.clientX, ev.clientY), d0: effective(), ...base }; // a press without dragging is a click: it applies
    return;
  }
  if (xform) {
    const sess = xform.sess;
    g = { kind: "xdrag", t0: sess.mode === "move" ? moveParam(ev.clientX, ev.clientY) : 0, v0: xformValue(), ...base };
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
  if (g && (g.kind === "xdrag" || g.kind === "extdrag") && !g.moved) {
    if (Math.hypot(ev.clientX - g.x0, ev.clientY - g.y0) < V.clickMovePx) return; // still a click
    g.moved = true;
  }
  if (g && g.kind === "xdrag" && xform) {
    const sess = xform.sess;
    const fine = ev.shiftKey;
    if (sess.mode === "move") {
      const t = moveParam(ev.clientX, ev.clientY);
      if (t !== null && g.t0 !== null) sess.drag(g.v0 + (t - g.t0), fine);
    } else if (sess.mode === "rotate" || sess.mode === "draft") sess.drag(g.v0 + (ev.clientX - g.x0) * S.transform.rotateDegPerPx, fine);
    else if (sess.mode === "scale") sess.drag(g.v0 * Math.exp(-(ev.clientY - g.y0) * S.transform.scalePerPx), fine);
    else {
      const mmPerPx = (2 * view.dist * Math.tan(THREE.MathUtils.degToRad(V.fovDeg / 2))) / canvas.clientHeight; // fillet, chamfer, radius: mm per pixel on screen
      sess.drag(g.v0 + (ev.clientX - g.x0) * mmPerPx, fine);
    }
    refreshUI();
    return;
  }
  if (g && g.kind === "extdrag" && extrude) {
    const t = pullParam(ev.clientX, ev.clientY);
    if (t !== null && g.t0 !== null) extrude.sess.drag(g.d0 + (t - g.t0), ev.shiftKey);
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
  if (extrude || xform) return;
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
  if ((was.kind === "xdrag" || was.kind === "extdrag") && !was.moved) {
    // a click in the world, not a drag: apply the operation and let go of the selection
    if (xform) commitTransform();
    else if (extrude) commitExtrude();
    sel = null;
    applySel();
    return;
  }
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
    selectFromHover(); // selecting does not move the camera; E, S, R, C, L then act on the selection
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
  // while moving, rotating or scaling a body: digits, Enter, Backspace, X Y Z (axis) and M T K (mode)
  if (xform && !e.ctrlKey && !e.metaKey) {
    if (e.key === "Enter") return e.preventDefault(), commitTransform();
    if (e.key === "Backspace") return e.preventDefault(), xform.sess.backspace(), refreshUI();
    const ax = ["x", "y", "z"].indexOf(e.key.toLowerCase());
    if (ax >= 0 && ["move", "rotate"].includes(xform.sess.mode)) return e.preventDefault(), xform.kind === "faceTilt" && Math.abs(xform.ref.n[ax]) > 0.97 ? flashMessage("A face tilts about an axis lying in it, not its own normal.") : (xform.sess.setAxis(ax), refreshUI());
    if (e.key.length === 1 && xform.sess.type(e.key)) return e.preventDefault(), refreshUI();
  }
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
  shown: () => ({ lastPlane, hovered }),
  xformState: () => (xform ? { mode: xform.sess.mode, axis: xform.sess.axis, value: xformValue() } : null),
  selInfo: () => (sel ? { kind: sel.kind, plane: sel.plane, id: sel.id } : null),
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
