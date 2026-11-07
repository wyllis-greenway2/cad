// The faint grid on the plane you look straight at (`in_066`): the lines come from the interaction layer; this puts them in the scene.
import * as THREE from "three";
import { settings } from "../../interaction/api.ts";
import type { Grid } from "../../interaction/api.ts";

export function createGrid(scene3: THREE.Scene) {
  const group = new THREE.Group();
  scene3.add(group);
  const material = (opacity: number) => new THREE.LineBasicMaterial({ color: new THREE.Color(...settings.grid.color), transparent: true, opacity, depthWrite: false, vertexColors: true });
  const minor = material(settings.grid.minorAlpha);
  const major = material(settings.grid.majorAlpha);
  // a patch seen from the side fades out towards its edge: full to the middle of the way, then smoothly to nothing (`in_193`)
  const fadeOf = (p: [number, number, number], f: Grid["fade"]): number => {
    if (!f) return 1;
    const t = Math.min(1, Math.hypot(p[0] - f.center[0], p[1] - f.center[1], p[2] - f.center[2]) / f.radius);
    const k = Math.max(0, Math.min(1, (1 - t) / 0.55)); // (1 inside 45% of the way out, 0 at the edge)
    return k * k * (3 - 2 * k);
  };
  const lines = (pts: number[], mat: THREE.LineBasicMaterial, fade: Grid["fade"]) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const [r, gr, b] = settings.grid.color;
    const colours: number[] = [];
    for (let i = 0; i < pts.length; i += 3) colours.push(r, gr, b, fadeOf([pts[i]!, pts[i + 1]!, pts[i + 2]!], fade));
    g.setAttribute("color", new THREE.Float32BufferAttribute(colours, 4));
    return new THREE.LineSegments(g, mat);
  };
  return (g: Grid | null) => {
    for (const o of [...group.children]) { group.remove(o); (o as THREE.LineSegments).geometry.dispose(); }
    if (g) group.add(lines(g.minor, minor, g.fade), lines(g.major, major, g.fade));
  };
}
