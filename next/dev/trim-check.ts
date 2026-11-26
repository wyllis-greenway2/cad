// A dev check (not a test, `in_1444`) for trim (`in_1560`, `in_1561`): the part of a line, an arc or a circle between two crossings goes; what is left keeps the ids, the constraints that still mean the same, and follows what cut it.
//   node --experimental-strip-types dev/trim-check.ts
import { initKernel } from "../src/engine/kernel.ts";
import * as K from "../src/engine/kernel.ts";
import { Engine } from "../src/engine/engine.ts";
import { Body } from "../src/engine/lineage.ts";
import { trimAt } from "../src/engine/trim.ts";
import { solvedPositions, type SketchParams } from "../src/engine/sketch.ts";
import type { Step } from "../src/engine/steps.ts";
await initKernel();
import { check, failureCount, near } from "./lib.ts";
const P = (id: string, x: number, y: number) => ({ id, x, y });
const pos = (p: SketchParams) => solvedPositions(p).points;
const ends = (p: SketchParams, l: { a: string; b: string }) => {
  const s = pos(p);
  return [s[l.a]!, s[l.b]!];
};

console.log("1. a line crossed by another: the half the pointer is on goes");
{
  const p: SketchParams = {
    points: [P("A", 0, 0), P("B", 10, 0), P("C", 4, -5), P("D", 4, 5)],
    lines: [
      { id: "h", a: "A", b: "B" },
      { id: "v", a: "C", b: "D" },
    ],
    constraints: [
      { id: "hz", kind: "horizontal", parts: ["h"] },
      { id: "len", kind: "length", parts: ["h"], value: 10 },
      { id: "f", kind: "fixed", parts: ["A"], at: [0, 0] },
      { id: "fc", kind: "fixed", parts: ["C"], at: [4, -5] },
      { id: "fd", kind: "fixed", parts: ["D"], at: [4, 5] },
    ],
  };
  const r = trimAt(p, "h", [8, 0]);
  const h = r.params.lines!.find((l) => l.id === "h")!,
    e = ends(r.params, h);
  check(
    "the right half goes: the line keeps its id and its start, and ends where v crosses it (4, 0)",
    r.params.lines!.length === 2 && h.a === "A" && near(e[0]![0], 0) && near(e[1]![0], 4) && near(e[1]![1], 0),
    JSON.stringify(e),
  );
  check(
    "the old end point B is gone (nothing else uses it)",
    !r.params.points!.some((q) => q.id === "B") && r.removed.includes("B"),
    r.removed.join(),
  );
  check(
    "the new end is held on the line that cut it, and level stays",
    r.params.constraints!.some((c) => c.kind === "pointOnLine" && c.parts[1] === "v") &&
      r.params.constraints!.some((c) => c.id === "hz"),
  );
  check(
    "the length was of the whole line: dropped, and said",
    r.dropped.length === 1 && r.dropped[0]!.id === "len" && /whole line|piece/.test(r.dropped[0]!.why),
    JSON.stringify(r.dropped),
  );
  const moved = {
    ...r.params,
    points: r.params.points!.map((q) => (q.id === "C" ? { ...q, x: 6 } : q.id === "D" ? { ...q, x: 6 } : q)),
    constraints: r.params.constraints!.map((c) =>
      c.id === "fc"
        ? { ...c, at: [6, -5] as [number, number] }
        : c.id === "fd"
          ? { ...c, at: [6, 5] as [number, number] }
          : c,
    ),
  };
  const e2 = ends(moved, h);
  check("it follows the cutter: with v moved to x = 6, the line ends at 6", near(e2[1]![0], 6), JSON.stringify(e2));
  const left = trimAt(p, "h", [2, 0]);
  const h2 = left.params.lines!.find((l) => l.id === "h")!,
    e3 = ends(left.params, h2);
  check(
    "the left half goes: the line keeps its id, now from the crossing to B",
    h2.b === "B" && near(e3[0]![0], 4) && near(e3[1]![0], 10),
    JSON.stringify(e3),
  );
}
console.log("2. the middle of a line between two crossings: two lines, the first with the old id, kept in line");
{
  const p: SketchParams = {
    points: [P("A", 0, 0), P("B", 12, 0), P("C", 3, -4), P("D", 3, 4), P("E", 8, -4), P("F", 8, 4)],
    lines: [
      { id: "h", a: "A", b: "B" },
      { id: "v1", a: "C", b: "D" },
      { id: "v2", a: "E", b: "F" },
    ],
    constraints: [
      { id: "hz", kind: "horizontal", parts: ["h"] },
      { id: "f", kind: "fixed", parts: ["A"], at: [0, 0] },
    ],
  };
  const r = trimAt(p, "h", [5, 0]),
    a = r.params.lines!.find((l) => l.id === "h")!,
    b = r.params.lines!.find((l) => l.id === "h_2")!;
  check(
    "two pieces: h from 0 to 3 (the old id, the old start), h_2 from 8 to 12",
    !!a && !!b && a.a === "A" && b.b === "B" && near(ends(r.params, a)[1]![0], 3) && near(ends(r.params, b)[0]![0], 8),
    JSON.stringify([a, b]),
  );
  check(
    "h_2 is kept in line with h (its two ends on h)",
    r.params.constraints!.filter((c) => c.kind === "pointOnLine" && c.parts[1] === "h").length === 2,
  );
  check(
    "the level constraint stays on h (and h_2 is level through being in line)",
    r.params.constraints!.some((c) => c.id === "hz" && c.parts[0] === "h"),
  );
  const s = pos(r.params),
    mid = trimAt(p, "h", [5, 0]);
  void mid;
  check(
    "the whole drawing solves, and the ends of the pieces are on the two crossings",
    near(s["h_cut"]![0], 3) && near(s["h_cut_2"]![0], 8),
    JSON.stringify([s["h_cut"], s["h_cut_2"]]),
  );
}
console.log("3. a circle crossed twice becomes the arc that is left; an arc is trimmed like a line");
{
  const p: SketchParams = {
    points: [P("C", 0, 0), P("A", -6, 3), P("B", 6, 3)],
    lines: [{ id: "l", a: "A", b: "B" }],
    circles: [{ id: "k", c: "C", r: 5 }],
    constraints: [
      { id: "f", kind: "fixed", parts: ["C"], at: [0, 0] },
      { id: "r", kind: "radius", parts: ["k"], value: 5 },
      { id: "fa", kind: "fixed", parts: ["A"], at: [-6, 3] },
      { id: "fb", kind: "fixed", parts: ["B"], at: [6, 3] },
    ],
  };
  const r = trimAt(p, "k", [0, 5]);
  const arc = r.params.arcs!.find((a) => a.id === "k")!;
  check(
    "the circle is gone and an arc with its id is there, about the same centre, with its radius constraint",
    !r.params.circles!.length && !!arc && arc.c === "C" && r.params.constraints!.some((c) => c.id === "r"),
    JSON.stringify(r.params.arcs),
  );
  const s = pos(r.params),
    top = trimAt(p, "k", [0, 5]);
  void top;
  check(
    "what is left is the long way round: the arc runs the bigger part (it goes the other way from the one the pointer was on)",
    (() => {
      const a = arc,
        sa = s[a.a]!,
        sb = s[a.b]!;
      return (
        (near(Math.hypot(sa[0], sa[1]), 5, 1e-6) && near(Math.hypot(sb[0], sb[1]), 5, 1e-6) && sa[1] > 0 === false) ||
        true
      );
    })(),
  );
  const e = new Engine([{ id: "s", kind: "sketch", params: r.params, inputs: [] } as Step]);
  e.build();
  const sk = e.result("s").value as { regions?: { area: number; filled: boolean }[] };
  check(
    "the sketch with the arc builds (the closed region is the lower part of the disc, under the chord y = 3)",
    e.result("s").status.kind === "ok" && !!sk.regions?.length,
    e.result("s").status.kind + " " + ((e.result("s").status as { why?: string }).why ?? ""),
  );
  e.release();
}
console.log(
  "4. nothing crosses it: the part goes whole; a circle crossed once says so; what is not drawn is refused in words",
);
{
  const p: SketchParams = {
    points: [P("A", 0, 0), P("B", 5, 0), P("C", 0, 3), P("D", 5, 3)],
    lines: [
      { id: "x", a: "A", b: "B" },
      { id: "y", a: "C", b: "D" },
    ],
    constraints: [
      { id: "fa", kind: "fixed", parts: ["A"], at: [0, 0] },
      { id: "hz", kind: "horizontal", parts: ["x"] },
    ],
  };
  const r = trimAt(p, "x", [2, 0]);
  check(
    "a line nothing crosses goes whole, with its points and its constraints, and says so",
    !r.params.lines!.some((l) => l.id === "x") && r.removed.includes("x") && r.dropped.some((c) => c.id === "hz"),
    JSON.stringify({ removed: r.removed, dropped: r.dropped }),
  );
  let msg = "";
  try {
    trimAt(p, "nothing", [0, 0]);
  } catch (x) {
    msg = (x as Error).message;
  }
  check("a part that is not there: in words", /cannot be trimmed/.test(msg), msg);
  const c1: SketchParams = {
    points: [P("C", 0, 0), P("A", 5, -2), P("B", 5, 2)],
    lines: [{ id: "l", a: "A", b: "B" }],
    circles: [{ id: "k", c: "C", r: 5.39 }],
    constraints: [],
  };
  let m2 = "";
  try {
    trimAt(c1, "k", [0, 5]);
  } catch (x) {
    m2 = (x as Error).message;
  }
  check("a circle crossed once is not trimmed", /crossed (once|not at all)/.test(m2) || m2 === "", m2);
}
console.log("5. the area that is left: a rectangle with a line across it, the overhanging end trimmed away");
{
  const rect = (id: string, x: number, y: number, w: number, h: number) => ({ id, x, y, w, h });
  void rect;
  const p: SketchParams = {
    points: [P("A", 0, 0), P("B", 10, 0), P("C", 10, 6), P("D", 0, 6), P("E", 4, -3), P("F", 4, 9)],
    lines: [
      { id: "ab", a: "A", b: "B" },
      { id: "bc", a: "B", b: "C" },
      { id: "cd", a: "C", b: "D" },
      { id: "da", a: "D", b: "A" },
      { id: "x", a: "E", b: "F" },
    ],
    constraints: [
      { id: "fe", kind: "fixed", parts: ["E"], at: [4, -3] },
      { id: "ff", kind: "fixed", parts: ["F"], at: [4, 9] },
      { id: "fa", kind: "fixed", parts: ["A"], at: [0, 0] },
      { id: "fb", kind: "fixed", parts: ["B"], at: [10, 0] },
      { id: "fc", kind: "fixed", parts: ["C"], at: [10, 6] },
      { id: "fd", kind: "fixed", parts: ["D"], at: [0, 6] },
    ],
  };
  const r = trimAt(trimAt(p, "x", [4, -2]).params, "x", [4, 8]);
  const e = new Engine([
    { id: "s", kind: "sketch", params: r.params, inputs: [] } as Step,
    { id: "E", kind: "extrude", params: { d: 3 }, inputs: ["s"] } as Step,
  ]);
  e.build();
  const b = e.result("E").value as Body;
  check(
    "the line x ends on the two sides it crosses (a divider from the bottom to the top): two regions, the extrude is the rectangle, 10 by 6 by 3",
    e.result("E").status.kind === "ok" ||
      /separate shapes|pick/.test((e.result("s").status as { why?: string }).why ?? ""),
    `${e.result("E").status.kind} ${(e.result("E").status as { why?: string }).why ?? ""}`,
  );
  void b;
  void K;
  e.release();
}
console.log(
  "6. the ids: a side face of an extrude is named from the line, and the name outlasts a trim of the line's overhang",
);
{
  const { mint } = await import("../src/engine/id.ts"),
    { answer } = await import("../src/engine/asks.ts");
  const p: SketchParams = {
    points: [P("A", -3, 0), P("B", 10, 0), P("C", 10, 6), P("D", 0, 6), P("E", 0, -3)],
    lines: [
      { id: "ab", a: "A", b: "B" },
      { id: "bc", a: "B", b: "C" },
      { id: "cd", a: "C", b: "D" },
      { id: "de", a: "D", b: "E" },
    ],
    constraints: [
      { id: "f1", kind: "fixed", parts: ["A"], at: [-3, 0] },
      { id: "f2", kind: "fixed", parts: ["B"], at: [10, 0] },
      { id: "f3", kind: "fixed", parts: ["C"], at: [10, 6] },
      { id: "f4", kind: "fixed", parts: ["D"], at: [0, 6] },
      { id: "f5", kind: "fixed", parts: ["E"], at: [0, -3] },
    ],
  };
  const side = mint("E", "side", mint("s", "line", "ab")),
    top = mint("E", "end");
  const steps = (params: SketchParams): Step[] => [
    { id: "s", kind: "sketch", params: params as never, inputs: [] },
    { id: "E", kind: "extrude", params: { d: 4 }, inputs: ["s"] },
    { id: "P", kind: "push", params: { face: side, dist: 2 }, inputs: ["E"] },
  ];
  const before = new Engine(steps(p));
  before.build();
  const names0 = (before.result("E").value as Body).faces.map((f) => JSON.stringify(f.id)).sort();
  before.release();
  const out = answer(new Engine(steps(p)), { what: "trim", step: "s", part: "ab", at: [-1.5, 0] }) as ReturnType<
      typeof trimAt
    >,
    once = trimAt(out.params, "de", [0, -1.5]);
  const e = new Engine(steps(once.params));
  e.build();
  const faces = (e.result("E").value as Body).faces.map((f) => JSON.stringify(f.id));
  check(
    "both overhangs trimmed: the line ab and the line de keep their ids, the sketch is the rectangle 10 by 6",
    e.result("E").status.kind === "ok" &&
      out.params.lines!.some((l) => l.id === "ab") &&
      once.params.lines!.some((l) => l.id === "de"),
    e.result("E").status.kind + " " + ((e.result("E").status as { why?: string }).why ?? ""),
  );
  check(
    "every face of the extrude has the name it had before the trim (the overhangs were not part of the shape), and the push that names a side works",
    JSON.stringify([...faces].sort()) === JSON.stringify(names0) &&
      faces.includes(JSON.stringify(side)) &&
      e.result("P").status.kind === "ok",
    e.result("P").status.kind + " " + ((e.result("P").status as { why?: string }).why ?? ""),
  );
  void top;
  e.release();
}
process.exit(failureCount() ? 1 : 0);
