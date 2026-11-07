// The little panes of the world planes (`in_190`): semi-transparent squares beside the axes, the plane that is on lit blue, the one under the pointer lighter. The geometry comes from the interaction layer.
import * as THREE from "three";
import { settings } from "../../interaction/api.ts";
import type { Vec3 } from "../../interaction/api.ts";

export interface PaneView { name: string; corners: Vec3[]; active: boolean; hover: boolean }

/** A square's outline with rounded corners (`in_193`): `corners` are the four corners in order; the radius is a fraction of the side. */
function rounded(corners: Vec3[], fraction: number, steps = 5): Vec3[] {
  const at = (i: number) => corners[((i % 4) + 4) % 4]!;
  const side = Math.hypot(at(1)[0] - at(0)[0], at(1)[1] - at(0)[1], at(1)[2] - at(0)[2]);
  const r = side * fraction;
  const out: Vec3[] = [];
  for (let i = 0; i < 4; i++) {
    const [p, a, b] = [at(i), at(i - 1), at(i + 1)];
    const toward = (q: Vec3): Vec3 => { const d: Vec3 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]]; const l = Math.hypot(...d) || 1; return [d[0] / l, d[1] / l, d[2] / l]; };
    const [da, db] = [toward(a), toward(b)];
    const [s0, s1]: [Vec3, Vec3] = [[p[0] + da[0] * r, p[1] + da[1] * r, p[2] + da[2] * r], [p[0] + db[0] * r, p[1] + db[1] * r, p[2] + db[2] * r]];
    // a quarter of a circle from one side's point to the other's, bent towards the corner (a quadratic curve through the corner)
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      out.push([0, 1, 2].map((j) => (1 - t) * (1 - t) * s0[j]! + 2 * (1 - t) * t * p[j]! + t * t * s1[j]!) as unknown as Vec3);
    }
  }
  return out;
}

export function createPanes(scene3: THREE.Scene) {
  const group = new THREE.Group();
  scene3.add(group);
  const shown = new Map<string, { fill: THREE.Mesh; edge: THREE.LineLoop }>();
  const colour = new THREE.Color();
  return (panes: PaneView[]) => {
    for (const p of panes) {
      let o = shown.get(p.name);
      if (!o) {
        const outline = rounded(p.corners, settings.world.paneRound);
        const mid = outline.reduce((a, q) => [a[0] + q[0] / outline.length, a[1] + q[1] / outline.length, a[2] + q[2] / outline.length], [0, 0, 0]);
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute([...mid, ...outline.flat()], 3));
        g.setIndex(outline.flatMap((_, i) => [0, 1 + i, 1 + ((i + 1) % outline.length)])); // (a fan from the middle)
        const fill = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false }));
        const eg = new THREE.BufferGeometry();
        eg.setAttribute("position", new THREE.Float32BufferAttribute(outline.flat(), 3)); // (the outline has no diagonal)
        const edge = new THREE.LineLoop(eg, new THREE.LineBasicMaterial({ transparent: true, depthWrite: false }));
        fill.renderOrder = 6; edge.renderOrder = 6;
        group.add(fill, edge);
        o = { fill, edge };
        shown.set(p.name, o);
      }
      const rgb = p.active ? settings.theme.paneOn : settings.theme.pane;
      colour.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
      const fill = o.fill.material as THREE.MeshBasicMaterial;
      fill.color.copy(colour);
      fill.opacity = p.hover ? Math.min(0.75, settings.world.paneActiveOpacity + 0.3) : p.active ? settings.world.paneActiveOpacity : settings.world.paneOpacity;
      const line = o.edge.material as THREE.LineBasicMaterial;
      line.color.copy(colour);
      line.opacity = p.hover || p.active ? 0.9 : 0.5;
    }
  };
}
