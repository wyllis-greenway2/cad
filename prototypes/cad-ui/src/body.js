// The solid body: runs the geometry kernel (OCCT in a worker), shows the result in the scene, and keeps lights.
// The view asks for a graph with request(); newest request wins while one is in flight, so dragging never queues up.
import * as THREE from "three";

export function createBody(scene, S, colors) {
  const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  const group = new THREE.Group();
  scene.add(group);
  // Lights ride with the camera (to one side and above it, never in view), so the sheen on a surface moves as you orbit, which is
  // what makes it look solid. A weaker fill from the other side keeps the shaded faces readable.
  const key = new THREE.DirectionalLight(0xffffff, S.light.key);
  const fill = new THREE.DirectionalLight(0xffffff, S.light.fill);
  scene.add(key, key.target, fill, fill.target, new THREE.AmbientLight(0xffffff, S.light.ambient));
  const highlight = new THREE.Group(); // the face under the cursor, tinted blue
  scene.add(highlight);
  let bodyMesh = null;
  let faces = [];
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
      setHighlight(null);
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
    if (!mesh) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(mesh.vertices, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3));
    geo.setIndex(new THREE.BufferAttribute(mesh.triangles, 1));
    const m = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: colors().bodyColor, roughness: S.light.roughness, metalness: 0, clearcoat: S.light.sheen, clearcoatRoughness: S.light.sheenRoughness, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, S.extrude.edgeAngleDeg), new THREE.LineBasicMaterial({ color: colors().bodyEdge }));
    group.add(m, edges);
    bodyMesh = m;
  }

  let shownFace = null;
  function setHighlight(face) {
    if (face === shownFace) return;
    shownFace = face;
    for (const c of [...highlight.children]) (c.geometry.dispose(), c.material.dispose(), highlight.remove(c));
    if (!face || !bodyMesh) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", bodyMesh.geometry.getAttribute("position"));
    geo.setIndex(Array.from(bodyMesh.geometry.index.array.subarray(face.start, face.start + face.count)));
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: colors().blueSurface.length ? new THREE.Color(...colors().blueSurface) : 0x88aaff, transparent: true, opacity: S.light.faceHoverOpacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: false, side: THREE.DoubleSide }));
    m.renderOrder = 6;
    highlight.add(m);
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
    /** The flat face under a camera ray, or null: { face: {start, count, axis, sign, offset}, distance }. */
    pick(origin, direction) {
      if (!bodyMesh || !faces.length) return null;
      ray.set(origin, direction);
      const hit = ray.intersectObject(bodyMesh, false)[0];
      if (!hit) return null;
      const at = hit.faceIndex * 3;
      const face = faces.find((f) => at >= f.start && at < f.start + f.count);
      return face ? { face, distance: hit.distance } : null;
    },
    setHighlight,
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
