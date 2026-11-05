// The faint grid on the plane you look straight at (`in_066`): the lines come from the interaction layer; this puts them in the scene.
import * as THREE from "three";
import { settings } from "../../interaction/api.ts";
import type { Grid } from "../../interaction/api.ts";

export function createGrid(scene3: THREE.Scene) {
  const group = new THREE.Group();
  scene3.add(group);
  const material = (opacity: number) => new THREE.LineBasicMaterial({ color: new THREE.Color(...settings.grid.color), transparent: true, opacity, depthWrite: false });
  const minor = material(settings.grid.minorAlpha);
  const major = material(settings.grid.majorAlpha);
  const lines = (pts: number[], mat: THREE.LineBasicMaterial) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return new THREE.LineSegments(g, mat);
  };
  return (g: Grid | null) => {
    for (const o of [...group.children]) { group.remove(o); (o as THREE.LineSegments).geometry.dispose(); }
    if (g) group.add(lines(g.minor, minor), lines(g.major, major));
  };
}
