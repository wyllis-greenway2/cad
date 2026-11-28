// The few helpers every three.js drawing file shares.
import * as THREE from "three";
import { across } from "./planes.ts";
import type { V3 } from "./vec.ts";

export const vec = (v: V3) => new THREE.Vector3(v[0], v[1], v[2]);
export const rgb = (c: [number, number, number]) => new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
/** The matrix whose first two axes are the world axes across `axis` (as the plane's grid and pane lie) and whose third is the way the plane faces. */
export const basisOf = (axis: 0 | 1 | 2): THREE.Matrix4 => {
  const [i, j] = across(axis);
  const a: V3 = [0, 0, 0],
    b: V3 = [0, 0, 0];
  a[i] = 1;
  b[j] = 1;
  return new THREE.Matrix4().makeBasis(vec(a), vec(b), vec(a).cross(vec(b)));
};
