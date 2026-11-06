// What the scene looks like: drawn lines, corners and circles in ink, translucent faces, and the body (a grey physical material with a thin outline where faces meet at a sharp angle).
import * as THREE from "three";
import type { Scene, Ref } from "../../interaction/api.ts";
import { outlineOf, lookup, settings, consumed } from "../../interaction/api.ts";
import { surfaceTriangles } from "../../interaction/surfaces.ts";
import type { Pen } from "./pen.ts";
import { clearGroup, trisMesh, ringOf, rgb } from "./pen.ts";

export interface BodyMesh { vertices: Float32Array; normals: Float32Array; triangles: Uint32Array }

/** Every straight line and circle of the scene, whatever its origin, as flat pairs of points: the one list that all the lines are drawn from. */
function linePairs(s: Scene, skip: Set<Ref>): number[] {
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
export function buildContent(content: THREE.Group, s: Scene, mesh: BodyMesh | null, pen: Pen, envMap: THREE.Texture) {
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
      // a pane: the same grey and the same shine as the body (clear-coat and the reflected room), but see-through
      const m = trisMesh(tris, new THREE.MeshPhysicalMaterial({ color: rgb(settings.theme.sheet), emissive: rgb(settings.theme.sheet), emissiveIntensity: 0.55, transparent: true, opacity: 0.25, roughness: settings.light.roughness, metalness: 0, envMap, envMapIntensity: settings.light.reflect, clearcoat: settings.light.sheen, clearcoatRoughness: settings.light.sheenRoughness, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
      m.geometry.computeVertexNormals();
      content.add(m);
    }
  }
  if (!mesh) return;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(mesh.vertices, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3));
  g.setIndex(new THREE.BufferAttribute(mesh.triangles, 1));
  content.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, settings.extrude.edgeAngleDeg), edge)); // where faces meet at more than 30 degrees
  content.add(new THREE.Mesh(g, new THREE.MeshPhysicalMaterial({ color: settings.theme.bodyColor, roughness: settings.light.roughness, metalness: 0, clearcoat: settings.light.sheen, clearcoatRoughness: settings.light.sheenRoughness, envMap, envMapIntensity: settings.light.reflect, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })));
}
