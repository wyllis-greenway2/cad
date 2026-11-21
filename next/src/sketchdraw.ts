// The sketch's lines as three.js draws them: pixel-wide, on top of the model. Figures done in charcoal, what the tool would make and the pointer's cross in the teal.
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { DrawLine } from "./sketchcontrol.ts";
import { settings } from "./settings.ts";

export function drawLines(group: THREE.Group, lines: DrawLine[], w: number, h: number): void {
  const c = (v: readonly number[]) => new THREE.Color().setRGB(v[0]!, v[1]!, v[2]!, THREE.SRGBColorSpace);
  for (const l of lines) {
    const g = new LineGeometry(); g.setPositions(l.pts.flat());
    const m = new LineMaterial({ color: (l.kind === "done" ? c(settings.theme.axis) : c(settings.orb.color)).getHex(), linewidth: settings.sketch.widthPx * (l.kind === "cursor" ? 0.8 : 1), transparent: l.kind !== "done", opacity: l.kind === "preview" ? 0.8 : 1, depthTest: false });
    m.resolution.set(w, h);
    const line = new Line2(g, m); line.renderOrder = 11; group.add(line);
  }
}
