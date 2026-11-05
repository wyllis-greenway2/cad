// The helper handles (`in_117`): arrows, a double arrow, curved arrows and a ball, drawn on top of the model in white with a dark rim (teal under the pointer or while dragged).
// Their size follows the view distance so they stay a comfortable size on the screen.
import * as THREE from "three";
import type { Vec3 } from "../../interaction/api.ts";
import type { Handle } from "../../interaction/gizmo.ts";
import type { Pen } from "./pen.ts";
import { clearGroup, sphereAt } from "./pen.ts";
import { TEAL } from "./highlight.ts";

export interface GizmoView { handles: Handle[]; hover: string | null; active: string | null }

const WHITE = 0xffffff;
/** The dark rim behind a white handle, so it reads on a light background too. */
const RIM = 0x2b2e33;
const cone = (tip: Vec3, dir: Vec3, unit: number, color: number, grow = 1): THREE.Mesh => {
  const h = unit * 0.02 * grow;
  const m = new THREE.Mesh(new THREE.ConeGeometry(unit * 0.0055 * grow, h, 16), new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true }));
  m.position.set(tip[0] - dir[0] * h / 2, tip[1] - dir[1] * h / 2, tip[2] - dir[2] * h / 2); // the tip is at the end of the handle
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...dir).normalize());
  m.renderOrder = color === RIM ? 5 : 6;
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
  for (const h of g.handles) {
    const hot = h.id === g.hover || h.id === g.active;
    const col = hot ? TEAL : WHITE;
    const pts = h.points;
    if (h.kind === "ball") { group.add(sphereAt(pts[0]!, unit * 0.012, RIM)); group.add(sphereAt(pts[0]!, unit * 0.01, col)); continue; }
    const rim = pen.line(pts.flat(), RIM, hot ? 6 : 5, false);
    rim.renderOrder = 5;
    group.add(rim);
    const line = pen.line(pts.flat(), col, hot ? 3.5 : 2.5, false);
    line.renderOrder = 6;
    group.add(line);
    const n = pts.length;
    if (h.kind === "scale") { group.add(sphereAt(pts[1]!, unit * 0.016, RIM)); group.add(sphereAt(pts[1]!, unit * 0.014, col)); continue; } // pull the ball at the corner out to make it bigger
    if (h.kind === "arc") {
      // a full circle, so the plane it turns in is plain; one arrowhead says which way
      const k = h.head ?? 6;
      group.add(cone(pts[k + 1]!, unitDir(pts[k]!, pts[k + 1]!), unit, RIM, 1.35), cone(pts[k + 1]!, unitDir(pts[k]!, pts[k + 1]!), unit, col));
      continue;
    }
    const tip = (at: Vec3, from: Vec3) => group.add(cone(at, unitDir(from, at), unit, RIM, 1.35), cone(at, unitDir(from, at), unit, col));
    tip(pts[n - 1]!, pts[n - 2]!);
    if (h.kind === "double") tip(pts[0]!, pts[1]!);
  }
}
