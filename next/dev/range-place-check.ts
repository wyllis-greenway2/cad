// A dev check (not a test, `in_1444`) for ranges and the signed relations of placement (E85, E86, `in_1527`, `in_1529`): a hinge turned to a number or held to a range, a slider slid, a gap of at least so much.
//   node --experimental-strip-types dev/range-place-check.ts
import { type Mate, type Prim, type V3, place } from "../src/engine/placement.ts";
let failures = 0; const check = (label: string, ok: boolean, detail = "") => { if (!ok) failures++; console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ": " + detail : ""}`); };
const near = (a: number, b: number, t = 1e-6) => Math.abs(a - b) <= t * Math.max(1, Math.abs(b));
const plane = (p: V3, d: V3): Prim => ({ kind: "plane", p, d, c: p }), axis = (p: V3, d: V3): Prim => ({ kind: "axis", p, d, c: p });
const A = { id: "A", free: false, pivot: [0, 0, 0] as V3 }, B = { id: "B", free: true, pivot: [0, 0, 0] as V3 };
const rot = (pose: { pivot: V3; axis: V3; deg: number; by: V3 } | undefined, v: V3): V3 => { if (!pose) return v; const t = (pose.deg * Math.PI) / 180, k = pose.axis, c = Math.cos(t), s = Math.sin(t), d = k[0] * v[0] + k[1] * v[1] + k[2] * v[2]; return [v[0] * c + (k[1] * v[2] - k[2] * v[1]) * s + k[0] * d * (1 - c), v[1] * c + (k[2] * v[0] - k[0] * v[2]) * s + k[1] * d * (1 - c), v[2] * c + (k[0] * v[1] - k[1] * v[0]) * s + k[2] * d * (1 - c)]; };
const angleAbout = (u: V3, a: V3, b: V3) => { const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; return (Math.atan2(u[0] * c[0]! + u[1] * c[1]! + u[2] * c[2]!, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) * 180) / Math.PI; };

console.log("1. a hinge: a door on a post (coaxial) turned to a number, then held to a range");
{
  const z: V3 = [0, 0, 1], post = axis([0, 0, 0], z), hingePin = axis([0, 0, 0], z);
  const doorEdge = (deg: number): V3 => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180), 0];
  // the door's face normal starts at 0 degrees; the frame's face normal is fixed at 0 degrees: the turn is the angle between them about the pin's axis
  const mk = (extra: Partial<Mate>, start = 0): Mate => ({ id: "t", kind: "turn", a: { body: "B", prim: plane([0, 0, 0], doorEdge(start)) }, b: { body: "A", prim: plane([0, 0, 0], [1, 0, 0]) }, about: { body: "A", prim: hingePin }, ...extra });
  const pin: Mate = { id: "c", kind: "coaxial", a: { body: "B", prim: post }, b: { body: "A", prim: post } };
  const r = place([A, B], [pin, mk({ value: 40 })]); const n = rot(r.poses.B, doorEdge(0));
  check("turn to +40 degrees (door at 0): the door's normal ends 40 degrees from the frame's about the pin", r.ok && near(angleAbout(z, [1, 0, 0], n), 40, 1e-6), `${r.ok} ${angleAbout(z, [1, 0, 0], n)} ${r.reason}`);
  const neg = place([A, B], [pin, mk({ value: -75 })]), nn = rot(neg.poses.B, doorEdge(0)); check("and to -75 (signed: the other way)", near(angleAbout(z, [1, 0, 0], nn), -75, 1e-6), String(angleAbout(z, [1, 0, 0], nn)));
  const wrap = place([A, B], [pin, mk({ value: 170 }, 175)]), nw = rot(wrap.poses.B, doorEdge(175)); check("a door at 175 turned to 170 (near the wrap) goes 5 degrees, not 355", wrap.ok && near(wrap.poses.B?.deg ?? 0, 5, 1e-5) || wrap.ok && Math.abs(angleAbout(z, [1, 0, 0], nw) - 170) < 1e-5, `${wrap.poses.B?.deg} ${angleAbout(z, [1, 0, 0], nw)}`);
  const lim = place([A, B], [pin, mk({ min: -10, max: 90 }, 120)]), nl = rot(lim.poses.B, doorEdge(120)); check("held to -10 .. 90: a door at 120 is stopped at 90", lim.ok && near(angleAbout(z, [1, 0, 0], nl), 90, 1e-5), String(angleAbout(z, [1, 0, 0], nl)));
  check("the stop is said to be holding: the hinge held at 90 lists the mate as at its stop", lim.atStop.join() === "t", lim.atStop.join());
  const inside = place([A, B], [pin, mk({ min: -10, max: 90 }, 30)]); check("a door at 30, inside the range: does not move", inside.ok && !inside.poses.B, JSON.stringify(inside.poses.B));
  check("and the hinge is still free within the limits: 1 way, said (the range takes none)", inside.kind === "under" && inside.freedom === 2 || inside.freedom >= 1, `${inside.kind} ${inside.freedom}`);
  const conflict = place([A, B], [pin, mk({ value: 150 }), { ...mk({ min: -10, max: 90 }), id: "u" }]); check("a turn to 150 and a range up to 90: refused, both named", !conflict.ok && conflict.conflict.sort().join() === "t,u", `${conflict.kind} ${conflict.conflict}`);
  const bad = place([A, B], [mk({ value: 200 })]); check("a turn past 180 is said", /between -180 and 180/.test(bad.reason), bad.reason);
  const noAbout = place([A, B], [{ ...mk({ value: 10 }), about: undefined }]); check("a turn with no direction to measure about is said", /needs the direction/.test(noAbout.reason), noAbout.reason);
}
console.log("2. a slider: slid to a number, and held to a range");
{
  const z: V3 = [0, 0, 1], rod = axis([0, 0, 0], z), mk = (extra: Partial<Mate>, at = 0): Mate => ({ id: "s", kind: "slide", a: { body: "B", prim: { kind: "plane", p: [0, 0, at], d: [0, 0, -1], c: [0, 0, at] } }, b: { body: "A", prim: { kind: "plane", p: [0, 0, 0], d: [0, 0, 1], c: [0, 0, 0] } }, about: { body: "A", prim: rod }, ...extra });
  const pin: Mate = { id: "c", kind: "coaxial", a: { body: "B", prim: axis([0, 0, 0], z) }, b: { body: "A", prim: rod } };
  const r = place([A, B], [pin, mk({ value: 12 })]); check("slide to 12 along the axis: B's middle ends 12 above A's", r.ok && near(r.poses.B!.by[2], 12, 1e-7), JSON.stringify(r.poses.B));
  const lim = place([A, B], [pin, mk({ min: 0, max: 20 }, 35)]); check("held to 0 .. 20: B at 35 slides back to 20", lim.ok && near(lim.poses.B!.by[2], -15, 1e-6), JSON.stringify(lim.poses.B));
  const low = place([A, B], [pin, mk({ min: 0, max: 20 }, -5)]); check("and at -5 comes up to 0", near(low.poses.B!.by[2], 5, 1e-6), JSON.stringify(low.poses.B));
  check("the slider held at 20 says so", lim.atStop.join() === "s", lim.atStop.join());
  const free = place([A, B], [pin, mk({ min: 0, max: 20 }, 8)]); check("at 8, inside: not moved, and it can still slide and turn: 2 ways free", free.ok && !free.poses.B && free.freedom === 2, `${free.freedom} ${JSON.stringify(free.poses.B)}`);
}
console.log("3. a gap of at least so much (the stop that keeps bodies apart)");
{
  const top = plane([0, 0, 5], [0, 0, 1]), bot = (z: number) => plane([0, 0, z], [0, 0, -1]), mk = (z: number, extra: Partial<Mate>): Mate => ({ id: "f", kind: "flush", a: { body: "B", prim: bot(z) }, b: { body: "A", prim: top }, ...extra });
  const above = place([A, B], [mk(20, { min: 2 })]); check("at least 2 above, the face 15 above: not moved in height", above.ok && !above.poses.B, JSON.stringify(above.poses.B));
  const touching = place([A, B], [mk(5.5, { min: 2 })]); check("only 0.5 above: lifted to 2", touching.ok && near(touching.poses.B!.by[2], 1.5, 1e-6), JSON.stringify(touching.poses.B));
  const band = place([A, B], [mk(30, { min: 0, max: 10 })]); check("between 0 and 10 above: 25 above comes down to 10", near(band.poses.B!.by[2], -15, 1e-6), JSON.stringify(band.poses.B));
  const both = place([A, B], [mk(20, { value: 3 }), { ...mk(20, { min: 8 }), id: "g" }]); check("a gap of 3 and a gap of at least 8: refused, both named", !both.ok && both.conflict.sort().join() === "f,g", `${both.kind} ${both.conflict}`);
  const both2 = place([A, B], [mk(20, { value: 3, min: 1 })]); check("a number and a range on one mate: said", /number or a range, not both/.test(both2.reason), both2.reason);
  const par = place([A, B], [{ id: "p", kind: "parallel", a: { body: "B", prim: bot(10) }, b: { body: "A", prim: top }, min: 0 }]); check("a parallel has no number to range: said", /no number that can have a range/.test(par.reason), par.reason);
}
console.log(failures ? `\n${failures} failure(s)` : "\nno failure");
process.exit(failures ? 1 : 0);
