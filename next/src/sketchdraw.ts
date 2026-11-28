// The sketch's lines as three.js draws them: pixel-wide, on top of the model. What each is doing says its colour and weight (`interaction/style.ts` `STROKE`: done in charcoal, selected, what the tool would make and the pointer's cross in teal, what a trim would take in red).
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { COLOUR, STROKE } from "./interaction/style.ts";
import { settings } from "./settings.ts";
import type { DrawLine } from "./sketchcontrol.ts";

let ballTexture: THREE.Texture | null = null;
const ball = (): THREE.Texture => {
  if (ballTexture) return ballTexture;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.beginPath();
  g.arc(32, 32, 30, 0, 2 * Math.PI);
  g.fill();
  return (ballTexture = new THREE.CanvasTexture(c));
};

/** One stroke of a drawing as three.js draws it: a pixel-wide line or a dot. The same strokes draw a sketch and the edges of a body (`dec_body_look_and_feel`). */
export function strokeOf(l: DrawLine, w: number, h: number): THREE.Object3D {
  if (l.kind === "dot") {
    // a picked point: a ball, on top of the model
    const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: ball(),
          color: new THREE.Color(COLOUR[l.tone ?? STROKE[l.kind].tone]).getHex(),
          depthTest: false,
        }),
      ),
      p = l.pts[0]!;
    sp.position.set(p[0], p[1], p[2]);
    sp.scale.setScalar(2 * (l.r ?? 1));
    sp.renderOrder = 12;
    return sp;
  }
  const g = l.pairs ? new LineSegmentsGeometry() : new LineGeometry(),
    st = STROKE[l.kind],
    dashed = st.dashed && !l.head,
    m = new LineMaterial({
      color: new THREE.Color(COLOUR[st.tone]).getHex(),
      linewidth: settings.sketch.widthPx * st.weight,
      transparent: st.soft,
      opacity: l.pale ? 0.4 : st.soft ? 0.8 : 1,
      depthTest: !!l.hidden,
      ...(l.hidden
        ? {
            polygonOffset: true,
            polygonOffsetFactor: l.kind === "done" ? -2 : -4,
            polygonOffsetUnits: l.kind === "done" ? -2 : -4,
          }
        : {}), // (a line on a surface wins over the surface and over a thinner line under it, as the old app's did)
      ...(dashed
        ? { dashed: true, dashSize: l.dash ?? 5, gapSize: (l.dash ?? 5) * settings.helpers.dashGap, dashScale: 1 }
        : {}),
    });
  g.setPositions(l.pts.flat());
  m.resolution.set(w, h);
  const line = l.pairs ? new LineSegments2(g as LineSegmentsGeometry, m) : new Line2(g as LineGeometry, m);
  if (dashed) line.computeLineDistances();
  line.renderOrder = l.kind === "done" ? 11 : 12;
  return line;
}

export function drawLines(group: THREE.Group, lines: DrawLine[], w: number, h: number): void {
  for (const l of lines) group.add(strokeOf(l, w, h));
}
