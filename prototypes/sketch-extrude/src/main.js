// View + input glue. All sketch logic is in interaction.mjs / sketch.mjs; all geometry is in the worker.
import * as THREE from "three";
import { settings as S } from "./settings.js";
import { SketchSession } from "./interaction.mjs";
import { regionsOf, hitRegion, regionToSketchOp, zOnVerticalLineFromRay, circlePolygon } from "./sketch.mjs";

const $ = (id) => document.getElementById(id);
const session = new SketchSession(S);
const T = S.theme;

// ---------------------------------------------------------------- app state
const features = []; // committed: { sketch, exId, distance, mode, entity }
let plane = { z: 0 };
let mode = "sketch"; // "sketch" | "extrude"
let ext = null; // { region, z0, distance, mode, drag }
let hoverId = null;
let bodyBox = null; // bbox of the latest compiled solid
let counter = 1;

// ---------------------------------------------------------------- three.js scene
const canvas = $("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setClearColor(T.background);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.5, 6000);
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(80, -120, 200);
scene.add(sun);
const gridGroup = new THREE.Group();
const bodyGroup = new THREE.Group();
const ghostGroup = new THREE.Group();
const overlay = new THREE.Group();
const handleGroup = new THREE.Group();
scene.add(gridGroup, bodyGroup, ghostGroup, overlay, handleGroup);

const view = { theta: -Math.PI / 2, phi: S.ui.sketchPhi, dist: 170, target: new THREE.Vector3(0, 0, 0) };
let anim = null;
let dirty = false;

function placeCamera() {
  const { theta, phi, dist, target } = view;
  camera.up.set(0, 0, 1);
  camera.position.set(target.x + dist * Math.sin(phi) * Math.cos(theta), target.y + dist * Math.sin(phi) * Math.sin(theta), target.z + dist * Math.cos(phi));
  camera.lookAt(target);
}
function requestRender() {
  if (dirty) return;
  dirty = true;
  requestAnimationFrame(() => {
    dirty = false;
    placeCamera();
    renderer.render(scene, camera);
  });
}
function resize() {
  const r = canvas.parentElement.getBoundingClientRect();
  renderer.setPixelRatio(devicePixelRatio);
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / r.height;
  camera.updateProjectionMatrix();
  requestRender();
}
addEventListener("resize", resize);

/** Pixels per mm on the sketch plane while looking straight down. */
function pixelsPerMm() {
  const d = Math.max(1, camera.position.z - plane.z);
  return canvas.clientHeight / (2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
}

function animateTo({ phi, theta, target }, ms) {
  const from = { phi: view.phi, theta: view.theta, target: view.target.clone() };
  const t0 = performance.now();
  anim = { id: Symbol() };
  const mine = anim.id;
  const step = (now) => {
    if (!anim || anim.id !== mine) return;
    const k = Math.min(1, (now - t0) / Math.max(1, ms));
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    view.phi = from.phi + (phi - from.phi) * e;
    view.theta = from.theta + (theta - from.theta) * e;
    view.target.lerpVectors(from.target, target, e);
    requestRender();
    if (k < 1) requestAnimationFrame(step);
    else anim = null;
  };
  requestAnimationFrame(step);
}

// ---------------------------------------------------------------- drawing helpers
function clearGroup(g) {
  for (const c of [...g.children]) {
    g.remove(c);
    c.geometry?.dispose();
    if (c.material && !c.material.__shared) c.material.dispose();
  }
}
const lineMat = (color, dashed = false) =>
  dashed ? new THREE.LineDashedMaterial({ color, dashSize: 2, gapSize: 1.5, depthTest: false }) : new THREE.LineBasicMaterial({ color, depthTest: false });

function polyline(points, z, color, { closed = false, dashed = false } = {}) {
  const pts = points.map((p) => new THREE.Vector3(p[0], p[1], z));
  if (closed) pts.push(pts[0].clone());
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  const l = new THREE.Line(g, lineMat(color, dashed));
  if (dashed) l.computeLineDistances();
  l.renderOrder = 10;
  return l;
}
function entityOutline(e) {
  if (e.type === "rect") return { pts: [[e.x0, e.y0], [e.x1, e.y0], [e.x1, e.y1], [e.x0, e.y1]], closed: true };
  if (e.type === "circle") return { pts: circlePolygon(e.cx, e.cy, e.r, 96), closed: true };
  return { pts: e.points, closed: !!e.closed };
}
function fill(polygon, z, color, opacity) {
  const shape = new THREE.Shape(polygon.map((p) => new THREE.Vector2(p[0], p[1])));
  const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthTest: false, depthWrite: false }));
  m.position.z = z;
  m.renderOrder = 5;
  return m;
}

