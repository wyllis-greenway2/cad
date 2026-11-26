// A dev stress run (not a test, `in_1444`, `in_1557`) for sketches with arcs, through the sketch step, as a person builds one: points, lines and arcs are drawn, constraints are added one at a time (one that the sketch refuses is taken out again),
// numbers are edited, and at the end the drawing is extruded. The promises:
//   1. nothing throws; a sketch that is refused says why, and the constraints that hold it back are named from the ones there
//   2. a sketch the step accepts: an edit equals a fresh build, and building twice gives the same answer
//   3. what the drawing says it fills (the areas of its regions) is the volume of the extrude over the depth, to a hundred-thousandth
//   4. an extrude of a drawing that fills nothing is refused in words, not a body of nothing
//   node --experimental-strip-types dev/stress-arcs.ts [sessions] [seed]
import { initKernel } from "../src/engine/kernel.ts";
import * as K from "../src/engine/kernel.ts";
import { Engine } from "../src/engine/engine.ts";
import { Body } from "../src/engine/lineage.ts";
import { RELATIONS, type Relation } from "../src/engine/solver.ts";
import type { Sketch, Step } from "../src/engine/steps.ts";
import { same } from "./lib.ts";
import { writeFileSync } from "node:fs";
await initKernel();
const N = Number(process.argv[2] ?? 60),
  SEED = Number(process.argv[3] ?? 1);
let seed = SEED;
const rnd = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
const problems: string[] = [],
  tally: Record<string, number> = {};
const bump = (k: string) => {
  tally[k] = (tally[k] ?? 0) + 1;
};
const KINDS: Relation[] = [
  "horizontal",
  "vertical",
  "parallel",
  "perpendicular",
  "equalLength",
  "equalRadius",
  "concentric",
  "tangent",
  "tangentCircles",
  "pointOnLine",
  "pointOnCircle",
  "midpoint",
  "coincident",
  "length",
  "radius",
  "distance",
  "angle",
  "horizontalDistance",
  "verticalDistance",
];
const DIMS = new Set<Relation>(["length", "radius", "distance", "angle", "horizontalDistance", "verticalDistance"]);
const st = (e: Engine, id: string) => e.result(id).status as { kind: string; why?: string; victims?: string[] };

