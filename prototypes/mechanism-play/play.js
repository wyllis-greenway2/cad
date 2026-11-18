// A spike (`in_822`): bodies moved on screen by a matrix each, with no kernel and no history, driven by a timer. Parameters in the address: ?copies=K&mode=matrix|rebuild&seconds=S
import * as THREE from "three";
const q = new URLSearchParams(location.search);
const copies = Number(q.get("copies") ?? 1), mode = q.get("mode") ?? "matrix", seconds = Number(q.get("seconds") ?? 4);
const model = await (await fetch("./model.json")).json();
const { n, a, c } = model;
const beta = Math.PI / 2 - Math.PI / n;
// the kinematics (`dec_geneva`): the wheel's turn while the pin is in the slot, and the crank's
const psi = (al) => Math.atan2(a * Math.sin(al), c - a * Math.cos(al));
const wheelTurn = (k, al) => (k * 2 * Math.PI) / n + (al < -beta ? 0 : al > beta ? (2 * Math.PI) / n : psi(al) + Math.PI / n); // from the pose the model is made in (locked)
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight); document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xffffff);
scene.add(new THREE.HemisphereLight(0xffffff, 0x888888, 1.4));
const cam = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 1, 2000);
const side = Math.ceil(Math.sqrt(copies)), pitch = 130;
cam.position.set(side * pitch * 0.5 + 40, -side * pitch * 0.9 - 60, side * pitch * 0.8 + 90); cam.up.set(0, 0, 1); cam.lookAt(side * pitch * 0.5 + 15, side * pitch * 0.5, 0);
const mat = new THREE.MeshStandardMaterial({ color: 0xcfd4da, roughness: 0.7 });
const geom = {};
const geometryOf = (b) => { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(b.vertices), 3)); g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(b.normals), 3)); g.setIndex(b.index); return g; };
for (const b of model.bodies) geom[b.id] = geometryOf(b);
const roles = model.roles;
const items = []; // one mesh per body per copy: it keeps its own matrix
for (let i = 0; i < copies; i++) for (const b of model.bodies) {
  const m = new THREE.Mesh(geom[b.id], mat); m.matrixAutoUpdate = false; scene.add(m);
  items.push({ m, role: Object.keys(roles).find((r) => roles[r] === b.id), offset: [(i % side) * pitch, Math.floor(i / side) * pitch], id: b.id });
}
const tris = model.bodies.reduce((t, b) => t + b.index.length / 3, 0) * copies;
const Rz = (phi, cx, cy, ox, oy) => { const co = Math.cos(phi), si = Math.sin(phi); return new THREE.Matrix4().set(co, -si, 0, ox + cx - co * cx + si * cy, si, co, 0, oy + cy - si * cx - co * cy, 0, 0, 1, 0, 0, 0, 0, 1); };
const TURN_S = 3; // seconds for one turn of the crank
let frames = 0, tMatrix = 0, tRender = 0, tRebuild = 0; const start = performance.now(); let last = start; const gaps = [];
function frame(now) {
  const t = (now - start) / 1000;
  const turns = t / TURN_S; const k = Math.floor(turns) % n; const al = -Math.PI + 2 * Math.PI * (turns - Math.floor(turns));
  const t0 = performance.now();
  for (const it of items) {
    const [ox, oy] = it.offset;
    if (it.role === "wheel") it.m.matrix.copy(Rz(wheelTurn(k, al), 0, 0, ox, oy)); // the wheel turns about its shaft
    else it.m.matrix.copy(Rz(-(al + Math.PI), c, 0, ox, oy)); // the crank and the disc turn together about theirs
    it.m.matrixWorldNeedsUpdate = true;
  }
  const t1 = performance.now();
  if (mode === "rebuild") for (const it of items) { it.m.geometry = geometryOf(model.bodies.find((b) => b.id === it.id)); } // the naive way: new geometry from the arrays each frame
  const t2 = performance.now();
  renderer.render(scene, cam);
  const t3 = performance.now();
  tMatrix += t1 - t0; tRebuild += t2 - t1; tRender += t3 - t2; frames++; gaps.push(now - last); last = now;
  if (now - start < seconds * 1000) requestAnimationFrame(frame);
  else {
    const el = (now - start) / 1000;
    const g = gaps.slice(1).sort((x, y) => x - y);
    const res = { copies, mode, bodies: items.length, triangles: tris, frames, fps: +(frames / el).toFixed(1), msMatrixPerFrame: +(tMatrix / frames).toFixed(3), msRebuildPerFrame: +(tRebuild / frames).toFixed(2), msRenderCallPerFrame: +(tRender / frames).toFixed(1), frameGapMedianMs: +g[Math.floor(g.length / 2)].toFixed(0), done: true };
    document.getElementById("out").textContent = JSON.stringify(res, null, 1); window.__result = res;
  }
}
document.getElementById("out").textContent = `${items.length} bodies, ${tris} triangles, ${mode}`;
requestAnimationFrame(frame);