function rebuildGrid() {
  clearGroup(gridGroup);
  const g = new THREE.GridHelper(400, 40, T.grid, T.grid);
  g.rotation.x = Math.PI / 2;
  g.position.z = plane.z - 0.02;
  g.material.transparent = true;
  g.material.opacity = 0.5;
  gridGroup.add(g);
  const o = 0.03;
  gridGroup.add(polyline([[-200, 0], [200, 0]], plane.z + o, 0xb04a4a), polyline([[0, -200], [0, 200]], plane.z + o, 0x4ab070));
}

function rebuildOverlay() {
  clearGroup(overlay);
  const z = plane.z + 0.05;
  const regions = regionsOf(session.entities, S.ui.circleSegments);
  const selectedId = ext?.region.id;
  for (const r of regions) {
    const hot = r.id === selectedId || (mode === "sketch" && session.tool === "select" && r.id === hoverId);
    overlay.add(fill(r.polygon, z - 0.01, hot ? T.regionHover : T.regionFill, hot ? 0.45 : 0.18));
  }
  for (const e of session.entities) {
    const o = entityOutline(e);
    overlay.add(polyline(o.pts, z, T.entity, { closed: o.closed }));
  }
  const d = session.draftShape();
  if (d && mode === "sketch") {
    const o = entityOutline(d);
    overlay.add(polyline(o.pts, z, T.draft, { closed: o.closed }));
  }
  const info = session.snapInfo;
  if (info && mode === "sketch" && session.cursor && session.tool !== "select") {
    for (const g of info.guides) {
      const a = g.axis === "v" ? [[g.value, -1000], [g.value, 1000]] : [[-1000, g.value], [1000, g.value]];
      overlay.add(polyline(a, z, T.guide, { dashed: true }));
    }
    if (info.kind !== "free") {
      const s = 6 / pixelsPerMm();
      const [x, y] = info.point;
      overlay.add(polyline([[x - s, y - s], [x + s, y - s], [x + s, y + s], [x - s, y + s]], z, T.snap, { closed: true }));
    }
  }
  requestRender();
}

// ---------------------------------------------------------------- extrude ghost + handle
function rebuildGhost() {
  clearGroup(ghostGroup);
  if (!ext || Math.abs(ext.distance) < S.extrude.minPreviewMm) return;
  const shape = new THREE.Shape(ext.region.polygon.map((p) => new THREE.Vector2(p[0], p[1])));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: Math.abs(ext.distance), bevelEnabled: false });
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: ext.mode === "cut" ? T.ghostCut : T.ghostAdd, transparent: true, opacity: 0.3, depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
  m.position.z = ext.distance >= 0 ? ext.z0 : ext.z0 + ext.distance;
  m.renderOrder = 6;
  ghostGroup.add(m);
}

