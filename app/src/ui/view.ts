// The three.js view (`dec_clean_engine_design` section 8): it reads the scene, the selection and the camera, and draws. It never changes them.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import type { Scene, Part, Ref, Vec3 } from "../interaction/api.ts";
import { outlineOf, lookup, settings, consumed } from "../interaction/api.ts";
import type { Camera } from "../interaction/camera.ts";
import { basis, position, projector } from "../interaction/camera.ts";
import { surfaceTriangles } from "../interaction/surfaces.ts";
import { createWorld } from "./world.ts";
import type { WorldState } from "./world.ts";
import type { Grid } from "../interaction/grid.ts";
import { hoverOrb, selectOrb, fullOrb, orbMaterial, selectedLook } from "./orb.ts";

const AXIS_LEN = 30; // mm: the short pencil axes, each ending at its arrow
const rgb = (c: [number, number, number]) => new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);

export interface Highlight {
  hover: Ref | undefined;
  /** the point under the pointer on the hovered surface, for the ring */
  hoverPoint: Vec3 | null;
  selection: readonly Ref[];
  /** the parts a focused relation ties the selection to */
  amber?: readonly Ref[];
  /** the last selected surface spreads its colour from where it was clicked */
  spread: { ref: Ref; point: Vec3; startMs: number } | null;
}

