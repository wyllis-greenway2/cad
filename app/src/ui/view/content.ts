// What the scene looks like: drawn lines, corners and circles in ink, translucent faces, and the body (a grey physical material with a thin outline where faces meet at a sharp angle).
import * as THREE from "three";
import type { Scene, Ref } from "../../interaction/api.ts";
import { outlineOf, lookup, settings, consumed } from "../../interaction/api.ts";
import { surfaceTriangles } from "../../interaction/surfaces.ts";
import type { Pen } from "./pen.ts";
import { clearGroup, trisMesh, ringOf, rgb } from "./pen.ts";
import { cornerEdges } from "./edges.ts";
import { ownSegments } from "./split.ts";

export interface BodyMesh { vertices: Float32Array; normals: Float32Array; triangles: Uint32Array }

/** Every straight line and circle of the scene, whatever its origin, as flat pairs of points: the one list that all the lines are drawn from. */
function linePairs(s: Scene, skip: ReadonlySet<Ref>): number[] {
  const get = lookup(s);
  const out: number[] = [];
  for (const p of Object.values(s.parts)) {
    if (skip.has(p.ref) || p.origin === "world" || p.origin === "body") continue; // the world is drawn by ui/world.ts; the body's lines come from its mesh
    const o = outlineOf(get, p);
    if (o.shape === "segment") out.push(...o.a, ...o.b);
    else if (o.shape === "polyline") for (let i = 0; i + 1 < o.pts.length; i++) out.push(...o.pts[i]!, ...o.pts[i + 1]!); // a drawn arc: the same black line as the others
    else if (o.shape === "circle") {
      const ring = ringOf(o.center, o.radius, o.normal);
      for (let i = 0; i + 5 < ring.length; i += 3) out.push(ring[i]!, ring[i + 1]!, ring[i + 2]!, ring[i + 3]!, ring[i + 4]!, ring[i + 5]!);
    }
  }
  return out;
}

/**
 * One look for every line (`in_115`): drawn lines and the body's outline are the same thin charcoal line, from the same material. Corners are not dotted anywhere:
 * a corner shows as a ball when you point at it or pick it, whatever it belongs to.
 */
export function buildContent(content: THREE.Group, s: Scene, mesh: BodyMesh | null, pen: Pen, envMap: THREE.Texture): { material: THREE.MeshPhysicalMaterial; body: THREE.Group; split: (tris: [number, number][] | null, box: { min: readonly number[]; max: readonly number[] } | null) => void; mover: THREE.Group } | null {
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
  const corners = cornerEdges(mesh.vertices, mesh.normals, mesh.triangles, settings.extrude.edgeAngleDeg); // where the surface turns by more than 30 degrees
  let edgePos: THREE.BufferAttribute | null = null;
  let edgeLines: THREE.LineSegments | null = null;
  const edgeOrig = Float32Array.from(corners);
  if (corners.length) {
    const eg = new THREE.BufferGeometry();
    edgePos = new THREE.Float32BufferAttribute(Float32Array.from(corners), 3);
    eg.setAttribute("position", edgePos);
    edgeLines = new THREE.LineSegments(eg, edge);
    body.add(edgeLines);
  }
  const material = new THREE.MeshPhysicalMaterial({ color: settings.theme.bodyColor, roughness: settings.light.roughness, metalness: 0, clearcoat: settings.light.sheen, clearcoatRoughness: settings.light.sheenRoughness, envMap, envMapIntensity: settings.light.reflect, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  body.add(new THREE.Mesh(g, material));
  const mover = new THREE.Group(); // (one body of several, being dragged: its triangles and outline in a group of its own, so a matrix can move it alone, `in_273`)
  mover.matrixAutoUpdate = false;
  content.add(mover);
  const orig = mesh.vertices;
  // Split the mesh: the triangles in `tris` (ranges of the index list) and the outline segments inside `box` go to `mover`, the rest stay in `body`; null puts everything back.
  let splitSig = "";
  const fullIndex = mesh.triangles;
  const split = (tris: [number, number][] | null, box: { min: readonly number[]; max: readonly number[] } | null) => {
    const sig = tris && box ? JSON.stringify([tris, box]) : "";
    if (sig === splitSig) return;
    splitSig = sig;
    clearGroup(mover);
    if (edgeLines && edgePos) edgeLines.geometry.setAttribute("position", edgePos);
    if (!tris || !box) { g.setIndex(new THREE.BufferAttribute(fullIndex, 1)); return; }
    const moving = new Uint8Array(Math.ceil(fullIndex.length / 3));
    for (const [start, count] of tris) for (let t = Math.floor(start / 3); t < Math.ceil((start + count) / 3); t++) moving[t] = 1;
    const rest: number[] = [];
    const mine: number[] = [];
    for (let t = 0; t < moving.length; t++) (moving[t] ? mine : rest).push(fullIndex[3 * t]!, fullIndex[3 * t + 1]!, fullIndex[3 * t + 2]!);
    g.setIndex(new THREE.BufferAttribute(Uint32Array.from(rest), 1));
    const gm = new THREE.BufferGeometry();
    gm.setAttribute("position", g.getAttribute("position")!);
    gm.setAttribute("normal", g.getAttribute("normal")!);
    gm.setIndex(new THREE.BufferAttribute(Uint32Array.from(mine), 1));
    mover.add(new THREE.Mesh(gm, material));
    if (edgeLines && edgePos) {
      const { go, stay } = ownSegments(edgeOrig, orig, mine, rest);
      edgeLines.geometry.setAttribute("position", new THREE.Float32BufferAttribute(Float32Array.from(stay), 3));
      const eg2 = new THREE.BufferGeometry();
      eg2.setAttribute("position", new THREE.Float32BufferAttribute(Float32Array.from(go), 3));
      mover.add(new THREE.LineSegments(eg2, edge));
    }
  };
  return { material, body, split, mover };
}
