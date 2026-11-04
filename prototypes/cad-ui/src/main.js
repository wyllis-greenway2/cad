// Stage 1: 3D view with infinite XYZ planes. Select a plane -> the camera goes normal to it. Orbit freely;
// clicking the selected plane while tilted returns to its normal view. (Sketching and extruding come next.)
import * as THREE from "three";
import { settings as S } from "./settings.js";
import { PLANES, shortest, cameraOffset, cameraUp, clamp, easeInOut, isNormal, projectOnto, pickPlane } from "./viewmath.mjs";

const $ = (id) => document.getElementById(id);
const G = S.grid;
const V = S.view;

// ---------------------------------------------------------------- state
const view = { a: V.homeAzimuth, e: V.homeElevation, dist: V.homeDistance, target: new THREE.Vector3() };
let selected = null; // "XY" | "XZ" | "YZ" | null
let hovered = null;
let anim = null;

// ---------------------------------------------------------------- renderer, camera
const canvas = $("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setClearColor(S.theme.background);
renderer.autoClear = false;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(V.fovDeg, 1, 0.1, 1000);

function applyCamera() {
  const o = cameraOffset(view.a, view.e);
  const up = cameraUp(view.a, view.e);
  camera.position.set(view.target.x + view.dist * o[0], view.target.y + view.dist * o[1], view.target.z + view.dist * o[2]);
  camera.up.set(up[0], up[1], up[2]);
  camera.lookAt(view.target);
  camera.near = Math.max(0.01, view.dist * V.nearFactor);
  camera.far = view.dist * V.farFactor + 100;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}

// ---------------------------------------------------------------- infinite grid planes (shader)
const VERT = /* glsl */ `
varying vec3 vPos;
void main() {
  vPos = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0);
}`;
const FRAG = /* glsl */ `
uniform vec3 uCam; uniform vec3 uTarget; uniform float uDist;
uniform int uAxis; uniform vec3 uTint; uniform vec3 uColU; uniform vec3 uColV;
uniform float uGrid; uniform float uSheet; uniform float uAxes;
uniform float uLodDiv; uniform float uFadeNear; uniform float uFadeFar;
uniform float uGrazeMin; uniform float uGrazeFull; uniform float uAxisW; uniform float uStyleMin;
uniform float uLineA; uniform float uSheetA; uniform float uBorderA; uniform float uSheetR;
varying vec3 vPos;

float gridLine(vec2 c, float s) {
  vec2 q = c / s;
  vec2 g = abs(fract(q - 0.5) - 0.5) / max(fwidth(q), vec2(1e-6));
  return 1.0 - min(min(g.x, g.y), 1.0);
}
void main() {
  vec2 c; vec3 n;
  if (uAxis == 2) { c = vPos.xy; n = vec3(0.0, 0.0, 1.0); }
  else if (uAxis == 1) { c = vPos.xz; n = vec3(0.0, 1.0, 0.0); }
  else { c = vPos.yz; n = vec3(1.0, 0.0, 0.0); }

  // grid (sketch plane only): three levels 10x apart that cross-fade as you zoom. A level's weight depends only on
  // its spacing relative to the view, so it is continuous across zoom steps.
  float lg = log(uDist / uLodDiv) / log(10.0);
  float lod = floor(lg);
  float f = lg - lod;
  float s0 = pow(10.0, lod);
  float x0 = -f; float x1 = 1.0 - f;
  float w0 = clamp(x0 + 1.0, 0.0, 1.0) * mix(uStyleMin, 1.0, clamp((x0 + 1.0) / 2.0, 0.0, 1.0));
  float w1 = mix(uStyleMin, 1.0, clamp((x1 + 1.0) / 2.0, 0.0, 1.0));
  float w2 = f;
  float grid = max(max(gridLine(c, s0) * w0, gridLine(c, s0 * 10.0) * w1), gridLine(c, s0 * 100.0) * w2);

  vec2 w = fwidth(c);
  float axU = 1.0 - min(abs(c.y) / (max(w.y, 1e-6) * uAxisW), 1.0); // v = 0 runs along the u axis
  float axV = 1.0 - min(abs(c.x) / (max(w.x, 1e-6) * uAxisW), 1.0); // u = 0 runs along the v axis

  float d = length(vPos - uTarget);
  float fade = 1.0 - smoothstep(uDist * uFadeNear, uDist * uFadeFar, d);
  float ang = smoothstep(uGrazeMin, uGrazeFull, abs(dot(normalize(uCam - vPos), n)));

  // hover sheet: a finite square around the origin with an outline
  float m = max(abs(c.x), abs(c.y));
  float fm = max(fwidth(m), 1e-6);
  float inside = 1.0 - smoothstep(uSheetR - fm, uSheetR, m);
  float border = 1.0 - min(abs(m - uSheetR) / (fm * 1.5), 1.0);
  float sheet = (uSheetA * inside + uBorderA * border) * uSheet * ang;

  vec3 col = mix(uTint, vec3(0.82, 0.86, 0.95), 0.45 * uGrid + 0.35 * border * uSheet);
  float a = max(grid * uLineA * uGrid * fade * ang, sheet);          // grid (sketch plane) or hover sheet
  float ax = max(axU, axV) * uAxes * fade;                              // axis lines
  col = mix(col, mix(uColU, uColV, step(axU, axV)), step(a, ax));        // an axis line wins where it is stronger
  gl_FragColor = vec4(col, max(a, ax));
}`;

const planeMeshes = {};
for (const [name, def] of Object.entries(PLANES)) {
  const T = S.theme;
  const axisCol = [T.axisX, T.axisY, T.axisZ];
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uCam: { value: new THREE.Vector3() }, uTarget: { value: new THREE.Vector3() }, uDist: { value: 1 },
      uAxis: { value: def.axis }, uTint: { value: new THREE.Vector3(...T[`tint${name}`]) },
      uColU: { value: new THREE.Vector3(...axisCol[def.u]) }, uColV: { value: new THREE.Vector3(...axisCol[def.v]) },
      uGrid: { value: 0 }, uSheet: { value: 0 }, uAxes: { value: 1 },
      uLodDiv: { value: G.lodDivisor }, uFadeNear: { value: G.fadeNearFactor }, uFadeFar: { value: G.fadeFarFactor },
      uGrazeMin: { value: G.grazeMinCos }, uGrazeFull: { value: G.grazeFullCos }, uAxisW: { value: G.axisWidthPx }, uStyleMin: { value: G.fineLineStrength },
      uLineA: { value: G.lineAlpha }, uSheetA: { value: G.sheetAlpha }, uBorderA: { value: G.sheetBorderAlpha }, uSheetR: { value: 1 },
    },
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  if (def.axis === 1) mesh.rotation.x = Math.PI / 2;
  if (def.axis === 0) mesh.rotation.y = Math.PI / 2;
  mesh.frustumCulled = false;
  planeMeshes[name] = mesh;
  scene.add(mesh);
}

