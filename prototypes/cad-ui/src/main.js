// 3D view with infinite XYZ planes in paper gray and charcoal (no blue), with distance fog; the world axes keep their
// colors. Click a plane: it becomes the sketch plane and the camera goes face-on to it. Orbiting away drops the sketch
// plane (back to the 3D view, where any plane can be hovered and clicked). Sketching and extruding come next.
import * as THREE from "three";
import { settings as S } from "./settings.js";
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

  // World fog: the plane keeps its own colors and simply fades into the world behind it with distance.
  float aLine = grid * uLineA * fog;          // grid lines
  float aFill = uFillA * fog;                 // the sheet itself
  float a = aLine + aFill * (1.0 - aLine);
  vec3 col = a > 0.0 ? (uLineCol * aLine + uCol * aFill * (1.0 - aLine)) / a : uCol;
  float ax = max(axU, axV) * uAxisA * axFog;
  col = mix(col, mix(uColU, uColV, step(axU, axV)), step(a, ax)); // an axis line wins where it is stronger
  gl_FragColor = vec4(col, max(a, ax));
}`;

const planeMeshes = {};
for (const [name, def] of Object.entries(PLANES)) {
  const axisCol = [T().axisX, T().axisY, T().axisZ];
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
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
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  if (def.axis === 1) mesh.rotation.x = Math.PI / 2;
  if (def.axis === 0) mesh.rotation.y = Math.PI / 2;
  mesh.frustumCulled = false;
  planeMeshes[name] = mesh;
  scene.add(mesh);
}

/** Keep each plane's quad centered on the target (projected onto the plane) and sized to the view, so it looks
 *  infinite and vertex positions stay small (float precision). Grid lines are in world coordinates. */
function updatePlanes() {
  for (const [name, mesh] of Object.entries(planeMeshes)) {
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
    const state = selected === name ? states.selected : hovered === name ? states.hover : states.base;
    const th = T();
    u.uCol.value.set(...th.sheet);
    u.uLineCol.value.set(...th.gridLine);
    u.uLineA.value = state.line;
    u.uFillA.value = state.fill;
    u.uFineMul.value = state.fine; // the densest grid level is only shown on the sketch plane
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
  for (const [name, mesh] of Object.entries(planeMeshes)) {
    mesh.material.uniforms.uColU.value.set(...axes[PLANES[name].u]);
    mesh.material.uniforms.uColV.value.set(...axes[PLANES[name].v]);
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
function selectPlane(plane) {
  selected = plane;
  goNormal(plane);
  updateStatus();
}
function goHome() {
  selected = null;
  animateTo({ a: V.homeAzimuth, e: V.homeElevation, target: new THREE.Vector3() }, V.transitionMs);
  updateStatus();
  requestRender();
}

// ---------------------------------------------------------------- status text (the only text on screen)
function updateStatus() {
  let text = "3D view   hover to find a plane, click it to sketch on it";
  if (selected) {
    text = isNormal(view, selected, V.normalToleranceRad)
      ? `Sketching on ${selected}   orbit away or press Esc for the 3D view`
      : `Going to ${selected}...`;
  }
  $("status").textContent = text;
}

// ---------------------------------------------------------------- picking
/** Looking straight at the selected plane = sketch view. Anything else (tilted, or nothing selected) = 3D mode. */
const inSketchView = () => !!selected && isNormal(view, selected, V.normalToleranceRad);
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function pickAt(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  applyCamera();
  raycaster.setFromCamera(ndc, camera);
  return pickPlane(raycaster.ray.origin.toArray(), raycaster.ray.direction.toArray(), { maxDist: view.dist * F.farFactor, minCos: G.grazeMinCos, only: inSketchView() ? selected : null }); // face-on to the sketch plane: only it exists; tilted (3D mode): any plane
}

// ---------------------------------------------------------------- input
let g = null; // { x, y, x0, y0, button, pan, moved }
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("pointerdown", (ev) => {
  canvas.setPointerCapture(ev.pointerId);
  g = { x: ev.clientX, y: ev.clientY, x0: ev.clientX, y0: ev.clientY, button: ev.button, pan: ev.button === 1 || ev.button === 2 || ev.shiftKey, moved: false };
});
canvas.addEventListener("pointermove", (ev) => {
  if (!g) {
    const h = pickAt(ev.clientX, ev.clientY)?.plane ?? null;
    if (h !== hovered) {
      hovered = h;
      const clickable = h && (h !== selected || !isNormal(view, selected, V.normalToleranceRad));
      canvas.style.cursor = clickable ? "pointer" : "default";
      requestRender();
    }
    return;
  }
  if (!g.moved && Math.hypot(ev.clientX - g.x0, ev.clientY - g.y0) < V.clickMovePx) return;
  g.moved = true;
  anim = null; // the user took over the camera
  const dx = ev.clientX - g.x;
  const dy = ev.clientY - g.y;
  g.x = ev.clientX;
  g.y = ev.clientY;
  if (g.pan) {
    const k = (2 * view.dist * Math.tan(THREE.MathUtils.degToRad(V.fovDeg / 2))) / canvas.clientHeight;
    const m = camera.matrixWorld.elements;
    view.target.x += -m[0] * dx * k + m[4] * dy * k;
    view.target.y += -m[1] * dx * k + m[5] * dy * k;
    view.target.z += -m[2] * dx * k + m[6] * dy * k;
  } else {
    view.a -= dx * V.orbitRadPerPx;
    view.e = clamp(view.e + dy * V.orbitRadPerPx, -Math.PI / 2, Math.PI / 2);
    if (selected && !isNormal(view, selected, V.normalToleranceRad)) selected = null; // orbiting out of the face-on view = back to 3D mode
  }
  updateStatus();
  requestRender();
});
canvas.addEventListener("pointerup", (ev) => {
  const was = g;
  g = null;
  if (!was || was.moved || was.button !== 0) return;
  const hit = pickAt(ev.clientX, ev.clientY);
  if (!hit) return;
  if (selected !== hit.plane) selectPlane(hit.plane);
  // clicking the sketch plane while face-on: later stages will use this click to sketch
});
canvas.addEventListener("pointerleave", () => {
  if (hovered) (hovered = null), requestRender();
});
canvas.addEventListener(
  "wheel",
  (e) => {
    view.dist = clamp(view.dist * Math.exp(e.deltaY * V.zoomPerWheel), V.minDistance, V.maxDistance);
    requestRender();
    e.preventDefault();
  },
  { passive: false },
);
addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return; // typing in the tuning panel
  if (e.key === "Escape") (selected = null), updateStatus(), requestRender();
  if (e.key.toLowerCase() === "h") goHome();
  if (e.key.toLowerCase() === "d") (themeName = themeName === "world" ? "paper" : "world"), applyTheme();
});

// ---------------------------------------------------------------- boot
applyTheme();
resize();
updateStatus();
// Hooks for the automated browser check (not used by the UI).
window.__ui = {
  state: () => ({ selected, hovered, a: view.a, e: view.e, dist: view.dist, target: view.target.toArray(), normal: selected ? isNormal(view, selected, V.normalToleranceRad) : null, animating: !!anim }),
  settings: S,
  pickAt,
  setView: ({ a, e, dist }) => ((view.a = a ?? view.a), (view.e = e ?? view.e), (view.dist = dist ?? view.dist), requestRender()),
  worldToScreen(x, y, z) {
    applyCamera();
    const v = new THREE.Vector3(x, y, z).project(camera);
    const r = canvas.getBoundingClientRect();
    return [r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height];
  },
};
