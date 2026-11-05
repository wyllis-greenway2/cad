// What the scene looks like: drawn lines, corners and circles in ink, translucent faces, and the body (a grey physical material with a thin outline where faces meet at a sharp angle).
import * as THREE from "three";
import type { Scene, Part } from "../../interaction/api.ts";
import { outlineOf, lookup, settings, consumed } from "../../interaction/api.ts";
import { surfaceTriangles } from "../../interaction/surfaces.ts";
import type { Pen } from "./pen.ts";
import { clearGroup, dot, trisMesh, ringOf, rgb } from "./pen.ts";

export interface BodyMesh { vertices: Float32Array; normals: Float32Array; triangles: Uint32Array }

export function buildContent(content: THREE.Group, s: Scene, mesh: BodyMesh | null, pen: Pen, envMap: THREE.Texture) {
  clearGroup(content);
  pen.reset();
  const get = lookup(s);
  const used = consumed(s);
  const drawOutline = (p: Part) => {
    const o = outlineOf(get, p);
    const ink = settings.theme.sketchInk;
    if (o.shape === "point") content.add(dot(o.at, ink, 6));
    else if (o.shape === "segment") content.add(pen.line([...o.a, ...o.b], ink, 1.8));
    else if (o.shape === "circle") content.add(pen.line(ringOf(o.center, o.radius, o.normal), ink, 1.8));
  };
  for (const p of Object.values(s.parts)) {
    if (used.has(p.ref)) continue; // an extrude has used it up
    if (p.origin === "world") continue; // the world is drawn by ui/world.ts
    if (p.origin === "body") continue; // the body's own outline comes from its mesh
    if (p.kind === "face") {
      const tris = surfaceTriangles(get, p);
      if (tris) content.add(trisMesh(tris, new THREE.MeshBasicMaterial({ color: rgb(settings.theme.sheet), transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })));
      continue;
    }
    drawOutline(p);
  }
  if (!mesh) return;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(mesh.vertices, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3));
  g.setIndex(new THREE.BufferAttribute(mesh.triangles, 1));
  content.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, settings.extrude.edgeAngleDeg), new THREE.LineBasicMaterial({ color: settings.theme.bodyEdge })));
  content.add(new THREE.Mesh(g, new THREE.MeshPhysicalMaterial({ color: settings.theme.bodyColor, roughness: settings.light.roughness, metalness: 0, clearcoat: settings.light.sheen, clearcoatRoughness: settings.light.sheenRoughness, envMap, envMapIntensity: settings.light.reflect, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })));
}
