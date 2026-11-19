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
export function buildContent(content: THREE.Group, s: Scene, mesh: BodyMesh | null, pen: Pen, envMap: THREE.Texture): { material: THREE.MeshPhysicalMaterial; body: THREE.Group; /** the body's edges that lie behind a face, drawn faintly or not (`in_324`) */ ghost: (on: boolean) => void; /** the edges on the far side of the plane being sketched on drawn faintly, those on it and in front in full (`in_1045`); null puts them back */ behind: (plane: { n: readonly [number, number, number]; at: readonly [number, number, number] } | null) => void; split: (items: { tris: [number, number][]; box: { min: readonly number[]; max: readonly number[] } }[] | null) => void; mover: THREE.Group; /** the group of each body that moves on its own, in the order of the items last given to `split` */ movers: () => THREE.Group[]; /** the bodies that are hidden (`dec_hidden_bodies`): their triangles and outline lines are drawn very faintly in a group of their own and are left out of the body; null or none brings them back */ hide: (items: { tris: [number, number][] }[] | null) => void } | null {
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
  let edgePos: THREE.BufferAttribute | null = null; // (the outline of what is drawn in full: all of it, less the hidden bodies')
  let edgeLines: THREE.LineSegments | null = null;
  let ghostLines: THREE.LineSegments | null = null;
  let farLines: THREE.LineSegments | null = null;
  const edgeNear = new THREE.LineBasicMaterial({ color: settings.theme.bodyEdge }); // (its own, so the plane being sketched on can clip it)
  const edgeFar = new THREE.LineBasicMaterial({ color: settings.theme.bodyEdge, transparent: true, opacity: settings.theme.behindEdgeOpacity, depthWrite: false });
  const edgeOrig = Float32Array.from(corners);
  if (corners.length) {
    const eg = new THREE.BufferGeometry();
    edgePos = new THREE.Float32BufferAttribute(Float32Array.from(corners), 3);
    eg.setAttribute("position", edgePos);
    edgeLines = new THREE.LineSegments(eg, edgeNear);
    edgeLines.visible = settings.theme.outlines;
    body.add(edgeLines);
    // the same edges again, only where a face of the body is in front of them, faint: while a sketch is drawn they show where the edges are that cannot be pointed at (`in_324`)
    ghostLines = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: settings.theme.bodyEdge, transparent: true, opacity: settings.theme.hiddenEdgeOpacity, depthFunc: THREE.GreaterDepth, depthWrite: false }));
    ghostLines.visible = false;
    body.add(ghostLines);
    farLines = new THREE.LineSegments(eg, edgeFar);
    farLines.visible = false;
    body.add(farLines);
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
  let visibleIndex = fullIndex; // (the triangles drawn in full: all, less the hidden bodies')
  let hiddenTri: Uint8Array | null = null; // (a flag for each triangle of `fullIndex` that is a hidden body's)
  let edgeBase: Float32Array = edgeOrig; // (the outline lines of what is drawn in full)
  const faint = new THREE.Group();
  content.add(faint);
  let hideSig = "";
  const hide = (items: { tris: [number, number][] }[] | null) => {
    const sig = items && items.length ? JSON.stringify(items) : "";
    if (sig === hideSig) return;
    hideSig = sig;
    clearGroup(faint);
    if (!sig) { visibleIndex = fullIndex; hiddenTri = null; edgeBase = edgeOrig; }
    else {
      const flags = new Uint8Array(Math.ceil(fullIndex.length / 3));
      for (const it of items!) for (const [start, count] of it.tris) for (let t = Math.floor(start / 3); t < Math.ceil((start + count) / 3); t++) flags[t] = 1;
      const shown: number[] = [];
      const gone: number[] = [];
      for (let t = 0; t < flags.length; t++) (flags[t] ? gone : shown).push(fullIndex[3 * t]!, fullIndex[3 * t + 1]!, fullIndex[3 * t + 2]!);
      hiddenTri = flags;
      visibleIndex = Uint32Array.from(shown);
      const { go, stay } = ownSegments(edgeOrig, orig, gone, shown);
      edgeBase = Float32Array.from(stay);
      const gm = new THREE.BufferGeometry();
      gm.setAttribute("position", g.getAttribute("position")!);
      gm.setAttribute("normal", g.getAttribute("normal")!);
      gm.setIndex(new THREE.BufferAttribute(Uint32Array.from(gone), 1));
      const veil = new THREE.Mesh(gm, new THREE.MeshBasicMaterial({ color: settings.theme.bodyColor, transparent: true, opacity: settings.theme.hiddenBodyOpacity, depthWrite: false, side: THREE.DoubleSide }));
      veil.renderOrder = 1;
      faint.add(veil);
      const lg = new THREE.BufferGeometry();
      lg.setAttribute("position", new THREE.Float32BufferAttribute(Float32Array.from(go), 3));
      const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: settings.theme.bodyEdge, transparent: true, opacity: settings.theme.hiddenBodyOpacity * 2, depthWrite: false }));
      lines.renderOrder = 1;
      faint.add(lines);
    }
    edgePos = edgeLines ? new THREE.Float32BufferAttribute(edgeBase, 3) : null;
    if (edgeLines && edgePos) edgeLines.geometry.setAttribute("position", edgePos);
    splitSig = "\u0000"; // (the next `split` goes over the new base)
    split(null);
    splitSig = "";
  };
  const kids: THREE.Group[] = [];
  const split = (items: { tris: [number, number][]; box: { min: readonly number[]; max: readonly number[] } }[] | null) => {
    const sig = items && items.length ? JSON.stringify(items) : "";
    if (sig === splitSig) return;
    splitSig = sig;
    clearGroup(mover);
    kids.length = 0;
    if (edgeLines && edgePos) edgeLines.geometry.setAttribute("position", edgePos);
    if (!items || !items.length) { g.setIndex(new THREE.BufferAttribute(visibleIndex, 1)); return; }
    const owner = new Int16Array(Math.ceil(fullIndex.length / 3)).fill(-1);
    items.forEach((it, k) => { for (const [start, count] of it.tris) for (let t = Math.floor(start / 3); t < Math.ceil((start + count) / 3); t++) owner[t] = k; });
    const rest: number[] = [];
    const mine: number[][] = items.map(() => []);
    for (let t = 0; t < owner.length; t++) { if (hiddenTri && hiddenTri[t]) continue; (owner[t]! >= 0 ? mine[owner[t]!]! : rest).push(fullIndex[3 * t]!, fullIndex[3 * t + 1]!, fullIndex[3 * t + 2]!); }
    g.setIndex(new THREE.BufferAttribute(Uint32Array.from(rest), 1));
    let remaining: number[] | Float32Array = edgeBase;
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
  return { material, body, split, hide, mover, movers: () => kids, ghost: (on: boolean) => { if (ghostLines) ghostLines.visible = on; }, behind: (plane) => {
    if (!edgeLines) return;
    if (!plane) { edgeNear.clippingPlanes = null; edgeFar.clippingPlanes = null; if (farLines) farLines.visible = false; edgeNear.needsUpdate = true; return; }
    const [n, c] = [new THREE.Vector3(...plane.n), plane.n[0] * plane.at[0] + plane.n[1] * plane.at[1] + plane.n[2] * plane.at[2]];
    // `n` points to the camera's side: what is on the plane or toward the camera stays in full (a hair of slack), what is past it is drawn again, faint
    edgeNear.clippingPlanes = [new THREE.Plane(n.clone(), -c + 1e-3)];
    edgeFar.clippingPlanes = [new THREE.Plane(n.clone().negate(), c - 1e-3)];
    if (farLines) farLines.visible = true;
    edgeNear.needsUpdate = true; edgeFar.needsUpdate = true;
  } };
}
