// A dev check (not a test, `in_1444`) of where an arrow stands on what is picked on a body (`dec_body_look_and_feel`, `src/interaction/anchors.ts`): the middle of a face; an edge's quarter way along or middle of a curve.
//   node --experimental-strip-types dev/anchors-check.ts
import { edgeAnchor, faceCentre } from "../src/interaction/anchors.ts";
import { check, failureCount } from "./lib.ts";

// a flat face as triangles: a 40 by 20 rectangle (two triangles)
const rect = {
  positions: new Float32Array([0, 0, 5, 40, 0, 5, 40, 20, 5, 0, 20, 5]),
  indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
};
const c = faceCentre(rect, { start: 0, count: 6 });
check(
  "a rectangle face's middle is its middle",
  Math.abs(c[0] - 20) < 1e-6 && Math.abs(c[1] - 10) < 1e-6 && Math.abs(c[2] - 5) < 1e-6,
  JSON.stringify(c),
);
// a C-shaped face: 30 by 30 with a mouth cut from the right between y 10 and 20, x 10 to 30: its centre of area is in the mouth
const pts: [number, number][] = [
  [0, 0],
  [30, 0],
  [30, 10],
  [10, 10],
  [10, 20],
  [30, 20],
  [30, 30],
  [0, 30],
];
const positions = new Float32Array(pts.flatMap(([x, y]) => [x, y, 0]));
// a fan from the corner (0,0) is not valid for a C; use three rectangles: bottom, back, top
const rects = [
  [0, 1, 2, 3],
  [0, 3, 4, 7],
  [4, 5, 6, 7],
]; // (bottom bar, left bar, top bar, as quads of the points above, split into triangles)
const indices = new Uint32Array(rects.flatMap(([a, b, cc, d]) => [a!, b!, cc!, a!, cc!, d!]));
const c2 = faceCentre({ positions, indices }, { start: 0, count: indices.length });
const inMouth = c2[0] > 10 && c2[1] > 10 && c2[1] < 20;
check("a C-shaped face: the middle is on the face, not in its mouth", !inMouth, JSON.stringify(c2));
// an edge
const lines = new Float32Array([0, 0, 0, 40, 0, 0]);
const e = edgeAnchor(lines, { start: 0, count: 2 });
check("a straight edge: a quarter of the way along", Math.abs(e[0] - 10) < 1e-6 && e[1] === 0, JSON.stringify(e));
const arc = new Float32Array([0, 0, 0, 10, 10, 0, 20, 0, 0]); // (a bend in three points: the middle of its length is the middle point)
const m = edgeAnchor(arc, { start: 0, count: 3 });
check("a curve: the middle of its length", Math.abs(m[0] - 10) < 1e-6 && Math.abs(m[1] - 10) < 1e-6, JSON.stringify(m));
process.exit(failureCount() ? 1 : 0);