function buildHandle() {
  clearGroup(handleGroup);
  if (!ext) return;
  const mat = new THREE.MeshBasicMaterial({ color: T.handle, depthTest: false });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.6, 12), mat);
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = 0.8;
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.1, 16), mat);
  head.rotation.x = Math.PI / 2;
  head.position.z = 2.15;
  const grab = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 3.2, 8), new THREE.MeshBasicMaterial({ visible: false }));
  grab.rotation.x = Math.PI / 2;
  grab.position.z = 1.6;
  for (const m of [shaft, head]) m.renderOrder = 20;
  handleGroup.add(shaft, head, grab);
  placeHandle();
}
function placeHandle() {
  if (!ext) return;
  const s = view.dist * S.extrude.handleScale;
  handleGroup.position.set(ext.region.centroid[0], ext.region.centroid[1], ext.z0 + ext.distance);
  handleGroup.scale.setScalar(s);
  handleGroup.rotation.x = ext.distance < 0 ? Math.PI : 0;
  requestRender();
}

// ---------------------------------------------------------------- geometry worker (coalescing, latency stats)
const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
let reqSeq = 0;
let inflight = null; // { id, t0, kind }
let queued = null; // { graph, kind }
const trips = [];
let lastOcctMs = null;
let lastVolume = null;
let bodyMesh = null;
let bodyEdges = null;

function buildGraph(extra) {
  const feats = extra ? [...features, extra] : features;
  const ops = [];
  let prev = null;
  for (const f of feats) {
    const m = f.mode === "cut" && prev ? "cut" : "add";
    ops.push(f.sketch);
    ops.push({ id: f.exId, type: "extrude", profile: f.sketch.id, distance: f.distance, ...(prev ? { target: prev } : {}), mode: m });
    prev = f.exId;
  }
  return { params: {}, ops };
}

function send(graph, kind) {
  if (inflight) {
    queued = { graph, kind }; // newest wins; older queued requests are dropped
    return;
  }
  const id = ++reqSeq;
  inflight = { id, t0: performance.now(), kind };
  const tolerance = kind === "preview" ? S.display.previewTessTolerance : S.display.tessTolerance;
  worker.postMessage({ id, graph, tess: { tolerance, angular: S.display.tessAngular } });
  $("json").textContent = JSON.stringify(graph, null, 1);
}

worker.onmessage = ({ data }) => {
  const done = inflight;
  inflight = null;
  if (queued) {
    const q = queued;
    queued = null;
    send(q.graph, q.kind);
  }
  if (data.fatal) return void ($("status").textContent = `worker error: ${data.fatal}`);
  if (done?.kind === "preview") {
    trips.push(performance.now() - done.t0);
    if (trips.length > S.stats.window) trips.shift();
  }
  lastOcctMs = data.totalMs;
  lastVolume = data.volume;
  bodyBox = data.bbox;
  showOps(data);
  showBody(data.mesh);
  showStats();
  $("planeTop").disabled = !bodyBox;
};

function showOps(data) {
  const ol = $("ops");
  ol.innerHTML = "";
  for (const o of data.ops) {
    const li = document.createElement("li");
    li.className = o.error ? "err" : "";
    li.innerHTML = `${o.id} <i>${o.type}</i> ${o.error ? "" : "ok"} ${Math.round(o.ms)} ms${o.error ? `<small>${o.error}</small>` : ""}`;
    ol.appendChild(li);
  }
}
function showBody(m) {
  clearGroup(bodyGroup);
  bodyMesh = bodyEdges = null;
  if (!m) return requestRender();
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(m.vertices, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(m.normals, 3));
  g.setIndex(new THREE.BufferAttribute(m.triangles, 1));
  bodyMesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: T.body, metalness: 0.1, roughness: 0.6, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
  bodyEdges = new THREE.LineSegments(new THREE.EdgesGeometry(g, 28), new THREE.LineBasicMaterial({ color: 0x1b2335 }));
  bodyGroup.add(bodyMesh, bodyEdges);
  requestRender();
}
function showStats() {
  const s = [...trips].sort((a, b) => a - b);
  const med = s.length ? s[Math.floor(s.length / 2)] : null;
  $("stats").textContent =
    `OCCT rebuild: ${lastOcctMs === null ? "-" : Math.round(lastOcctMs)} ms | volume ${lastVolume === null ? "-" : lastVolume.toFixed(1)} mm^3\n` +
    (s.length ? `drag round trip: last ${Math.round(trips[trips.length - 1])} / median ${Math.round(med)} / max ${Math.round(s[s.length - 1])} ms (n=${s.length})` : "");
  $("stats").style.whiteSpace = "pre-line";
}