export function createView(host: HTMLElement) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(settings.theme.background);
  host.appendChild(renderer.domElement);
  const scene3 = new THREE.Scene();
  const persp = new THREE.PerspectiveCamera(settings.view.fovDeg, 1, 0.1, 10000);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10000);
  scene3.add(new THREE.AmbientLight(0xffffff, settings.light.ambient * Math.PI));
  const key = new THREE.DirectionalLight(0xffffff, settings.light.key);
  const fill = new THREE.DirectionalLight(0xffffff, settings.light.fill);
  scene3.add(key, key.target, fill);

  const content = new THREE.Group();
  const overlay = new THREE.Group();
  const preview = new THREE.Group();
  scene3.add(content, overlay, preview);
  const world = createWorld(renderer, scene3, host);
  const envMap = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture; // a soft studio, only reflected in the body
  let lastScene: Scene | null = null;
  let lastMesh: { vertices: Float32Array; triangles: Uint32Array } | null = null;
  let size = { w: 1, h: 1 };
  const lineMats: LineMaterial[] = [];

  const dispose = (g: THREE.Group) => {
    for (const o of [...g.children]) {
      g.remove(o);
      o.traverse((c) => {
        const m = c as THREE.Mesh;
        m.geometry?.dispose?.();
      });
    }
  };
  const fatLine = (pts: number[], color: number | THREE.Color, widthPx: number, depthTest = true): Line2 => {
    const geo = new LineGeometry();
    geo.setPositions(pts);
    const mat = new LineMaterial({ color: color as number, linewidth: widthPx, depthTest, worldUnits: false });
    mat.resolution.set(size.w, size.h);
    lineMats.push(mat);
    return new Line2(geo, mat);
  };
  const dot = (p: Vec3, color: number, px: number): THREE.Points => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([...p], 3));
    return new THREE.Points(g, new THREE.PointsMaterial({ color, size: px, sizeAttenuation: false }));
  };
  const trisMesh = (tris: number[], mat: THREE.Material): THREE.Mesh => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(tris, 3));
    return new THREE.Mesh(g, mat);
  };
  const ringOf = (center: Vec3, radius: number, normal: Vec3): number[] => {
    const n = new THREE.Vector3(...normal).normalize();
    const a = Math.abs(n.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    const u = new THREE.Vector3().crossVectors(a, n).normalize();
    const v = new THREE.Vector3().crossVectors(n, u);
    const out: number[] = [];
    for (let i = 0; i <= 96; i++) {
      const t = (i / 96) * Math.PI * 2;
      out.push(center[0] + (u.x * Math.cos(t) + v.x * Math.sin(t)) * radius, center[1] + (u.y * Math.cos(t) + v.y * Math.sin(t)) * radius, center[2] + (u.z * Math.cos(t) + v.z * Math.sin(t)) * radius);
    }
    return out;
  };

  /** Rebuild what is drawn from the scene (called when the scene changes). */
  function setScene(s: Scene, mesh: { vertices: Float32Array; normals: Float32Array; triangles: Uint32Array } | null) {
    if (s === lastScene) return;
    lastScene = s;
    lastMesh = mesh;
    dispose(content);
    lineMats.length = 0;
    const get = lookup(s);
    const ink = settings.theme.sketchInk;
    const axis = rgb(settings.theme.axis);
    const paneRgb = settings.theme.sheet;
    const used = consumed(s);
    for (const p of Object.values(s.parts)) {
      if (used.has(p.ref)) continue; // an extrude has used it up
      if (p.origin === "world") continue; // the world is drawn by ui/world.ts
      if (p.kind === "face" && p.origin === "drawn") {
        const tris = surfaceTriangles(get, p);
        if (tris) content.add(trisMesh(tris, new THREE.MeshBasicMaterial({ color: rgb(paneRgb), transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })));
        continue;
      }
      if (p.origin === "body") continue; // the body's own outline comes from its mesh
      drawOutline(p, ink, get);
    }
    if (mesh) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(mesh.vertices, 3));
      g.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3));
      g.setIndex(new THREE.BufferAttribute(mesh.triangles, 1));
      content.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, settings.extrude.edgeAngleDeg), new THREE.LineBasicMaterial({ color: settings.theme.bodyEdge }))); // the outline, where faces meet at more than 30 degrees
      content.add(new THREE.Mesh(g, new THREE.MeshPhysicalMaterial({ color: settings.theme.bodyColor, roughness: settings.light.roughness, metalness: 0, clearcoat: settings.light.sheen, clearcoatRoughness: settings.light.sheenRoughness, envMap, envMapIntensity: settings.light.reflect, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })));
    }
  }
  function drawOutline(p: Part, color: number, get: ReturnType<typeof lookup>) {
    const o = outlineOf(get, p);
    if (o.shape === "point") content.add(dot(o.at, color, p.origin === "body" ? 4 : 6));
    else if (o.shape === "segment") content.add(fatLine([...o.a, ...o.b], color, p.origin === "body" ? 1.4 : 1.8));
    else if (o.shape === "circle") content.add(fatLine(ringOf(o.center, o.radius, o.normal), color, 1.8));
  }

  // ---- highlight: ring on hover, teal on selection ----
  const teal = settings.orb.color;
  const surface: [number, number, number] = [0.8, 0.8, 0.82];
  const ringRgb = selectedLook(teal, settings.orb.selectOpacity, surface);
  const tealHex = rgb(teal).getHex();
  function setHighlight(h: Highlight, cam: Camera, nowMs: number) {
    dispose(overlay);
    if (!lastScene) return;
    const get = lookup(lastScene);
    const unit = cam.distance;
    const AMBER = 0xf2c14e;
    const mark = (ref: Ref, kind: "select" | "hover" | "amber") => {
      const p = get(ref);
      if (!p) return;
      let tris = kind === "amber" ? null : surfaceTriangles(get, p);
      if (p.kind === "body" && lastMesh) {
        tris = [];
        for (const ix of lastMesh.triangles) tris.push(lastMesh.vertices[ix * 3]!, lastMesh.vertices[ix * 3 + 1]!, lastMesh.vertices[ix * 3 + 2]!);
      }
      if (tris) {
        const spread = h.spread?.ref === ref && kind === "select";
        const orb = kind === "hover" ? hoverOrb : spread ? selectOrb : fullOrb;
        const mat = orbMaterial(teal, ringRgb, orb, { offset: -2 });
        if (kind === "hover") {
          hoverOrb.uOrbC.value.set(...(h.hoverPoint ?? [0, 0, 0]));
          hoverOrb.uOrbR.value = settings.orb.radius * unit;
          hoverOrb.uOrbA.value = 0;
          hoverOrb.uOrbRingA.value = settings.orb.ringOpacity;
          hoverOrb.uOrbFill.value = 0;
          hoverOrb.uRingPx.value = settings.orb.ringPx;
        } else if (spread && h.spread) {
          const k = Math.min(1, (nowMs - h.spread.startMs) / settings.orb.fillMs);
          let reach = 0;
          for (let i = 0; i < tris.length; i += 3) reach = Math.max(reach, Math.hypot(tris[i]! - h.spread.point[0], tris[i + 1]! - h.spread.point[1], tris[i + 2]! - h.spread.point[2]));
          selectOrb.uOrbC.value.set(...h.spread.point);
          selectOrb.uOrbR.value = Math.max(1e-6, k * reach * settings.orb.reachFactor);
          selectOrb.uOrbA.value = settings.orb.selectOpacity;
          selectOrb.uOrbRingA.value = k < 1 ? 1 : 0;
          selectOrb.uOrbSoft.value = settings.orb.softFactor;
          selectOrb.uOrbFill.value = k;
          selectOrb.uRingPx.value = settings.orb.ringPx;
        } else {
          fullOrb.uOrbA.value = settings.orb.selectOpacity;
          fullOrb.uOrbRingA.value = 0;
          fullOrb.uOrbFill.value = 1;
        }
        overlay.add(trisMesh(tris, mat));
        return;
      }
      const o = outlineOf(get, p);
      const w = kind === "select" ? settings.pick.edgeWidthPx : settings.pick.edgeHoverWidthPx;
      const col = kind === "amber" ? AMBER : tealHex;
      if (o.shape === "point") {
        const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color: col, depthTest: false, transparent: true, opacity: 0.95 }));
        ball.position.set(...o.at);
        ball.scale.setScalar(unit * settings.pick.vertexScale * (kind === "select" ? settings.pick.vertexSelectScale : 1));
        ball.renderOrder = 5;
        overlay.add(ball);
      }
      else if (o.shape === "segment") overlay.add(fatLine([...o.a, ...o.b], col, w, false));
      else if (o.shape === "circle") overlay.add(fatLine(ringOf(o.center, o.radius, o.normal), col, w, false));
      else if (p.kind === "axis") overlay.add(fatLine([...p.at, ...[0, 1, 2].map((i) => p.at[i]! + p.dir[i]! * AXIS_LEN)], col, w, false));
    };
    for (const r of h.amber ?? []) mark(r, "amber");
    for (const r of h.selection) mark(r, "select");
    if (h.hover && !h.selection.includes(h.hover)) mark(h.hover, "hover");
  }

  /** The figure being drawn, or the prism an extrude would make (lines; not part of the scene). */
  function setPreview(p: { segments: [Vec3, Vec3][]; circle: { center: Vec3; radius: number; normal: Vec3 } | null } | null) {
    dispose(preview);
    if (!p) return;
    for (const [a, b] of p.segments) preview.add(fatLine([...a, ...b], tealHex, 2, false));
    if (p.circle) preview.add(fatLine(ringOf(p.circle.center, p.circle.radius, p.circle.normal), tealHex, 2, false));
  }

  function resize() {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    size = { w, h };
    renderer.setSize(w, h);
    for (const m of lineMats) m.resolution.set(w, h);
  }
  /** Draw the frame. Returns true while the world is still animating (the axes moving into the compass), so the caller keeps drawing. */
  function render(cam: Camera, ws: WorldState, grid: Grid | null, nowMs: number): boolean {
    world.setGrid(grid);
    const animating = world.update(ws, cam, size, nowMs);
    const pr = projector(cam, size.w, size.h);
    const b = basis(cam);
    const eye = position(cam);
    const active = cam.straight ? ortho : persp;
    if (cam.straight) {
      const hh = pr.halfH;
      ortho.left = -hh * (size.w / size.h);
      ortho.right = hh * (size.w / size.h);
      ortho.top = hh;
      ortho.bottom = -hh;
    } else persp.aspect = size.w / size.h;
    active.near = cam.distance * settings.view.nearFactor;
    active.far = cam.distance * settings.view.farFactor;
    active.position.set(...eye);
    active.up.set(...b.up);
    active.lookAt(...cam.target);
    active.updateProjectionMatrix();
    key.position.set(...([0, 1, 2].map((i) => eye[i]! + b.right[i]! * -0.7 * cam.distance + b.up[i]! * 0.9 * cam.distance) as unknown as Vec3));
    key.target.position.set(...cam.target);
    fill.position.set(...eye);
    for (const m of lineMats) m.resolution.set(size.w, size.h);
    renderer.render(scene3, active);
    world.renderCompass(cam, size);
    return animating;
  }
  resize();
  return { setScene, setHighlight, setPreview, render, cornerRect: world.cornerRect, resize, size: () => size, canvas: renderer.domElement };
}
