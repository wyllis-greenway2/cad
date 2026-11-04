import * as THREE from "three";
import graphJson from "../graphs/bracket.json";

const graph = structuredClone(graphJson);
const RANGES = { w: [20, 120, 1], d: [20, 80, 1], h: [5, 60, 1], hole_d: [2, 18, 0.5], r: [0.5, 14, 0.5] };

// --- view ---
const canvas = document.getElementById("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 2000);
scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const sun = new THREE.DirectionalLight(0xffffff, 1.1);
sun.position.set(60, -80, 120);
scene.add(sun);
const grid = new THREE.GridHelper(200, 20, 0x888888, 0xbbbbbb);
grid.rotation.x = Math.PI / 2;
scene.add(grid);
const material = new THREE.MeshStandardMaterial({ color: 0x4f8cff, metalness: 0.1, roughness: 0.55, side: THREE.DoubleSide });
let mesh = null;
let orbit = { theta: -0.9, phi: 1.05, dist: 190 };
function placeCamera() {
  const { theta, phi, dist } = orbit;
  camera.up.set(0, 0, 1);
  camera.position.set(dist * Math.sin(phi) * Math.cos(theta), dist * Math.sin(phi) * Math.sin(theta), dist * Math.cos(phi) + 10);
  camera.lookAt(0, 0, 10);
}
function resize() {
  const r = canvas.parentElement.getBoundingClientRect();
  renderer.setPixelRatio(devicePixelRatio);
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / r.height;
  camera.updateProjectionMatrix();
}
function draw() {
  placeCamera();
  renderer.render(scene, camera);
}
addEventListener("resize", () => (resize(), draw()));
let drag = null;
canvas.addEventListener("pointerdown", (e) => (drag = [e.clientX, e.clientY]));
addEventListener("pointerup", () => (drag = null));
addEventListener("pointermove", (e) => {
  if (!drag) return;
  orbit.theta -= (e.clientX - drag[0]) * 0.008;
  orbit.phi = Math.min(3.0, Math.max(0.1, orbit.phi - (e.clientY - drag[1]) * 0.008));
  drag = [e.clientX, e.clientY];
  draw();
});
canvas.addEventListener("wheel", (e) => ((orbit.dist = Math.max(40, Math.min(600, orbit.dist * (1 + e.deltaY * 0.001)))), draw(), e.preventDefault()), { passive: false });

// --- geometry worker ---
const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
let seq = 0;
let latest = 0;
function rebuild() {
  latest = ++seq;
  worker.postMessage({ id: latest, graph });
}
worker.onmessage = ({ data }) => {
  if (data.id !== latest) return; // a newer request superseded this one
  if (data.fatal) return void (document.getElementById("stats").textContent = `worker error: ${data.fatal}`);
  const ol = document.getElementById("ops");
  ol.innerHTML = "";
  for (const o of data.ops) {
    const li = document.createElement("li");
    li.className = o.error ? "err" : "ok";
    li.innerHTML = `<b>${o.id}</b> ${o.type} <span class="s">${o.error ? "" : "ok"}</span> ${Math.round(o.ms)} ms${o.error ? `<br><small>${o.error}</small>` : ""}`;
    ol.appendChild(li);
  }
  document.getElementById("stats").textContent = data.mesh
    ? `showing ${data.finalId} | volume ${data.volume.toFixed(1)} mm^3 | rebuild ${Math.round(data.totalMs)} ms`
    : "no solid";
  if (mesh) (scene.remove(mesh), mesh.geometry.dispose());
  if (data.mesh) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(data.mesh.vertices, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(data.mesh.normals, 3));
    g.setIndex(new THREE.BufferAttribute(data.mesh.triangles, 1));
    mesh = new THREE.Mesh(g, material);
    scene.add(mesh);
  }
  draw();
};

// --- parameter panel: every dimension is a named parameter ---
const panel = document.getElementById("params");
for (const [key, [min, max, step]] of Object.entries(RANGES)) {
  const label = document.createElement("label");
  label.innerHTML = `<span>${key}</span><output>${graph.params[key]}</output><input type="range" min="${min}" max="${max}" step="${step}" value="${graph.params[key]}">`;
  const input = label.querySelector("input");
  const out = label.querySelector("output");
  input.addEventListener("input", () => {
    graph.params[key] = Number(input.value);
    out.textContent = input.value;
    rebuild();
  });
  panel.appendChild(label);
}

resize();
draw();
rebuild();
window.__proto = { graph, rebuild, setParam: (k, v) => ((graph.params[k] = v), rebuild()) };