// ---------------------------------------------------------------- modes
const HINTS = {
  select: "Select: click a closed region to extrude it. Draw with R (rectangle), C (circle), L (polyline).",
  rect: "Rectangle: click two corners. Shift = no snapping. Esc cancels.",
  circle: "Circle: click the centre, then click to set the radius. Shift = no snapping.",
  poly: "Polyline: click points; click the first point (or Enter) to close; Backspace removes a point.",
  extrude: "Drag the yellow arrow or type a distance. Pull below the plane to cut. Enter applies, Esc cancels.",
};
function updateUi() {
  document.querySelectorAll("#tools button").forEach((b) => b.classList.toggle("on", mode === "sketch" && b.dataset.tool === session.tool));
  $("hint").textContent = mode === "extrude" ? HINTS.extrude : HINTS[session.tool];
  $("extrudePanel").style.display = mode === "extrude" ? "block" : "none";
  $("status").textContent = `plane z = ${plane.z.toFixed(2)} mm | ${session.entities.length} sketch entities | ${features.length} features`;
  $("undo").disabled = features.length === 0;
  $("planeTop").disabled = !bodyBox;
}

function setTool(t) {
  if (mode === "extrude") cancelExtrude();
  session.setTool(t);
  hoverId = null;
  updateUi();
  rebuildOverlay();
}

function setPlane(z) {
  plane = { z };
  view.target.z = 0;
  rebuildGrid();
  rebuildOverlay();
  updateUi();
}

function enterExtrude(region) {
  ext = { region, z0: plane.z, distance: 0, mode: "add", drag: null };
  mode = "extrude";
  $("readout").style.display = "none";
  animateTo({ phi: S.ui.extrudePhi, theta: S.ui.extrudeTheta, target: new THREE.Vector3(region.centroid[0], region.centroid[1], plane.z) }, S.ui.tiltMs);
  $("dist").value = "0";
  buildHandle();
  rebuildOverlay();
  updateUi();
  updateExtrudeMode();
  setTimeout(() => $("dist").select(), 0);
}

function updateExtrudeMode() {
  if (!ext) return;
  ext.mode = ext.distance < 0 && features.length > 0 ? "cut" : "add";
  $("extrudeMode").textContent = Math.abs(ext.distance) < S.extrude.minPreviewMm ? "No change yet" : ext.mode === "cut" ? "Cut from the body (pulled below the plane)" : ext.distance < 0 ? "Add (downward, no body to cut yet)" : "Add";
}

function previewFeature() {
  return { sketch: regionToSketchOp(ext.region, `sk_${counter}`, ext.z0), exId: `ex_${counter}`, distance: ext.distance, mode: ext.mode, entity: ext.region.entity };
}

function setDistance(d) {
  if (!ext) return;
  ext.distance = d;
  updateExtrudeMode();
  if (document.activeElement !== $("dist")) $("dist").value = d.toFixed(2);
  rebuildGhost();
  placeHandle();
  const live = Math.abs(d) >= S.extrude.minPreviewMm;
  send(buildGraph(live ? previewFeature() : null), "preview");
}

