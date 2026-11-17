// The world dressing (`in_064`, `in_120`): small, semi-transparent charcoal pencil axes with arrowheads and X Y Z labels at the origin, and that is all: they stay where they are
// (nothing flies into a corner). The three world planes are truly transparent: nothing is drawn for them, you pick them by clicking anywhere on empty space (the hover ring shows
// where). An axis pointing at you is seen end-on and loses its arrowhead and label. The faint grid on the plane you look straight at is here too (off by default).
import * as THREE from "three";
import type { Vec3 } from "../interaction/api.ts";
import { settings } from "../interaction/api.ts";
import type { Camera } from "../interaction/camera.ts";
import { basis, position, projector } from "../interaction/camera.ts";
import { AXES, AXIS_LEN, axisSet, fadable, makeLabel, srgb } from "./world/parts.ts";
import { createGrid } from "./world/grid.ts";
import { createPanes } from "./world/panes.ts";

/**
 * Whether the ray meets a mesh before its `far`, found with the mesh's triangles in chunks of 128 with a box round each (made once for the mesh): the ray is asked of the chunks' boxes and only the triangles of the chunks it meets are
 * worked, and the first hit ends it (three's own raycast works every triangle of a mesh whose box the ray meets, and keeps them all: a gear body is thousands, three times a frame while the view turns, `in_765`). The same answer: the sides
 * of a triangle that the material draws are those that count, as three has it. What is not a plain mesh of its own triangles is asked of three.
 */
const CHUNK = 128;
const chunked = new WeakMap<THREE.BufferGeometry, { boxes: Float32Array; tris: number }>();
function chunksOf(g: THREE.BufferGeometry, pos: THREE.BufferAttribute): { boxes: Float32Array; tris: number } {
  let c = chunked.get(g);
  if (c) return c;
  const idx = g.index;
  const tris = idx ? idx.count / 3 : pos.count / 3;
  const n = Math.ceil(tris / CHUNK);
  const boxes = new Float32Array(n * 6);
  for (let i = 0; i < n; i++) boxes.set([Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity], i * 6);
  for (let t = 0; t < tris; t++) {
    const b = Math.floor(t / CHUNK) * 6;
    for (let k = 0; k < 3; k++) {
      const v = idx ? idx.getX(t * 3 + k) : t * 3 + k;
      for (let a = 0; a < 3; a++) { const x = pos.array[v * 3 + a]!; if (x < boxes[b + a]!) boxes[b + a] = x; if (x > boxes[b + 3 + a]!) boxes[b + 3 + a] = x; }
    }
  }
  c = { boxes, tris };
  chunked.set(g, c);
  return c;
}
const toLocal = new THREE.Matrix4();
export function anyHit(ray: THREE.Raycaster, o: THREE.Object3D): boolean {
  const mesh = o as THREE.Mesh;
  const g = mesh.geometry as THREE.BufferGeometry | undefined;
  const pos = g?.getAttribute?.("position") as THREE.BufferAttribute | undefined;
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  if (!mesh.isMesh || !g || !pos || pos.itemSize !== 3 || (pos as unknown as { isInterleavedBufferAttribute?: boolean }).isInterleavedBufferAttribute || !material || (o as { isLineSegments2?: boolean }).isLineSegments2 || (o as { isLine2?: boolean }).isLine2 || (mesh as unknown as { isInstancedMesh?: boolean }).isInstancedMesh) {
    return ray.intersectObject(o, false).length > 0;
  }
  const { boxes, tris } = chunksOf(g, pos);
  toLocal.copy(mesh.matrixWorld).invert();
  const org = ray.ray.origin.clone().applyMatrix4(toLocal);
  const dir = ray.ray.direction.clone().transformDirection(toLocal);
  const far = ray.far;
  const [ox, oy, oz, dx, dy, dz] = [org.x, org.y, org.z, dir.x, dir.y, dir.z];
  const o3 = [ox, oy, oz], d3 = [dx, dy, dz];
  const side = material.side;
  const idx = g.index;
  const P = pos.array;
  for (let c = 0; c * CHUNK < tris; c++) {
    let [t0, t1] = [0, far];
    let missed = false;
    for (let a = 0; a < 3 && !missed; a++) {
      const [lo, hi] = [boxes[c * 6 + a]!, boxes[c * 6 + 3 + a]!];
      if (Math.abs(d3[a]!) < 1e-12) { if (o3[a]! < lo || o3[a]! > hi) missed = true; continue; }
      let [p, q] = [(lo - o3[a]!) / d3[a]!, (hi - o3[a]!) / d3[a]!];
      if (p > q) [p, q] = [q, p];
      t0 = Math.max(t0, p); t1 = Math.min(t1, q);
      if (t0 > t1) missed = true;
    }
    if (missed) continue;
    for (let t = c * CHUNK; t < Math.min(tris, (c + 1) * CHUNK); t++) {
      const [i0, i1, i2] = idx ? [idx.getX(t * 3), idx.getX(t * 3 + 1), idx.getX(t * 3 + 2)] : [t * 3, t * 3 + 1, t * 3 + 2];
      const [ax, ay, az] = [P[i0! * 3]!, P[i0! * 3 + 1]!, P[i0! * 3 + 2]!];
      const [e1x, e1y, e1z, e2x, e2y, e2z] = [P[i1! * 3]! - ax, P[i1! * 3 + 1]! - ay, P[i1! * 3 + 2]! - az, P[i2! * 3]! - ax, P[i2! * 3 + 1]! - ay, P[i2! * 3 + 2]! - az];
      // Moller-Trumbore, with the sides of the triangle the material draws counting, as three has it (a ray along the normal's way meets the back)
      const [hx, hy, hz] = [dy * e2z - dz * e2y, dz * e2x - dx * e2z, dx * e2y - dy * e2x];
      const det = e1x * hx + e1y * hy + e1z * hz;
      if (Math.abs(det) < 1e-18 || (det < 0 && side === THREE.FrontSide) || (det > 0 && side === THREE.BackSide)) continue;
      const f = 1 / det;
      const [sx, sy, sz] = [ox - ax, oy - ay, oz - az];
      const u = f * (sx * hx + sy * hy + sz * hz);
      if (u < 0 || u > 1) continue;
      const [qx, qy, qz] = [sy * e1z - sz * e1y, sz * e1x - sx * e1z, sx * e1y - sy * e1x];
      const v = f * (dx * qx + dy * qy + dz * qz);
      if (v < 0 || u + v > 1) continue;
      const t_ = f * (e2x * qx + e2y * qy + e2z * qz);
      if (t_ >= 0 && t_ <= far) return true;
    }
  }
  return false;
}

