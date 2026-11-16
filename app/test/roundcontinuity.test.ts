// Is a fillet or chamfer the same kind of shape on both sides of the size at which the kernel's own round gives way to the cut region (`in_476`, `in_477`, `dec_edits_saturate`)? Each case is a round step
// of a saved file taken as it was made (the steps after it are left off); the size is swept up and the volume of the body is read at each. A round of a bigger size on the same edges takes off (or, on
// a concave edge, adds) more, so the volume must change one way and without a jump: where the region takes over and the volume goes back, or jumps by many times the steps before it, the two ways of
// making a round do not agree.
//
// A case in `KNOWN` is a break found by this sweep that has not been fixed: it is run as a `todo` (it shows in the report and does not fail the run); when it is fixed it passes and must be taken out
// of the list. The cases that are not in it must pass.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, run } from "../src/interaction/session.ts";

await kernel.init();
const SIZES = Array.from({ length: 24 }, (_, k) => 0.5 + k * 0.5); // 0.5 to 12 mm
type Point = { size: number; volume: number; region: boolean };

/** The volume of the body after the round step `id` of the file, for each size, up to the first size the kernel gives up on (`ended`). */
function sweep(file: string, id: string): { points: Point[]; ended: string | null } {
  const d = JSON.parse(fs.readFileSync(new URL(`./fixtures/${file}`, import.meta.url), "utf8"));
  const flat = (c: { type: string; commands?: unknown[] }): { type: string; step?: { id: string } }[] => (c.type === "batch" ? (c.commands as never[]).flatMap(flat) : [c as never]);
  const at = d.commands.findIndex((c: never) => flat(c).some((x) => x.type === "addStep" && x.step?.id === id));
  assert.ok(at >= 0, `${file} has no step ${id}`);
  const opened = openSession(kernel as never, JSON.stringify({ ...d, cursor: at + 1 }));
  assert.ok(opened.ok);
  let s = opened.ok ? opened.value : (null as never);
  const points: Point[] = [];
  for (const size of SIZES) {
    s = run(s, { type: "setStepParams", id, params: { value: size } } as never);
    const k = s.outcome.kernel as unknown as { volume: number; ops: { id: string; error: string | null; note?: string }[] };
    const op = k.ops.find((o) => o.id === `x_${id}`);
    if (op?.error) return { points, ended: op.error };
    points.push({ size, volume: k.volume, region: !!op?.note });
    if (points.filter((p) => p.region).length >= 3) break; // (three sizes of the region are enough to see whether it joins on to the kernel's round: the rest takes time and shows nothing more)
  }
  return { points, ended: null };
}

/**
 * Where the volume as the size grows goes back, or jumps. `reversals`: a step that changes the volume the other way from the change before it by more than a thousandth of the volume; `jumps`: a step
 * that changes it by more than 2.5 times the step before it plus a thousandth of the volume (a round's effect grows smoothly with its size).
 */
export function breaks(points: Point[]): string[] {
  const out: string[] = [];
  if (points.length < 3) return out;
  const v0 = points[0]!.volume;
  const tol = 1e-3 * v0;
  const dv = points.slice(1).map((p, k) => p.volume - points[k]!.volume);
  const sign = Math.sign(dv.find((x) => Math.abs(x) > tol) ?? 0);
  dv.forEach((x, k) => {
    const [a, b] = [points[k]!, points[k + 1]!];
    const where = `${a.size} to ${b.size} mm (${a.volume.toFixed(1)} to ${b.volume.toFixed(1)} mm3)${b.region && !a.region ? ", where the cut region takes over" : ""}`;
    if (sign !== 0 && Math.sign(x) === -sign && Math.abs(x) > tol) out.push(`the volume goes back: ${where}`);
    else if (k > 0 && Math.abs(x) > 2.5 * Math.abs(dv[k - 1]!) + tol) out.push(`the volume jumps: ${where}`);
  });
  return out;
}

/** `slow`: found by the sweep, takes 8 to 10 seconds: run only with `ROUNDS_ALL=1`. */
const CASES: { file: string; step: string; known?: string; slow?: boolean }[] = [
  // rounds that are the same on both sides of the handover
  { file: "block-fillet-in_405.cad.json", step: "s_014" },
  { file: "chamfered-block-in_405.cad.json", step: "s_014" },
  { file: "channel-block.cad.json", step: "s_021" },
  { file: "face-edits.cad.json", step: "s_018" },
  { file: "face-shift-ears-in_474.cad.json", step: "s_022" },
  { file: "chamfer-continuation-in_476.cad.json", step: "s_020" }, // (`in_476`: was a break, fixed by ending the region at the end faces, `dec_chamfer_region_reach`)
  // breaks found by the sweep: the kernel's round gives way to the region and the volume goes back (a bigger round that leaves more of the body)
  { file: "cyl-fillet.cad.json", step: "s_007" }, // (was a break: the region rounded the one half of the rim the step names, the kernel the whole rim; `in_479`)
  { file: "stadium-body.cad.json", step: "s_020", known: "4 to 4.5 mm: 4981 to 5302 mm3" },
  { file: "hollow-pushed.cad.json", step: "s_022", slow: true, known: "8 to 8.5 mm: 3786 to 4421 mm3" },
  { file: "hollow-pushed.cad.json", step: "s_026", slow: true, known: "5.5 to 6 mm: 2219 to 2018 mm3" },
  { file: "thin-wall.cad.json", step: "s_020", slow: true, known: "7.5 to 8 mm: 16261 to 17065 mm3" },
  { file: "big-chamfer.cad.json", step: "s_036", slow: true, known: "7 to 7.5 mm: 8112 to 8646 mm3" },
];

for (const c of CASES) {
  if (c.slow && !process.env.ROUNDS_ALL) continue;
  const name = `${c.file} ${c.step}: the volume of the body follows the size of the round, with no jump where the cut region takes over`;
  test(name, c.known ? { todo: c.known } : {}, () => {
    const { points } = sweep(c.file, c.step);
    assert.ok(points.length >= 4, "the round could be made at some sizes");
    const found = breaks(points);
    assert.deepEqual(found, [], found.join("; "));
  });
}

test("the check itself: a smooth growth passes, a step back and a jump are found", () => {
  const mk = (vols: number[], regionFrom = 99): Point[] => vols.map((volume, i) => ({ size: (i + 1) * 0.5, volume, region: i >= regionFrom }));
  assert.deepEqual(breaks(mk([1000, 998, 994, 988, 980, 970])), [], "smooth");
  assert.equal(breaks(mk([1000, 998, 994, 988, 996, 990], 4)).length, 1, "a step back");
  assert.ok(breaks(mk([1000, 998, 994, 988, 960, 950])).some((m) => /jumps/.test(m)), "a jump");
  assert.match(breaks(mk([1000, 990, 980, 995, 985], 3)).join(), /where the cut region takes over/);
});
