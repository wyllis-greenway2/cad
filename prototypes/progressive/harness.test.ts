// Prototype (thrown away, `in_908`): the differential test for building a model in pieces (`q_progressive_load`).
// The claim to test: **a group of steps that no other step depends on and whose bodies touch no other group's can be built alone, and gives the very bodies, volumes, boxes and face names it gives in the whole model.**
// For each project: the whole model is built; its steps are grouped (by what they use and by where their bodies are); each group is built alone (the other steps taken out of the scene); the bodies are compared.
// Run (from app/): node --test ../prototypes/progressive/harness.test.ts      (PROJECTS=a,b to name fixtures)
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { kernel } from "../../app/src/compiler/kernel/index.ts";
import { clearKernelCaches } from "../../app/src/compiler/kernel/occt/interpreter.mjs";
import { openSession, scene } from "../../app/src/interaction/session.ts";
import { graphOf } from "../../app/src/compiler/compile.ts";
import type { Scene, Step } from "../../app/src/operation/scene.ts";
import { createSession, run } from "../../app/src/interaction/session.ts";
import type { Session } from "../../app/src/interaction/session.ts";
import { drawRectangle } from "../../app/src/operation/build.ts";
import { loopFaceRef } from "../../app/src/operation/loops.ts";
import { startOp } from "../../app/src/interaction/operations.ts";
import type { Op } from "../../app/src/interaction/operations.ts";
import { runOp } from "../../app/src/interaction/runop.ts";
import { worldRef } from "../../app/src/shared/ref.ts";
import { gearRefs } from "../../app/src/operation/gearscene.ts";

await kernel.init();
type Body = { id: string; min: number[]; max: number[]; volume: number };
type Built = { bodies: Body[]; names: string[]; errors: string[]; ms: number };
const build = (sc: Scene): Built => {
  clearKernelCaches(); // (nothing kept from another build is used: each is made from the scene alone)
  const t = performance.now();
  const g = { ...graphOf(sc), names: true } as never;
  const r = kernel.evaluate(g) as unknown as { bodies?: Body[] | null; faceNames?: { name: string }[]; ops: { error: string | null; id: string }[]; volume: number | null };
  return { bodies: (r.bodies ?? []).map((b) => ({ id: b.id, min: [...b.min], max: [...b.max], volume: b.volume })), names: (r.faceNames ?? []).map((f) => f.name).sort(), errors: r.ops.filter((o) => o.error).map((o) => `${o.id}: ${o.error}`), ms: performance.now() - t };
};
const MARGIN = 0.01;
const overlap = (a: Body, b: Body): boolean => [0, 1, 2].every((i) => a.min[i]! - MARGIN <= b.max[i]! && b.min[i]! - MARGIN <= a.max[i]!);
/** The steps that make a body of their own by their name: `x_<step>` or `x_<step>.k` (a pattern's copies). */
const ownedBy = (stepId: string, b: Body): boolean => b.id === `x_${stepId}` || b.id.startsWith(`x_${stepId}.`);
const STEP_BODY = new Set(["extrude", "pattern", "revolve", "loft", "sweep"]);

/** The groups of steps: those that make a body each, joined when their bodies touch or one uses the other's body; a step that makes no body of its own (it changes one) or any other kind of step makes everything one group. */
function groups(sc: Scene, whole: Built): { groups: string[][]; reason: string | null } {
  const steps = sc.steps;
  if (steps.some((s) => !STEP_BODY.has(s.type))) return { groups: [steps.map((s) => s.id)], reason: `a step of another kind (${[...new Set(steps.filter((s) => !STEP_BODY.has(s.type)).map((s) => s.type))].join(", ")})` };
  const bodiesOf = (s: Step) => whole.bodies.filter((b) => ownedBy(s.id, b));
  if (steps.some((s) => bodiesOf(s).length === 0)) return { groups: [steps.map((s) => s.id)], reason: "a step that makes no body of its own (it joins or cuts)" };
  const parent = new Map(steps.map((s) => [s.id, s.id]));
  const find = (x: string): string => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x)!)), parent.get(x)!));
  const union = (a: string, b: string) => parent.set(find(a), find(b));
  for (const a of steps) for (const b of steps) if (a.id < b.id && bodiesOf(a).some((x) => bodiesOf(b).some((y) => overlap(x, y)))) union(a.id, b.id);
  steps.forEach((s, k) => { // (a step that uses a body: the body it names, or, by `b/body/..`, any of the bodies there are so far)
    for (const r of [...s.parts, ...String(s.params.path ?? "").split(",")]) {
      if (!String(r).startsWith("b/")) continue;
      const m = /^b\/(x_[^./]+)/.exec(String(r));
      const owner = m ? steps.find((o) => `x_${o.id}` === m[1] || m[1]!.startsWith(`x_${o.id}`)) : null;
      if (owner) union(s.id, owner.id); else for (const o of steps.slice(0, k)) union(s.id, o.id);
    }
  });
  const by = new Map<string, string[]>();
  for (const s of steps) by.set(find(s.id), [...(by.get(find(s.id)) ?? []), s.id]);
  return { groups: [...by.values()], reason: by.size < 2 ? "its bodies all touch" : null };
}