function leaveExtrude() {
  ext = null;
  mode = "sketch";
  clearGroup(ghostGroup);
  clearGroup(handleGroup);
  animateTo({ phi: S.ui.sketchPhi, theta: -Math.PI / 2, target: new THREE.Vector3(view.target.x, view.target.y, 0) }, S.ui.tiltMs);
  rebuildOverlay();
  updateUi();
}
function cancelExtrude() {
  if (!ext) return;
  leaveExtrude();
  send(buildGraph(null), "commit");
}
function commitExtrude() {
  if (!ext) return;
  if (Math.abs(ext.distance) < S.extrude.minPreviewMm) return cancelExtrude();
  features.push(previewFeature());
  counter++;
  session.removeEntity(ext.region.entity.id);
  leaveExtrude();
  send(buildGraph(null), "commit");
}
function undo() {
  if (mode === "extrude") return cancelExtrude();
  const f = features.pop();
  if (!f) return;
  session.restoreEntity(f.entity);
  send(buildGraph(null), "commit");
  rebuildOverlay();
  updateUi();
}

// ---------------------------------------------------------------- pointer input
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function setRay(ev) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
}
function planePoint(ev) {
  setRay(ev);
  const hit = new THREE.Vector3();
  return raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -plane.z), hit) ? [hit.x, hit.y] : null;
}
const ray = () => ({ o: raycaster.ray.origin.toArray(), v: raycaster.ray.direction.toArray() });
const quantize = (d, fine) => {
  const step = fine ? 0.01 : S.extrude.dragStepMm;
  return Math.round(d / step) * step;
};

let gesture = null; // { kind: "pan"|"orbit"|"handle", x, y, ... }
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("pointerdown", (ev) => {
  canvas.setPointerCapture(ev.pointerId);
  const panning = ev.button === 1 || ev.button === 2 || (ev.button === 0 && spaceDown);
  if (panning) return void (gesture = { kind: "pan", x: ev.clientX, y: ev.clientY });
  if (ev.button !== 0) return;
  if (mode === "extrude") {
    setRay(ev);
    if (raycaster.intersectObject(handleGroup, true).length) {
      const s0 = zOnVerticalLineFromRay(ray(), ext.region.centroid[0], ext.region.centroid[1]);
      gesture = { kind: "handle", s0, d0: ext.distance };
    } else gesture = { kind: "orbit", x: ev.clientX, y: ev.clientY };
    return;
  }
  const p = planePoint(ev);
  if (!p) return;
  session.scale = pixelsPerMm();
  if (session.tool === "select") {
    const hit = hitRegion(p, regionsOf(session.entities, S.ui.circleSegments));
    if (hit) enterExtrude(hit);
    return;
  }
  session.click(p, { shift: ev.shiftKey });
  rebuildOverlay();
  updateUi();
});
canvas.addEventListener("pointermove", (ev) => {
  if (gesture?.kind === "pan") {
    const k = pixelsPerMm();
    view.target.x -= (ev.clientX - gesture.x) / k;
    view.target.y += (ev.clientY - gesture.y) / k;
    gesture.x = ev.clientX;
    gesture.y = ev.clientY;
    return requestRender();
  }
  if (gesture?.kind === "orbit") {
    anim = null;
    view.theta -= (ev.clientX - gesture.x) * 0.008;
    view.phi = Math.min(1.5, Math.max(0.15, view.phi - (ev.clientY - gesture.y) * 0.008));
    gesture.x = ev.clientX;
    gesture.y = ev.clientY;
    placeHandle();
    return requestRender();
  }
  if (gesture?.kind === "handle") {
    setRay(ev);
    const s = zOnVerticalLineFromRay(ray(), ext.region.centroid[0], ext.region.centroid[1]);
    if (s === null) return;
    let d = quantize(gesture.d0 + (s - gesture.s0), ev.shiftKey);
    if (Math.abs(d) < S.extrude.dragStepMm / 2 && !ev.shiftKey) d = 0;
    if (d !== ext.distance) setDistance(d);
    return;
  }
  if (mode !== "sketch") return;
  const p = planePoint(ev);
  if (!p) return;
  session.scale = pixelsPerMm();
  if (session.tool === "select") {
    const hit = hitRegion(p, regionsOf(session.entities, S.ui.circleSegments));
    const id = hit?.id ?? null;
    if (id !== hoverId) {
      hoverId = id;
      rebuildOverlay();
    }
    canvas.style.cursor = id ? "pointer" : "default";
    return;
  }
  session.move(p, { shift: ev.shiftKey });
  rebuildOverlay();
  const ro = $("readout");
  const text = [session.readout(), session.snapInfo.kind !== "free" ? `[${session.snapInfo.kind}]` : ""].filter(Boolean).join("  ");
  const r = canvas.getBoundingClientRect();
  ro.style.display = text ? "block" : "none";
  ro.textContent = text;
  ro.style.left = `${ev.clientX - r.left + 16}px`;
  ro.style.top = `${ev.clientY - r.top + 16}px`;
});
canvas.addEventListener("pointerup", () => (gesture = null));
canvas.addEventListener("pointerleave", () => ($("readout").style.display = "none"));
canvas.addEventListener(
  "wheel",
  (e) => {
    view.dist = Math.max(30, Math.min(900, view.dist * Math.exp(e.deltaY * 0.001)));
    placeHandle();
    rebuildOverlay();
    e.preventDefault();
  },
  { passive: false },
);

