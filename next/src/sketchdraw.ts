// The sketch's lines as three.js draws them: pixel-wide, on top of the model. What each is doing says its colour and weight (`interaction/style.ts` `STROKE`: done in charcoal, selected, what the tool would make and the pointer's cross in teal, what a trim would take in red).
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { DrawLine } from "./sketchcontrol.ts";
import { settings } from "./settings.ts";
import { COLOUR, STROKE } from "./interaction/style.ts";

export function drawLines(group: THREE.Group, lines: DrawLine[], w: number, h: number): void {
  for (const l of lines) {
    const g = new LineGeometry(); g.setPositions(l.pts.flat());
    const st = STROKE[l.kind], m = new LineMaterial({ color: new THREE.Color(COLOUR[st.tone]).getHex(), linewidth: settings.sketch.widthPx * st.weight, transparent: st.soft, opacity: st.soft ? 0.8 : 1, depthTest: false, ...(st.dashed ? { dashed: true, dashSize: 5, gapSize: 4, dashScale: 1 } : {}) });
    m.resolution.set(w, h);
    const line = new Line2(g, m); if (st.dashed) line.computeLineDistances(); line.renderOrder = 11; group.add(line);
  }
}