const same = (a: number, b: number, rel = 1e-9): boolean => Math.abs(a - b) <= rel * Math.max(1, Math.abs(a), Math.abs(b));
const rows: string[] = [];
const verdict = { orders: 0, projects: 0, withGroups: 0, groupsBuilt: 0, bodiesCompared: 0, mismatches: [] as string[] };

function check(name: string, sc: Scene): void {
  const whole = build(sc);
  verdict.projects++;
  const g = groups(sc, whole);
  if (whole.errors.length) { rows.push(`${name.padEnd(46)} whole model has errors: ${whole.errors[0]!.slice(0, 60)}`); return; }
  if (g.groups.length < 2) { rows.push(`${name.padEnd(46)} ${whole.bodies.length} bodies, one group: ${g.reason}`); return; }
  verdict.withGroups++;
  let sumAlone = 0, worst = 0;
  for (const ids of g.groups) {
    const keep = new Set(ids);
    const alone = build({ ...sc, steps: sc.steps.filter((s) => keep.has(s.id)) });
    sumAlone += alone.ms; worst = Math.max(worst, alone.ms);
    verdict.groupsBuilt++;
    const mine = whole.bodies.filter((b) => ids.some((id) => ownedBy(id, b)));
    if (alone.errors.length) verdict.mismatches.push(`${name}: group ${ids.join("+")} built alone has errors: ${alone.errors[0]}`);
    if (alone.bodies.length !== mine.length) verdict.mismatches.push(`${name}: group ${ids.join("+")} built alone has ${alone.bodies.length} bodies, in the whole ${mine.length}`);
    for (const b of mine) {
      const o = alone.bodies.find((x) => x.id === b.id);
      verdict.bodiesCompared++;
      if (!o) { verdict.mismatches.push(`${name}: body ${b.id} is not in the group built alone`); continue; }
      if (!same(o.volume, b.volume)) verdict.mismatches.push(`${name}: body ${b.id} volume ${o.volume} alone, ${b.volume} in the whole`);
      for (let i = 0; i < 3; i++) if (Math.abs(o.min[i]! - b.min[i]!) > 1e-6 || Math.abs(o.max[i]! - b.max[i]!) > 1e-6) { verdict.mismatches.push(`${name}: body ${b.id} box differs`); break; }
    }
    const ownNames = (names: string[]): string[] => names.filter((n) => ids.some((id) => n.startsWith(`x_${id}:`)));
    const [a, w] = [ownNames(alone.names), ownNames(whole.names)];
    if (a.join("|") !== w.join("|")) verdict.mismatches.push(`${name}: the face names of ${ids.join("+")} differ (${a.length} alone, ${w.length} in the whole)`);
  }
  // the groups in other orders (steps of a group stay in their order): the same bodies, volumes, boxes and face names
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let k = 0; k < 3; k++) {
    const order = [...g.groups].sort(() => rnd() - 0.5);
    const byId = new Map(sc.steps.map((st) => [st.id, st]));
    const reordered = build({ ...sc, steps: order.flatMap((ids) => ids.map((id) => byId.get(id)!)) });
    verdict.orders++;
    const key = (b: Built) => JSON.stringify([b.bodies.map((x) => [x.id, Math.round(x.volume * 1e6), x.min.map((v) => Math.round(v * 1e4)), x.max.map((v) => Math.round(v * 1e4))]).sort(), b.names, b.errors]);
    if (key(reordered) !== key(whole)) verdict.mismatches.push(`${name}: the groups in the order ${order.map((o) => o[0]).join(" ")} give another model`);
  }
  rows.push(`${name.padEnd(46)} ${whole.bodies.length} bodies, ${g.groups.length} groups: whole ${Math.round(whole.ms)} ms, groups alone ${Math.round(sumAlone)} ms in all (the longest ${Math.round(worst)} ms)`);
}

