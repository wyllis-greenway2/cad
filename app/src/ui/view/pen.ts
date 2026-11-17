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
/** Many balls as one object (an instanced mesh: one draw call, one buffer): `points` each with its own radius. The same look as `sphereAt`. */
export const spheresAt = (points: readonly { at: Vec3; radius: number }[], color: number, depthTest = false): THREE.InstancedMesh => {
  const mat = new THREE.MeshBasicMaterial({ color, depthTest, transparent: true, opacity: 0.95, ...(depthTest ? { polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 } : {}) });
  const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), mat, points.length);
  const m = new THREE.Matrix4();
  points.forEach((p, i) => { m.makeScale(p.radius, p.radius, p.radius).setPosition(p.at[0], p.at[1], p.at[2]); balls.setMatrixAt(i, m); });
  balls.instanceMatrix.needsUpdate = true;
  balls.frustumCulled = false; // (its box is the one ball at the origin, not where the instances are)
  balls.renderOrder = 5;
  return balls;
};
export const sphereAt = (p: Vec3, radius: number, color: number, depthTest = false): THREE.Mesh => {
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color, depthTest, transparent: true, opacity: 0.95, ...(depthTest ? { polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 } : {}) }));
  ball.position.set(...p);
  ball.scale.setScalar(radius);
  ball.renderOrder = 5;
  return ball;
};

/** Thick lines are drawn by the screen size, so they are made here and told the size whenever it changes. */
export function createPen() {
  const mats: { mat: LineMaterial; tag: string }[] = []; // (every thick line's material, told the screen's size; `tag` says whose it is, so what was built for the highlight can be let go when it is built again)
  let tag = "";
  let size = { w: 1, h: 1 };
  return {
    line(pts: number[], color: number | THREE.Color, widthPx: number, depthTest = true): Line2 {
      const geo = new LineGeometry();
      geo.setPositions(pts);
      // a line that is depth tested sits a little in front of the surface it lies on, so it does not flicker with it, and is hidden by whatever is nearer
      const mat = new LineMaterial({ color: color as number, linewidth: widthPx, depthTest, worldUnits: false, ...(depthTest ? { polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 } : {}) });
      mat.resolution.set(size.w, size.h);
      mats.push({ mat, tag });
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
      mats.push({ mat, tag });
      return new LineSegments2(geo, mat);
    },
    setSize(w: number, h: number) {
      size = { w, h };
      for (const m of mats) m.mat.resolution.set(w, h);
    },
    /** The lines made from now on are the `name`'s (an empty name is the scene's own). */
    tagAs(name: string) { tag = name; },
    /** Let go of the lines of `name` (their group was cleared): their materials are freed, not kept for ever. */
    release(name: string) { for (let i = mats.length - 1; i >= 0; i--) if (mats[i]!.tag === name) { mats[i]!.mat.dispose(); mats.splice(i, 1); } },
    /** Build something of lines under a name: what that name built before is let go first, and the lines made inside `make` are its. */
    build(name: string, make: () => void) { this.release(name); const was = tag; tag = name; try { make(); } finally { tag = was; } },
    /** How many lines' materials are kept (for a test). */
    count(): number { return mats.length; },
    /** Forget the scene's own lines (their group was cleared). */
    reset() { this.release(""); },
  };
}
export type Pen = ReturnType<typeof createPen>;