/** Keep each grid quad centered on the target (projected onto its plane) and sized to the view, so the grid
 *  looks infinite and vertex positions stay small (float precision). Grid lines are in world coordinates. */
/** Half side of the hover sheets, scaled with the camera distance so they keep the same apparent size. */
const sheetHalf = () => camera.position.length() * G.sheetHalfFactor;

function updatePlanes() {
  for (const [name, mesh] of Object.entries(planeMeshes)) {
    const c = projectOnto(name, view.target.toArray());
    mesh.position.set(c[0], c[1], c[2]);
    mesh.scale.setScalar(view.dist * G.extentFactor);
    const u = mesh.material.uniforms;
    u.uCam.value.copy(camera.position);
    u.uTarget.value.copy(view.target);
    u.uDist.value = view.dist;
    // 3D overview: no grid, only a sheet on the hovered plane. Sketch mode: grid on the sketch plane only.
    u.uGrid.value = selected === name ? 1 : 0;
    u.uSheet.value = !selected && hovered === name ? 1 : 0;
    u.uSheetR.value = sheetHalf();
    u.uAxes.value = !selected || selected === name ? G.axisAlpha : G.axisAlphaOthers;
  }
}

// ---------------------------------------------------------------- axis gizmo (corner)
const gizmoScene = new THREE.Scene();
const gizmoCam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
const axisDirs = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
const axisHex = [0xeb5959, 0x66cc73, 0x66a0ff];
axisDirs.forEach((d, i) => gizmoScene.add(new THREE.ArrowHelper(d, new THREE.Vector3(), 1, axisHex[i], 0.3, 0.16)));
const axisLabels = [$("lx"), $("ly"), $("lz")];

