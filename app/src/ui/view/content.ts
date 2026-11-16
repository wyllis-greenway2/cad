// What the scene looks like: drawn lines, corners and circles in ink, translucent faces, and the body (a grey physical material with a thin outline where faces meet at a sharp angle).
import * as THREE from "three";
import type { Scene, Ref } from "../../interaction/api.ts";
import { outlineOf, lookup, settings, consumed } from "../../interaction/api.ts";
import { surfaceTriangles } from "../../interaction/surfaces.ts";
import { linePairs } from "../../interaction/linepairs.ts";
import type { Pen } from "./pen.ts";
import { clearGroup, trisMesh, rgb } from "./pen.ts";
import { cornerEdgesOf } from "./edges.ts";
import { ownSegments } from "./split.ts";

export interface BodyMesh { vertices: Float32Array; normals: Float32Array; triangles: Uint32Array; /** the sharp edges found by the kernel (`dec_sharp_edges_once`) and the angle they were found for */ sharp?: Float32Array; sharpDeg?: number }

/**
 * One look for every line (`in_115`): drawn lines and the body's outline are the same thin charcoal line, from the same material. Corners are not dotted anywhere:
 * a corner shows as a ball when you point at it or pick it, whatever it belongs to.
 */
/** How long the last build took, and the part of it that found the body's sharp edges (`cornerEdges`): read by the page's timing (`in_494`). */
export const buildStats = { runs: 0, totalMs: 0, cornersMs: 0, triangles: 0 };
export function buildContent(content: THREE.Group, s: Scene, mesh: BodyMesh | null, pen: Pen, envMap: THREE.Texture): { material: THREE.MeshPhysicalMaterial; body: THREE.Group; /** the body's edges that lie behind a face, drawn faintly or not (`in_324`) */ ghost: (on: boolean) => void; split: (items: { tris: [number, number][]; box: { min: readonly number[]; max: readonly number[] } }[] | null) => void; mover: THREE.Group; /** the group of each body that moves on its own, in the order of the items last given to `split` */ movers: () => THREE.Group[] } | null {
  const tBuild = performance.now();
  clearGroup(content);
  pen.reset();
  const get = lookup(s);
  const used = consumed(s);
  const edge = new THREE.LineBasicMaterial({ color: settings.theme.bodyEdge });
  const pairs = linePairs(s, used);
  if (pairs.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pairs, 3));
    content.add(new THREE.LineSegments(g, edge));
  }
  // the lines marked for a laser or a cutter (`in_564`): score is blue and dashed, engrave a thicker orange line, so a mark can be seen on the drawing; cut is the usual line
  const score = linePairs(s, used, "score");
  if (score.length) {
    const xs = score.filter((_, i) => i % 3 === 0), ys = score.filter((_, i) => i % 3 === 1), zs = score.filter((_, i) => i % 3 === 2);
    const size = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), Math.max(...zs) - Math.min(...zs));
    const m = pen.segments(score, settings.theme.markScore, 2, false);
    const mat = m.material as import("three/addons/lines/LineMaterial.js").LineMaterial;
    mat.dashed = true; mat.dashSize = Math.max(size / 60, 0.3); mat.gapSize = mat.dashSize * 0.7; mat.needsUpdate = true;
    m.computeLineDistances();
    m.renderOrder = 3;
    m.raycast = () => {}; // (a mark is not something to hide an axis label behind: the label test casts rays at this group, and a thick line cannot be cast without a camera)
    content.add(m);
  }
  const engrave = linePairs(s, used, "engrave");
  if (engrave.length) { const m = pen.segments(engrave, settings.theme.markEngrave, 2.6, false); m.renderOrder = 3; m.raycast = () => {}; content.add(m); }
  for (const p of Object.values(s.parts)) {
    if (p.kind !== "face" || p.origin !== "drawn" || used.has(p.ref)) continue;
    const tris = surfaceTriangles(get, p);
    if (tris) {
      // a closed sketch has no thickness: it is not a grey surface like a body's face, only a faint see-through tint that lights up teal when the pointer is over it (`in_194`)
      const m = trisMesh(tris, new THREE.MeshBasicMaterial({ color: rgb(settings.theme.sheet), transparent: true, opacity: settings.theme.sketchFillOpacity, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
      content.add(m);
    }
  }
  if (!mesh) return null;
  const body = new THREE.Group(); // (the body on its own, so a matrix can move it on the graphics card, `in_216`)
  body.matrixAutoUpdate = false;
  content.add(body);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(mesh.vertices, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3));
  g.setIndex(new THREE.BufferAttribute(mesh.triangles, 1));
  const tCorners = performance.now();
  const corners = cornerEdgesOf(mesh, settings.extrude.edgeAngleDeg).edges;
  buildStats.cornersMs = performance.now() - tCorners;
  buildStats.triangles = mesh.triangles.length / 3; // where the surface turns by more than 30 degrees
  let edgePos: THREE.BufferAttribute | null = null;
  let edgeLines: THREE.LineSegments | null = null;
  let ghostLines: THREE.LineSegments | null = null;
  const edgeOrig = Float32Array.from(corners);
  if (corners.length) {
    const eg = new THREE.BufferGeometry();
    edgePos = new THREE.Float32BufferAttribute(Float32Array.from(corners), 3);
    eg.setAttribute("position", edgePos);
    edgeLines = new THREE.LineSegments(eg, edge);
    edgeLines.visible = settings.theme.outlines;
    body.add(edgeLines);
    // the same edges again, only where a face of the body is in front of them, faint: while a sketch is drawn they show where the edges are that cannot be pointed at (`in_324`)
    ghostLines = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: settings.theme.bodyEdge, transparent: true, opacity: settings.theme.hiddenEdgeOpacity, depthFunc: THREE.GreaterDepth, depthWrite: false }));
    ghostLines.visible = false;
    body.add(ghostLines);
  }
  const material = new THREE.MeshPhysicalMaterial({ color: settings.theme.bodyColor, roughness: settings.light.roughness, metalness: 0, clearcoat: settings.light.sheen, clearcoatRoughness: settings.light.sheenRoughness, envMap, envMapIntensity: settings.light.reflect, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  body.add(new THREE.Mesh(g, material));
  const mover = new THREE.Group(); // (one body of several, being dragged: its triangles and outline in a group of its own, so a matrix can move it alone, `in_273`)
  mover.matrixAutoUpdate = false;
  content.add(mover);
  const orig = mesh.vertices;
  // Split the mesh: each item is one body that moves on its own (`in_273`, `in_341`): its triangles (ranges of the index list) and the outline segments inside `box` go to a group of its own under `mover`, so a matrix can move each; the rest stay
  // in `body`; null puts everything back.
  let splitSig = "";
  const fullIndex = mesh.triangles;
  const kids: THREE.Group[] = [];
  const split = (items: { tris: [number, number][]; box: { min: readonly number[]; max: readonly number[] } }[] | null) => {
    const sig = items && items.length ? JSON.stringify(items) : "";
    if (sig === splitSig) return;
    splitSig = sig;
    clearGroup(mover);
    kids.length = 0;
    if (edgeLines && edgePos) edgeLines.geometry.setAttribute("position", edgePos);
    if (!items || !items.length) { g.setIndex(new THREE.BufferAttribute(fullIndex, 1)); return; }
    const owner = new Int16Array(Math.ceil(fullIndex.length / 3)).fill(-1);
    items.forEach((it, k) => { for (const [start, count] of it.tris) for (let t = Math.floor(start / 3); t < Math.ceil((start + count) / 3); t++) owner[t] = k; });
    const rest: number[] = [];
    const mine: number[][] = items.map(() => []);
    for (let t = 0; t < owner.length; t++) (owner[t]! >= 0 ? mine[owner[t]!]! : rest).push(fullIndex[3 * t]!, fullIndex[3 * t + 1]!, fullIndex[3 * t + 2]!);
    g.setIndex(new THREE.BufferAttribute(Uint32Array.from(rest), 1));
    let remaining: number[] | Float32Array = edgeOrig;
    items.forEach((_, k) => {
      const kid = new THREE.Group();
      kid.matrixAutoUpdate = false;
      mover.add(kid);
      kids.push(kid);
      const gm = new THREE.BufferGeometry();
      gm.setAttribute("position", g.getAttribute("position")!);
      gm.setAttribute("normal", g.getAttribute("normal")!);
      gm.setIndex(new THREE.BufferAttribute(Uint32Array.from(mine[k]!), 1));
      kid.add(new THREE.Mesh(gm, material));
      if (edgeLines && edgePos) {
        const others = [...rest, ...mine.flatMap((m, q) => (q === k ? [] : m))];
        const { go, stay } = ownSegments(remaining, orig, mine[k]!, others);
        remaining = stay;
        const eg2 = new THREE.BufferGeometry();
        eg2.setAttribute("position", new THREE.Float32BufferAttribute(Float32Array.from(go), 3));
        kid.add(new THREE.LineSegments(eg2, edge));
      }
    });
    if (edgeLines && edgePos) edgeLines.geometry.setAttribute("position", new THREE.Float32BufferAttribute(Float32Array.from(remaining), 3));
  };
  buildStats.runs++; buildStats.totalMs = performance.now() - tBuild;
  return { material, body, split, mover, movers: () => kids, ghost: (on: boolean) => { if (ghostLines) ghostLines.visible = on; } };
}
