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
import { elementAt } from "./sketchpick.mjs";
import { modelOf } from "./sketchsolve.mjs";
import { barItems, barHint } from "./actionbar.mjs";
import { iconSvg, iconTitle, keyShort } from "./icons.mjs";
import { ExtrudeSession } from "./extrude.mjs";
import { TransformSession, AXIS_NAMES, UNITS } from "./transform.mjs";
import { buildGraph } from "./features.mjs";
import { createBody } from "./body.js";
import { hoverOrb, selectOrb, fullOrb, orbMaterial, selectedLook } from "./orb.js";
import { PLANES, planeDef, addFacePlane, basisOf, frameOf, planeOrigin, shortest, cameraOffset, cameraUp, clamp, easeInOut, isNormal, normalSide, flippedView, projectOnto, pickPlane } from "./viewmath.mjs";

const $ = (id) => document.getElementById(id);
const G = S.grid;
const V = S.view;
const F = S.fog; // world fog (objects)
const A = S.sheetArea; // how far a sheet's light, grid and axes reach
const T = () => S.themes[S.themeName];
/** The ring's colour: exactly what a selected face looks like (the teal at its opacity over the model's grey), `in_075`. */
const ringColor = () => selectedLook(S.orb.color, S.orb.selectOpacity, hexToRgb(T().bodyColor));
const hexToRgb = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
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
scene.fog = new THREE.Fog(0x000000, 1, 1000); // world fog for objects; near/far follow the camera distance each frame (see updatePlanes)
const persp = new THREE.PerspectiveCamera(V.fovDeg, 1, 0.1, 1000);
const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000); // used face-on to a plane: no perspective, so the plane is seen flat
let camera = persp;
let aspect = 1;

let normalFor = null; // the plane the camera was last turned square to (by N, X Y Z or a triple click)
function applyCamera() {
  const o = cameraOffset(view.a, view.e);
  const up = cameraUp(view.a, view.e);
  const useOrtho = !extrude && ((!!selected && isNormal(view, selected, V.normalToleranceRad)) || (!!normalFor && isNormal(view, normalFor, V.normalToleranceRad))); // looking straight at a plane is always orthographic (`in_070`)
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
uniform float uLineA; uniform float uOpacity; uniform float uAxisA;
uniform vec3 uLineCol;
uniform float uLodDiv; uniform float uStyleMin; uniform float uFineMul; uniform float uMinCellPx;
uniform float uFogNear; uniform float uFogFar; uniform float uAxisFogFar; uniform float uFogK;
uniform float uAxisW;
uniform float uPane; uniform float uPaneOff; uniform float uPaneR; uniform float uAxisLen; uniform float uEdgeA; uniform vec3 uFadeC; uniform float uFadeR;
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

  // panes style: the plane is only a small square (0..uPane in its own axes) with an outline; the axis lines are never cut
  float paneIn = 1.0;
  float edge = 0.0;
  if (uPane > 0.0) {
    // a rounded square from uPaneOff to uPaneOff + uPane in the plane's own axes (signed distance to its outline: negative inside)
    float hf = uPane * 0.5;
    float r = min(uPaneR * uPane, hf);
    vec2 pc = abs(c - vec2(uPaneOff + hf)) - vec2(hf - r);
    float d = length(max(pc, 0.0)) + min(max(pc.x, pc.y), 0.0) - r;
    float fw = max(length(fwidth(c)), 1e-6);
    paneIn = 1.0 - smoothstep(-0.5 * fw, 0.5 * fw, d);
    edge = (1.0 - clamp(-d / (fw * 1.3), 0.0, 1.0)) * paneIn;
  }
  // the sketch grid fades out away from the view centre (uFadeR > 0)
  float gridFade = uFadeR > 0.0 ? 1.0 - smoothstep(0.35 * uFadeR, uFadeR, distance(vPos, uFadeC)) : 1.0;
  grid *= gridFade * paneIn;

  vec2 w = fwidth(c);
  float axU = 1.0 - min(abs(c.y) / (max(w.y, 1e-6) * uAxisW), 1.0); // v = 0 runs along the u axis
  float axV = 1.0 - min(abs(c.x) / (max(w.x, 1e-6) * uAxisW), 1.0); // u = 0 runs along the v axis
  if (uAxisLen > 0.0) { // short axes: only the + half, ending at the arrows
    axU *= step(0.0, c.x) * step(c.x, uAxisLen);
    axV *= step(0.0, c.y) * step(c.y, uAxisLen);
  }

  // World fog by distance from the camera: a smooth fall-off that never has a hard end, so a plane seen at a low angle
  // stays a solid plane that recedes all the way to the horizon (no fade with viewing angle).
  float dc = distance(uCam, vPos);
  float t = max(dc - uDist * uFogNear, 0.0) / (uDist * (uFogFar - uFogNear));
  float ta = max(dc - uDist * uFogNear, 0.0) / (uDist * (uAxisFogFar - uFogNear));
  float fog = exp(-uFogK * t * t);
  float axFog = exp(-uFogK * ta * ta);

#if PASS == 0
  // Paint layer: a pane's fill.
  gl_FragColor = vec4(uCol, uOpacity * fog * paneIn); // world planes stay grey: only objects turn teal
#else
  float a = max(grid * uLineA * fog, edge * uEdgeA);                  // grid lines and the pane outline
  float ax = max(axU, axV) * uAxisA * axFog;                          // world axis lines
  vec3 col = mix(uLineCol, mix(uColU, uColV, step(axU, axV)), step(a, ax)); // an axis line wins where it is stronger
  gl_FragColor = vec4(col, max(a, ax));
#endif
}`;

const planeMeshes = {}; // name -> { paint, lines }: a pane's fill; its outline, the sketch grid and the axis lines
for (const [name, def] of Object.entries(PLANES)) {
  const axisCol = [T().axisX, T().axisY, T().axisZ];
  const makeMat = (pass) => new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    defines: { PASS: pass },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uCam: { value: new THREE.Vector3() }, uDist: { value: 1 },
      uU: { value: new THREE.Vector3(...def.basis[0]) }, uV: { value: new THREE.Vector3(...def.basis[1]) }, uCol: { value: new THREE.Vector3(...T().sheet) },
      uColU: { value: new THREE.Vector3(...axisCol[def.u]) }, uColV: { value: new THREE.Vector3(...axisCol[def.v]) },
      uLineA: { value: 0 }, uOpacity: { value: 0 }, uAxisA: { value: G.axisAlpha },
      uLodDiv: { value: G.lodDivisor }, uStyleMin: { value: G.fineLineStrength }, uFineMul: { value: 0 }, uMinCellPx: { value: G.minCellPx },
      uLineCol: { value: new THREE.Vector3() },
      uFogNear: { value: A.nearFactor }, uFogFar: { value: A.farFactor }, uAxisFogFar: { value: A.axisFarFactor }, uFogK: { value: A.sharpness },
      uAxisW: { value: G.axisWidthPx },
      uPane: { value: 0 }, uPaneOff: { value: 0 }, uPaneR: { value: 0 }, uAxisLen: { value: 0 }, uEdgeA: { value: 0 }, uFadeC: { value: new THREE.Vector3() }, uFadeR: { value: 0 },
    },
  });
  const geo = new THREE.PlaneGeometry(1, 1);
  const paint = new THREE.Mesh(geo, makeMat(0));
  const lines = new THREE.Mesh(geo, makeMat(2));
  paint.renderOrder = 1;
  lines.renderOrder = 3;
  for (const mesh of [paint, lines]) {
    mesh.frustumCulled = false;
    scene.add(mesh);
  }
  planeMeshes[name] = { paint, lines };
}

/** Keep each plane's quad centered on the target (projected onto the plane) and sized to the view, so it looks
 *  infinite and vertex positions stay small (float precision). Grid lines are in world coordinates. */
const mix3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const baseOf = (id) => (id ? planeDef(id).base ?? id : null);
const selPlane = () => (sel?.kind === "plane" ? sel.plane : null); // a selected world plane (not sketching on it)
/** The plane that N, X, Y and Z act on: the sketch plane, else a selected plane, or the plane of a selected face or sketch shape. */
function actingPlane() {
  if (selected) return selected;
  if (!sel) return null;
  if (sel.kind === "plane") return sel.plane;
  return ["face", "sketch"].includes(sel.kind) ? planeOfTarget(sel) ?? null : null;
}
/** Is this plane the one being sketched on, selected or pointed at? (Its surface and lines lean blue.) */
const hotOf = (plane) => plane === selected || plane === selPlane() || plane === hovered || hoveredSketch?.plane === plane || (sel?.kind === "sketch" && sel.plane === plane);
let paneFade = 0; // 0..1: the sketch grid fading in on the plane you look straight at
function updatePlanes() {
  scene.fog.near = view.dist * F.nearFactor;
  scene.fog.far = view.dist * F.farFactor;
  const th = T();
  const PN = S.panes;
  stepCorner();
  const cornerK = 1 - cornerT; // the world axes and panes fade as the compass moves to the corner
  const axisLen = S.axisArrow.lengthFactor * view.dist * Math.tan(THREE.MathUtils.degToRad(V.fovDeg / 2)); // the axes stop at their arrows
  const actP = selected ?? selPlane(); // the plane being sketched on or selected
  const faceOnAct = !!actP && isNormal(view, actP, V.normalToleranceRad);
  const want = faceOnAct ? 1 : 0; // the grid shows only while you look straight at the plane
  paneFade += (want - paneFade) * PN.fadeEase;
  if (Math.abs(want - paneFade) < 0.01) paneFade = want;
  else requestRender(); // keep fading
  for (const [name, pair] of Object.entries(planeMeshes)) {
   const mine = !!actP && baseOf(actP) === name;
   const hot = !faceOnAct && (hovered === name || mine);
   let line = 0;
   let opacity = 0;
   let fine = 0;
   let paneSize = 0;
   let edgeA = 0;
   let fadeR = 0;
   if (faceOnAct) {
     if (mine) (line = PN.gridAlpha * paneFade), (fine = PN.fine), (fadeR = view.dist * PN.fadeRadius);
   } else {
     opacity = (hot ? PN.hoverOpacity : PN.opacity) * cornerK; // a world plane only gets a little greyer and its outline stronger when pointed at or selected: it never turns blue (`in_079`)
     paneSize = cornerK > 0 ? view.dist * PN.size : 0;
     edgeA = (hot ? PN.hoverEdgeAlpha : PN.edgeAlpha) * cornerK;
   }
   const blue = 0;
   const sheet = mix3(th.sheet, th.blueSurface, blue);
   const lineCol = mix3(th.gridLine, th.blueLine, Math.min(1, blue * 3));
   // while sketching on a face, this sheet takes that face's place and orientation (any angle); otherwise it is the base plane itself
   const planeId = selected && (planeDef(selected).base ?? selected) === name ? selected : name;
   const def = planeDef(planeId);
   const sheetQuat = new THREE.Quaternion().setFromRotationMatrix(basisMatrix(planeId, new THREE.Vector3()));
   const center = new THREE.Vector3(...projectOnto(planeId, view.target.toArray()));
   for (const mesh of [pair.paint, pair.lines]) {
    mesh.quaternion.copy(sheetQuat);
    mesh.position.copy(center);
    mesh.scale.setScalar(view.dist * G.extentFactor);
    const u = mesh.material.uniforms;
    u.uU.value.set(...def.basis[0]);
    u.uV.value.set(...def.basis[1]);
    u.uCam.value.copy(camera.position);
    u.uDist.value = view.dist;
    u.uLodDiv.value = PN.lodDivisor;
    u.uStyleMin.value = G.fineLineStrength;
    u.uMinCellPx.value = G.minCellPx;
    u.uAxisW.value = G.axisWidthPx;
    u.uAxisA.value = G.axisAlpha * cornerK;
    u.uFogNear.value = A.nearFactor;
    u.uFogFar.value = A.farFactor;
    u.uAxisFogFar.value = A.axisFarFactor;
    u.uFogK.value = A.sharpness;
    u.uCol.value.set(...sheet);
    u.uLineCol.value.set(...lineCol);
    u.uLineA.value = line;
    u.uFineMul.value = fine;
    u.uPane.value = paneSize;
    u.uPaneOff.value = view.dist * PN.offset;
    u.uPaneR.value = PN.radius;
    u.uAxisLen.value = axisLen;
    u.uEdgeA.value = edgeA;
    u.uFadeC.value.copy(center);
    u.uFadeR.value = fadeR;
    u.uOpacity.value = mesh === pair.paint ? opacity : 0;
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
    const hide = cornerT >= 1 || Math.abs(d.dot(viewDir)) > A.hideCos || len < 1e-3;
    poly.style.display = label.style.display = hide ? "none" : "block";
    if (hide) return;
    const faint = body.blocked(camera.position, p0) ? 0 : 1; // behind an object: not seen through it (`in_066`)
    poly.style.opacity = label.style.opacity = String(faint * (1 - cornerT));
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
    for (const mesh of [pair.paint, pair.lines]) {
      mesh.material.uniforms.uColU.value.set(...axes[PLANES[name].u]);
      mesh.material.uniforms.uColV.value.set(...axes[PLANES[name].v]);
    }
  }
  arrowHeads.forEach((p, i) => p.setAttribute("fill", `#${toHex(axes[i]).toString(16).padStart(6, "0")}`));
  axisLabels.forEach((l, i) => (l.style.color = `#${toHex(axes[i]).toString(16).padStart(6, "0")}`));
  requestRender();
}

