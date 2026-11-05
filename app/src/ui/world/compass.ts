// The compass in the lower right corner (`in_068`): the same axes, small, drawn over the finished frame in a corner rectangle. While the axes move between the origin
// and the corner, the compass draws the flying copy, in a rectangle that moves and shrinks between the two places.
import * as THREE from "three";
import { settings } from "../../interaction/api.ts";
import type { Camera } from "../../interaction/camera.ts";
import { basis, offsetOf, projector, position, worldPerPixel } from "../../interaction/camera.ts";
import { AXES, AXIS_LEN, axisSet, fadable, makeLabel, srgb } from "./parts.ts";

export interface Size { w: number; h: number }
export interface CompassState {
  /** there is a body: the compass lives in the corner */
  corner: boolean;
  /** moving between the origin and the corner */
  flying: boolean;
  /** how much of the big world is shown (0 to 1, eased) */
  e: number;
}

/** Where the compass sits: in the lower right corner, to the left of the X Y Z buttons that stand at the viewport edge. */
export function cornerRect(size: Size) {
  const C = settings.compass;
  return { cx: size.w - C.marginPx - C.buttonPx - C.gapPx - C.sizePx / 2, cy: size.h - C.marginPx - C.sizePx / 2, size: C.sizePx };
}

export function createCompass(renderer: THREE.WebGLRenderer, host: HTMLElement) {
  const scene = new THREE.Scene();
  const axes = axisSet(1, 2, 0.15, srgb(settings.theme.axis));
  scene.add(axes.group);
  const fade = fadable(axes);
  for (const m of fade) m.transparent = true;
  const camera = new THREE.OrthographicCamera(-1.5, 1.5, 1.5, -1.5, 0.1, 20);
  const labels = AXES.map((a) => makeLabel(host, a.name));

  /** Draw over the finished frame (call after the main render). */
  function render(cam: Camera, size: Size, st: CompassState) {
    const a = st.corner ? (st.flying ? 1 : 0.3 + 0.7 * (1 - st.e)) : 0; // a faint copy stays in the corner while the big axes are out
    axes.group.visible = a > 0.01;
    for (const m of fade) m.opacity = a;
    const b = basis(cam);
    const off = offsetOf(cam);
    camera.position.set(off[0] * 6, off[1] * 6, off[2] * 6);
    camera.up.set(...b.up);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    // the rectangle it is drawn in: the corner, or (flying) between the big axes' own place and the corner
    let { cx, cy, size: sz } = cornerRect(size);
    if (st.flying) {
      const origin = projector(cam, size.w, size.h).project([0, 0, 0]);
      const eye = position(cam);
      const wpp = cam.straight ? worldPerPixel(cam, size.h) : worldPerPixel({ ...cam, distance: Math.hypot(eye[0], eye[1], eye[2]) }, size.h);
      const bigSize = (3 * AXIS_LEN) / wpp; // the compass scene shows three units across and the axes are one unit long
      cx = origin[0] + (cx - origin[0]) * (1 - st.e);
      cy = origin[1] + (cy - origin[1]) * (1 - st.e);
      sz = bigSize + (sz - bigSize) * (1 - st.e);
    }
    const x = cx - sz / 2;
    const yTop = cy - sz / 2;
    if (a > 0.01) {
      const yGl = size.h - (yTop + sz);
      renderer.autoClear = false;
      renderer.setViewport(x, yGl, sz, sz);
      renderer.setScissor(Math.max(0, x), Math.max(0, yGl), Math.min(size.w, x + sz) - Math.max(0, x), Math.min(size.h, yGl + sz) - Math.max(0, yGl));
      renderer.setScissorTest(true);
      renderer.clearDepth();
      renderer.render(scene, camera);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, size.w, size.h);
      renderer.autoClear = true;
    }
    labels.forEach((d, i) => {
      const v = new THREE.Vector3(...AXES[i]!.dir).multiplyScalar(1.2).project(camera);
      d.style.display = a > 0.01 ? "block" : "none";
      d.style.opacity = String(a);
      d.style.left = `${x + ((v.x + 1) / 2) * sz}px`;
      d.style.top = `${yTop + ((1 - v.y) / 2) * sz}px`;
    });
  }
  return { render, lines: axes.lines };
}
