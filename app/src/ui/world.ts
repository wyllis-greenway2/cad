// The world dressing (`in_064`, `in_120`): small, semi-transparent charcoal pencil axes with arrowheads and X Y Z labels at the origin, and that is all: they stay where they are
// (nothing flies into a corner). The three world planes are truly transparent: nothing is drawn for them, you pick them by clicking anywhere on empty space (the hover ring shows
// where). An axis pointing at you is seen end-on and loses its arrowhead and label. The faint grid on the plane you look straight at is here too (off by default).
import * as THREE from "three";
import type { Vec3 } from "../interaction/api.ts";
import { settings } from "../interaction/api.ts";
import type { Camera } from "../interaction/camera.ts";
import { basis, projector } from "../interaction/camera.ts";
import { AXES, AXIS_LEN, axisSet, fadable, makeLabel, srgb } from "./world/parts.ts";
import { createGrid } from "./world/grid.ts";

const HEAD = 3.2; // arrowhead length at the axes' own size

export function createWorld(scene3: THREE.Scene, host: HTMLElement) {
  const axes = axisSet(AXIS_LEN, settings.world.axisWidthPx, HEAD, srgb(settings.theme.axis));
  for (const m of fadable(axes)) { m.transparent = true; m.opacity = settings.world.axisOpacity; }
  scene3.add(axes.group);
  const setGrid = createGrid(scene3);
  const labels = AXES.map((a) => makeLabel(host, a.name));
  for (const l of labels) { l.style.fontSize = "10px"; l.style.opacity = String(settings.world.axisOpacity); }

  /** Place the axes at a size that stays the same on the screen, and their labels. */
  function update(cam: Camera, size: { w: number; h: number }) {
    const k = (cam.distance * settings.world.sizeOfView) / AXIS_LEN;
    axes.group.scale.setScalar(k);
    for (const l of axes.lines) l.resolution.set(size.w, size.h);
    const pr = projector(cam, size.w, size.h);
    const fwd = basis(cam).forward;
    const facing = AXES.map((a) => Math.abs(a.dir[0] * fwd[0] + a.dir[1] * fwd[1] + a.dir[2] * fwd[2]) > 0.98); // seen end-on: no arrowhead, no label
    axes.heads.forEach((c, i) => (c.visible = !facing[i]));
    labels.forEach((d, i) => {
      const p = pr.project(AXES[i]!.dir.map((v) => v * AXIS_LEN * k * 1.18) as unknown as Vec3);
      d.style.display = facing[i] ? "none" : "block";
      d.style.left = `${p[0]}px`;
      d.style.top = `${p[1]}px`;
    });
  }
  return { update, setGrid };
}
