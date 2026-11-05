// The solid body: asks the geometry kernel (through ./kernel/client.js; today OCCT) for the result, shows it in the scene, and keeps lights.
// The view asks for a graph with request(); newest request wins while one is in flight, so dragging never queues up.
import * as THREE from "three";
import { hoverOrb, selectOrb, orbMaterial, selectedLook } from "./orb.js";
const hexRgb = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
import { spawnKernel } from "./kernel/client.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

export function createBody(scene, S, colors, renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; // a soft studio, only reflected in the body (not a real reflection of the scene)
  const worker = spawnKernel();
  const group = new THREE.Group();
  scene.add(group);
  // Lights ride with the camera (to one side and above it, never in view), so the sheen on a surface moves as you orbit, which is
  // what makes it look solid. A weaker fill from the other side keeps the shaded faces readable.
  const key = new THREE.DirectionalLight(0xffffff, S.light.key);
  const fill = new THREE.DirectionalLight(0xffffff, S.light.fill);
  scene.add(key, key.target, fill, fill.target, new THREE.AmbientLight(0xffffff, S.light.ambient));
  const highlight = new THREE.Group(); // the face under the cursor, tinted blue
  const selectedGroup = new THREE.Group(); // the selected face, tinted more strongly
  scene.add(highlight, selectedGroup);
  let bodyMesh = null;
  let faces = [];
  let edges = [];
  let vertices = [];
  const ray = new THREE.Raycaster();

  let seq = 0;
  let inflight = null; // { id, key }
  let queued = null; // { graph, key }
  let wantedKey = null; // the graph most recently asked for
  let shownKey = null; // the graph the shown mesh was built from
  const info = { ready: false, volume: null, bbox: null, ms: null, error: null, ops: [] };
  let onResult = () => {};

  function post(graph, k) {
    const id = ++seq;
    inflight = { id, key: k };
    worker.postMessage({ id, graph, tess: { tolerance: S.extrude.tessTolerance, angular: S.extrude.tessAngular } });
  }

  worker.onmessage = ({ data }) => {
    const done = inflight;
    inflight = null;
    if (queued) {
      const q = queued;
      queued = null;
      post(q.graph, q.key);
    }
    info.ready = true;
    if (data.fatal) {
      info.error = data.fatal;
    } else {
      info.ops = data.ops;
      info.volume = data.volume;
      info.bbox = data.bbox;
      faces = data.faces ?? [];
      info.faceCount = faces.length;
      edges = data.edges ?? [];
      vertices = data.vertices ?? [];
      hoverState.face = null;
      selectState.face = null;
      info.ms = data.totalMs;
      info.error = data.ops.find((o) => o.error)?.error ?? null;
      show(data.mesh);
      shownKey = done?.key ?? null;
    }
    onResult(info);
  };

  function clear() {
    for (const c of [...group.children]) {
      c.geometry?.dispose();
      c.material?.dispose();
      group.remove(c);
    }
  }
  function show(mesh) {
    clear();
    bodyMesh = null;
    for (const g of [highlight, selectedGroup]) for (const c of [...g.children]) (c.geometry.dispose(), c.material.dispose(), g.remove(c));
    if (!mesh) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(mesh.vertices, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3));
    geo.setIndex(new THREE.BufferAttribute(mesh.triangles, 1));
    const m = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: colors().bodyColor, roughness: S.light.roughness, metalness: 0, clearcoat: S.light.sheen, clearcoatRoughness: S.light.sheenRoughness, envMap, envMapIntensity: S.light.reflect, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, S.extrude.edgeAngleDeg), new THREE.LineBasicMaterial({ color: colors().bodyEdge }));
    group.add(m, edges);
    bodyMesh = m;
  }

  /** A copy of the mesh triangles of one face (shares the vertex data). */
  function faceGeometry(face) {
    // own copy of the vertices: sharing the body's attribute would make disposing this geometry delete the body's GPU buffer too
    const pos = bodyMesh.geometry.getAttribute("position");
    const idx = bodyMesh.geometry.index.array;
    const out = new Float32Array(face.count * 3);
    for (let k = 0; k < face.count; k++) for (let c = 0; c < 3; c++) out[k * 3 + c] = pos.getComponent(idx[face.start + k], c);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(out, 3));
    return geo;
  }
  function tint(group, face, orb, current) {
    if (face === current.face) return;
    current.face = face;
    for (const c of [...group.children]) (c.geometry.dispose(), c.material.dispose(), group.remove(c));
    if (!face || !bodyMesh) return;
    const m = new THREE.Mesh(faceGeometry(face), orbMaterial(S.orb.color, selectedLook(S.orb.color, S.orb.selectOpacity, hexRgb(colors().bodyColor)), orb, { offset: -2 })); // a ring on the face, and a teal fill when clicked (`in_073`, `in_074`)
    m.renderOrder = 6;
    group.add(m);
  }
  const hoverState = { face: null };
  const selectState = { face: null };
  const setHighlight = (face) => tint(highlight, face, hoverOrb, hoverState);
  const setSelected = (face) => tint(selectedGroup, face, selectOrb, selectState);
  const positionsOf = (face) => {
    const pos = bodyMesh.geometry.getAttribute("position");
    const idx = bodyMesh.geometry.index.array;
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    const sum = [0, 0, 0];
    for (let k = face.start; k < face.start + face.count; k++) {
      for (let c = 0; c < 3; c++) {
        const v = pos.getComponent(idx[k], c);
        lo[c] = Math.min(lo[c], v);
        hi[c] = Math.max(hi[c], v);
        sum[c] += v;
      }
    }
    return { lo, hi, mean: sum.map((x) => x / face.count) };
  };

  return {
    /** Ask for this graph (ignored if it is the same as the last request). */
    request(graph) {
      const k = JSON.stringify(graph);
      if (k === wantedKey) return;
      wantedKey = k;
      if (inflight) queued = { graph, key: k };
      else post(graph, k);
    },
    /** Is the shown mesh the result of the latest request? (If not, the view may show an instant ghost.) */
    fresh: () => shownKey === wantedKey,
    ready: () => info.ready,
    info,
    onResult: (fn) => (onResult = fn),
    /** The flat face under a camera ray, or null: { face: {start, count, axis, sign, offset}, distance }. */
    pick(origin, direction) {
      if (!bodyMesh || !faces.length) return null;
      ray.set(origin, direction);
      const hit = ray.intersectObject(bodyMesh, false)[0];
      if (!hit) return null;
      const at = hit.faceIndex * 3;
      const face = faces.find((f) => at >= f.start && at < f.start + f.count);
      return face ? { face, distance: hit.distance, point: hit.point.toArray() } : null;
    },
    /** Is the straight line from `from` to `to` blocked by the body? */
    blocked(from, to) {
      if (!bodyMesh) return false;
      const d = to.clone().sub(from);
      const len = d.length();
      ray.set(from, d.normalize());
      ray.far = len - 0.01;
      const hit = ray.intersectObject(bodyMesh, false).length > 0;
      ray.far = Infinity;
      return hit;
    },
    /** The current line matching an earlier reference { a, b, mid }, or null. */
    findEdge: (ref) => edges.find((e) => e.mid && Math.hypot(e.mid[0] - ref.mid[0], e.mid[1] - ref.mid[1], e.mid[2] - ref.mid[2]) < 1e-3 && ((e.a.join() === ref.a.join() && e.b.join() === ref.b.join()) || (e.a.join() === ref.b.join() && e.b.join() === ref.a.join()))) ?? null,
    get edges() { return edges; },
    get vertices() { return vertices; },
    /** The whole body as one "face" (every triangle), for tinting a selected body. */
    wholeBody: () => (bodyMesh ? { start: 0, count: bodyMesh.geometry.index.count } : null),
    setHighlight,
    setSelected,
    faceGeometry: (face) => (bodyMesh ? faceGeometry(face) : null),
    /** The size of a face's box (mm). */
    faceSize(face) {
      const { lo, hi } = positionsOf(face);
      return Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
    },
    /** Where a face is (the middle of its triangles' corners), as a THREE.Vector3. */
    faceCenter(face) {
      const { lo, hi } = positionsOf(face);
      return new THREE.Vector3(...lo.map((l, i) => (l + hi[i]) / 2));
    },
    /** The current face matching an earlier reference { axis, sign, offset, point }, or null (e.g. after the model changed). */
    findFace(ref) {
      if (!bodyMesh) return null;
      if (ref.kind === "cyl") {
        return faces.find((f) => f.type === "cyl" && f.axis === ref.axis && Math.abs(f.radius - ref.radius) < 1e-3 && Math.abs(f.lo - ref.lo) < 1e-3 && Math.abs(f.hi - ref.hi) < 1e-3 && [0, 1, 2].every((i) => i === ref.axis || Math.abs(f.center[i] - ref.center[i]) < 1e-3)) ?? null;
      }
      const n = ref.n ?? [0, 1, 2].map((i) => (i === ref.axis ? ref.sign : 0)); // the face's unit normal and offset (n . p = d)
      const d = ref.n ? ref.d : ref.sign * ref.offset;
      let best = null;
      for (const f of faces) {
        if (f.type === "cyl") continue;
        if (f.n[0] * n[0] + f.n[1] * n[1] + f.n[2] * n[2] < 1 - 1e-5 || Math.abs(f.d - d) > 1e-3) continue;
        const { lo, hi } = positionsOf(f);
        if (ref.point.some((p, i) => p < lo[i] - 1e-3 || p > hi[i] + 1e-3)) continue;
        const area = (hi[0] - lo[0] + 1e-6) * (hi[1] - lo[1] + 1e-6) * (hi[2] - lo[2] + 1e-6);
        if (!best || area < best.area) best = { f, area };
      }
      return best?.f ?? null;
    },
    /** Put the lights to one side of and above the camera. */
    updateLights(camera, target, dist) {
      const m = camera.matrixWorld.elements;
      const right = new THREE.Vector3(m[0], m[1], m[2]);
      const up = new THREE.Vector3(m[4], m[5], m[6]);
      const place = (light, r, u) => {
        light.position.copy(camera.position).addScaledVector(right, r * dist).addScaledVector(up, u * dist);
        light.target.position.copy(target);
        light.target.updateMatrixWorld();
      };
      place(key, S.light.keyRight, S.light.keyUp);
      place(fill, -S.light.keyRight, -S.light.keyUp * 0.4);
    },
    recolor() {
      for (const c of group.children) c.material.color?.setHex(c.isLineSegments ? colors().bodyEdge : colors().bodyColor);
    },
    group,
  };
}
