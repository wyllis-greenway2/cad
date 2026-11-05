// The world dressing (`in_064` to `in_070`): short charcoal pencil axes with arrowheads and X Y Z labels, three rounded panes to choose a plane by (until there is a body),
// the same axes shrunk into a compass in the corner once there is one, and the faint grid on the plane you look straight at. The pieces are in `world/`.
// It draws what it is told and decides nothing: the controller says whether the big axes are shown, and the camera says how to look.
import * as THREE from "three";
import type { Ref, Vec3 } from "../interaction/api.ts";
import { settings } from "../interaction/api.ts";
import type { Camera } from "../interaction/camera.ts";
import { basis, projector } from "../interaction/camera.ts";
import { AXES, AXIS_LEN, axisSet, fadable, makeLabel, srgb } from "./world/parts.ts";
import { createPanes } from "./world/panes.ts";
import { createCompass, cornerRect } from "./world/compass.ts";
import { createGrid } from "./world/grid.ts";

const HEAD = 3.2; // arrowhead length of the big axes

export interface WorldState {
  /** the big axes and panes at the origin (false: only the corner compass) */
  big: boolean;
  /** the starter panes are shown (no body yet) */
  panes: boolean;
  /** panes under the pointer or selected: a little brighter */
  lit: readonly Ref[];
  /** there is a body: the compass lives in the corner (a faint copy stays when the big axes are out) */
  corner: boolean;
}

export function createWorld(renderer: THREE.WebGLRenderer, scene3: THREE.Scene, host: HTMLElement) {
  const big = new THREE.Group();
  const axes = axisSet(AXIS_LEN, 2.2, HEAD, srgb(settings.theme.axis));
  const fade = fadable(axes);
  for (const m of fade) m.transparent = true;
  const panes = createPanes();
  big.add(axes.group, panes.group);
  scene3.add(big);
  const compass = createCompass(renderer, host);
  const setGrid = createGrid(scene3);
  const labels = AXES.map((a) => makeLabel(host, a.name));
  const lineMats = [...axes.lines, ...compass.lines];

  // k: 1 = the big axes are shown, 0 = only the compass; moves toward its target over `seconds`
  let k = 1;
  let lastT = 0;
  let first = true;
  let st = { corner: false, flying: false, e: 1 };

  /** Advance the animation and place the big axes, panes and labels. Returns true while the axes are still moving. */
  function update(state: WorldState, cam: Camera, size: { w: number; h: number }, nowMs: number): boolean {
    const dt = lastT ? Math.min(0.1, (nowMs - lastT) / 1000) : 0;
    lastT = nowMs;
    const target = state.big ? 1 : 0;
    if (first) { k = target; first = false; } // the first frame is where it should be: nothing flies at load
    if (k !== target) k = k < target ? Math.min(target, k + dt / settings.compass.seconds) : Math.max(target, k - dt / settings.compass.seconds);
    const e = k * k * (3 - 2 * k); // eased
    const flying = state.corner && k !== 0 && k !== 1 && e > 0.01 && e < 0.99; // one copy of the axes flies, drawn by the compass
    st = { corner: state.corner, flying, e };
    big.visible = e > 0.01 && !flying;
    for (const m of fade) m.opacity = e;
    panes.apply(state.panes, state.lit, e);
    for (const l of lineMats) l.resolution.set(size.w, size.h);
    const pr = projector(cam, size.w, size.h);
    const fwd = basis(cam).forward;
    const facing = AXES.map((a) => Math.abs(a.dir[0] * fwd[0] + a.dir[1] * fwd[1] + a.dir[2] * fwd[2]) > 0.98); // an axis pointing at you is seen end-on: no arrowhead, no label
    axes.heads.forEach((c, i) => (c.visible = !facing[i]));
    labels.forEach((d, i) => {
      const p = pr.project(AXES[i]!.dir.map((v) => v * (AXIS_LEN + 4)) as unknown as Vec3);
      d.style.display = big.visible && !facing[i] ? "block" : "none";
      d.style.opacity = String(e);
      d.style.left = `${p[0]}px`;
      d.style.top = `${p[1]}px`;
    });
    return k !== target;
  }

  return { update, renderCompass: (cam: Camera, size: { w: number; h: number }) => compass.render(cam, size, st), setGrid, cornerRect };
}
