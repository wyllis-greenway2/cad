// A dev check (not a test, `in_1444`): what the stress run found (`in_1541`, `in_1542`), kept as recipes in dev/stress-found/ and checked again.
//   node --experimental-strip-types dev/stress-found-check.ts
import { initKernel } from "../src/engine/kernel.ts";
import { Engine } from "../src/engine/engine.ts";
import type { Step } from "../src/engine/steps.ts";
import { readFileSync } from "node:fs";
await initKernel();
import { check, failureCount, same } from "./lib.ts";
const load = (n: string): Step[] =>
  JSON.parse(readFileSync(new URL(`./stress-found/${n}.json`, import.meta.url), "utf8"));
const st = (e: Engine, id: string) => e.result(id).status as { kind: string; why?: string };

console.log("1. a shell the kernel calls valid but whose face is 1e101 mm squared is refused, not kept");
{
  const e = new Engine(load("shell-absurd-volume"));
  e.build();
  check(
    "X9 is flagged, in words",
    st(e, "X9").kind === "flagged" && /cannot be right/.test(st(e, "X9").why ?? ""),
    st(e, "X9").kind + " " + (st(e, "X9").why ?? ""),
  );
  e.release();
}
console.log("2. a round naming edges of two bodies says so (flagged), not that an edge is gone (orphaned)");
{
  const e = new Engine(load("round-two-bodies"));
  e.build();
  check(
    "X6 flagged, says another body",
    st(e, "X6").kind === "flagged" && /another body/.test(st(e, "X6").why ?? ""),
    st(e, "X6").kind + " " + (st(e, "X6").why ?? ""),
  );
  e.release();
}
console.log(
  "3. an edit and back gives the same answers (the kernel's volume differs in the 11th digit with the way a shape was built; compared with a tolerance)",
);
{
  const e = new Engine(load("edit-and-back-volume-noise"));
  e.build();
  const ids = e.ids(),
    before = Object.fromEntries(ids.map((i) => [i, e.result(i).fingerprint])),
    p = e.step("X12").params as { dist: number };
  e.edit("X12", { ...p, dist: p.dist * 1.25 });
  e.edit("X12", p);
  check(
    "every step has its first fingerprint again",
    ids.every((i) => same(e.result(i).fingerprint, before[i]!)),
    ids.filter((i) => !same(e.result(i).fingerprint, before[i]!)).join(" "),
  );
  e.release();
}
console.log(
  "4. a push does not spoil the shape it was given (the kernel's booleans work in place unless told not to), so a later edit of that step works as a fresh build does",
);
{
  const rec = load("boolean-changes-its-input"),
    d0 = (rec.find((s) => s.id === "X12")!.params as { dist: number }).dist,
    e = new Engine(rec);
  e.build();
  const kinds: string[] = [];
  for (const f of [1.25, 1, 1.25, 1]) {
    e.edit("X12", { ...(e.step("X12").params as object), dist: d0 * f });
    kinds.push(st(e, "X12").kind);
  }
  check(
    "the push is ok every time it is edited",
    kinds.every((k) => k === "ok"),
    kinds.join(" "),
  );
  e.release();
}
console.log(
  "5. a flat face moved beside the wall of a hole (the neighbour is round, along the move): the wall grows or shrinks with it",
);
{
  const { mint } = await import("../src/engine/id.ts"),
    K = await import("../src/engine/kernel.ts"),
    { Body } = await import("../src/engine/lineage.ts");
  const base: Step[] = [
    {
      id: "s",
      kind: "sketchPolygon",
      params: {
        points: [
          [0, 0],
          [40, 0],
          [40, 30],
          [0, 30],
        ],
      },
      inputs: [],
    },
    { id: "A", kind: "extrude", params: { d: 10 }, inputs: ["s"] },
  ];
  const top = mint("A", "end"),
    hole: Step = { id: "H", kind: "hole", params: { face: top, diameter: 6, depth: 4 }, inputs: ["A"] },
    vol = (e: Engine) => K.volume((e.result("M").value as InstanceType<typeof Body>).solid);
  const mv = (face: typeof top, dist: number) => {
    const e = new Engine([...base, hole, { id: "M", kind: "moveFace", params: { face, dist }, inputs: ["H"] }]);
    e.build();
    return e;
  };
  const up = mv(top, 4),
    down = mv(top, -3),
    deeper = mv(mint("H", "hole", "bottom"), -2),
    disc = Math.PI * 9,
    slab = 1200 - disc;
  check(
    "the top moved up 4: four more slabs, the hole 4 longer",
    st(up, "M").kind === "ok" && Math.abs(vol(up) - (12000 - 4 * disc + 4 * slab)) < 1e-3,
    st(up, "M").kind + " " + vol(up),
  );
  check(
    "the top moved down 3: three slabs fewer",
    st(down, "M").kind === "ok" && Math.abs(vol(down) - (12000 - 4 * disc - 3 * slab)) < 1e-3,
    st(down, "M").kind + " " + vol(down),
  );
  check(
    "the hole's bottom moved 2 deeper: two discs fewer",
    st(deeper, "M").kind === "ok" && Math.abs(vol(deeper) - (12000 - 6 * disc)) < 1e-3,
    st(deeper, "M").kind + " " + vol(deeper),
  );
  check(
    "the same as editing the hole's depth (fresh build)",
    (() => {
      const e = new Engine([...base, { ...hole, params: { ...hole.params, depth: 6 } }]);
      e.build();
      const v = K.volume((e.result("H").value as InstanceType<typeof Body>).solid);
      e.release();
      return Math.abs(v - vol(deeper)) < 1e-3;
    })(),
  );
  up.release();
  down.release();
  deeper.release();
}
console.log(
  "6. a fillet does not change the shape it was given (it raised tolerances in place), so a later step on that shape gives what a fresh build gives",
);
{
  const e = new Engine(load("fillet-changes-its-input"));
  e.build();
  const p = e.step("X4").params as { size: number };
  e.edit("X4", { ...p, size: p.size * 1.25 });
  const f = new Engine(e.recipe());
  f.build();
  check(
    "live equals a fresh build after the edit",
    e.ids().every((i) => same(e.result(i).fingerprint, f.result(i).fingerprint)),
    e
      .ids()
      .filter((i) => !same(e.result(i).fingerprint, f.result(i).fingerprint))
      .join(" "),
  );
  f.release();
  e.release();
}
console.log(
  "7. rounding an edge where the faces meet smoothly (a fillet's own seam) is refused in words; the kernel failed on these at every size",
);
{
  const { mint, edgeRef } = await import("../src/engine/id.ts"),
    A = (r: string, o?: unknown) => mint("A", r as never, ...(o ? [o as never] : []));
  const line0 = mint("s", "line", 0),
    side = mint("A", "side", line0),
    end = mint("A", "end"),
    ref = edgeRef(side, end);
  const steps: Step[] = [
    {
      id: "s",
      kind: "sketchPolygon",
      params: {
        points: [
          [0, 0],
          [40, 0],
          [40, 30],
          [0, 30],
        ],
      },
      inputs: [],
    },
    { id: "A", kind: "extrude", params: { d: 10 }, inputs: ["s"] },
    { id: "R", kind: "round", params: { edges: [ref], size: 2 }, inputs: ["A"] },
    {
      id: "T",
      kind: "round",
      params: { edges: [edgeRef(mint("R", "round", ref.a, ref.b, 0), end)], size: 0.5 },
      inputs: ["R"],
    },
  ];
  void A;
  const e = new Engine(steps);
  e.build();
  check(
    "a round of a block's own edge is fine",
    st(e, "R").kind === "ok",
    st(e, "R").kind + " " + (st(e, "R").why ?? ""),
  );
  check(
    "a round of the seam between that round and the top is flagged, and says the edge is smooth",
    st(e, "T").kind === "flagged" && /is smooth/.test(st(e, "T").why ?? ""),
    st(e, "T").kind + " " + (st(e, "T").why ?? ""),
  );
  e.release();
}
console.log(
  "8. faces the kernel left without a name are numbered by what they are and where, not by the kernel's listing order (which differed between a live engine and a fresh build)",
);
{
  const { Body } = await import("../src/engine/lineage.ts"),
    K = await import("../src/engine/kernel.ts"),
    e = new Engine(load("unnamed-order"));
  e.build();
  let seen = 0,
    inOrder = true;
  const q = (v: number) => Math.round(v * 1e6) / 1e6;
  for (const id of e.ids()) {
    const v = e.result(id).value;
    if (!(v instanceof Body)) continue;
    const un = v.faces
      .filter((f) => f.id.role === "unnamed" && f.id.step === id)
      .sort((a, b) => (a.id.of[0] as number) - (b.id.of[0] as number));
    seen += un.length;
    const keys = un.map((f) => {
      const c = K.facts(f.h);
      return [c.type, q(c.ce[0]), q(c.ce[1]), q(c.ce[2]), q(c.area)] as const;
    });
    for (let i = 1; i < keys.length; i++) {
      const a = keys[i - 1]!,
        b = keys[i]!;
      const cmp = (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0) || a[1] - b[1] || a[2] - b[2] || a[3] - b[3] || a[4] - b[4];
      if (cmp > 0) inOrder = false;
    }
  }
  check("the unnamed faces of every step are in geometric order", seen > 0 && inOrder, `${seen} unnamed faces seen`);
  e.release();
}
console.log(
  "9. two edges the kernel cannot round together are rounded one after the other (a boss whose two walls run out over a cylinder's rim), and the part is the same as rounding them in two steps",
);
{
  const { mint, edgeRef } = await import("../src/engine/id.ts"),
    K = await import("../src/engine/kernel.ts"),
    { Body } = await import("../src/engine/lineage.ts"),
    top = mint("A", "end"),
    bs = (i: number) => mint("B", "side", mint("t", "line", i));
  const base: Step[] = [
    { id: "s", kind: "sketchCircle", params: { r: 20, at: [0, 0] }, inputs: [] },
    { id: "A", kind: "extrude", params: { d: 20 }, inputs: ["s"] },
    {
      id: "t",
      kind: "sketchPolygon",
      params: {
        offset: 20,
        points: [
          [5, -6],
          [32, -6],
          [32, 6],
          [5, 6],
        ],
      },
      inputs: [],
    },
    { id: "B", kind: "extrude", params: { d: 10 }, inputs: ["t"] },
    { id: "C", kind: "combine", params: { mode: "add" }, inputs: ["A", "B"] },
  ];
  for (const size of [0.5, 2, 6]) {
    const both = new Engine([
      ...base,
      { id: "F", kind: "round", params: { edges: [edgeRef(bs(0), top), edgeRef(bs(2), top)], size }, inputs: ["C"] },
    ]);
    both.build();
    const two = new Engine([
      ...base,
      { id: "F1", kind: "round", params: { edges: [edgeRef(bs(0), top)], size }, inputs: ["C"] },
      { id: "F2", kind: "round", params: { edges: [edgeRef(bs(2), top)], size }, inputs: ["F1"] },
    ]);
    two.build();
    const v = (e: Engine, id: string) => K.volume((e.result(id).value as InstanceType<typeof Body>).solid);
    check(
      `size ${size}: ok, with a note that says it was done in turn, and the volume of the two steps`,
      st(both, "F").kind === "ok" &&
        st(two, "F2").kind === "ok" &&
        both.result("F").notes.some((n) => n.kind === "sequence") &&
        Math.abs(v(both, "F") - v(two, "F2")) < 1e-3,
      `${st(both, "F").kind} ${st(both, "F").why ?? ""} ${st(both, "F").kind === "ok" ? v(both, "F") : ""} ${st(two, "F2").kind === "ok" ? v(two, "F2") : ""}`,
    );
    both.release();
    two.release();
  }
}
console.log(
  "10. a constraint added to a sketch does not send the drawing far away (a parallel or a square from a quarter turn off had almost no slope, and the step it gave sent points thousands of mm off), or shrink a line to nothing",
);
{
  const { tryAdd, solve } = await import("../src/engine/solver.ts");
  for (const n of ["sketch-parallel-flies-away", "sketch-line-of-nothing"]) {
    const { prev, c } = JSON.parse(readFileSync(new URL(`./stress-found/${n}.json`, import.meta.url), "utf8")),
      a = tryAdd(prev, c),
      r = solve(a.system);
    const moved = Math.max(
      ...prev.points.map((p: { id: string; x: number; y: number }) =>
        Math.hypot(r.solution.points[p.id]![0] - p.x, r.solution.points[p.id]![1] - p.y),
      ),
    );
    const lines = a.system.lines.map((l: { a: string; b: string }) =>
      Math.hypot(
        r.solution.points[l.a]![0] - r.solution.points[l.b]![0],
        r.solution.points[l.a]![1] - r.solution.points[l.b]![1],
      ),
    );
    check(
      `${n}: ${a.outcome}, nothing moves more than the drawing is wide (${moved.toFixed(1)} mm), and no line is shorter than 0.001 mm`,
      a.outcome !== "added" || (moved < 60 && Math.min(...lines) >= 1e-3),
      `${a.outcome} moved ${moved.toFixed(1)} shortest ${Math.min(...lines)}`,
    );
  }
}
console.log(
  "11. the area of a region of a sketch is exact (arcs were cut into a polygon, a tenth of a percent short) and does not count an island inside it",
);
{
  const K = await import("../src/engine/kernel.ts"),
    { Body } = await import("../src/engine/lineage.ts");
  const params = JSON.parse(readFileSync(new URL("./stress-found/sketch-island-region.json", import.meta.url), "utf8")),
    e = new Engine([
      { id: "s", kind: "sketch", params, inputs: [] },
      { id: "E", kind: "extrude", params: { d: 4 }, inputs: ["s"] },
    ]);
  e.build();
  const sk = e.result("s").value as { regions?: { area: number; filled: boolean }[] },
    filled = (sk.regions ?? []).filter((q) => q.filled).reduce((a, q) => a + q.area, 0),
    v = K.volume((e.result("E").value as InstanceType<typeof Body>).solid);
  check(
    "the filled areas times the depth are the volume of the extrude, to a millionth",
    st(e, "E").kind === "ok" && Math.abs(v - filled * 4) < 1e-6 * v,
    `${v} against ${filled * 4}`,
  );
  e.release();
  const c = new Engine([
    {
      id: "s",
      kind: "sketch",
      params: {
        points: [{ id: "C", x: 0, y: 0 }],
        circles: [{ id: "k", c: "C", r: 7 }],
        constraints: [
          { id: "f", kind: "fixed", parts: ["C"], at: [0, 0] },
          { id: "r", kind: "radius", parts: ["k"], value: 7 },
        ],
      },
      inputs: [],
    },
  ]);
  c.build();
  const cs = c.result("s").value as { regions?: { area: number }[] };
  check(
    "a circle of radius 7: its region is 49 pi",
    !!cs.regions?.length && Math.abs(cs.regions[0]!.area - 49 * Math.PI) < 1e-9,
    String(cs.regions?.[0]?.area),
  );
  c.release();
}
process.exit(failureCount() ? 1 : 0);
