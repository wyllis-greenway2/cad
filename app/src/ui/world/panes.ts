// The little panes of the world planes (`in_190`): semi-transparent squares beside the axes, the plane that is on lit blue, the one under the pointer lighter. The geometry comes from the interaction layer.
import * as THREE from "three";
import { settings } from "../../interaction/api.ts";
import type { Vec3 } from "../../interaction/api.ts";

export interface PaneView { name: string; corners: Vec3[]; active: boolean; hover: boolean }

export function createPanes(scene3: THREE.Scene) {
  const group = new THREE.Group();
  scene3.add(group);
  const shown = new Map<string, { fill: THREE.Mesh; edge: THREE.LineLoop }>();
  const colour = new THREE.Color();
  return (panes: PaneView[]) => {
    for (const p of panes) {
      let o = shown.get(p.name);
      if (!o) {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(p.corners.flat(), 3));
        g.setIndex([0, 1, 2, 0, 2, 3]);
        const fill = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false }));
        const eg = new THREE.BufferGeometry();
        eg.setAttribute("position", new THREE.Float32BufferAttribute(p.corners.flat(), 3)); // (the outline has no diagonal)
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
