// The mover orb as three.js draws it: pixel-wide lines (like the old app's pen), small cones for heads, a ball that pulses blue while the orb is being oriented. Everything is drawn on top of the
// model. The handles come from orb.ts; this only draws them into a group that is emptied every picture.
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { OrbDrawing } from "./orbcontrol.ts";
import { settings } from "./settings.ts";
import type { V3 } from "./vec.ts";

const vec = (v: V3) => new THREE.Vector3(v[0], v[1], v[2]);
const rgb = (c: readonly number[]) => new THREE.Color().setRGB(c[0]!, c[1]!, c[2]!, THREE.SRGBColorSpace);

export function drawOrb(group: THREE.Group, o: OrbDrawing, w: number, h: number): void {
  const M = settings.mover, hl = o.unit * 0.127 * (M.headScale / 0.7), hr = hl * 0.3; // (the old head: 0.02 of the view distance long, a little under a third as wide)
  const ink = rgb(settings.theme.axis), teal = rgb(settings.orb.color);
  const add = (m: THREE.Object3D, order: number) => { m.renderOrder = order; group.add(m); };
  for (const hd of o.handles) {
    const hot = o.hot.includes(hd.id), colour = hot ? teal : ink, opacity = hot ? 1 : M.opacity;
    if (hd.kind === "ball") {
      const k = o.orient ? 0.5 + 0.5 * Math.sin(performance.now() / 260) : 0, blue = new THREE.Color(0x2f6fe0).lerp(new THREE.Color(0x9cc4ff), k); // (being oriented: it breathes blue)
      const ball = new THREE.Mesh(new THREE.SphereGeometry(o.unit * 0.064 * (M.headScale / 0.7) * (1 + 0.35 * k), 16, 12), new THREE.MeshBasicMaterial({ color: o.orient ? blue : colour, depthTest: false }));
      ball.position.copy(vec(hd.points[0]!)); add(ball, 14);
      continue;
    }
    // the head begins where the line has `hl` left to go and points the way the line goes THERE, not at its end, so it carries on from the curve; the line stops where the head begins
    const pts = hd.points.map(vec); let left = hl, i = pts.length - 1;
    while (i > 0 && left > pts[i]!.distanceTo(pts[i - 1]!)) { left -= pts[i]!.distanceTo(pts[i - 1]!); i--; }
    const dir = pts[i]!.clone().sub(pts[i - 1]!).normalize(), base = pts[i]!.clone().sub(dir.clone().multiplyScalar(left));
    for (const line of [[...pts.slice(0, i), base], ...(hd.also ?? []).map((l) => l.map(vec))]) {
      const g = new LineGeometry(); g.setPositions(line.flatMap((q) => [q.x, q.y, q.z]));
      const m = new LineMaterial({ color: colour.getHex(), linewidth: M.widthPx + (hot ? 1 : 0), transparent: true, opacity, depthTest: false });
      m.resolution.set(w, h);
      add(new Line2(g, m), 12);
    }
    const head = new THREE.Mesh(new THREE.ConeGeometry(hr, hl, 14), new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity, depthTest: false }));
    head.position.copy(base.clone().add(dir.clone().multiplyScalar(hl / 2))); head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    add(head, 13);
  }
}
