// The sketch's lines as three.js draws them: pixel-wide, on top of the model. What each is doing says its colour and weight (`interaction/style.ts` `STROKE`: done in charcoal, selected, what the tool would make and the pointer's cross in teal, what a trim would take in red).
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
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

export function drawLines(group: THREE.Group, lines: DrawLine[], w: number, h: number): void {
  for (const l of lines) {
    if (l.kind === "ball" || l.kind === "tieBall" || l.kind === "centre") {
      // a picked point: a teal ball of the old app's size, on top of the model
      const m = new THREE.SpriteMaterial({
          map: ball(),
          color: new THREE.Color(COLOUR[STROKE[l.kind].tone]).getHex(),
          depthTest: false,
        }),
        sp = new THREE.Sprite(m),
        p = l.pts[0]!;
      sp.position.set(p[0], p[1], p[2]);
      sp.scale.setScalar(2 * (l.r ?? 1));
      sp.renderOrder = 12;
      group.add(sp);
      continue;
    }
    const g = new LineGeometry();
    g.setPositions(l.pts.flat());
    const st = STROKE[l.kind],
      m = new LineMaterial({
        color: new THREE.Color(COLOUR[st.tone]).getHex(),
        linewidth: settings.sketch.widthPx * st.weight,
        transparent: st.soft,
        opacity: l.pale ? 0.4 : st.soft ? 0.8 : 1,
        depthTest: false,
        ...(st.dashed && !l.head
          ? { dashed: true, dashSize: l.dash ?? 5, gapSize: (l.dash ?? 5) * settings.helpers.dashGap, dashScale: 1 }
          : {}),
      });
    m.resolution.set(w, h);
    const line = new Line2(g, m);
    if (st.dashed && !l.head) line.computeLineDistances();
    line.renderOrder = 11;
    group.add(line);
  }
}
