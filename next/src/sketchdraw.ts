// The sketch's lines as three.js draws them: pixel-wide, on top of the model. Done in charcoal; selected, what the tool would make and the pointer's cross in the teal; what a trim would take away in the red (`interaction/style.ts` has the colours).
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { DrawLine } from "./sketchcontrol.ts";
import { settings } from "./settings.ts";
import { COLOUR } from "./interaction/style.ts";

export function drawLines(group: THREE.Group, lines: DrawLine[], w: number, h: number): void {
  const c = (v: readonly number[]) => new THREE.Color().setRGB(v[0]!, v[1]!, v[2]!, THREE.SRGBColorSpace);
  for (const l of lines) {
    const g = new LineGeometry(); g.setPositions(l.pts.flat());
    const colour = l.kind === "done" ? c(settings.theme.axis).getHex() : l.kind === "cut" ? new THREE.Color(COLOUR.refused).getHex() : c(settings.orb.color).getHex();
    const m = new LineMaterial({ color: colour, linewidth: settings.sketch.widthPx * (l.kind === "cursor" ? 0.8 : l.kind === "selected" || l.kind === "cut" ? 1.4 : 1), transparent: l.kind === "preview" || l.kind === "cursor", opacity: l.kind === "preview" ? 0.8 : 1, depthTest: false });
    m.resolution.set(w, h);
    const line = new Line2(g, m); line.renderOrder = 11; group.add(line);
  }
}