// ---------------------------------------------------------------- the compass and X Y Z buttons (compass style, `in_067`, `in_068`)
// Until the first object (an extrusion) exists the world shows the short axes and the helper panes at the origin. When the first object exists, the axes
// shrink and slide into the bottom-right corner, where they live as a compass with X, Y and Z buttons (and the X, Y, Z keys do the same).
let compassHome = false; // the first object exists: the compass lives in the corner
let bigWanted = false; // the compass was clicked: it is back at the origin (big, with the panes) until it is clicked again
let cornerT = 0; // 0 = at the origin, 1 = in the corner
let cornerLast = 0;
function stepCorner() {
  if (!store.features.length) bigWanted = false;
  compassHome = store.features.length > 0 && !bigWanted; // the first object (an extrusion) exists: the compass moves to its corner (`in_069`)
  const now = performance.now();
  const dt = Math.min(0.1, (now - cornerLast) / 1000);
  cornerLast = now;
  const want = compassHome ? 1 : 0;
  if (cornerT !== want) {
    const step = dt / S.panes.cornerSeconds;
    cornerT = want > cornerT ? Math.min(want, cornerT + step) : Math.max(want, cornerT - step);
    if (cornerT !== want) requestRender(); // keep animating
  }
}
const AXIS_PLANES = ["YZ", "XZ", "XY"]; // looking along an axis = square to the plane across it
/** Which end of the axis the camera is on while looking straight at that axis's plane: +1, -1, or 0 when not looking along it. */
function lookSign(ax) {
  const plane = AXIS_PLANES[ax];
  if (selected !== plane && selPlane() !== plane) return 0;
  return normalSide(view, plane, V.normalToleranceRad) * Math.sign(planeDef(plane).n[ax]);
}
/** X, Y, Z (keys or buttons): look straight along that axis from its + end; again, from its - end; and so on (`in_068`). */
function lookAlong(ax) {
  if (extrude || xform) return;
  const plane = AXIS_PLANES[ax];
  const want = lookSign(ax) > 0 ? -1 : 1; // the end of the axis to look from
  const side = want * Math.sign(planeDef(plane).n[ax]); // +1 = the plane's front side
  if (selected && selected !== plane) {
    enterSketch(plane, "select", side); // while sketching, another plane takes over the sketch
    goNormal(plane, side);
  } else {
    if (!selected) (sel = { kind: "plane", plane }), applySel(); // otherwise just select that plane (blue) and look along it
    goNormal(plane, side);
  }
}
const compassEl = $("compass");
const compassSvg = $("compassSvg");
$("compassHit").onclick = () => ((bigWanted = !bigWanted), requestRender()); // click the compass: it goes big at the origin; click it again: back to the corner (`in_070`)
AXIS_NAMES.forEach((label, ax) => {
  const b = document.createElement("button");
  b.dataset.ax = String(ax);
  b.textContent = label;
  withTip(b, { label: `Look along ${label}`, help: `Sketch on the ${AXIS_PLANES[ax]} plane, looking straight at it. Click again to look from the other end.` });
  b.onclick = () => lookAlong(ax);
  compassEl.querySelector(".cbtns").appendChild(b);
});
{
  const n = document.createElement("button"); // N: normal to the plane
  n.id = "compassN";
  n.textContent = "N";
  withTip(n, { label: "Normal", key: "N", help: "Look straight at the selected plane or the plane being sketched on. Again: from its back. Again: from its front." });
  n.onclick = () => normalAction();
  compassEl.querySelector(".cbtns").appendChild(n);
}
function updateCompass() {
  const have = store.features.length > 0;
  compassEl.style.display = cornerT > 0 || have ? "block" : "none";
  compassEl.querySelector("#compassHit").style.display = have ? "block" : "none";
  if (cornerT <= 0 && !have) return;
  const ghost = cornerT <= 0; // big at the origin: a faint compass stays in the corner to click it back
  const t = ghost ? 1 : cornerT;
  const e = easeInOut(t);
  const W = innerWidth;
  const H = innerHeight;
  const corner = [W - 94, H - 63];
  const o = window.__ui.worldToScreen(0, 0, 0); // where the world origin is: the tripod starts there, as big as the world axes
  const R0 = S.axisArrow.lengthFactor * (H / 2);
  const R = R0 + (30 - R0) * e;
  const cx = o[0] + (corner[0] - o[0]) * e;
  const cy = o[1] + (corner[1] - o[1]) * e;
  const mm = camera.matrixWorld.elements;
  const right = [mm[0], mm[1], mm[2]];
  const up = [mm[4], mm[5], mm[6]];
  const fwd = [-mm[8], -mm[9], -mm[10]];
  const T3 = T();
  const cols = [T3.axisX, T3.axisY, T3.axisZ].map((c) => `rgb(${c.map((v) => Math.round(v * 255)).join(",")})`);
  const items = [[1, 0, 0, "X"], [0, 1, 0, "Y"], [0, 0, 1, "Z"]].map(([x, y, z, name], i) => {
    const dot = (a) => x * a[0] + y * a[1] + z * a[2];
    return { name, sx: cx + dot(right) * R, sy: cy - dot(up) * R, depth: dot(fwd), col: cols[i] };
  }).sort((a, b) => b.depth - a.depth); // far ones first, near ones on top
  compassSvg.replaceChildren();
  const ns = "http://www.w3.org/2000/svg";
  const fade = ghost ? 0.35 : Math.min(1, t * 3); // the world axes fade out as this one fades in
  for (const it of items) {
    const g = document.createElementNS(ns, "g");
    g.setAttribute("opacity", String(fade * (it.depth < 0 ? 1 : 0.5)));
    const line = document.createElementNS(ns, "line");
    for (const [k, v] of [["x1", cx], ["y1", cy], ["x2", it.sx], ["y2", it.sy], ["stroke", it.col], ["stroke-width", 2.2], ["stroke-linecap", "round"]]) line.setAttribute(k, v);
    const tx = document.createElementNS(ns, "text");
    for (const [k, v] of [["x", cx + (it.sx - cx) * 1.12 + Math.sign(it.sx - cx) * 6], ["y", cy + (it.sy - cy) * 1.12 + 4], ["text-anchor", "middle"], ["fill", it.col], ["font-size", 12], ["font-weight", 700], ["font-family", "system-ui,sans-serif"]]) tx.setAttribute(k, v);
    tx.textContent = it.name;
    g.append(line, tx);
    compassSvg.appendChild(g);
  }
  const btns = compassEl.querySelector(".cbtns");
  btns.style.opacity = ghost ? "0" : String(t * t);
  btns.style.pointerEvents = !ghost && t > 0.6 ? "auto" : "none";
  for (const b of btns.children) {
    if (b.dataset.ax === undefined) continue; // the N button
    const ax = Number(b.dataset.ax);
    const s = lookSign(ax);
    b.textContent = (s < 0 ? "\u2212" : "") + AXIS_NAMES[ax];
    b.classList.toggle("on", selected === AXIS_PLANES[ax] || selPlane() === AXIS_PLANES[ax]);
  }
}

