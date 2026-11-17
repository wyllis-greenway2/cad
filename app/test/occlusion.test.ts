// The axis labels' "is the model in front" test and the picking of a face's triangles give the answer the plain way gives (`in_767`): only faster.
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("data:text/javascript," + encodeURIComponent(`export async function resolve(s, c, n) { if (s.includes("?url")) return { url: "data:text/javascript,export default 'x'", shortCircuit: true }; return n(s, c); }`));
const THREE = await import("three");
const { anyHit } = await import("../src/ui/world.ts");

function rng(seed: number) { let x = seed; return () => { x = (x * 1664525 + 1013904223) % 4294967296; return x / 4294967296; }; }

test("a ray is found to meet a mesh before its far end exactly when three says so, for each side a material draws", () => {
  for (const side of [THREE.FrontSide, THREE.BackSide, THREE.DoubleSide]) {
    // a lumpy mesh of a few thousand triangles, moved and turned, so that the chunks' boxes and the matrix are in play
    const g = new THREE.SphereGeometry(10, 64, 48);
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side }));
    mesh.position.set(3, -2, 5);
    mesh.rotation.set(0.4, 0.7, -0.2);
    mesh.updateMatrixWorld(true);
    const r = rng(7 + side);
    const caster = new THREE.Raycaster();
    let hits = 0, total = 0;
    for (let i = 0; i < 600; i++) {
      const o = new THREE.Vector3((r() - 0.5) * 60, (r() - 0.5) * 60, (r() - 0.5) * 60);
      const aim = new THREE.Vector3((r() - 0.5) * 30, (r() - 0.5) * 30, (r() - 0.5) * 30);
      const d = aim.clone().sub(o);
      const len = d.length();
      caster.set(o, d.normalize());
      caster.far = len * (0.3 + 1.4 * r());
      const want = caster.intersectObject(mesh, false).length > 0;
      assert.equal(anyHit(caster, mesh), want, `ray ${i}, side ${side}`);
      total++; if (want) hits++;
    }
    assert.ok(hits > 60 && hits < total - 60, `${hits} of ${total} rays meet it: both answers are tried`);
  }
});

test("what is not a plain mesh is asked of three, and a mesh with no index is as good as one with", () => {
  const caster = new THREE.Raycaster();
  caster.set(new THREE.Vector3(0, 0, 20), new THREE.Vector3(0, 0, -1));
  caster.far = 100;
  const box = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4).toNonIndexed(), new THREE.MeshBasicMaterial());
  box.updateMatrixWorld(true);
  assert.equal(anyHit(caster, box), true);
  const away = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), new THREE.MeshBasicMaterial());
  away.position.set(50, 0, 0); away.updateMatrixWorld(true);
  assert.equal(anyHit(caster, away), false);
  assert.equal(anyHit(caster, new THREE.Group()), false);
});
