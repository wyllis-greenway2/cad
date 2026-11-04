// The solid body: runs the geometry kernel (OCCT in a worker), shows the result in the scene, and keeps lights.
// The view asks for a graph with request(); newest request wins while one is in flight, so dragging never queues up.
import * as THREE from "three";

export function createBody(scene, S, colors) {
  const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  const group = new THREE.Group();
  scene.add(group);
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(30, -40, 60);
  scene.add(key, new THREE.AmbientLight(0xffffff, 0.85));

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
    if (!mesh) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(mesh.vertices, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3));
    geo.setIndex(new THREE.BufferAttribute(mesh.triangles, 1));
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: colors().bodyColor, roughness: 0.65, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, S.extrude.edgeAngleDeg), new THREE.LineBasicMaterial({ color: colors().bodyEdge }));
    group.add(m, edges);
  }

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
    recolor() {
      for (const c of group.children) c.material.color?.setHex(c.isLineSegments ? colors().bodyEdge : colors().bodyColor);
    },
    group,
  };
}
