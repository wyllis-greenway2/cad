// A dev check (not a test, `in_1444`) for ranges (E85, `in_1527`, `in_1529`): a constraint that measures a number may hold it to a range instead of a value.
//   node --experimental-strip-types dev/range-check.ts
import { moveDefinition } from "../src/engine/sketch.ts";
import { type Constraint, type System, residualsOf, solve, tryAdd } from "../src/engine/solver.ts";
let failures = 0; const check = (label: string, ok: boolean, detail = "") => { if (!ok) failures++; console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ": " + detail : ""}`); };
const near = (a: number, b: number, t = 1e-6) => Math.abs(a - b) <= t * Math.max(1, Math.abs(b));
const line = (len: number, cs: Constraint[], fixB = false): System => ({ points: [{ id: "A", x: 0, y: 0, fixed: true }, { id: "B", x: len, y: 0, fixed: fixB }], lines: [{ id: "l", a: "A", b: "B" }], circles: [], constraints: [{ id: "h", kind: "horizontal", parts: ["l"] }, ...cs] });
const L = (len: number, min?: number, max?: number) => solve(line(len, [{ id: "r", kind: "length", parts: ["l"], ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) }]));

console.log("1. a length between 5 and 10");
{
  check("longer than the most: held to 10", near(L(12, 5, 10).solution.points.B![0], 10, 1e-7), String(L(12, 5, 10).solution.points.B));
  check("shorter than the least: held to 5", near(L(2, 5, 10).solution.points.B![0], 5, 1e-7));
  const inside = L(7, 5, 10); check("inside the range: not moved at all (the nearest answer is where it is)", inside.verdict.ok && inside.solution.points.B![0] === 7, String(inside.solution.points.B));
  check("it takes no freedom: B can still move along the line within the range (1 way left), and the verdict is under", inside.verdict.kind === "under" && inside.verdict.freedom === 1, `${inside.verdict.kind} ${inside.verdict.freedom}`);
  check("a range holding the answer at its end says so (the stop is lit): at 12 with most 10 the range is at its stop; at 7 inside it is not", L(12, 5, 10).verdict.atStop.join() === "r" && L(7, 5, 10).verdict.atStop.length === 0, `${L(12, 5, 10).verdict.atStop} | ${L(7, 5, 10).verdict.atStop}`);
  check("one-sided: at least 5 (no most)", near(L(2, 5, undefined).solution.points.B![0], 5, 1e-7) && L(40, 5, undefined).solution.points.B![0] === 40);
  check("one-sided: at most 10 (no least)", near(L(12, undefined, 10).solution.points.B![0], 10, 1e-7) && L(3, undefined, 10).solution.points.B![0] === 3);
  check("the same two ends are a value: min = max = 8 is length 8, and the verdict is solved", near(L(12, 8, 8).solution.points.B![0], 8, 1e-7) && L(12, 8, 8).verdict.kind === "solved", L(12, 8, 8).verdict.kind);
  check("residualsOf: zero inside, the distance past the end outside", residualsOf(line(7, []), { id: "r", kind: "length", parts: ["l"], min: 5, max: 10 })[0] === 0 && near(residualsOf(line(12, []), { id: "r", kind: "length", parts: ["l"], min: 5, max: 10 })[0]!, 2) && near(residualsOf(line(3, []), { id: "r", kind: "length", parts: ["l"], min: 5, max: 10 })[0]!, -2));
}
console.log("2. a drag is stopped at the end of the range, and it says by how much");
{
  const S = line(7, [{ id: "r", kind: "length", parts: ["l"], min: 5, max: 10 }]);
  const free = solve(S, { pins: { B: [9, 0] } }); check("dragged to 9 (inside): goes there", near(free.solution.points.B![0], 9, 1e-6) && Object.keys(free.unreached).length === 0, String(free.solution.points.B));
  const past = solve(S, { pins: { B: [14, 0] } }); check("dragged to 14: stops at 10, and the pin is not reached by 4", near(past.solution.points.B![0], 10, 1e-5) && near(past.unreached.B ?? 0, 4, 1e-3), `${past.solution.points.B} ${JSON.stringify(past.unreached)} holds ${past.holds}`);
  check("what holds it back is the range, named", past.holds.includes("r"), past.holds.join());
}
console.log("3. conflicts: a range that cannot hold with the rest, and a range with nothing in it");
{
  const c = solve(line(7, [{ id: "r", kind: "length", parts: ["l"], min: 5, max: 10 }, { id: "f", kind: "length", parts: ["l"], value: 3 }]));
  check("a length of 3 and a length of at least 5: refused, both named", !c.verdict.ok && c.verdict.conflict.sort().join() === "f,r", `${c.verdict.kind} ${c.verdict.conflict}`);
  const e = solve(line(7, [{ id: "r", kind: "length", parts: ["l"], min: 10, max: 5 }])); check("a range with the least above the most is refused in words", !e.verdict.ok && /least \(10\) is above the most \(5\)/.test(e.verdict.reason), e.verdict.reason);
  const k = solve({ points: [{ id: "A", x: 0, y: 0 }, { id: "B", x: 1, y: 1 }], lines: [], circles: [], constraints: [{ id: "c", kind: "coincident", parts: ["A", "B"], min: 1, max: 2 }] }); check("a constraint that measures no number has no range: said", !k.verdict.ok && /measures no number/.test(k.verdict.reason), k.verdict.reason);
  const a = tryAdd(line(7, [{ id: "h2", kind: "length", parts: ["l"], value: 7 }]), { id: "r", kind: "length", parts: ["l"], min: 9, max: 12 }); check("tryAdd of a range that cannot hold with a value: refused, the value is among those that hold it", a.outcome === "refused" && a.holding.includes("h2"), `${a.outcome} ${a.victims} holding ${a.holding}`);
  const b = tryAdd(line(7, []), { id: "r", kind: "length", parts: ["l"], min: 5, max: 10 }); check("tryAdd of a range that already holds: added (it takes nothing away)", b.outcome === "added" && b.verdict.ok, b.outcome);
}
console.log("4. the other numbers: radius, distance, a horizontal distance, an angle");
{
  const c: System = { points: [{ id: "O", x: 0, y: 0, fixed: true }, { id: "P", x: 3, y: 0 }], lines: [], circles: [{ id: "k", c: "O", r: 4 }], constraints: [{ id: "rr", kind: "radius", parts: ["k"], min: 1, max: 3 }] };
  check("a radius of 4 held to at most 3", near(solve(c).solution.circles.k!, 3, 1e-7));
  const d = solve({ ...c, circles: [], constraints: [{ id: "dd", kind: "distance", parts: ["O", "P"], min: 5 }] }); check("a distance of at least 5 from a point 3 away: goes to 5", near(Math.hypot(...d.solution.points.P!), 5, 1e-6), String(d.solution.points.P));
  const h = solve({ ...c, circles: [], constraints: [{ id: "hd", kind: "horizontalDistance", parts: ["O", "P"], min: -2, max: 2 }] }); check("a horizontal distance between -2 and 2 from 3: goes to 2", near(h.solution.points.P![0], 2, 1e-6), String(h.solution.points.P));
  const ang = (deg: number): System => ({ points: [{ id: "A", x: 0, y: 0, fixed: true }, { id: "B", x: 10, y: 0, fixed: true }, { id: "C", x: 0, y: 0, fixed: true }, { id: "D", x: 10 * Math.cos((deg * Math.PI) / 180), y: 10 * Math.sin((deg * Math.PI) / 180) }], lines: [{ id: "u", a: "A", b: "B" }, { id: "w", a: "C", b: "D" }], circles: [], constraints: [{ id: "an", kind: "angle", parts: ["u", "w"], min: -30, max: 30 }] });
  const a1 = solve(ang(50)), D = a1.solution.points.D!, th = (Math.atan2(D[1], D[0]) * 180) / Math.PI; check("an angle held between -30 and 30: a line at 50 degrees comes to 30", a1.verdict.ok && near(th, 30, 1e-5), th.toFixed(4));
  const a2 = solve(ang(-50)), D2 = a2.solution.points.D!; check("and one at -50 to -30 (a signed angle)", near((Math.atan2(D2[1], D2[0]) * 180) / Math.PI, -30, 1e-5), String(D2));
  const a3 = solve(ang(10)); check("inside: not moved", near(Math.atan2(a3.solution.points.D![1], a3.solution.points.D![0]) * 180 / Math.PI, 10, 1e-9));
}
console.log("5. random: a length held to a random range ends inside it, at the nearest end when it started outside");
{
  let seed = 3; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296; let bad = 0, n = 0;
  for (let k = 0; k < 200; k++) {
    const lo = 1 + rnd() * 8, hi = lo + rnd() * 6, len = 0.5 + rnd() * 20, r = solve(line(len, [{ id: "r", kind: "length", parts: ["l"], min: lo, max: hi }])); n++;
    const got = r.solution.points.B![0], want = len < lo ? lo : len > hi ? hi : len;
    if (!r.verdict.ok || Math.abs(got - want) > 1e-6) bad++;
  }
  check(`${n} random ranges: the end lands at the nearest point of the range`, bad === 0, `${bad} wrong`);
}
console.log("6. a copy of a sketch carries the range, flipped when the copy is mirrored")
{
  const params = { points: [{ id: "A", x: 0, y: 0 }, { id: "B", x: 3, y: 0 }], lines: [{ id: "l", a: "A", b: "B" }], constraints: [{ id: "hd", kind: "horizontalDistance", parts: ["A", "B"], min: 2, max: 5 }, { id: "len", kind: "length", parts: ["l"], max: 9 }] };
  const m = moveDefinition(params as never, { mirror: 90 }).params.constraints!, hd = m.find((c) => c.id === "hd")!, len = m.find((c) => c.id === "len")!;
  check("mirrored left to right: the distance from 2..5 is -5..-2", hd.min === -5 && hd.max === -2 && hd.value === undefined, JSON.stringify(hd));
  check("a length keeps its range as it was", len.max === 9 && len.min === undefined, JSON.stringify(len));
  const turned = moveDefinition(params as never, { deg: 0, by: [4, 4] }).params.constraints!.find((c) => c.id === "hd")!; check("moved without a flip: the range is as it was", turned.min === 2 && turned.max === 5);
}
console.log(failures ? `\n${failures} failure(s)` : "\nno failure");
process.exit(failures ? 1 : 0);