test("fixtures: the bodies of a group built alone are the bodies of the whole model", () => {
  const dir = new URL("../../app/test/fixtures/", import.meta.url);
  const names = (process.env.PROJECTS ? process.env.PROJECTS.split(",").map((n) => `${n}.cad.json`) : readdirSync(dir).filter((n) => n.endsWith(".cad.json")));
  for (const f of names) {
    const r = openSession(kernel, readFileSync(new URL(f, dir), "utf8"));
    if (!r.ok) continue;
    try { check(f.replace(".cad.json", ""), scene(r.value)); } catch (e) { rows.push(`${f.padEnd(46)} threw ${String(e).slice(0, 60)}`); }
  }
  console.log(rows.join("\n"));
  console.log(`# SUMMARY ${verdict.projects} projects, ${verdict.withGroups} with two or more groups, ${verdict.groupsBuilt} groups built alone, ${verdict.bodiesCompared} bodies compared, ${verdict.mismatches.length} differences`);
  for (const m of verdict.mismatches.slice(0, 20)) console.log("# DIFF", m);
});

// ---------- assemblies made here: parts that are apart, parts that touch, parts of other kinds ----------
const push = (s: Session, face: string, depth: number): Session => runOp(s, { ...(startOp(scene(s), [face as never], "extrude") as { op: Op }).op, value: depth })!.session;
const box = (s: Session, x: number, y: number, w = 8, d = 5): Session => {
  const r = drawRectangle(scene(s), worldRef("XY"), [x, y, 0], [x + w, y + w, 0], [1, 0, 0], [0, 1, 0]);
  return push(run(s, r.command), loopFaceRef(r.lines), d);
};
const gear = (s: Session, id: string, x: number, y: number): Session => {
  const spec = { teeth: 20, module: 1 };
  const made = run(s, { type: "gear", id, plane: worldRef("XY"), at: [x, y, 0], spec });
  return push(made, loopFaceRef(gearRefs({ id, plane: worldRef("XY"), at: [x, y, 0], spec }).lines), 6);
};
const projects: Record<string, () => Session> = {
  "twelve boxes apart": () => { let s = createSession(kernel); for (let i = 0; i < 12; i++) s = box(s, (i % 4) * 20, Math.floor(i / 4) * 20, 8, 3 + i); return s; },
  "boxes, two of them touching": () => { let s = createSession(kernel); for (let i = 0; i < 5; i++) s = box(s, i * 20, 0); return box(s, 8, 0); }, // (the sixth stands against the first: face to face)
  "boxes, two of them overlapping": () => { let s = createSession(kernel); for (let i = 0; i < 5; i++) s = box(s, i * 20, 0); return box(s, 4, 2); },
  "boxes and gears apart": () => { let s = createSession(kernel); s = box(s, 0, 0); s = gear(s, "g_001", 40, 0); s = box(s, 0, 40); s = gear(s, "g_002", 40, 40); return box(s, 80, 0, 10, 12); },
  "gears meshing and a box apart": () => { let s = createSession(kernel); s = gear(s, "g_001", 0, 0); s = gear(s, "g_002", 21, 0); return box(s, 60, 0); },
};
test("assemblies: the bodies of a group built alone are the bodies of the whole model", () => {
  rows.length = 0; verdict.mismatches.length = 0;
  for (const [name, make] of Object.entries(projects)) { try { check(name, scene(make())); } catch (e) { rows.push(`${name.padEnd(46)} threw ${String(e).slice(0, 80)}`); } }
  console.log(rows.join("\n"));
  console.log(`# ASSEMBLIES ${verdict.groupsBuilt} groups built alone, ${verdict.orders} other orders, ${verdict.bodiesCompared} bodies compared, ${verdict.mismatches.length} differences`);
  for (const m of verdict.mismatches.slice(0, 20)) console.log("# DIFF", m);
});