const HEAD = 1.1; // arrowhead length at the axes' own size (small: `in_140`)

export function createWorld(scene3: THREE.Scene, host: HTMLElement) {
  const axes = axisSet(AXIS_LEN, settings.world.axisWidthPx, HEAD, srgb(settings.theme.axis));
  for (const m of fadable(axes)) { m.transparent = true; m.opacity = settings.world.axisOpacity; }
  scene3.add(axes.group);
  const setGrid = createGrid(scene3);
  const setPanes = createPanes(scene3);
  const labels = AXES.map((a) => makeLabel(host, a.name));
  for (const l of labels) { l.style.fontSize = "10px"; l.style.opacity = String(settings.world.axisOpacity); }

  let off = false; // the axes and the panes put away with the orb at their junction (`in_463`)
  const ray = new THREE.Raycaster();
  /** Is anything of the model between the eye and this point? (The axes themselves are drawn with depth, the labels are text and need this check.) */
  function hidden(cam: Camera, point: Vec3, occluders: readonly THREE.Object3D[]): boolean {
    const fwd = basis(cam).forward;
    const eye = cam.straight ? ([point[0] - fwd[0] * 1e4, point[1] - fwd[1] * 1e4, point[2] - fwd[2] * 1e4] as Vec3) : position(cam);
    const d = [point[0] - eye[0], point[1] - eye[1], point[2] - eye[2]];
    const len = Math.hypot(d[0]!, d[1]!, d[2]!);
    ray.set(new THREE.Vector3(...eye), new THREE.Vector3(d[0]! / len, d[1]! / len, d[2]! / len));
    ray.far = len - 0.05;
    for (const o of occluders) if (anyHit(ray, o)) return true; // (only the meshes are asked: a ray through every segment of every drawn line, to throw the answer away, was most of a gear's frame)
    return false;
  }
  /** Place the axes at their real size in the world (so they grow and shrink as you zoom), and their labels (hidden when the model is in front of them). */
  let placedFor = "";
  /** `key`: what the labels' places and their being hidden depend on besides the camera and the size (the model as drawn): while it is the same the labels are where they were and are not worked out again. */
  function update(cam: Camera, size: { w: number; h: number }, occluders: readonly THREE.Object3D[], key = "") {
    const now = `${cam.target.join(",")}|${cam.distance}|${cam.azimuth}|${cam.elevation}|${cam.straight}|${cam.mix}|${size.w}x${size.h}|${off}|${key}`;
    const k = settings.world.axisLengthMm / AXIS_LEN;
    axes.group.scale.setScalar(k);
    axes.group.visible = !off;
    for (const l of axes.lines) l.resolution.set(size.w, size.h);
    if (now === placedFor) return;
    placedFor = now;
    const pr = projector(cam, size.w, size.h);
    const fwd = basis(cam).forward;
    const facing = AXES.map((a) => Math.abs(a.dir[0] * fwd[0] + a.dir[1] * fwd[1] + a.dir[2] * fwd[2]) > 0.98); // seen end-on: no arrowhead, no label
    axes.heads.forEach((c, i) => (c.visible = !facing[i]));
    labels.forEach((d, i) => {
      const at = AXES[i]!.dir.map((v) => v * AXIS_LEN * k * 1.18) as unknown as Vec3;
      const p = pr.project(at);
      d.style.display = off || facing[i] || hidden(cam, at, occluders) ? "none" : "block";
      d.style.left = `${p[0]}px`;
      d.style.top = `${p[1]}px`;
    });
  }
  return { update, setGrid, setPanes, setOff: (on: boolean) => { off = on; } };
}