function drawGizmo(w, h) {
  const size = S.gizmo.sizePx;
  const x = w - size - S.gizmo.padPx;
  const y = S.gizmo.padPx; // from the bottom
  const o = cameraOffset(view.a, view.e);
  const up = cameraUp(view.a, view.e);
  gizmoCam.position.set(o[0] * 4, o[1] * 4, o[2] * 4);
  gizmoCam.up.set(up[0], up[1], up[2]);
  gizmoCam.lookAt(0, 0, 0);
  gizmoCam.updateMatrixWorld();
  renderer.setScissorTest(true);
  renderer.setViewport(x, y, size, size);
  renderer.setScissor(x, y, size, size);
  renderer.clearDepth();
  renderer.render(gizmoScene, gizmoCam);
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, w, h);
  axisDirs.forEach((d, i) => {
    const p = d.clone().multiplyScalar(S.gizmo.labelOffset).project(gizmoCam);
    axisLabels[i].style.left = `${x + ((p.x + 1) / 2) * size}px`;
    axisLabels[i].style.top = `${h - y - size + ((1 - p.y) / 2) * size}px`;
  });
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
    renderer.render(scene, camera);
    drawGizmo(w, h);
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
}

// ---------------------------------------------------------------- UI text
function updateStatus() {
  document.querySelectorAll("#tools button[data-plane]").forEach((b) => b.classList.toggle("on", b.dataset.plane === selected));
  let text = "3D view. Hover near the origin to see a plane, click it to sketch on it.";
  if (selected) {
    text = isNormal(view, selected, V.normalToleranceRad)
      ? `Sketch mode on ${selected}. Esc leaves sketch mode.`
      : `Sketch mode on ${selected}, tilted. Click the plane to return to its normal view. Esc leaves sketch mode.`;
  }
  $("status").textContent = text;
}

// ---------------------------------------------------------------- picking
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function pickAt(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  applyCamera();
  raycaster.setFromCamera(ndc, camera);
  return pickPlane(raycaster.ray.origin.toArray(), raycaster.ray.direction.toArray(), { maxDist: view.dist * S.pick.maxDistanceFactor, minCos: G.grazeMinCos, only: selected, halfSize: selected ? null : sheetHalf() }); // sketch mode: only the sketch plane (infinite); 3D mode: the visible sheets
}

// ---------------------------------------------------------------- input
let g = null; // { x, y, button, shift, moved }
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("pointerdown", (ev) => {
  canvas.setPointerCapture(ev.pointerId);
  g = { x: ev.clientX, y: ev.clientY, x0: ev.clientX, y0: ev.clientY, button: ev.button, pan: ev.button === 1 || ev.button === 2 || ev.shiftKey, moved: false };
});
canvas.addEventListener("pointermove", (ev) => {
  if (!g) {
    const hit = pickAt(ev.clientX, ev.clientY);
    const h = hit?.plane ?? null;
    const tag = $("tag");
    tag.style.display = h && !selected ? "block" : "none";
    if (h && !selected) (tag.textContent = `${h} plane: click to sketch`), (tag.style.left = `${ev.clientX + 16}px`), (tag.style.top = `${ev.clientY + 16}px`);
    if (h !== hovered) {
      hovered = h;
      canvas.style.cursor = h && (!selected || !isNormal(view, selected, V.normalToleranceRad)) ? "pointer" : "default";
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
  else if (!isNormal(view, selected, V.normalToleranceRad)) goNormal(selected); // tilted: click returns to normal
  // already normal: later stages will use this click to sketch
});
canvas.addEventListener("pointerleave", () => {
  $("tag").style.display = "none";
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
  if (e.key === "Escape") (selected = null), updateStatus(), requestRender();
  if (e.key.toLowerCase() === "h") goHome();
});
document.querySelectorAll("#tools button[data-plane]").forEach((b) => b.addEventListener("click", () => selectPlane(b.dataset.plane)));
$("home").addEventListener("click", goHome);

// ---------------------------------------------------------------- boot
resize();
updateStatus();
// Hooks for the automated browser check (not used by the UI).
window.__ui = {
  state: () => ({ selected, hovered, a: view.a, e: view.e, dist: view.dist, target: view.target.toArray(), normal: selected ? isNormal(view, selected, V.normalToleranceRad) : null, animating: !!anim }),
  pickAt,
  worldToScreen(x, y, z) {
    applyCamera();
    const v = new THREE.Vector3(x, y, z).project(camera);
    const r = canvas.getBoundingClientRect();
    return [r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height];
  },
};