// ---------------------------------------------------------------- the orb highlights (`in_073`)
let selOrbAnim = null; // the colour spreading over the clicked surface: { t0, c, R0, R1 }
let orbSel = null; // the selection the orb was last set up for
/** How far from `c` the surface under the selection reaches (world): the orb must grow past this to fill it. */
function surfaceReach(c) {
  const far = (pts) => pts.reduce((m, q) => Math.max(m, Math.hypot(q[0] - c[0], q[1] - c[1], q[2] - c[2])), 0);
  if ((sel?.kind === "face" || sel?.kind === "body") && body.ready()) {
    const g = body.faceGeometry(sel.kind === "body" ? body.wholeBody() : sel.face);
    const a = g?.getAttribute("position");
    if (a) {
      let m = 0;
      for (let i = 0; i < a.count; i++) m = Math.max(m, Math.hypot(a.getX(i) - c[0], a.getY(i) - c[1], a.getZ(i) - c[2]));
      g.dispose();
      return m;
    }
  }
  if (sel?.kind === "sketch") {
    const e = store.entities(sel.plane).find((x) => x.id === sel.id);
    if (e) return far(outline(e).pts.map((p) => toWorld(sel.plane, p)));
  }
  return view.dist * 0.35;
}
/** A click just selected a surface: the orb colour radiates from the click over the whole surface. */
function startSelectOrb() {
  orbSel = sel;
  selOrbAnim = null;
  if (!sel || !["face", "body", "sketch"].includes(sel.kind) || !hoverPoint) return;
  const R0 = view.dist * S.orb.radius;
  selOrbAnim = { t0: performance.now(), c: hoverPoint.slice(), R0, R1: Math.max(R0, surfaceReach(hoverPoint)) * S.orb.reachFactor };
  requestRender();
}
function updateOrbs() {
  const O = S.orb;
  const hovering = (!selected || session.tool === "select") && !extrude && !xform && !!hoverPoint && !!(hoveredFace || hoveredSketch); // objects only: a world plane gets no ring
  hoverOrb.uOrbA.value = 0; // pointing at a surface draws only a thin ring, no fill
  hoverOrb.uOrbRingA.value = hovering ? O.ringOpacity : 0;
  if (hoverPoint) hoverOrb.uOrbC.value.set(...hoverPoint);
  hoverOrb.uOrbR.value = view.dist * O.radius;
  hoverOrb.uRingPx.value = O.ringPx;
  fullOrb.uOrbA.value = O.selectOpacity;
  const surface = !!sel && ["face", "body", "sketch"].includes(sel.kind);
  selectOrb.uOrbA.value = surface ? O.selectOpacity : 0;
  selectOrb.uOrbSoft.value = O.softFactor;
  selectOrb.uRingPx.value = O.ringPx;
  selectOrb.uOrbRingA.value = 0;
  if (sel !== orbSel) {
    // selected some other way (no click to spread from): lit all over at once
    orbSel = sel;
    selOrbAnim = null;
    selectOrb.uOrbR.value = 1e6;
    selectOrb.uOrbFill.value = 1;
  }
  if (selOrbAnim) {
    const k = clamp((performance.now() - selOrbAnim.t0) / O.fillMs, 0, 1);
    if (k >= 1) {
      selOrbAnim = null;
      selectOrb.uOrbR.value = 1e6;
      selectOrb.uOrbFill.value = 1;
    } else {
      const e = 1 - (1 - k) ** 3;
      const f = clamp((k - 0.55) / 0.45, 0, 1);
      selectOrb.uOrbC.value.set(...selOrbAnim.c);
      selectOrb.uOrbR.value = selOrbAnim.R0 + (selOrbAnim.R1 - selOrbAnim.R0) * e; // the ring expands to the surface's edges...
      selectOrb.uOrbFill.value = f * f * (3 - 2 * f); // ...while the colour fills it
      selectOrb.uOrbRingA.value = O.ringOpacity;
      requestRender(); // keep spreading
    }
  }
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
    updateOrbs();
    updatePlanes();
    renderer.setViewport(0, 0, w, h);
    renderer.clear();
    if (inSketchView() !== sketchWasFlat) (sketchWasFlat = inSketchView()), (sketchDirty = true);
    if (sketchDirty) rebuildSketchViz();
    updateAxisArrows();
    updateCompass();
    updateOriginPill();
    updateDims();
    updateConstraintUI();
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

function goNormal(plane, side = 1, at = null) {
  normalFor = plane;
  const def = planeDef(plane);
  const t = side < 0 ? flippedView(def.view) : def.view; // from the back when asked (`in_068`)
  animateTo({ a: t.a, e: t.e, target: new THREE.Vector3(...projectOnto(plane, at ?? view.target.toArray())) }, V.transitionMs); // centred on `at` (the clicked point), else on what the camera was looking at
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
/** Pixels per mm on the sketch plane. Face-on (and for anything that is not about the sketch plane) it is the same everywhere; seen at an angle it
 *  changes across the plane, so give the point (local u, v) you care about; with none it is measured where the camera looks. */
function pxPerMm(uv, onPlane = null) {
  const pl = onPlane ?? selected;
  const faceOn = canvas.clientHeight / (2 * view.dist * Math.tan(THREE.MathUtils.degToRad(V.fovDeg / 2)));
  if (!pl || extrude || xform) return faceOn;
  if (isNormal(view, pl, V.normalToleranceRad)) return faceOn;
  applyCamera();
  let at = uv;
  if (!at) {
    const [U, W] = basisOf(pl);
    const c = projectOnto(pl, view.target.toArray());
    at = [c[0] * U[0] + c[1] * U[1] + c[2] * U[2], c[0] * W[0] + c[1] * W[1] + c[2] * W[2]];
  }
  const px = (q) => {
    const v = toWorld(pl, q).project(camera);
    return [((v.x + 1) / 2) * canvas.clientWidth, ((1 - v.y) / 2) * canvas.clientHeight];
  };
  const o = px(at);
  const du = px([at[0] + 1, at[1]]);
  const dv = px([at[0], at[1] + 1]);
  const k = (Math.hypot(du[0] - o[0], du[1] - o[1]) + Math.hypot(dv[0] - o[0], dv[1] - o[1])) / 2;
  return Math.min(1e4, Math.max(0.05, k));
}

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
/** An orb of blue lying on a flat shape (`in_073`): the same soft highlight as on body faces and panes. */
function orbShape(plane, polygon, orb) {
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(polygon.map((p) => new THREE.Vector2(p[0], p[1])))), orbMaterial(S.orb.color, ringColor(), orb));
  mesh.matrixAutoUpdate = false;
  mesh.matrix.copy(basisMatrix(plane));
  mesh.renderOrder = 3.5;
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
    for (const e of key === session.key && session.preview ? session.preview : store.entities(key)) {
      const o = outline(e);
      const pts = o.pts.map((p) => toWorld(plane, p));
      const skSel = plane === session.plane && key === session.key && (session.picks.some((k) => k.kind === "entity" && k.shape === e.id) || (session.tool === "dimension" && e.id === session.selectedId)); // the whole shape is selected in the sketch view
      const hov = (plane === session.plane && session.tool === "extrude" && e.id === session.hoverId) || (hoveredSketch?.plane === plane && hoveredSketch.id === e.id);
      const picked = skSel || (sel?.kind === "sketch" && sel.plane === plane && sel.id === e.id); // stays blue until deselected, in the sketch view and in 3D
      if (o.closed && !isExtruded(plane, e)) {
        sketchGroup.add(fillShape(plane, o.pts, toHex(cream), SK.regionFill));
        const hoverHere = hoveredSketch?.plane === plane && hoveredSketch.id === e.id;
        const selHere = sel?.kind === "sketch" && sel.plane === plane && sel.id === e.id;
        if (selHere) sketchGroup.add(orbShape(plane, o.pts, selectOrb)); // the selected shape: the orb spread over it
        else if (skSel || (plane === session.plane && session.tool === "extrude" && e.id === session.hoverId)) sketchGroup.add(orbShape(plane, o.pts, fullOrb)); // selected or picked in the sketch view: lit all over
        if (hoverHere) sketchGroup.add(orbShape(plane, o.pts, hoverOrb)); // pointed at: an orb at the cursor
      }
      if (SK.haloWidthPx > 0) sketchGroup.add(stroke(pts, { color: haloC, width: SK.haloWidthPx * (skSel ? 1.5 : 1), closed: o.closed, order: 4 }));
      sketchGroup.add(stroke(pts, { color: inkC, width: SK.lineWidthPx * (skSel ? 1.7 : 1), closed: o.closed, order: 5 }));
    }
  }
  const hovInSketch = inSketchView() && session.tool === "select" && hoverEl && !session.picks.some((k) => k.ref === hoverEl.ref);
  const hovIn3D = !!hoveredSkEl && (!inSketchView() || hoveredSkEl.plane !== session.plane);
  if (hovInSketch || hovIn3D) {
    // the corner, line or circle under the cursor lights up: in the sketch view, and in 3D too (`in_083`)
    const he = hovIn3D ? hoveredSkEl.el : hoverEl;
    const pl = hovIn3D ? hoveredSkEl.plane : session.plane;
    const ents = hovIn3D ? store.entities(pl) : session.viewEntities();
    const model = modelOf(ents);
    const lightC = toHex(th.blueSurface);
    const kk = 1 / pxPerMm(null, pl);
    if (he.kind === "point" && model.points[he.ref]) sketchGroup.add(disc(pl, model.points[he.ref], S.sketch.markerPx * (S.sketch.pickPointScale * 0.8) * kk, lightC, 9));
    else if (he.kind === "seg" && model.segments[he.ref]) sketchGroup.add(stroke(model.segments[he.ref].map((id) => toWorld(pl, model.points[id])), { color: lightC, width: S.sketch.pickHoverWidthPx, order: 8, alpha: 0.7 }));
    else if (he.kind === "circle") {
      const c = ents.find((e) => e.id === he.shape);
      if (c) sketchGroup.add(stroke(circlePolygon(c.cx, c.cy, c.r, 96).map((q) => toWorld(pl, q)), { color: lightC, width: S.sketch.pickHoverWidthPx, closed: true, order: 8, alpha: 0.7 }));
    }
  }
  if (inSketchView() && session.tool === "select" && session.picks.length) {
    // the picked corners, lines and circles, in blue
    const model = modelOf(session.viewEntities());
    const blueC = toHex(th.blueSurface);
    const kk = 1 / pxPerMm();
    for (const pk of session.picks) {
      if (pk.kind === "point" && model.points[pk.ref]) sketchGroup.add(disc(session.plane, model.points[pk.ref], S.sketch.markerPx * S.sketch.pickPointScale * kk, blueC, 9));
      else if (pk.kind === "seg" && model.segments[pk.ref]) sketchGroup.add(stroke(model.segments[pk.ref].map((id) => toWorld(session.plane, model.points[id])), { color: blueC, width: S.sketch.pickWidthPx, order: 8 }));
      else if (pk.kind === "circle") {
        const c = session.viewEntities().find((e) => e.id === pk.shape);
        if (c) sketchGroup.add(stroke(circlePolygon(c.cx, c.cy, c.r, 96).map((q) => toWorld(session.plane, q)), { color: blueC, width: S.sketch.pickWidthPx, closed: true, order: 8 }));
      }
    }
  }
  if (inSketchView() && session.tool === "select" && session.relatedRefs().length) {
    // the clicked constraint's relationship: everything it ties together, in amber
    const model = modelOf(session.viewEntities());
    const relC = S.sketch.relatedColor;
    const kk = 1 / pxPerMm();
    for (const ref of session.relatedRefs()) {
      if (model.points[ref]) sketchGroup.add(disc(session.plane, model.points[ref], S.sketch.markerPx * S.sketch.pickPointScale * kk, relC, 10));
      else if (model.segments[ref]) sketchGroup.add(stroke(model.segments[ref].map((id) => toWorld(session.plane, model.points[id])), { color: relC, width: S.sketch.pickWidthPx * 1.5, order: 10 }));
      else if (ref.endsWith(".r")) {
        const c = session.viewEntities().find((e) => e.id === ref.slice(0, -2));
        if (c) sketchGroup.add(stroke(circlePolygon(c.cx, c.cy, c.r, 96).map((q) => toWorld(session.plane, q)), { color: relC, width: S.sketch.pickWidthPx * 1.5, closed: true, order: 10 }));
      }
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
  const flat = isFaceOn();
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
  if (hoveredEdge) edgeLine(hoveredEdge, S.pick.edgeHoverWidthPx, 0.8);
  if (hoveredVertex) dot(hoveredVertex, 1);
  if (sel?.kind === "edge") edgeLine(sel.edge, S.pick.edgeWidthPx, 1);
  if (sel?.kind === "vertex") dot(sel.v, 1.2);
}

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
let hoverEl = null; // the corner, line or circle under the cursor in the sketch select tool
let flash = null; // a short message that replaces the status for a moment (e.g. why a click was ignored)
function flashMessage(text) {
  flash = text;
  updateStatus();
  setTimeout(() => ((flash = null), updateStatus()), 2600);
}
/** What can be done with a selection (for the status line). */
function selectionHint(t) {
  if (t.kind === "body") return "M move   R rotate   K scale";
  if (t.kind === "face") return t.face.type === "cyl" ? "M radius   R taper" : "M move   R tilt";
  if (t.kind === "sketch") return "E extrude   L R C draw on it   N look straight";
  if (t.kind === "plane") return "L R C draw on it   N look straight";
  if (t.kind === "edge") return "F fillet   B chamfer   triple-click selects the whole body";
  return "triple-click selects the whole body";
}
/** A drawing tool just added its one figure: leave the sketch (normal interaction is back: faces and the rest can be clicked) and select the figure if it is closed (`in_080`). */
function settleFinished(fin) {
  exitSketch(false);
  if (fin.closed) {
    sel = { kind: "sketch", plane: fin.plane, id: fin.id };
    applySel();
  }
}
function updateStatus() {
  const fin = session.takeFinished();
  if (fin) settleFinished(fin);
  let text = (matchMedia("(pointer: coarse)").matches ? "Tap selects   double-tap: look straight   triple-tap: object   long-press or the ⋯ button: menu   drag: orbit   two fingers: pan and zoom" : "Click selects   double-click: look straight   triple-click: object   L R C then a surface: draw   right-click: menu");
  if (flash) text = flash;
  else if (xform) text = xform.sess.prompt();
  else if (extrude) text = `${extrude.ref ? "Move face" : `Extrude on ${extrude.plane}`}   ${extrude.sess.prompt()}`;
  else if (armedTool && !selected) text = `${{ line: "Line", rect: "Rectangle", circle: "Circle" }[armedTool]}: click a plane, a face or a sketch to draw on it   Esc to cancel`;
  else if (!selected && sel) text = `Selected: ${targetName(sel)}`; // what you can do is in the bar (icons and tooltips), not repeated here
  else if (session.editKey && inSketchView()) text = `Editing the sketch of step ${store.features.findIndex((f) => `feat:${f.id}` === session.editKey) + 1}   ${session.prompt()}   Esc to finish`;
  else if (selected) text = inSketchView() ? `Sketching on ${selected}   ${session.prompt()}` : `Going to ${selected}...`;
  if (inSketchView() && !flash && !extrude && !xform) {
    const info = session.solveInfo();
    if (info.count) text += info.status === "conflict" ? "   [constraints conflict]" : info.dof === 0 ? "   [fully constrained]" : `   [${info.dof} free]`;
  }
  if (!body.ready() && (store.features.length || extrude)) text += "   (loading the geometry kernel...)";
  if (armedTool && !selected) canvas.style.cursor = "crosshair";
  else if (inSketchView() && !extrude && !xform && !hoverEl) canvas.style.cursor = session.tool === "select" || session.tool === "dimension" ? "default" : "crosshair"; // the cursor follows the tool even before the mouse moves
  else if (body.info.error) text += `   [kernel: ${body.info.error}]`;
  $("statusText").textContent = text;
  $("scaleText").textContent = `grid ${gridScaleText()}`;
  $("exitBtn").style.display = selected && !flash && !extrude ? "inline-block" : "none";
}

// ---------------------------------------------------------------- picking
/** Looking straight at the selected plane = sketch view. Anything else (orbited away, or nothing selected) = 3D view. */
/** Sketching: a plane is chosen and no operation is running. The camera can be at any angle (`in_059`); looking straight at the plane is a convenience (orthographic), not a requirement. */
const inSketchView = () => !!selected && !extrude && !xform;
const isFaceOn = () => !!selected && isNormal(view, selected, V.normalToleranceRad);
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function setRay(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  applyCamera();
  raycaster.setFromCamera(ndc, camera);
}
let hoveredFace = null; // a flat face of the body under the cursor (3D view only): { start, count, axis, sign, offset, point }
let hoveredSkEl = null; // a line, corner or circle of an unextruded sketch under the cursor (3D view): { plane, el, p }
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
    if (hit) best = { plane, id: hit.id, t, point: p };
  }
  return best;
}
/** A line, corner or circle of an unextruded sketch under the cursor, in the 3D view: { plane, el, p, t } (nearest along the ray), or null. Sketch lines and corners are as easy to pick as the body's (`in_083`). */
function pickSketchElement(clientX, clientY) {
  setRay(clientX, clientY);
  const o = raycaster.ray.origin.toArray();
  const d = raycaster.ray.direction.toArray();
  let best = null;
  for (const plane of Object.keys(store.sketches)) {
    const ents = store.entities(plane).filter((e) => !isExtruded(plane, e));
    if (!ents.length) continue;
    const hit = pickPlane(o, d, { only: plane, minCos: 0.05, maxDist: view.dist * A.farFactor });
    if (!hit) continue;
    const [U, W] = basisOf(plane);
    const p = [hit.point[0] * U[0] + hit.point[1] * U[1] + hit.point[2] * U[2], hit.point[0] * W[0] + hit.point[1] * W[1] + hit.point[2] * W[2]];
    const el = elementAt(p, ents, S.sketch.selectTolPx / pxPerMm(p, plane));
    if (el && (!best || hit.t < best.t)) best = { plane, el, p, t: hit.t };
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
  const skel = pickSketchElement(clientX, clientY);
  if (skel && (!faceHit || skel.t < faceHit.distance + 1e-3)) return { plane: null, face: null, sketch: null, skel, point: null }; // a sketch's line or corner before its face
  const sk = pickSketchFace(o, d, Math.min(faceHit ? faceHit.distance : Infinity, view.dist * A.farFactor));
  if (sk) return { plane: null, face: null, sketch: { plane: sk.plane, id: sk.id }, point: sk.point };
  if (faceHit) return { plane: null, face: { ...faceHit.face, point: faceHit.point }, sketch: null }; // a body face wins over the see-through planes
  return { plane: planeHit?.plane ?? null, face: null, sketch: null, point: planeHit?.point ?? null };
}
let hoverPoint = null; // where on the surface under the cursor (world): the hover orb sits here
function setHover({ plane = null, face = null, sketch = null, edge = null, vertex = null, point = null, skel = null }) {
  hoverPoint = point ?? face?.point ?? null;
  if (skel?.el?.ref === hoveredSkEl?.el?.ref && skel?.plane === hoveredSkEl?.plane && plane === hovered && face?.start === hoveredFace?.start && face?.axis === hoveredFace?.axis && sketch?.id === hoveredSketch?.id && sketch?.plane === hoveredSketch?.plane && edge?.pts === hoveredEdge?.pts && vertex?.join() === hoveredVertex?.join()) return false;
  hoveredSkEl = skel;
  hovered = plane;
  hoveredFace = face;
  hoveredSketch = sketch;
  hoveredEdge = edge;
  hoveredVertex = vertex;
  body.setHighlight(face);
  canvas.style.cursor = armedTool ? "crosshair" : plane || face || sketch || edge || vertex || skel ? "pointer" : "default";
  markSketch();
  return true;
}
const hoverAsSel = () =>
  hoveredSkEl ? { kind: "skel", ...hoveredSkEl }
  : hoveredVertex ? { kind: "vertex", v: hoveredVertex }
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
/** A single click selects what is on the model (a plane, face, line, corner or sketch shape), never a whole object and never moving the camera; a click on nothing lets go. */
function selectFromHover() {
  const t0 = hoverAsSel();
  if (t0?.kind === "skel") {
    // a click on a sketch's line, corner or circle opens that sketch for editing with the element picked (constraints, lengths...); the camera stays where it is (`in_083`)
    sel = null;
    armedTool = null;
    applySel();
    enterSketch(t0.plane, "select", 1, true);
    session.scale = pxPerMm(t0.p);
    session.click(t0.p, { shift: false });
    refreshUI();
    return;
  }
  // planes are just planes (`in_069`): a click selects what is under the pointer (blue), or lets go when there is nothing; it never moves the camera
  sel = hoverAsSel();
  armedTool = null;
  applySel();
  startSelectOrb();
}
/** Only the small panes can be pointed at (not the whole infinite plane); none while the compass is in the corner. `always`: also while sketching. */
function paneFilter(always = false) {
  if (inSketchView() && !always) return null;
  if (cornerT > 0) return () => false;
  return (name, p) => {
    const [u, v] = planeDef(name).basis;
    const s = view.dist * S.panes.size;
    const o = view.dist * S.panes.offset;
    const a = p[0] * u[0] + p[1] * u[1] + p[2] * u[2];
    const b = p[0] * v[0] + p[1] * v[1] + p[2] * v[2];
    return a >= o && a <= o + s && b >= o && b <= o + s;
  };
}
function pickAt(clientX, clientY) {
  setRay(clientX, clientY);
  return pickPlane(raycaster.ray.origin.toArray(), raycaster.ray.direction.toArray(), { maxDist: view.dist * A.farFactor, minCos: G.grazeMinCos, only: inSketchView() ? selected : null, within: paneFilter() });
}
/** The plane of the surface under the pointer (a body face, a closed sketch shape, or a pane): what a drawing tool sketches on (`in_069`). Null if none. */
function surfaceUnder(clientX, clientY) {
  setRay(clientX, clientY);
  const o = raycaster.ray.origin;
  const d = raycaster.ray.direction;
  const faceHit = body.pick(o, d);
  const sk = pickSketchFace(o, d, Math.min(faceHit ? faceHit.distance : Infinity, view.dist * A.farFactor));
  if (sk) return sk.plane;
  if (faceHit) return faceHit.face.type === "cyl" ? null : planeOfTarget({ kind: "face", face: { ...faceHit.face, point: faceHit.point } });
  return pickPlane(o.toArray(), d.toArray(), { maxDist: view.dist * A.farFactor, minCos: G.grazeMinCos, within: paneFilter(true) })?.plane ?? null;
}
/** The point under the cursor on the sketch plane, in local (u, v) mm. */
function localPoint(clientX, clientY) {
  if (!selected) return null;
  const hit = pickPlane(...((setRay(clientX, clientY), [raycaster.ray.origin.toArray(), raycaster.ray.direction.toArray()])), { minCos: 1e-3, maxDist: view.dist * A.farFactor, only: selected });
  if (!hit) return null;
  const [U, W] = basisOf(selected);
  return [hit.point[0] * U[0] + hit.point[1] * U[1] + hit.point[2] * U[2], hit.point[0] * W[0] + hit.point[1] * W[1] + hit.point[2] * W[2]];
}

// ---------------------------------------------------------------- actions (shared by hotkeys and the right-click menu)
let armedTool = null; // a drawing tool chosen in 3D with nothing to draw on yet: the next click on a surface starts the sketch there (`in_069`)
let prePose = null; // the 3D camera pose to return to when leaving the sketch
function enterSketch(plane, tool = "select", side = 1, keepCamera = false) {
  sel = null;
  body.setSelected(null);
  if (!selected) prePose = { a: view.a, e: view.e, dist: view.dist, target: view.target.clone() };
  selected = plane;
  session.setPlane(plane);
  session.setTool(tool);
  // choosing a drawing tool on a surface starts drawing right there, in 3D (`in_063`); the camera only turns if the surface is nearly edge-on
  const drawing = ["line", "rect", "circle"].includes(tool);
  const toCam = camera.position.clone().sub(view.target).normalize();
  const n = planeDef(plane).n;
  if (!keepCamera && (!drawing || Math.abs(toCam.x * n[0] + toCam.y * n[1] + toCam.z * n[2]) < V.drawMinFacing)) goNormal(plane, side);
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
  } else if (!selected && sel && ["plane", "face", "sketch"].includes(sel.kind) && planeOfTarget(sel) && ["line", "rect", "circle"].includes(tool)) {
    const pl = planeOfTarget(sel);
    sel = null;
    applySel();
    enterSketch(pl, tool); // a selected surface: draw on it right away
  } else if (!selected && ["line", "rect", "circle"].includes(tool)) {
    armedTool = tool; // nothing selected yet: the next click on a surface starts drawing there
    canvas.style.cursor = "crosshair";
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
  if (armedTool) return void ((armedTool = null), (canvas.style.cursor = "default"));
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
/** A constraint hotkey: apply the first matching button of the current picks (or say why it cannot be). */
function constraintKey(labels) {
  if (!inSketchView() || session.tool !== "select") return;
  const offers = session.offers();
  const i = offers.findIndex((o) => labels.includes(o.label));
  if (i < 0) return flashMessage("Pick lines or corners first (Shift-click for a second one).");
  if (!offers[i].enabled) return flashMessage(`That cannot be set: ${offers[i].reason}.`);
  const msg = session.applyOffer(i);
  if (msg) flashMessage(msg);
  refreshUI();
}
/** Square the camera to the sketch plane, remembering the angle it had so it can go back. */
/** +1 if the camera is on the plane's front side (along its normal), -1 if on the back. */
function cameraSide(plane) {
  const n = planeDef(plane).n;
  const c = camera.position.clone().sub(view.target);
  return c.x * n[0] + c.y * n[1] + c.z * n[2] >= 0 ? 1 : -1;
}

/** N (`in_069`): normal to the selected / sketched plane: from the front; again from the back; again from the front. */
function normalAction() {
  if (extrude || xform) return;
  const plane = actingPlane();
  if (!plane) return flashMessage("Select a plane or a face first (or start sketching); then N looks straight at it.");
  goNormal(plane, normalSide(view, plane, V.normalToleranceRad) > 0 ? -1 : 1, sel?.kind === "face" && !selected ? body.faceCenter(sel.face).toArray() : null);
}
/** After deleting in the sketch: say how many constraints went with the shape (`in_085`). */
function noteDeletion() {
  const n = session.takeNote();
  if (n) flashMessage(n);
}
const ACTIONS = {
  lookX: () => lookAlong(0), lookY: () => lookAlong(1), lookZ: () => lookAlong(2),
  faceOn: () => normalAction(), // N: look straight at the plane (selected or being sketched on); again, from its back; again, from its front
  consH: () => constraintKey(["Horizontal"]),
  consV: () => constraintKey(["Vertical"]),
  consE: () => constraintKey(["Equal length", "Equal radius"]),
  consL: () => constraintKey(["Parallel"]),
  consP: () => constraintKey(["Perpendicular"]),
  consF: () => constraintKey(["Fix in place"]),
  consC: () => constraintKey(["Coincident"]),
  fillet: () => edgeAction("fillet"),
  chamfer: () => edgeAction("chamfer"),
  select: () => setTool("select"),
  line: () => setTool("line"),
  rect: () => ((xform || (!inSketchView() && !selected && sel && ["face", "body"].includes(sel.kind))) ? ACTIONS.rotate() : setTool("rect")), // R rotates a selected face or body (or switches to rotate while modifying); with anything else selected (a plane, a sketch shape) or nothing, it is the rectangle tool
  circle: () => setTool("circle"),
  home: () => goHome(),
  origin: () => returnToOrigin(),
  undo: () => doUndo(),
  redo: () => doRedo(),
  cancel: () => doEscape(),
  delete: () => (xform ? deleteTransformBeingEdited() : extrude ? deleteFeatureBeingEdited() : inSketchView() ? (session.deleteSelected() ? (updateStatus(), markSketch(), noteDeletion()) : false) : deleteSelection()),
  move: () => bodyTransform("move"),
  rotate: () => bodyTransform("rotate"),
  scale: () => bodyTransform("scale"),
  extrude: () => {
    if (extrude) return;
    if (inSketchView()) {
      const r = session.tool === "select" && session.selectedId ? regionsOf(session.entities()).find((x) => x.id === session.selectedId) : null;
      return r ? startExtrudeFromRegion(r) : setTool("extrude"); // a closed shape is selected: pull it; otherwise pick one
    }
    const t = currentTarget();
    if (t?.kind === "face") return flashMessage("E extrudes sketch shapes. To move a face press M; to extrude from a face, draw a shape on it first (L, R or C), then extrude that.");
    if (t?.kind === "sketch") {
      const r = regionsOf(store.entities(t.plane)).find((x) => x.id === t.id);
      return r ? startExtrudeFromRegion(r, t.plane) : undefined;
    }
    if (t && ["body", "edge", "vertex"].includes(t.kind)) return flashMessage(t.kind === "body" ? "E pulls faces and sketch shapes. For the whole body: M move, R rotate, K scale." : "E pulls faces and sketch shapes. Lines and corners cannot be modified yet.");
    flashMessage(t ? "Planes have nothing to pull: select a face or a closed sketch shape, then press E." : "Select a face or a closed sketch shape first (click it), then press E.");
  },
  dimension: () => setTool("dimension"),
};

// ---------------------------------------------------------------- tooltips (text lives here; the interface itself is icons)
const tipEl = $("tip");
function hideTip() {
  tipEl.style.display = "none";
}
/** Show a tooltip above an element: { label, help, key, reason }. */
function showTip(el, d) {
  tipEl.replaceChildren();
  const head = document.createElement("div");
  head.className = "tl";
  head.textContent = d.label;
  if (d.key) head.appendChild(Object.assign(document.createElement("kbd"), { textContent: d.key }));
  tipEl.appendChild(head);
  if (d.help) tipEl.appendChild(Object.assign(document.createElement("div"), { className: "th", textContent: d.help }));
  if (d.reason) tipEl.appendChild(Object.assign(document.createElement("div"), { className: "tr", textContent: `Not possible: ${d.reason}` }));
  tipEl.style.display = "block";
  const r = el.getBoundingClientRect();
  const w = tipEl.offsetWidth;
  tipEl.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`;
  tipEl.style.top = `${Math.max(8, r.top - tipEl.offsetHeight - 8)}px`;
}
function withTip(el, d) {
  el.onmouseenter = () => showTip(el, d);
  el.onmouseleave = hideTip;
  el.onpointerdown = hideTip;
  el.setAttribute("aria-label", d.label);
  return el;
}

// ---------------------------------------------------------------- the selection widget (sketch view): constraint icons, then the number
const widgetEl = $("pickw");
let widgetSig = "";
function updateConstraintUI() {
  const on = inSketchView() && !extrude && !xform;
  const w = on ? session.widget() : null;
  if (!w) {
    widgetEl.style.display = "none";
    widgetSig = "";
    return;
  }
  // rebuild the pill only when its content changes (so a click on it is not lost to a re-render)
  const sig = JSON.stringify([w.icons, w.value && [w.value.kind, w.value.text, w.value.locked, w.value.editing]]);
  if (sig !== widgetSig) {
    widgetSig = sig;
    widgetEl.replaceChildren();
    const pill = document.createElement("div");
    pill.className = "pill";
    for (const ic of w.icons) {
      const b = document.createElement("button");
      b.className = `ico${ic.picked ? " picked" : ""}`;
      b.innerHTML = iconSvg(ic.key);
      withTip(b, { label: iconTitle(ic.key), help: ic.picked ? "Click again to let go. The amber parts are what it relates." : "A constraint on this selection. Click to see what it relates." });
      b.onclick = () => (session.pickConstraint(ic.id), refreshUI());
      if (ic.picked) {
        // clicked: opens up in width with an x that deletes it; the things it ties together show in amber
        const grp = document.createElement("span");
        grp.className = "icogrp";
        b.className = "ico picked";
        const x = document.createElement("button");
        x.className = "ico x";
        x.innerHTML = iconSvg("cross");
        withTip(x, { label: "Remove", help: `Delete this ${iconTitle(ic.key).toLowerCase()} constraint.` });
        x.onclick = () => (session.deleteConstraint(ic.id), refreshUI());
        grp.append(b, x);
        pill.appendChild(grp);
      } else pill.appendChild(b);
    }
    if (w.value) {
      if (w.icons.length) pill.appendChild(Object.assign(document.createElement("span"), { className: "sepv" }));
      const v = document.createElement("div");
      v.className = `val${w.value.editing !== null ? " act" : ""}`;
      withTip(v, { label: w.value.kind === "length" ? "Length" : w.value.kind === "radius" ? "Radius" : "Angle", help: `Click, then type a number${w.value.locked ? ". It is locked: a new number replaces it" : ""}.` });
      const lab = document.createElement("b");
      lab.textContent = w.value.kind === "length" ? "LEN" : w.value.kind === "radius" ? "RAD" : "ANG";
      v.append(lab, w.value.editing !== null ? w.value.editing || "_" : w.value.text);
      if (w.value.locked) v.insertAdjacentHTML("beforeend", `<span class="lock" title="${iconTitle("lock")}">${iconSvg("lock")}</span>`);
      v.onclick = () => (session.startPickEdit(), refreshUI());
      pill.appendChild(v);
    }
    widgetEl.appendChild(pill);
  }
  // where: just off the line (or on the corner / shape)
  const k = 1 / pxPerMm();
  const nl = Math.hypot(w.normal[0], w.normal[1]);
  const off = (w.value?.kind === "angle" ? 36 : 24) * k;
  const at = toWorld(session.plane, nl ? [w.pos[0] + (w.normal[0] / nl) * off, w.pos[1] + (w.normal[1] / nl) * off] : [w.pos[0], w.pos[1]]);
  const [sx, sy] = window.__ui.worldToScreen(at.x, at.y, at.z);
  widgetEl.style.display = "block";
  widgetEl.style.left = `${sx}px`;
  widgetEl.style.top = `${nl ? sy : sy - 20}px`;
}

// ---------------------------------------------------------------- what can be done now (offered by the right-click menu), with hotkeys
/** Run what a bar button stands for. */
function runBar(id) {
  const [kind, name] = id.split(":");
  if (kind === "tool" && ["select", "line", "rect", "circle", "dimension"].includes(name)) return void setTool(name); // the menu item means the tool: the R key rotates a selected face, so it must not be used here
  if (kind === "tool" || kind === "act") return void ACTIONS[name]?.();
  if (kind === "cons") {
    const msg = session.applyOffer(Number(name));
    if (msg) flashMessage(msg);
    return refreshUI();
  }
  if (id === "apply") return xform ? commitTransform() : extrude ? commitExtrude() : undefined;
  if (id === "cancel") return doEscape();
}
function barContext() {
  const mode = extrude || xform ? "op" : inSketchView() ? "sketch" : "3d";
  return {
    mode, keys: S.input.keys, tool: session.tool, canUndo: store.canUndo(), canRedo: store.canRedo(),
    op: extrude ? { editing: !!extrude.sess.featureId } : xform ? { editing: !!xform.sess.featureId } : null,
    offers: mode === "sketch" ? session.offers() : [],
    pickParts: !!(session.pickedConstraint || session.picks.some((k) => k.kind !== "entity")),
    pickShape: session.picks.some((k) => k.kind === "entity"),
    pickShapeClosed: session.picks.some((k) => k.kind === "entity" && regionsOf(session.entities()).some((r) => r.id === k.shape)),
    editingStepSketch: !!session.editKey,
    faceOn: isFaceOn(),
    sel: sel ? { kind: sel.kind, round: sel.kind === "face" && sel.face?.type === "cyl" } : null,
  };
}
// ---------------------------------------------------------------- dimension numbers (shown by the dimension tool)
const dimsEl = $("dims");
function updateDims() {
  const list = inSketchView() && session.tool === "dimension" ? session.dims(S.sketch.dimOffsetPx / pxPerMm()) : [];
  while (dimsEl.children.length > list.length) dimsEl.lastChild.remove();
  while (dimsEl.children.length < list.length) dimsEl.appendChild(Object.assign(document.createElement("div"), { className: "chip" }));
  list.forEach((d, i) => {
    const el = dimsEl.children[i];
    el.className = `chip${d.typed ? " typed" : ""}${d.active ? " act" : ""}${d.locked ? " locked" : ""}`;
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
/** Right-click: first pick what is under the pointer (unless it is already picked), so the menu offers what can be done with it. */
function pickUnderPointer(x, y) {
  if (extrude || xform) return;
  if (inSketchView()) {
    if (session.tool !== "select") return;
    const p = localPoint(x, y);
    if (!p) return;
    session.scale = pxPerMm(p);
    const el = elementAt(p, session.entities(), S.sketch.selectTolPx / pxPerMm(p));
    if (el && !session.picks.some((k) => k.ref === el.ref && k.kind === el.kind)) {
      session.click(p, { shift: false });
      refreshUI();
    }
    return;
  }
  setHover(hoverAt(x, y));
  const t = hoverAsSel();
  if (t && t.kind !== "plane" && !(sel && t.kind === sel.kind && t.id === sel.id && t.plane === sel.plane && t.face === sel.face)) (sel = t), applySel();
}
function showMenu(x, y, pick = true) {
  if (pick) pickUnderPointer(x, y);
  menuEl.replaceChildren();
  const groups = barItems(barContext()).filter((g) => g.items.length);
  groups.forEach((g, gi) => {
    if (gi) menuEl.appendChild(document.createElement("hr"));
    for (const it of g.items) {
      const b = document.createElement("button");
      b.className = it.active ? "on" : "";
      b.disabled = !it.enabled;
      b.title = it.enabled ? it.help : `Not possible: ${it.reason}`;
      b.innerHTML = `${iconSvg(it.icon)}<span></span><kbd></kbd>`;
      b.querySelector("span").textContent = it.label;
      b.querySelector("kbd").textContent = it.key ?? "";
      b.addEventListener("click", () => (hideMenu(), runBar(it.id)));
      menuEl.appendChild(b);
    }
  });
  menuEl.appendChild(document.createElement("hr"));
  const nav = document.createElement("button"); // what a scroll does: pan or zoom
  nav.innerHTML = `${iconSvg("pan")}<span></span><kbd></kbd>`;
  nav.querySelector("span").textContent = `Scroll: ${scrollMode}`;
  nav.querySelector("kbd").textContent = { auto: "trackpad pans, wheel zooms", pan: "always pans", zoom: "always zooms" }[scrollMode];
  nav.title = "Auto: a trackpad's two-finger scroll pans (like a phone screen) and a mouse wheel zooms; a pinch always zooms. Click to switch to always pan, or always zoom. Shift + scroll and Space + drag always pan.";
  nav.addEventListener("click", () => {
    hideMenu();
    scrollMode = { auto: "pan", pan: "zoom", zoom: "auto" }[scrollMode];
    try {
      localStorage.setItem("cad.scrollMode", scrollMode);
    } catch {}
    flashMessage(`Scroll: ${scrollMode === "auto" ? "a trackpad pans, a mouse wheel zooms" : scrollMode === "pan" ? "always pans" : "always zooms"}.`);
  });
  menuEl.appendChild(nav);
  menuEl.style.display = "block";
  const r = menuEl.getBoundingClientRect();
  menuEl.style.left = `${Math.max(8, Math.min(x, innerWidth - r.width - 8))}px`;
  menuEl.style.top = `${Math.max(8, Math.min(y, innerHeight - r.height - 8))}px`;
}

// ---------------------------------------------------------------- mouse input
const preset = () => S.input.navPresets[S.input.navPreset];
/** Move the view by a drag of dx, dy screen pixels (the scene follows the pointer). */
function panBy(dx, dy) {
  const k = (2 * view.dist * Math.tan(THREE.MathUtils.degToRad(V.fovDeg / 2))) / canvas.clientHeight;
  const m = camera.matrixWorld.elements;
  view.target.x += -m[0] * dx * k + m[4] * dy * k;
  view.target.y += -m[1] * dx * k + m[5] * dy * k;
  view.target.z += -m[2] * dx * k + m[6] * dy * k;
  updateStatus();
  markSketch();
}
let orbitPivot = null; // while orbiting: the model's middle, and where it sits in the camera's own frame (right, up, forward), so it stays put on screen (`in_081`, `in_082`)
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** The camera's frame { eye, f (forward), u (up), r (right) } for an azimuth and elevation about the current target and distance. */
function cameraFrame(a, e) {
  const o = cameraOffset(a, e);
  const f = [-o[0], -o[1], -o[2]];
  const u = cameraUp(a, e);
  return { eye: [view.target.x + view.dist * o[0], view.target.y + view.dist * o[1], view.target.z + view.dist * o[2]], f, u, r: cross3(f, u) };
};
/** Start of an orbit: if the model is in view, it becomes the pivot. The camera then turns about the model's middle and the model stays exactly where it is on the screen, even
 *  if you had panned it to the side: nothing is re-centred. The model's place in the camera's frame is remembered here, and `orbitBy` rebuilds the camera around it. */
function repivotOrbit() {
  orbitPivot = null;
  const info = body.info;
  if (!V.orbitAroundObject || camera === ortho || !body.ready() || !info.bbox) return;
  const { min, max } = info.bbox;
  const c = new THREE.Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
  const ndc = c.clone().project(camera);
  if (Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1 || ndc.z < -1 || ndc.z > 1) return; // the model is not in view: keep the current pivot
  const d = c.distanceTo(camera.position);
  if (!(d > V.minDistance && d < V.maxDistance)) return;
  const fr = cameraFrame(view.a, view.e);
  const p = [c.x - fr.eye[0], c.y - fr.eye[1], c.z - fr.eye[2]];
  const dot = (x, y) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
  orbitPivot = { c: [c.x, c.y, c.z], x: dot(p, fr.r), y: dot(p, fr.u), z: dot(p, fr.f) };
}
function orbitBy(dx, dy) {
  view.a -= dx * V.orbitRadPerPx;
  view.e = clamp(view.e + dy * V.orbitRadPerPx, -Math.PI / 2, Math.PI / 2);
  if (orbitPivot) {
    // keep the model where it is on screen: put the camera back so the model has the same place in its frame, then look along the new direction
    const P = orbitPivot;
    const fr = cameraFrame(view.a, view.e);
    const eye = [0, 1, 2].map((i) => P.c[i] - P.x * fr.r[i] - P.y * fr.u[i] - P.z * fr.f[i]);
    view.target.set(eye[0] + view.dist * fr.f[0], eye[1] + view.dist * fr.f[1], eye[2] + view.dist * fr.f[2]);
  }
  updateStatus();
  markSketch();
}
let spaceDown = false; // Space held: a plain drag pans
let clickCount = 0;
let lastClickAt = 0;
let lastClickXY = [0, 0];
/** Triple-click: the whole object under the pointer. */
function selectObjectFromHover() {
  if (hoveredSketch && !hoveredFace) {
    // a double-click on a sketch shape opens it for editing (its lines, corners and constraints); Esc leaves
    const pl = hoveredSketch.plane;
    sel = null;
    applySel();
    return void enterSketch(pl, "select");
  }
  const h = hoveredFace || hoveredEdge || hoveredVertex;
  if (!h) return;
  sel = { kind: "body" };
  applySel();
  startSelectOrb();
}
/** Double-click: look straight at the plane that was clicked (a pane, a face, a closed sketch), from the side you are on. */
function normalToClicked() {
  const t = hoverAsSel();
  if (!t || !["plane", "face", "sketch"].includes(t.kind)) return;
  const plane = planeOfTarget(t);
  if (!plane) return;
  sel = t;
  applySel();
  startSelectOrb();
  goNormal(plane, cameraSide(plane), t.kind === "face" ? body.faceCenter(t.face).toArray() : null); // a face is centred in the view
}
let g = null; // the gesture in progress: { kind: "orbit" | "pan" | "draw" | "click", x, y, x0, y0, button, moved }
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
// ---------------------------------------------------------------- touch (`in_078`, `prin_input_agnostic`)
// A finger drag orbits, two fingers pan and pinch to zoom, a tap selects or places a point, a long press opens the menu (the right click). While an operation runs
// (extrude, move...) or a sketch point is under the finger, the finger works like the mouse (drag to pull, move or drag the point). A pen and a mouse use the mouse path.
const touches = new Map(); // pointerId -> { id, x, y }
let tg = null; // the touch gesture: { mode: "one" | "two" | "mouse" | "done", ... }
const touchEv = (t) => ({ clientX: t.x, clientY: t.y, button: 0, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, pointerId: t.id, pointerType: "touch", touch: true });
function touchWantsMouse(x, y) {
  if (extrude || xform) return true;
  if (inSketchView() && session.tool === "select") {
    const p = localPoint(x, y);
    if (p) return !!elementAt(p, session.entities(), S.sketch.selectTolPx / pxPerMm(p));
  }
  return false;
}
const twoState = () => {
  const [a, b] = [...touches.values()];
  return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) };
};
function touchDown(ev) {
  touches.set(ev.pointerId, { id: ev.pointerId, x: ev.clientX, y: ev.clientY });
  try {
    canvas.setPointerCapture(ev.pointerId);
  } catch {}
  hideMenu();
  if (touches.size === 1) {
    if (touchWantsMouse(ev.clientX, ev.clientY)) {
      tg = { mode: "mouse", id: ev.pointerId };
      return void onPointerDown(touchEv(touches.get(ev.pointerId)));
    }
    tg = { mode: "one", id: ev.pointerId, x0: ev.clientX, y0: ev.clientY, x: ev.clientX, y: ev.clientY, moved: false, long: false };
    tg.timer = setTimeout(() => {
      if (tg && tg.mode === "one" && !tg.moved) (tg.long = true), showMenu(tg.x, tg.y); // long press = right click
    }, S.input.longPressMs);
  } else if (touches.size === 2 && tg && (tg.mode === "one" || tg.mode === "done")) {
    clearTimeout(tg.timer);
    Object.assign(tg, { mode: "two", moved: true }, twoState());
  }
}
function touchMove(ev) {
  const t = touches.get(ev.pointerId);
  if (!t) return;
  t.x = ev.clientX;
  t.y = ev.clientY;
  if (!tg) return;
  if (tg.mode === "mouse") return void onPointerMove(touchEv(t));
  if (tg.mode === "one") {
    if (!tg.moved && Math.hypot(t.x - tg.x0, t.y - tg.y0) < S.input.touchSlopPx) return;
    repivotOrbit();
    tg.moved = true;
    clearTimeout(tg.timer);
    anim = null;
    orbitBy(t.x - tg.x, t.y - tg.y);
    tg.x = t.x;
    tg.y = t.y;
  } else if (tg.mode === "two" && touches.size >= 2) {
    const s2 = twoState();
    anim = null;
    panBy(s2.cx - tg.cx, s2.cy - tg.cy);
    if (tg.d > 0 && s2.d > 0) view.dist = clamp((view.dist * tg.d) / s2.d, V.minDistance, V.maxDistance);
    Object.assign(tg, s2);
    updateStatus();
    markSketch();
  }
}
function touchUp(ev) {
  orbitPivot = null;
  const t = touches.get(ev.pointerId) ?? { id: ev.pointerId, x: ev.clientX, y: ev.clientY };
  touches.delete(ev.pointerId);
  if (!tg) return;
  clearTimeout(tg.timer);
  if (tg.mode === "mouse") (onPointerUp(touchEv(t)), (tg = null));
  else if (tg.mode === "one" && !tg.moved && !tg.long) {
    // a tap: hover, press and release at that spot, as a mouse click would
    const f = touchEv(t);
    onPointerMove(f);
    onPointerDown(f);
    onPointerUp(f);
  }
  if (!touches.size) tg = null;
  else if (tg) tg.mode = "done"; // one finger left after a pinch: ignore it until all are lifted
}
function touchCancel(ev) {
  touches.delete(ev.pointerId);
  if (tg) clearTimeout(tg.timer);
  if (tg?.mode === "mouse") onPointerUp(touchEv({ id: ev.pointerId, x: ev.clientX, y: ev.clientY }));
  if (!touches.size) tg = null;
}

/** In the sketch view with the select tool: what else is under the pointer besides the sketch being worked on (another sketch's line or corner, a face, a plane, ...), or null.
 *  There is no isolation (`dec_no_sketch_isolation`, `in_084`): all of it can be clicked at any time. */
function otherTargetAt(x, y) {
  const h = hoverAt(x, y);
  if (h.skel?.plane === selected) h.skel = null;
  if (h.sketch?.plane === selected) h.sketch = null; // the sketch's own shapes are handled by the sketch
  if (h.plane === selected) h.plane = null;
  return h.face || h.edge || h.vertex || h.skel || h.sketch || h.plane ? h : null;
}
function onPointerDown(ev) {
  hideMenu();
  try {
    canvas.setPointerCapture(ev.pointerId);
  } catch {} // a synthesized tap has no live pointer to capture
  const spaceNav = spaceDown && ev.button === 0 ? "pan" : null; // Space + drag pans: the way for a trackpad or a single-button device
  const nav = spaceNav ?? navAction(ev, preset());
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
  if (selected && anim) return; // gliding to the plane: ignore clicks until it arrives
  if (armedTool && !inSketchView()) {
    // a drawing tool is chosen: a click on a surface starts the sketch right there, no mode to enter (`in_069`)
    const pl = surfaceUnder(ev.clientX, ev.clientY);
    if (!pl) return; // nothing to draw on there: the tool stays armed until Esc
    const tool = armedTool;
    armedTool = null;
    sel = null;
    applySel();
    enterSketch(pl, tool);
    if (anim) return;
  }
  if (!inSketchView()) return void (g = { kind: "click", ...base }); // a click picks something in the 3D view; a drag orbits
  if (["line", "rect", "circle"].includes(session.tool) && !session.draft) {
    // freely sketch: a click on another surface moves the sketch to that surface
    const pl = surfaceUnder(ev.clientX, ev.clientY);
    if (pl && pl !== selected) {
      enterSketch(pl, session.tool);
      if (anim) return;
    }
  }
  const p = localPoint(ev.clientX, ev.clientY);
  if (!p) return;
  session.scale = pxPerMm(p);
  if (session.tool === "select") {
    // pressing on a corner, line or circle: dragging it moves it (constraints stay true); a click picks it. Elsewhere a click selects and a drag orbits.
    const el = ev.shiftKey ? null : elementAt(p, session.entities(), S.sketch.selectTolPx / pxPerMm(p));
    return void (g = el ? { kind: "skdrag", el, p, started: false, ...base } : { kind: "selectclick", p, shift: ev.shiftKey, target: ev.shiftKey ? null : otherTargetAt(ev.clientX, ev.clientY), ...base });
  }
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
}
function onPointerMove(ev) {
  lastPointer = { x: ev.clientX, y: ev.clientY };
  pointerSeen = true;
  if (g && g.kind === "skdrag") {
    if (!g.started && Math.hypot(ev.clientX - g.x0, ev.clientY - g.y0) < V.clickMovePx) return; // still a click
    if (!g.started) (g.started = true), (g.moved = true), session.dragStart(g.el, g.p);
    const q = localPoint(ev.clientX, ev.clientY);
    if (q) (session.scale = pxPerMm(q)), session.dragMove(q);
    refreshUI();
    return;
  }
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
    if (!g.moved && g.kind === "orbit") repivotOrbit();
    g.moved = true;
    anim = null; // the user took over the camera
    const dx = ev.clientX - g.x;
    const dy = ev.clientY - g.y;
    g.x = ev.clientX;
    g.y = ev.clientY;
    if (g.kind === "pan") panBy(dx, dy);
    else orbitBy(dx, dy);
    return;
  }
  if (extrude || xform) return;
  if (inSketchView()) {
    const p = localPoint(ev.clientX, ev.clientY);
    if (p && session.tool !== "select") {
      session.scale = pxPerMm(p);
      session.move(p, { shift: ev.shiftKey });
      updateReadout();
      markSketch();
    }
    if (p && session.tool === "select" && !g) {
      // a corner, line or circle under the cursor lights up (you can drag it)
      const el = elementAt(p, session.entities(), S.sketch.selectTolPx / pxPerMm(p));
      if ((el?.ref ?? null) !== (hoverEl?.ref ?? null)) (hoverEl = el), markSketch();
      setHover(el ? {} : otherTargetAt(ev.clientX, ev.clientY) ?? {}); // anything else under the cursor lights up too: no isolation
    } else if (hoverEl && session.tool !== "select") (hoverEl = null), markSketch();
    canvas.style.cursor = session.tool === "select" && (hoverEl || hoveredFace || hoveredSketch || hoveredEdge || hoveredVertex || hoveredSkEl || hovered) ? "pointer" : session.tool === "select" || session.tool === "dimension" ? "default" : "crosshair";
    return;
  }
  if (g) return;
  if (!selected) {
    setHover(hoverAt(ev.clientX, ev.clientY));
    requestRender(); // the orb follows the cursor even while the surface under it stays the same
  }
}
function onPointerUp(ev) {
  const was = g;
  g = null;
  orbitPivot = null;
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
      session.scale = pxPerMm(p);
      session.click(p, { shift: ev.shiftKey });
      updateStatus();
      updateReadout();
      markSketch();
    }
    return;
  }
  if (was.kind === "skdrag") {
    if (was.started) {
      session.dragEnd();
    } else {
      session.scale = pxPerMm(was.p);
      session.click(was.p, { shift: false });
    }
    refreshUI();
    return;
  }
  if (was.kind === "selectclick" && !was.moved && was.target) {
    const t = was.target;
    if (t.skel) {
      // a line or corner of another sketch: that sketch takes over, with the element picked
      enterSketch(t.skel.plane, "select", 1, true);
      session.scale = pxPerMm(t.skel.p, t.skel.plane);
      session.click(t.skel.p, { shift: false });
      refreshUI();
    } else {
      // a face, a plane or another sketch's shape: leave the sketch being worked on and select that
      exitSketch(false);
      setHover(t);
      selectFromHover();
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
    // one click selects (a face, line, corner, plane or sketch shape: never a whole object); two look straight at the plane clicked; three select the whole object (`in_070`, swapped in `in_083`)
    const now = performance.now();
    clickCount = now - lastClickAt < (ev.touch ? S.input.multiTapMs : S.input.multiClickMs) && Math.hypot(ev.clientX - lastClickXY[0], ev.clientY - lastClickXY[1]) < (ev.touch ? S.input.multiTapPx : S.input.multiClickPx) ? clickCount + 1 : 1;
    lastClickAt = now;
    lastClickXY = [ev.clientX, ev.clientY];
    if (clickCount === 2) return void normalToClicked();
    if (clickCount >= 3) return void selectObjectFromHover();
    selectFromHover();
  }
}
canvas.addEventListener("pointerdown", (ev) => (ev.pointerType === "touch" ? touchDown(ev) : onPointerDown(ev)));
canvas.addEventListener("pointermove", (ev) => (ev.pointerType === "touch" ? touchMove(ev) : onPointerMove(ev)));
canvas.addEventListener("pointerup", (ev) => (ev.pointerType === "touch" ? touchUp(ev) : onPointerUp(ev)));
canvas.addEventListener("pointercancel", (ev) => (ev.pointerType === "touch" ? touchCancel(ev) : onPointerUp(ev)));
canvas.addEventListener("pointerleave", () => {
  pointerSeen = false;
  if (hovered || hoveredFace) setHover({ plane: null, face: null });
});
let lastWheelAt = 0;
let scrollMode = S.input.scrollMode; // "auto" | "pan" | "zoom" (the menu cycles it; kept in this browser)
try {
  scrollMode = localStorage.getItem("cad.scrollMode") || scrollMode;
} catch {}
let lastScroll = { t: 0, pans: false };
/** Does this wheel event pan (a trackpad's two-finger scroll, Shift + scroll) or zoom (a mouse wheel notch, a pinch)? `in_079`: the trackpad behaves like a phone screen. */
function scrollPansFor(e) {
  if (e.ctrlKey) return false; // a pinch
  if (e.shiftKey) return true;
  if (scrollMode === "pan") return true;
  if (scrollMode === "zoom") return false;
  // auto: a wheel notch is a big whole number (a multiple of 120 in wheelDeltaY) or counted in lines; a trackpad sends small, fine steps, often with a sideways part.
  // A gesture keeps its kind while its events (and their inertia) keep arriving.
  const now = performance.now();
  if (now - lastScroll.t < 160) return (lastScroll.t = now), lastScroll.pans;
  const notch = e.deltaMode === 1 || (e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50 && (e.wheelDeltaY === undefined || e.wheelDeltaY % 120 === 0));
  lastScroll = { t: now, pans: !notch };
  return !notch;
}
// Safari sends a pinch as gesture events, not as a ctrl + wheel
let gestureDist0 = 0;
canvas.addEventListener("gesturestart", (e) => (e.preventDefault(), (gestureDist0 = view.dist)));
canvas.addEventListener("gesturechange", (e) => {
  e.preventDefault();
  view.dist = clamp(gestureDist0 / (e.scale || 1), V.minDistance, V.maxDistance);
  updateStatus();
  markSketch();
});
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    if (scrollPansFor(e)) {
      // a two-finger scroll on a trackpad (or Shift + scroll): the view follows the fingers, like a phone screen
      const unit = e.deltaMode === 1 ? 33 : 1;
      const px = (e.shiftKey ? e.deltaX || e.deltaY : e.deltaX) * unit;
      const py = (e.shiftKey ? 0 : e.deltaY) * unit;
      anim = null;
      return void panBy(-px, -py);
    }
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
$("menuBtn").addEventListener("click", () => {
  // the menu without a right click: for touch screens and trackpads (the same menu a right click or a long press opens)
  const r = $("menuBtn").getBoundingClientRect();
  showMenu(r.left, r.bottom + 6, false);
});
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
  if (e.code === "Space" && !e.ctrlKey && !e.metaKey) return (spaceDown = true), e.preventDefault(); // hold Space and drag to pan
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

addEventListener("keyup", (e) => {
  if (e.code === "Space") spaceDown = false;
});
addEventListener("blur", () => (spaceDown = false));

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
  xformState: () => (xform ? { mode: xform.sess.mode, axis: xform.sess.axis, value: xformValue() } : null),
  selInfo: () => (sel ? { kind: sel.kind, plane: sel.plane, id: sel.id } : null),
  hoverInfo: () => ({ hovered, face: hoveredFace }),
  cameraType: () => (camera === ortho ? "ortho" : "persp"),
  planeWorld: (pl, q) => toWorld(pl, q).toArray(),
  orb: () => ({ R: selectOrb.uOrbR.value, fill: selectOrb.uOrbFill.value, A: selectOrb.uOrbA.value, hover: hoverOrb.uOrbA.value }),
  cornerT: () => cornerT,
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
