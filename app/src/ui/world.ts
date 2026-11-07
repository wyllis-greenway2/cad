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

const HEAD = 1.1; // arrowhead length at the axes' own size (small: `in_140`)

export function createWorld(scene3: THREE.Scene, host: HTMLElement) {
  const axes = axisSet(AXIS_LEN, settings.world.axisWidthPx, HEAD, srgb(settings.theme.axis));
  for (const m of fadable(axes)) { m.transparent = true; m.opacity = settings.world.axisOpacity; }
  scene3.add(axes.group);
  const setGrid = createGrid(scene3);
  const setPanes = createPanes(scene3);
  const labels = AXES.map((a) => makeLabel(host, a.name));
  for (const l of labels) { l.style.fontSize = "10px"; l.style.opacity = String(settings.world.axisOpacity); }

  const ray = new THREE.Raycaster();
  /** Is anything of the model between the eye and this point? (The axes themselves are drawn with depth, the labels are text and need this check.) */
  function hidden(cam: Camera, point: Vec3, occluders: THREE.Object3D): boolean {
    const fwd = basis(cam).forward;
    const eye = cam.straight ? ([point[0] - fwd[0] * 1e4, point[1] - fwd[1] * 1e4, point[2] - fwd[2] * 1e4] as Vec3) : position(cam);
    const d = [point[0] - eye[0], point[1] - eye[1], point[2] - eye[2]];
    const len = Math.hypot(d[0]!, d[1]!, d[2]!);
    ray.set(new THREE.Vector3(...eye), new THREE.Vector3(d[0]! / len, d[1]! / len, d[2]! / len));
    ray.far = len - 0.05;
    return ray.intersectObject(occluders, true).some((h) => (h.object as THREE.Mesh).isMesh);
  }
  /** Place the axes at their real size in the world (so they grow and shrink as you zoom), and their labels (hidden when the model is in front of them). */
  function update(cam: Camera, size: { w: number; h: number }, occluders: THREE.Object3D) {
    const k = settings.world.axisLengthMm / AXIS_LEN;
    axes.group.scale.setScalar(k);
    for (const l of axes.lines) l.resolution.set(size.w, size.h);
    const pr = projector(cam, size.w, size.h);
    const fwd = basis(cam).forward;
    const facing = AXES.map((a) => Math.abs(a.dir[0] * fwd[0] + a.dir[1] * fwd[1] + a.dir[2] * fwd[2]) > 0.98); // seen end-on: no arrowhead, no label
    axes.heads.forEach((c, i) => (c.visible = !facing[i]));
    labels.forEach((d, i) => {
      const at = AXES[i]!.dir.map((v) => v * AXIS_LEN * k * 1.18) as unknown as Vec3;
      const p = pr.project(at);
      d.style.display = facing[i] || hidden(cam, at, occluders) ? "none" : "block";
      d.style.left = `${p[0]}px`;
      d.style.top = `${p[1]}px`;
    });
  }
  return { update, setGrid, setPanes };
}
