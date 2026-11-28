// A dev check (not a test, `in_1444`) that what is laid over the bodies (the sketch tint, the marks, the pull ghost) is made again only when its input changed, and that finding out costs next to nothing:
// node --experimental-strip-types dev/overlay-check.ts
import * as THREE from "three";
import { equal } from "../src/equal.ts";
import { createOverlays, type Overlays } from "../src/overlaydraw.ts";
import { check, failureCount } from "./lib.ts";

// ---- equal ----
const typed = new Float32Array(3),
  heavyLoops = Array.from({ length: 1000 }, (_, i) => [i, [i, i]]);
check("the same thing is equal to itself without looking inside", equal(typed, typed) && equal(heavyLoops, heavyLoops));
check("plain data is equal when it holds the same", equal({ a: [1, [2, 3]], b: "x" }, { b: "x", a: [1, [2, 3]] }));
check(
  "a different number, length or key is not equal",
  !equal([1, 2], [1, 3]) && !equal([1], [1, 2]) && !equal({ a: 1 }, { a: 1, b: 2 }) && !equal({ a: 1 }, { b: 1 }),
);
check(
  "an array is not an object, and null is not nothing",
  !equal([], {}) && !equal(null, {}) && !equal(null, undefined),
);
check("a typed array is the same only if it is the same one", !equal(new Float32Array(3), new Float32Array(3)));

// ---- overlays: the meshes are kept while the input is, made again when it changes ----
const scene = new THREE.Scene(),
  overlays = createOverlays(scene, () => []);
const loop: [number, number][] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
];
const frame = () => ({
  origin: [0, 0, 0] as [number, number, number],
  u: [1, 0, 0] as [number, number, number],
  v: [0, 1, 0] as [number, number, number],
});
const tint = (loops: [number, number][][]): Overlays => ({ fills: [{ frame: frame(), loops }] }); // (a new wrapper each picture, as the controller makes it)
const meshes = () => scene.children.flatMap((g) => g.children);
const loops = [loop];
overlays.update(tint(loops), 800, 600);
const first = meshes();
check("a closed figure is tinted", first.length === 1);
overlays.update(tint(loops), 800, 600);
check("the same figure in a new wrapper keeps its mesh", meshes()[0] === first[0]);
overlays.update(tint([[...loop, [5, 12]]]), 800, 600);
check("a changed figure is made again", meshes().length === 1 && meshes()[0] !== first[0]);
overlays.update({}, 800, 600);
check("no figure: no tint", meshes().length === 0);

// ---- what it costs to find out, for a heavy sketch ----
const big = Array.from({ length: 300 }, () => [
  Array.from({ length: 200 }, (_, i) => [Math.cos(i) * 10, Math.sin(i) * 10] as [number, number]),
]);
const heavy = (): Overlays["fills"] => big.map((l) => ({ frame: frame(), loops: l }));
overlays.update({ fills: heavy() }, 800, 600);
const t0 = performance.now();
for (let i = 0; i < 200; i++) overlays.update({ fills: heavy() }, 800, 600);
const ms = (performance.now() - t0) / 200;
check(`300 figures of 200 points: ${ms.toFixed(3)} ms a picture (was about 23 by building a string)`, ms < 1);

process.exit(failureCount() ? 1 : 0);
