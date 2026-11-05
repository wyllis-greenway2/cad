// The helper handles (`in_117`): arrows, a double arrow, curved arrows and a ball, drawn on top of the model in charcoal (teal under the pointer or while dragged).
// Their size follows the view distance so they stay a comfortable size on the screen.
import * as THREE from "three";
import type { Vec3 } from "../../interaction/api.ts";
import { settings } from "../../interaction/api.ts";
import type { Handle } from "../../interaction/gizmo.ts";
import type { Pen } from "./pen.ts";
import { clearGroup, sphereAt, rgb } from "./pen.ts";
import { TEAL } from "./highlight.ts";

export interface GizmoView { handles: Handle[]; hover: string | null; active: string | null }

const cone = (tip: Vec3, dir: Vec3, unit: number, color: number): THREE.Mesh => {
  const h = unit * 0.034;
  const m = new THREE.Mesh(new THREE.ConeGeometry(unit * 0.0095, h, 16), new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true }));
  m.position.set(tip[0] - dir[0] * h / 2, tip[1] - dir[1] * h / 2, tip[2] - dir[2] * h / 2); // the tip is at the end of the handle
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...dir).normalize());
  m.renderOrder = 6;
  return m;
};
const unitDir = (a: Vec3, b: Vec3): Vec3 => {
  const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const l = Math.hypot(...d) || 1;
  return [d[0] / l, d[1] / l, d[2] / l];
};

export function buildGizmo(group: THREE.Group, g: GizmoView | null, unit: number, pen: Pen) {
  clearGroup(group);
  if (!g) return;
  const ink = rgb(settings.theme.axis).getHex();
  for (const h of g.handles) {
    const hot = h.id === g.hover || h.id === g.active;
    const col = hot ? TEAL : ink;
    const pts = h.points;
    if (h.kind === "ball") { group.add(sphereAt(pts[0]!, unit * 0.014, col)); continue; }
    const line = pen.line(pts.flat(), col, hot ? 4 : 3, false);
    line.renderOrder = 6;
    group.add(line);
    const n = pts.length;
    group.add(cone(pts[n - 1]!, unitDir(pts[n - 2]!, pts[n - 1]!), unit, col));
    if (h.kind === "double") group.add(cone(pts[0]!, unitDir(pts[1]!, pts[0]!), unit, col));
  }
}