function session(s: number): void {
  seed = (SEED * 7919 + s * 104729) | 0;
  const tag = `session ${s} (seed ${SEED})`;
  let dumped = false,
    params: Record<string, any> = {};
  const fail = (what: string) => {
    problems.push(`${tag}: ${what}`);
    if (!dumped) {
      dumped = true;
      writeFileSync(`/tmp/arcs-${SEED}-${s}.json`, JSON.stringify(params));
    }
  };
  const nP = 5 + Math.floor(rnd() * 3),
    points = Array.from({ length: nP }, (_x, i) => ({
      id: `P${i}`,
      x: Math.round(rnd() * 300) / 10,
      y: Math.round(rnd() * 300) / 10,
    }));
  const lines: any[] = [],
    arcs: any[] = [],
    pairs = new Set<string>();
  for (let i = 0; i < 3 + Math.floor(rnd() * 3); i++) {
    const a = Math.floor(rnd() * nP),
      b = (a + 1 + Math.floor(rnd() * (nP - 1))) % nP,
      key = [a, b].sort().join("-");
    if (!pairs.has(key)) {
      pairs.add(key);
      lines.push({ id: `L${lines.length}`, a: `P${a}`, b: `P${b}` });
    }
  }
  for (let i = 0; i < 1 + Math.floor(rnd() * 2); i++) {
    const idx = [0, 1, 2, 3, 4, 5, 6]
      .slice(0, nP)
      .sort(() => rnd() - 0.5)
      .slice(0, 3);
    arcs.push({ id: `A${i}`, c: `P${idx[0]}`, a: `P${idx[1]}`, b: `P${idx[2]}`, ...(rnd() < 0.3 ? { cw: true } : {}) });
  }
  params = { points, lines, arcs, constraints: [] as any[] };
  const e = new Engine([{ id: "s", kind: "sketch", params, inputs: [] }]);
  let n = 0;
  try {
    e.build();
    if (st(e, "s").kind !== "ok") {
      bump("start refused");
      bump("  why: " + (st(e, "s").why ?? "").replace(/[-\d.]+/g, "#").slice(0, 70));
      e.release();
      return;
    }
    for (let step = 0; step < 9; step++) {
      const kind = pick(KINDS),
        row = RELATIONS[kind],
        parts: string[] = [];
      const pool = (k: string) => (k === "point" ? points : k === "line" ? lines : [...arcs]);
      if (kind === "horizontal" || kind === "vertical") {
        if (rnd() < 0.6) parts.push(pick(lines).id);
        else parts.push(pick(points).id, pick(points).id);
      } else
        for (let i = 0; i < row.arity; i++) {
          const k = pick(row.parts[i]!),
            p = pool(k);
          if (!p.length) break;
          parts.push(pick(p).id);
        }
      if (
        parts.length < (kind === "horizontal" || kind === "vertical" ? 1 : row.arity) ||
        new Set(parts).size !== parts.length
      )
        continue;
      const c: any = { id: `c${n++}`, kind, parts };
      if (DIMS.has(kind))
        c.value = kind === "angle" ? pick([30, 45, 60, 90, 120]) : Math.round((2 + rnd() * 14) * 10) / 10;
      const next = { ...params, constraints: [...params.constraints, c] };
      try {
        e.edit("s", next);
      } catch (x) {
        fail(`adding ${kind} THREW ${(x as Error).message.slice(0, 120)}`);
        e.release();
        return;
      }
      const r = st(e, "s");
      if (r.kind === "ok") {
        params = next;
        bump("accepted");
      } else {
        bump("refused");
        if (!r.why) fail(`${kind} ${c.id} refused with no words`);
        else if (
          r.kind === "flagged" &&
          (r.victims?.length ?? 0) &&
          !r.victims!.every(
            (v) =>
              v === c.id ||
              (/^[A-Za-z0-9]+(\.(start|end))?$/.test(v) && arcs.some((a) => a.id === v.split(".")[0])) ||
              params.constraints.some((q: any) => q.id === v),
          )
        )
          fail(`${kind} ${c.id}: the refusal names constraints that are not there: ${r.victims!.join(",")}`);
        e.edit("s", params);
        if (st(e, "s").kind !== "ok") {
          fail(`the sketch was not ok again after taking ${c.id} out: ${st(e, "s").why}`);
          e.release();
          return;
        }
      }
    }
    // 2. a number edited, and a fresh build
    const dims = params.constraints.filter((c: any) => DIMS.has(c.kind));
    if (dims.length) {
      const d = pick(dims),
        edited = {
          ...params,
          constraints: params.constraints.map((c: any) =>
            c.id === d.id ? { ...c, value: c.value * pick([0.7, 1.3]) } : c,
          ),
        };
      e.edit("s", edited);
      const f = new Engine([{ id: "s", kind: "sketch", params: edited, inputs: [] }]);
      f.build();
      if (
        st(e, "s").kind !== st(f, "s").kind ||
        (st(e, "s").kind === "ok" && !same(e.result("s").fingerprint, f.result("s").fingerprint))
      )
        fail(`after editing ${d.id} the live sketch differs from a fresh build`);
      f.release();
      e.edit("s", params);
    }
    const again = new Engine([{ id: "s", kind: "sketch", params, inputs: [] }]);
    again.build();
    if (!same(e.result("s").fingerprint, again.result("s").fingerprint))
      fail("building the same sketch twice gave different answers");
    again.release();
    // 3, 4. extrude
    e.insert({ id: "E", kind: "extrude", params: { d: 4 }, inputs: ["s"] } as Step);
    const x = st(e, "E"),
      sk = e.result("s").value as Sketch;
    const filled = (sk.regions ?? []).filter((q) => q.filled).reduce((a, q) => a + q.area, 0);
    if (x.kind === "ok") {
      bump("extruded");
      const b = e.result("E").value as Body,
        v = K.volume(b.solid);
      if (!K.valid(b.solid)) fail("an extrude is not a valid solid");
      if (!(sk.regions && sk.regions.length)) bump("extruded without regions listed");
      else if (Math.abs(v - filled * 4) > 1e-5 * Math.max(1, v))
        fail(`the extrude holds ${v.toFixed(4)} but the drawing says it fills ${(filled * 4).toFixed(4)}`);
    } else {
      bump("extrude refused");
      if (!x.why) fail("an extrude was refused with no words");
    }
    e.release();
  } catch (x) {
    fail(`THREW ${(x as Error).stack?.split("\n").slice(0, 3).join(" | ").slice(0, 260)}`);
    try {
      e.release();
    } catch {
      /* released */
    }
  }
}
const t0 = Date.now();
for (let s = 0; s < N; s++) session(s);
console.log(`${N} sessions, ${((Date.now() - t0) / 1000).toFixed(1)} s:`, JSON.stringify(tally));
console.log(
  problems.length
    ? `${problems.length} PROBLEMS:\n` + problems.slice(0, 30).join("\n")
    : "no problems in the arcs' promises",
);
process.exit(problems.length ? 1 : 0);