// ---------------------------------------------------------------- keyboard + buttons
let spaceDown = false;
addEventListener("keyup", (e) => e.code === "Space" && (spaceDown = false));
addEventListener("keydown", (e) => {
  const inInput = document.activeElement === $("dist");
  if (e.code === "Space" && !inInput) spaceDown = true;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") return (e.preventDefault(), undo());
  if (inInput) {
    if (e.key === "Enter") return (e.preventDefault(), $("dist").blur(), commitExtrude());
    if (e.key === "Escape") return ($("dist").blur(), cancelExtrude());
    return;
  }
  if (mode === "extrude") {
    if (e.key === "Enter") commitExtrude();
    else if (e.key === "Escape") cancelExtrude();
    return;
  }
  const tools = { v: "select", r: "rect", c: "circle", l: "poly" };
  const k = e.key.toLowerCase();
  if (tools[k] && !e.ctrlKey && !e.metaKey) return setTool(tools[k]);
  if (k === "x") return setPlane(0);
  if (k === "t" && bodyBox) return setPlane(bodyBox.max[2]);
  session.key(e.key);
  rebuildOverlay();
  updateUi();
});
document.querySelectorAll("#tools button").forEach((b) => b.addEventListener("click", () => setTool(b.dataset.tool)));
$("planeXY").addEventListener("click", () => setPlane(0));
$("planeTop").addEventListener("click", () => bodyBox && setPlane(bodyBox.max[2]));
$("undo").addEventListener("click", undo);
$("applyExtrude").addEventListener("click", commitExtrude);
$("cancelExtrude").addEventListener("click", cancelExtrude);
$("dist").addEventListener("input", () => {
  const v = parseFloat($("dist").value);
  if (Number.isFinite(v)) setDistance(v);
});

// ---------------------------------------------------------------- boot
resize();
rebuildGrid();
rebuildOverlay();
updateUi();
send(buildGraph(null), "commit");

// Hooks for the automated browser check (not used by the UI).
window.__sk = {
  session,
  state: () => ({ mode, plane, ext: ext && { distance: ext.distance, mode: ext.mode, regionId: ext.region.id }, features: features.length, bodyBox, tripsMs: [...trips], lastOcctMs, lastVolume }),
  graph: () => buildGraph(null),
  worldToScreen(x, y, z) {
    placeCamera();
    camera.updateMatrixWorld();
    const v = new THREE.Vector3(x, y, z).project(camera);
    const r = canvas.getBoundingClientRect();
    return [r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height];
  },
  handleScreen() {
    const p = handleGroup.position;
    return this.worldToScreen(p.x, p.y, p.z + handleGroup.scale.x * 1.6);
  },
};
