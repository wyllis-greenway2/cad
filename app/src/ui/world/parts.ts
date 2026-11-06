// Pieces the world dressing shares: the three axes (a line and an arrowhead each), screen colours, and the X Y Z labels.
import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import type { Vec3 } from "../../interaction/api.ts";

export const AXIS_LEN = 30; // mm: each axis stops at its arrow
export const AXES: { name: "X" | "Y" | "Z"; dir: Vec3 }[] = [{ name: "X", dir: [1, 0, 0] }, { name: "Y", dir: [0, 1, 0] }, { name: "Z", dir: [0, 0, 1] }];

/** The tuned look values are screen colours, so they are read as sRGB. */
export const srgb = (c: readonly [number, number, number]): THREE.Color => new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);

export interface AxisSet { group: THREE.Group; lines: LineMaterial[]; heads: THREE.Mesh[] }
/** Three axes of length `len` from the origin, each ending in an arrowhead `head` long. */
export function axisSet(len: number, width: number, head: number, color: THREE.Color): AxisSet {
  const group = new THREE.Group();
  const lines: LineMaterial[] = [];
  const heads: THREE.Mesh[] = [];
  for (const a of AXES) {
    const geo = new LineGeometry();
    const reach = len - head * 0.6;
    geo.setPositions([...a.dir.map((v) => -v * reach), ...a.dir.map((v) => v * reach)]); // a star: each axis goes as far the other way, with its own arrow (`in_159`)
    const mat = new LineMaterial({ color: color.getHex(), linewidth: width, worldUnits: false });
    lines.push(mat);
    group.add(new Line2(geo, mat));
    for (const sign of [1, -1]) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(head * 0.3, head, 14), new THREE.MeshBasicMaterial({ color }));
      cone.position.set(sign * a.dir[0] * (len - head / 2), sign * a.dir[1] * (len - head / 2), sign * a.dir[2] * (len - head / 2));
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(sign * a.dir[0], sign * a.dir[1], sign * a.dir[2]));
      group.add(cone);
      heads.push(cone); // (the two heads of axis k are 2k and 2k + 1)
    }
  }
  return { group, lines, heads };
}

/** Every material of an axis set that can fade (its lines and its arrowheads). */
export function fadable(set: AxisSet): (THREE.Material & { opacity: number })[] {
  const out: (THREE.Material & { opacity: number })[] = [...set.lines];
  for (const h of set.heads) out.push(h.material as THREE.MeshBasicMaterial);
  return out;
}

/** A DOM label placed by the caller (the page, not the scene, draws text). */
export function makeLabel(host: HTMLElement, text: string): HTMLDivElement {
  const d = document.createElement("div");
  d.textContent = text;
  d.style.cssText = "position:absolute;left:0;top:0;font:700 12px system-ui,sans-serif;color:#2b2b2d;text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 3px #fff;pointer-events:none;transform:translate(-50%,-50%);display:none";
  host.appendChild(d);
  return d;
}
