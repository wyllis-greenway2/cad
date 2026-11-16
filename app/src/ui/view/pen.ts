// Small helpers that make the pieces the view is built from: thick lines (they need the screen size), dots, triangle meshes, rings.
import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import type { Vec3 } from "../../interaction/api.ts";
import { ringPoints } from "../../interaction/api.ts";

export const rgb = (c: readonly [number, number, number]): THREE.Color => new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);

/** Take everything out of a group and free its geometry. */
export function clearGroup(g: THREE.Group) {
  for (const o of [...g.children]) {
    g.remove(o);
    o.traverse((c) => (c as THREE.Mesh).geometry?.dispose?.());
  }
}

export const trisMesh = (tris: number[], mat: THREE.Material): THREE.Mesh => {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(tris, 3));
  return new THREE.Mesh(g, mat);
};
/** The points of a circle in 3D (a closed polyline, flat xyz). */
export const ringOf = (center: Vec3, radius: number, normal: Vec3): number[] => ringPoints(center, radius, normal);
export const sphereAt = (p: Vec3, radius: number, color: number, depthTest = false): THREE.Mesh => {
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color, depthTest, transparent: true, opacity: 0.95, ...(depthTest ? { polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 } : {}) }));
  ball.position.set(...p);
  ball.scale.setScalar(radius);
  ball.renderOrder = 5;
  return ball;
};

/** Thick lines are drawn by the screen size, so they are made here and told the size whenever it changes. */
export function createPen() {
  const mats: LineMaterial[] = [];
  let size = { w: 1, h: 1 };
  return {
    line(pts: number[], color: number | THREE.Color, widthPx: number, depthTest = true): Line2 {
      const geo = new LineGeometry();
      geo.setPositions(pts);
      // a line that is depth tested sits a little in front of the surface it lies on, so it does not flicker with it, and is hidden by whatever is nearer
      const mat = new LineMaterial({ color: color as number, linewidth: widthPx, depthTest, worldUnits: false, ...(depthTest ? { polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 } : {}) });
      mat.resolution.set(size.w, size.h);
      mats.push(mat);
      return new Line2(geo, mat);
    },
    /** A dashed thick line (a guide, not a figure): dashes of `dash` world units with gaps of the same (`in_381`). */
    dashed(pts: number[], color: number | THREE.Color, widthPx: number, dash: number): Line2 {
      const line = this.line(pts, color, widthPx, false);
      const mat = line.material as LineMaterial;
      mat.dashed = true; mat.dashSize = dash; mat.gapSize = dash * 0.7; mat.needsUpdate = true;
      line.computeLineDistances();
      return line;
    },
    /** Separate thick segments: flat pairs of points (a, b, a, b, ...), with nothing drawn between one pair and the next (a line strip would join them). */
    segments(pairs: number[], color: number | THREE.Color, widthPx: number, depthTest = true): LineSegments2 {
      const geo = new LineSegmentsGeometry();
      geo.setPositions(pairs);
      const mat = new LineMaterial({ color: color as number, linewidth: widthPx, depthTest, worldUnits: false, ...(depthTest ? { polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 } : {}) });
      mat.resolution.set(size.w, size.h);
      mats.push(mat);
      return new LineSegments2(geo, mat);
    },
    setSize(w: number, h: number) {
      size = { w, h };
      for (const m of mats) m.resolution.set(w, h);
    },
    /** Forget the lines made so far (their group was cleared). */
    reset() { mats.length = 0; },
  };
}
export type Pen = ReturnType<typeof createPen>;
