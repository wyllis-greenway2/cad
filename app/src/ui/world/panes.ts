// The three helper panes at the origin (`in_064`): rounded squares floating out from the axes, brighter under the pointer.
import * as THREE from "three";
import type { Ref, Vec3 } from "../../interaction/api.ts";
import { settings } from "../../interaction/api.ts";
import { srgb } from "./parts.ts";

const PLANES: { ref: string; u: Vec3; v: Vec3 }[] = [{ ref: "w/XY", u: [1, 0, 0], v: [0, 1, 0] }, { ref: "w/XZ", u: [1, 0, 0], v: [0, 0, 1] }, { ref: "w/YZ", u: [0, 1, 0], v: [0, 0, 1] }];

function roundedSquare(size: number, radius: number): THREE.Shape {
  const r = size * radius;
  const s = size;
  const shape = new THREE.Shape();
  shape.moveTo(r, 0); shape.lineTo(s - r, 0); shape.quadraticCurveTo(s, 0, s, r); shape.lineTo(s, s - r); shape.quadraticCurveTo(s, s, s - r, s);
  shape.lineTo(r, s); shape.quadraticCurveTo(0, s, 0, s - r); shape.lineTo(0, r); shape.quadraticCurveTo(0, 0, r, 0);
  return shape;
}

export function createPanes() {
  const P = settings.panes;
  const group = new THREE.Group();
  const mats = new Map<string, { fill: THREE.MeshBasicMaterial; edge: THREE.LineBasicMaterial }>();
  const sheet = srgb(settings.theme.sheet);
  const shape = roundedSquare(P.size, P.radius);
  for (const pl of PLANES) {
    const fill = new THREE.MeshBasicMaterial({ color: sheet, side: THREE.DoubleSide, depthWrite: false, transparent: true });
    const edge = new THREE.LineBasicMaterial({ color: sheet.clone().multiplyScalar(0.8), transparent: true });
    const u = new THREE.Vector3(...pl.u);
    const v = new THREE.Vector3(...pl.v);
    const m4 = new THREE.Matrix4().makeBasis(u, v, u.clone().cross(v));
    m4.setPosition(u.clone().multiplyScalar(P.offset).add(v.clone().multiplyScalar(P.offset)));
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape, 12), fill);
    const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(shape.getPoints(12).map((p) => new THREE.Vector3(p.x, p.y, 0))), edge);
    for (const o of [mesh, outline]) { o.matrixAutoUpdate = false; o.matrix.copy(m4); group.add(o); }
    mats.set(pl.ref, { fill, edge });
  }
  return {
    group,
    /** `e`: how much of the big world is shown (0 to 1); the pane under the pointer is brighter. */
    apply(visible: boolean, hover: Ref | undefined, e: number) {
      group.visible = visible;
      for (const [ref, m] of mats) {
        const hot = hover === ref;
        m.fill.opacity = (hot ? P.hoverOpacity : P.opacity) * e;
        m.edge.opacity = (hot ? P.hoverEdgeAlpha : P.edgeAlpha) * e;
      }
    },
  };
}
