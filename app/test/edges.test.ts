import test from "node:test";
import assert from "node:assert/strict";
import { cornerEdges } from "../src/ui/view/edges.ts";

test("lines are drawn where the surface turns a corner, by the smooth normals: a smooth strip of any triangles has none, a folded one has one", () => {
  // two triangles sharing an edge, flat (same normals): no line
  const v = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]);
  const flat = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const tris = new Uint32Array([0, 1, 2, 3, 4, 5]);
  assert.equal(cornerEdges(v, flat, tris, 30).length, 0);
  // a fillet: the surface is smooth, but the triangles are long and thin so their own normals differ a lot: the smooth normals differ by 10 degrees only
  const a = (10 * Math.PI) / 180;
  const smooth = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, Math.sin(a), 0, Math.cos(a), 0, 0, 1]);
  assert.equal(cornerEdges(v, smooth, tris, 30).length, 0, "a gentle bend is not a corner");
  // a fold: the normals on the two sides of the shared edge are 90 degrees apart
  const fold = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0]);
  const edge = cornerEdges(v, fold, tris, 30);
  assert.equal(edge.length, 6, "one line");
  assert.deepEqual([...edge].sort(), [0, 0, 0, 0, 1, 1].sort(), "the edge they share, from (0,1,0) to (1,0,0)");
});

test("the edges of a mesh are found once: the same mesh gives the same list, a new mesh or another angle is found again (`dec_sharp_edges_once`)", async () => {
  const { cornerEdgesOf } = await import("../src/ui/view/edges.ts");
  const v = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1]);
  const n = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, -1, 0, 0, -1, 0]);
  const t = new Uint32Array([0, 1, 2, 0, 2, 3, 0, 4, 1, 1, 4, 5]);
  const a = cornerEdgesOf({ vertices: v, normals: n, triangles: t }, 30);
  assert.equal(a.again, false);
  assert.deepEqual(a.edges, cornerEdges(v, n, t, 30), "the same edges as the plain search");
  const b = cornerEdgesOf({ vertices: v, normals: n, triangles: t }, 30);
  assert.equal(b.again, true, "remembered");
  assert.equal(b.edges, a.edges);
  assert.equal(cornerEdgesOf({ vertices: v, normals: n, triangles: t }, 80).again, false, "another angle");
  assert.equal(cornerEdgesOf({ vertices: new Float32Array(v), normals: n, triangles: t }, 80).again, false, "another mesh");
});
