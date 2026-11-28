// What is laid over the bodies and the plane: the faint tint of closed sketches, the marks on bodies (faces and edges picked or pointed at), and the ghost of a pull. Each is made again only when what it is made of changes.
import * as THREE from "three";
import type { Line2 } from "three/examples/jsm/lines/Line2.js";
import type { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { Mark } from "./bodyselect.ts";
import { forwardDepth, type Cam } from "./camera.ts";
import { equal } from "./equal.ts";
import { surfaceOf } from "./looks.ts";
import { makeOrbs, orbMaterial, selectedRgb, setOrbs } from "./orbfill.ts";
import { settings } from "./settings.ts";
import { strokeOf } from "./sketchdraw.ts";
import type { BodyMesh } from "./studio.ts";
import { vec } from "./threeutil.ts";
import type { V3 } from "./vec.ts";

export interface Overlays {
  /** What is picked or pointed at on the bodies: laid over them in the Marked look (teal). */
  marks?: Mark[];
  /** where the orb is on a face: the disc under the pointer, and the click a picked face's teal spreads from (and when, ms) */
  faceOrb?: { hover: V3 | null; spread: { point: V3; since: number } | null };
  /** The closed parts of the drawings, tinted very faintly: each an outline and its holes in the plane's axes. */
  fills?: { frame: { origin: V3; u: V3; v: V3 }; loops: [number, number][][] }[];
  /** What a pull would make, shown before the engine has made it: an outline (and holes) pulled `d` along the plane's normal, or a face moved along its normal. */
  ghost?:
    | { frame: { origin: V3; u: V3; v: V3; n: V3 }; loops: [number, number][][]; d: number }
    | { faceMove: { positions: Float32Array; n: V3; d: number } }
    | null;
}

export function createOverlays(scene: THREE.Scene, solids: () => readonly BodyMesh[]) {
  const orbs = makeOrbs();
  // the tint of closed sketches
  const fillGroup = new THREE.Group();
  scene.add(fillGroup);
  let lastFills: unknown = null;
  const setFills = (fills: Overlays["fills"]) => {
    if (equal(fills ?? [], lastFills)) return;
    lastFills = fills ?? [];
    fillGroup.traverse((o) => {
      (o as THREE.Mesh).geometry?.dispose();
    });
    fillGroup.clear();
    for (const f of fills ?? []) {
      if (!f.loops.length) continue;
      const shape = new THREE.Shape(f.loops[0]!.map((p) => new THREE.Vector2(p[0], p[1])));
      for (const h of f.loops.slice(1)) shape.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p[0], p[1]))));
      const m = new THREE.Mesh(
        new THREE.ShapeGeometry(shape),
        new THREE.MeshBasicMaterial({
          color: settings.looks.marks.pick.color,
          transparent: true,
          opacity: settings.looks.fillOpacity,
          depthWrite: false,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -3,
          polygonOffsetUnits: -3,
        }),
      );
      m.matrixAutoUpdate = false;
      m.matrix
        .makeBasis(vec(f.frame.u), vec(f.frame.v), vec(f.frame.u).cross(vec(f.frame.v)))
        .setPosition(vec(f.frame.origin));
      m.matrixWorldNeedsUpdate = true;
      m.renderOrder = 1;
      fillGroup.add(m);
    }
  }; // the marks: faces and edges of the bodies, in the Marked look (teal); made again when they change
  const markGroup = new THREE.Group();
  scene.add(markGroup);
  let lastMarks: unknown = null,
    lastSolids: readonly BodyMesh[] | null = null; // (the bodies are replaced as a whole, so the list itself says if they changed)
  const markLines: LineMaterial[] = [];
  const setMarks = (marks: Mark[] | undefined, w: number, h: number) => {
    for (const m of markLines) m.resolution.set(w, h);
    if (equal(marks ?? [], lastMarks) && solids() === lastSolids) return;
    lastMarks = marks ?? [];
    lastSolids = solids();
    markGroup.traverse((o) => {
      (o as THREE.Mesh).geometry?.dispose();
    });
    markGroup.clear();
    markLines.length = 0;
    const teal = new THREE.Color(settings.looks.marks.pick.color);
    for (const mk of marks ?? []) {
      const b = solids().find((x) => x.id === mk.body);
      if (!b) continue;
      const strong = mk.strength === "pick" || mk.strength === "tie",
        colour = mk.strength === "tie" ? new THREE.Color(settings.looks.marks.tie.color) : teal; // (a tie: the face a pull is flush with, as the sketch's ties are orange)
      for (const f of mk.faces) {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(b.positions, 3));
        g.setIndex(new THREE.BufferAttribute(b.indices.slice(f.start, f.start + f.count), 1));
        // a face picked or pointed at is lit as in the old app (the orb: a disc under the pointer, the teal spreading from a click); a tied face is washed amber
        const orb = mk.strength === "pick" ? orbs.select : mk.strength === "hover" ? orbs.hover : null,
          m = new THREE.Mesh(
            g,
            orb
              ? orbMaterial(settings.orb.color, selectedRgb(), orb)
              : new THREE.MeshBasicMaterial({
                  color: colour,
                  transparent: true,
                  opacity: 0.5,
                  depthWrite: false,
                  side: THREE.DoubleSide,
                  polygonOffset: true,
                  polygonOffsetFactor: -2,
                  polygonOffsetUnits: -2,
                }),
          );
        m.renderOrder = 3;
        if (mk.strength === "pick") {
          // the farthest a spread from a click has to go: found from the face's own points when the spread is drawn
          const ps: number[] = [];
          for (let k = f.start; k < f.start + f.count; k++)
            ps.push(
              b.positions[3 * b.indices[k]!]!,
              b.positions[3 * b.indices[k]! + 1]!,
              b.positions[3 * b.indices[k]! + 2]!,
            );
          m.userData.points = ps;
        }
        markGroup.add(m);
      }
      for (const e of mk.edges) {
        // a body's edge marked is a line of a drawing marked: bold teal picked, thin teal pointed at, bold amber tied (`dec_body_look_and_feel`)
        const pts: V3[] = [];
        for (let i = e.start; i < e.start + e.count; i++)
          pts.push([b.lines[3 * i]!, b.lines[3 * i + 1]!, b.lines[3 * i + 2]!]);
        const line = strokeOf({ kind: mk.strength === "tie" ? "tie" : strong ? "selected" : "lit", pts }, w, h);
        markGroup.add(line);
        markLines.push((line as Line2).material as LineMaterial);
      }
    }
  }; // the ghost of a pull: made again only when what it is made of changes
  let ghost: THREE.Group | null = null,
    lastGhost: unknown = undefined;
  const setGhost = (g: Overlays["ghost"]) => {
    if (equal(g ?? null, lastGhost)) return;
    lastGhost = g ?? null;
    if (ghost) {
      scene.remove(ghost);
      ghost.traverse((o) => {
        (o as THREE.Mesh).geometry?.dispose();
      });
      ghost = null;
    }
    if (g && "faceMove" in g) {
      if (Math.abs(g.faceMove.d) < 1e-9) return; // (not pulled yet: it would only lie on the face)
      // a face of a body pushed or pulled: the face itself, moved along its normal
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(g.faceMove.positions, 3));
      const sf = surfaceOf({ base: "seeThrough", mark: "pick" }),
        mesh = new THREE.Mesh(
          geo,
          new THREE.MeshBasicMaterial({
            color: sf.color,
            transparent: true,
            opacity: 0.55,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
        );
      ghost = new THREE.Group();
      ghost.add(
        mesh,
        new THREE.LineSegments(
          new THREE.WireframeGeometry(geo),
          new THREE.LineBasicMaterial({ color: sf.color, transparent: true, opacity: 0.35 }),
        ),
      );
      ghost.position.copy(vec(g.faceMove.n).multiplyScalar(g.faceMove.d));
      ghost.renderOrder = 5;
      scene.add(ghost);
      return;
    }
    if (!g || !g.loops.length || Math.abs(g.d) < 1e-9) return;
    const shape = new THREE.Shape(g.loops[0]!.map((p) => new THREE.Vector2(p[0], p[1])));
    for (const h of g.loops.slice(1)) shape.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p[0], p[1]))));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: Math.abs(g.d), bevelEnabled: false, curveSegments: 1 }),
      sf = surfaceOf({ base: "seeThrough", mark: "pick" });
    const mat = new THREE.MeshBasicMaterial({
      color: sf.color,
      transparent: true,
      opacity: Math.max(sf.opacity, 0.25),
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat),
      edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo, 30),
        new THREE.LineBasicMaterial({ color: sf.color, transparent: true, opacity: 0.9 }),
      );
    ghost = new THREE.Group();
    ghost.add(mesh, edges);
    const f = g.frame;
    ghost.matrix.makeBasis(vec(f.u), vec(f.v), vec(f.n)).setPosition(vec(f.origin));
    ghost.matrixAutoUpdate = false;
    ghost.matrixWorldNeedsUpdate = true;
    mesh.scale.z = Math.sign(g.d);
    edges.scale.z = Math.sign(g.d); // (pulled the other way: the same prism on the other side)
    ghost.renderOrder = 5;
    scene.add(ghost);
  };
  return {
    update(d: Overlays & { cam: Cam }, w: number, h: number) {
      setGhost(d.ghost);
      setMarks(d.marks, w, h);
      setFills(d.fills);
      // the orb of a face: the disc follows the pointer; a pick's teal spreads from the click over `fillMs`, then the face keeps its tint
      const hover = d.faceOrb?.hover
          ? {
              point: d.faceOrb.hover,
              radius: settings.orb.radius * Math.max(forwardDepth(d.cam, d.faceOrb.hover), 1e-3),
            }
          : null,
        k = d.faceOrb?.spread ? Math.min(1, (performance.now() - d.faceOrb.spread.since) / settings.orb.fillMs) : 1;
      let spread: { point: V3; k: number; reach: number } | null = null;
      if (d.faceOrb?.spread && k < 1) {
        let reach = 0;
        for (const m of markGroup.children) {
          const ps = m.userData.points as number[] | undefined;
          for (let i = 0; ps && i < ps.length; i += 3)
            reach = Math.max(
              reach,
              Math.hypot(
                ps[i]! - d.faceOrb.spread.point[0],
                ps[i + 1]! - d.faceOrb.spread.point[1],
                ps[i + 2]! - d.faceOrb.spread.point[2],
              ),
            );
        }
        spread = { point: d.faceOrb.spread.point, k, reach };
      }
      setOrbs(orbs, hover, spread);
    },
  };
}
