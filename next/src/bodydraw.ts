// The bodies as three.js draws them: the stand-in boxes of the scene's things and the meshes the engine made, each in the look it is asked for (`looks.ts`), a body shown moved by the orb's draft, and the cut of a sketch plane (`cutdraw.ts`).
import * as THREE from "three";
import { createCutDraw, type CutDrawing } from "./cutdraw.ts";
import { SOLID, surfaceOf, type Look } from "./looks.ts";
import type { Scene as Model } from "./scene.ts";
import { centreOf } from "./scene.ts";
import { settings } from "./settings.ts";
import type { BodyMesh } from "./studio.ts";
import { vec } from "./threeutil.ts";

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
const bodyMaterial = () =>
  new THREE.MeshPhysicalMaterial({
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
  // stand-in bodies (rebuilt when the model changes)
  const bodies = new THREE.Group();
  let solids: readonly BodyMesh[] = [];
  const buildBodies = () => {
    bodies.clear();
    for (const t of model.things) {
      const size = vec([t.hi[0] - t.lo[0], t.hi[1] - t.lo[1], t.hi[2] - t.lo[2]]);
      const g = new THREE.BoxGeometry(size.x, size.y, size.z);
      const m = new THREE.Mesh(g, bodyMaterial());
      m.add(new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial()));
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
      const m = new THREE.Mesh(g, bodyMaterial());
      const eg = new THREE.BufferGeometry();
      eg.setAttribute("position", new THREE.BufferAttribute(b.edges, 3));
      m.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial()));
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
        edges = m.children[0] as THREE.LineSegments,
        em = edges.material as THREE.LineBasicMaterial;
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
    update(d: BodiesDrawing) {
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
