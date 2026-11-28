// The bodies as three.js draws them: the stand-in boxes of the scene's things and the meshes the engine made, each in the look it is asked for (`looks.ts`), a body shown moved by the orb's draft, and the cut of a sketch plane (`cutdraw.ts`).
import * as THREE from "three";
import { createCutDraw, type CutDrawing } from "./cutdraw.ts";
import { SOLID, surfaceOf, type Look } from "./looks.ts";
import { roomTexture } from "./room.ts";
import type { Scene as Model } from "./scene.ts";
import { centreOf } from "./scene.ts";
import { settings } from "./settings.ts";
import type { BodyMesh } from "./studio.ts";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import type { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { strokeOf } from "./sketchdraw.ts";
import { vec } from "./threeutil.ts";
import type { V3 } from "./vec.ts";

/** What the bodies need of a picture. */
export interface BodiesDrawing {
  /** The look of each body by id (default Solid): a body is drawn only in one of the three looks (looks.ts). */
  looks?: Record<string, Look>;
  /** The cut: everything on the side `n` points to is not drawn. */
  cut?: CutDrawing | null;
  /** a body shown moved and turned (the mover orb's draft): the step that made it, and its matrix (column by column) */
  moved?: { body: string; matrix: number[] } | null;
}

/** a body's surface as the old app made it: a slight clear coat over the grey, drawn behind its own outline */
const bodyMaterial = (envMap: THREE.Texture) =>
  new THREE.MeshPhysicalMaterial({
    envMap,
    envMapIntensity: settings.light.reflect,
    roughness: settings.light.roughness,
    metalness: 0,
    clearcoat: settings.light.sheen,
    clearcoatRoughness: settings.light.sheenRoughness,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
export function createBodies(scene: THREE.Scene, renderer: THREE.WebGLRenderer, model: Model) {
  const envMap = roomTexture(renderer);
  // stand-in bodies (rebuilt when the model changes)
  const bodies = new THREE.Group();
  let solids: readonly BodyMesh[] = [];
  /** the outline of a body: the sketch's own "done" stroke (thin charcoal, a line of a drawing), hidden by what is in front of it; its resolution is set each picture */
  const edgeMaterials: LineMaterial[] = [];
  const outline = (pairs: ArrayLike<number>): THREE.Object3D => {
    const pts: V3[] = [];
    for (let i = 0; i + 2 < pairs.length; i += 3) pts.push([pairs[i]!, pairs[i + 1]!, pairs[i + 2]!]);
    const o = strokeOf({ kind: "done", pairs: true, hidden: true, pts }, 1, 1);
    edgeMaterials.push((o as Line2).material as LineMaterial);
    return o;
  };
  const buildBodies = () => {
    for (const o of [...bodies.children]) {
      o.traverse((q) => {
        const m = q as THREE.Mesh;
        m.geometry?.dispose();
        for (const x of [m.material].flat()) (x as THREE.Material | undefined)?.dispose();
      });
    }
    bodies.clear();
    edgeMaterials.length = 0;
    for (const t of model.things) {
      const size = vec([t.hi[0] - t.lo[0], t.hi[1] - t.lo[1], t.hi[2] - t.lo[2]]);
      const g = new THREE.BoxGeometry(size.x, size.y, size.z);
      const m = new THREE.Mesh(g, bodyMaterial(envMap));
      m.add(outline(new THREE.EdgesGeometry(g).getAttribute("position").array));
      m.userData.thing = t.id;
      m.userData.look = "";
      m.position.copy(vec(centreOf(t)));
      bodies.add(m);
    }
    for (const b of solids) {
      // the bodies the engine made
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(b.positions, 3));
      g.setAttribute("normal", new THREE.BufferAttribute(b.normals, 3));
      g.setIndex(new THREE.BufferAttribute(b.indices, 1));
      const m = new THREE.Mesh(g, bodyMaterial(envMap));
      m.add(outline(b.edges));
      m.userData.thing = b.id;
      m.userData.look = "";
      bodies.add(m);
    }
  };
  scene.add(bodies);
  const cut = createCutDraw(scene, bodies, renderer);
  /** Each body in the look asked for (looks.ts: the only place a body's colour and opacity are set), changed only when the look changed. */
  const lookBodies = (looks: Record<string, Look> | undefined) => {
    for (const m of bodies.children as THREE.Mesh[]) {
      const look = looks?.[m.userData.thing as string] ?? SOLID,
        key = `${look.base}/${look.mark ?? ""}`;
      if (m.userData.look === key) continue;
      m.userData.look = key;
      const sf = surfaceOf(look),
        mat = m.material as THREE.MeshPhysicalMaterial,
        em = (m.children[0] as Line2).material as LineMaterial;
      mat.color.setHex(sf.color);
      mat.opacity = sf.opacity;
      mat.transparent = sf.transparent;
      mat.depthWrite = sf.depthWrite;
      mat.needsUpdate = true;
      em.color.setHex(sf.edge);
      em.opacity = sf.edgeOpacity;
      em.transparent = sf.edgeOpacity < 1;
      em.needsUpdate = true;
    }
  };
  const rebuildAll = () => {
    buildBodies();
    lookBodies(undefined);
    cut.rebuild();
  };
  rebuildAll();
  return {
    rebuild: rebuildAll,
    /** The bodies the engine made, as the last list given. */
    solids: () => solids,
    /** The bodies the engine made (replaced as a whole). */
    setSolids(list: readonly BodyMesh[]) {
      solids = list;
      rebuildAll();
    },
    update(d: BodiesDrawing, w: number, h: number) {
      for (const e of edgeMaterials) e.resolution.set(w, h);
      lookBodies(d.looks);
      for (const m of bodies.children as THREE.Mesh[]) {
        // a body shown moved (the mover orb's draft): its own matrix; the others as they were
        if (!solids.some((b) => b.id === m.userData.thing)) continue;
        const mv = d.moved && d.moved.body === m.userData.thing ? d.moved.matrix : null;
        if (mv) {
          m.matrixAutoUpdate = false;
          m.matrix.fromArray(mv);
          m.matrixWorldNeedsUpdate = true;
        } else if (!m.matrixAutoUpdate) {
          m.matrixAutoUpdate = true;
          m.matrix.identity();
          m.matrixWorldNeedsUpdate = true;
        }
      }
      cut.update(d.cut ?? null);
    },
  };
}
