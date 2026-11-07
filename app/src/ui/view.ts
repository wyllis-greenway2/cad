// The three.js view (`dec_clean_engine_design` section 8): it reads the scene, the selection and the camera, and draws. It never changes them.
// The pieces are in `view/`: `content` (the scene), `highlight` (ring, teal, amber), `pen` (thick lines and shapes); the world dressing is `world.ts`.
import * as THREE from "three";
import { studio } from "./view/studio.ts";
import type { Scene, Vec3 } from "../interaction/api.ts";
import { settings } from "../interaction/api.ts";
import type { Camera } from "../interaction/camera.ts";
import { basis, position, projector } from "../interaction/camera.ts";
import type { Grid } from "../interaction/api.ts";
import { createWorld } from "./world.ts";
import { createPen, clearGroup, ringOf, sphereAt } from "./view/pen.ts";
import { buildContent } from "./view/content.ts";
import type { BodyMesh } from "./view/content.ts";
import { buildHighlight, TEAL } from "./view/highlight.ts";
import { buildGizmo } from "./view/gizmo.ts";
import type { GizmoView } from "./view/gizmo.ts";
import type { Highlight } from "./view/highlight.ts";

export type { Highlight };
type Preview = { segments: [Vec3, Vec3][]; circle: { center: Vec3; radius: number; normal: Vec3 } | null; cursor: Vec3 | null };

export function createView(host: HTMLElement) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(settings.theme.background);
  host.appendChild(renderer.domElement);
  const scene3 = new THREE.Scene();
  const persp = new THREE.PerspectiveCamera(settings.view.fovDeg, 1, 0.1, 10000);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10000);
  // lights ride with the camera (to one side and above it), so the sheen moves as you orbit
  scene3.add(new THREE.AmbientLight(0xffffff, settings.light.ambient * Math.PI));
  const key = new THREE.DirectionalLight(0xffffff, settings.light.key);
  const fill = new THREE.DirectionalLight(0xffffff, settings.light.fill);
  scene3.add(key, key.target, fill);

  const content = new THREE.Group();
  const overlay = new THREE.Group();
  const preview = new THREE.Group();
  const gizmo = new THREE.Group();
  const notes = new THREE.Group();
  scene3.add(content, overlay, preview, gizmo, notes);
  const world = createWorld(scene3, host);
  const pen = createPen();
  const envMap = new THREE.PMREMGenerator(renderer).fromScene(studio(), 0.04).texture; // a soft studio, only reflected in the body
  let lastScene: Scene | null = null;
  let lastMesh: BodyMesh | null = null;
  let size = { w: 1, h: 1 };

  /** Rebuild what is drawn from the scene (called when the scene changes). */
  function setScene(s: Scene, mesh: BodyMesh | null) {
    if (s === lastScene) return;
    lastScene = s;
    lastMesh = mesh;
    buildContent(content, s, mesh, pen, envMap);
  }
  const setHighlight = (h: Highlight, cam: Camera, nowMs: number) => buildHighlight(overlay, lastScene, lastMesh, h, cam, pen, nowMs);
  /** The figure being drawn, or the prism an extrude would make (lines; not part of the scene). */
  function setPreview(p: Preview | null, cam: Camera) {
    clearGroup(preview);
    if (!p) return;
    if (p.cursor) preview.add(sphereAt(p.cursor, cam.distance * settings.pick.vertexScale, TEAL));
    for (const [a, b] of p.segments) preview.add(pen.line([...a, ...b], TEAL, 2, false));
    if (p.circle) preview.add(pen.line(ringOf(p.circle.center, p.circle.radius, p.circle.normal), TEAL, 2, false));
  }

  /** The lines that go with constraints: the arc of an angle, the segment a distance measures. */
  function setNotes(lines: Vec3[][]) {
    clearGroup(notes);
    for (const l of lines) {
      const m = pen.line(l.flat(), 0x55575c, 1.6, false);
      m.renderOrder = 4;
      notes.add(m);
    }
  }
  const setPanes = (p: Parameters<typeof world.setPanes>[0]) => world.setPanes(p);
  const setGizmo = (g: GizmoView | null, cam: Camera) => buildGizmo(gizmo, g, cam.distance, pen);

  function resize() {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    size = { w, h };
    renderer.setSize(w, h);
    pen.setSize(w, h);
  }
  /** Draw the frame. */
  function render(cam: Camera, grid: Grid | null) {
    world.setGrid(grid);
    world.update(cam, size, content);
    const b = basis(cam);
    const eye = position(cam);
    const active = cam.straight ? ortho : persp;
    if (cam.straight) {
      const hh = projector(cam, size.w, size.h).halfH;
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
    pen.setSize(size.w, size.h);
    renderer.render(scene3, active);
  }
  resize();
  return { setScene, setHighlight, setPreview, setGizmo, setPanes, setNotes, render, resize, size: () => size, canvas: renderer.domElement };
}
