// Prototype (thrown away, `in_995`): the differential test for building a model in pieces (`q_progressive_load`).
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

// ---------- v2 (`in_999`): parts with modifying steps (fillets, holes, moves): which body does a step change, and do the groups still build alone? ----------
import { opCommand } from "../../app/src/interaction/operations.ts";
import { drawCircle } from "../../app/src/operation/build.ts";

const creatorOf = (bodyId: string): string => bodyId.replace(/^x_/, "").replace(/\..*$/, "");
/** The bodies a step changes, by taking the step out and looking at what differs (the truth the page's rule has to cover). */
function affectedBy(sc: Scene, whole: Built, stepId: string): { bodies: Set<string>; breaks: boolean } {
  const without = build({ ...sc, steps: sc.steps.filter((s) => s.id !== stepId) });
  if (without.errors.length) return { bodies: new Set(whole.bodies.map((b) => b.id)), breaks: true };
  const out = new Set<string>();
  const ids = new Set([...whole.bodies.map((b) => b.id), ...without.bodies.map((b) => b.id)]);
  for (const id of ids) {
    const a = whole.bodies.find((b) => b.id === id), b = without.bodies.find((x) => x.id === id);
    if (!a || !b || !same(a.volume, b.volume) || [0, 1, 2].some((i) => Math.abs(a.min[i]! - b.min[i]!) > 1e-6 || Math.abs(a.max[i]! - b.max[i]!) > 1e-6)) out.add(id);
  }
  return { bodies: out, breaks: false };
}
const MODIFIER = new Set(["edgeMod", "pushPull", "move", "rotate", "scale", "hollow", "reshape", "delete"]);

/** The page's rule for what a step changes, from what it names (no kernel): bodies by name; a place (`e@x,y,z~..` an edge's points, `f@nx,ny,nz,d` with `px,py,pz`) by the bodies whose boxes hold it; anything else: every body before it. Returns the creators to group it with, or "all". */
function ruleAffects(sc: Scene, whole: Built, st: Step): Set<string> | "all" {
  const r0 = ruleAffects0(sc, whole, st);
  if (r0 === "all") return r0;
  // bodies tied together by a relation (a mate holds a part of one body to a part of another): a change to one moves the other
  const bound = new Map<string, Set<string>>();
  const sketchOwner = new Map<string, string>(); // (a drawing is one step's: the elements share a prefix, `d/e_003.s0`)
  for (const step of sc.steps) for (const part of [...step.parts, ...String(step.params.holes ?? "").split(/[,;]/), ...String(step.params.also ?? "").split(/[,|>;]/)]) { const k = /^(d\/[^.]+)\./.exec(String(part)); if (k) sketchOwner.set(k[1]!, step.id); }
  for (const rel of sc.relations) {
    const cs = new Set<string>();
    for (const part of rel.parts) {
      const m = /^b\/(x_[^/]+)\//.exec(String(part)); if (m) cs.add(creatorOf(m[1]!));
      const k = /^(d\/[^.]+)\./.exec(String(part)); const o = k && sketchOwner.get(k[1]!); if (o) cs.add(o);
    }
    if (cs.size > 1) for (const c of cs) bound.set(c, new Set([...(bound.get(c) ?? []), ...cs]));
  }
  // hard bodies stop each other when moved (`dec_hard_bodies`): one thing
  const hard = (sc.hard ?? []).map((h) => creatorOf(String(h)));
  for (const c of hard) bound.set(c, new Set([...(bound.get(c) ?? []), ...hard]));
  // bodies whose boxes meet are one thing (they are built together: a move of one may push the other); a body that is moved is taken at where it began and where it ends, and the box round both (a straight move stays inside it)
  const initial = build({ ...sc, steps: sc.steps.filter((x) => !["move", "rotate", "scale"].includes(x.type)) });
  const swept = whole.bodies.map((b) => { const i = initial.bodies.find((x) => x.id === b.id); return i ? { ...b, min: b.min.map((v, k) => Math.min(v, i.min[k]!)), max: b.max.map((v, k) => Math.max(v, i.max[k]!)) } : b; });
  for (const a of swept) for (const b of swept) if (a.id < b.id && overlap(a, b)) { const [ca, cb] = [creatorOf(a.id), creatorOf(b.id)]; bound.set(ca, new Set([...(bound.get(ca) ?? []), ca, cb])); bound.set(cb, new Set([...(bound.get(cb) ?? []), ca, cb])); }
  const out = new Set(r0);
  for (let changed = true; changed;) { changed = false; for (const c of [...out]) for (const o of bound.get(c) ?? []) if (!out.has(o)) { out.add(o); changed = true; } }
  return out;
}
function ruleAffects0(sc: Scene, whole: Built, st: Step): Set<string> | "all" {
  const out = new Set<string>();
  const refs = [...st.parts.map(String), ...(typeof st.params.body === "string" ? [`b/${st.params.body}/o`] : [])];
  if (refs.length === 0) return "all";
  for (const r of refs) {
    const named = /^b\/(x_[^/]+)\//.exec(r);
    if (named) { out.add(creatorOf(named[1]!)); continue; }
    const pts: number[][] = [];
    const e = /^b\/body\/e@(.+)$/.exec(r);
    if (e) for (const q of e[1]!.split("~")) { const v = q.split(",").map(Number); if (v.length === 3 && v.every(Number.isFinite)) pts.push(v); }
    const f = /^b\/body\/f@/.exec(r);
    if (f && ["px", "py", "pz"].every((k) => Number.isFinite(Number(st.params[k])))) pts.push([Number(st.params.px), Number(st.params.py), Number(st.params.pz)]);
    if (!pts.length) return "all";
    for (const p of pts) {
      const holders = whole.bodies.filter((b) => [0, 1, 2].every((i) => p[i]! >= b.min[i]! - 0.5 && p[i]! <= b.max[i]! + 0.5));
      if (!holders.length) return "all";
      for (const b of holders) out.add(creatorOf(b.id));
    }
  }
  return out;
}
const rule = { steps: 0, covered: 0, all: 0, missed: [] as string[] };

function checkV2(name: string, sc: Scene): void {
  const whole = build(sc);
  if (whole.errors.length) { rows.push(`${name.padEnd(46)} whole model has errors: ${whole.errors[0]!.slice(0, 60)}`); return; }
  // which step makes which body: by name; which step changes which body: by taking it out
  const parent = new Map(sc.steps.map((s) => [s.id, s.id]));
  const find = (x: string): string => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x)!)), parent.get(x)!));
  const union = (a: string, b: string) => { if (parent.has(a) && parent.has(b)) parent.set(find(a), find(b)); };
  const facts: string[] = [];
  sc.steps.forEach((st, k) => { // (what a step names: a body by its name (`params.body`, `b/x_..`), or any body so far by `b/body/..`)
    const refs = [...st.parts.map(String), ...(typeof st.params.body === "string" ? [`b/${st.params.body}/o`] : [])];
    for (const r of refs) {
      const m = /^b\/(x_[^/]+)\//.exec(r);
      if (m) union(st.id, creatorOf(m[1]!)); else if (r.startsWith("b/body/")) for (const o of sc.steps.slice(0, k)) union(st.id, o.id);
    }
  });
  for (const st of sc.steps) {
    const own = whole.bodies.filter((b) => ownedBy(st.id, b));
    if (own.length === 0 || MODIFIER.has(st.type)) {
      const t = affectedBy(sc, whole, st.id);
      facts.push(`${st.type}:${[...t.bodies].map((b) => creatorOf(b)).filter((v, i, a) => a.indexOf(v) === i).length}${t.breaks ? "*" : ""}`);
      if (MODIFIER.has(st.type) && !t.breaks) { // (does the page's rule cover what the step really changes?)
        const r = ruleAffects(sc, whole, st);
        rule.steps++;
        if (r === "all") rule.all++;
        else { const truth = new Set([...t.bodies].map(creatorOf)); if ([...truth].every((c) => r.has(c) || c === st.id)) rule.covered++; else rule.missed.push(`${name}: ${st.type} ${st.id} changes ${[...truth].join(",")}, the rule says ${[...r].join(",")}`); }
      }
      for (const id of t.bodies) union(st.id, creatorOf(id));
    }
  }
  for (const a of whole.bodies) for (const b of whole.bodies) if (a.id < b.id && overlap(a, b)) union(creatorOf(a.id), creatorOf(b.id)); // (bodies that touch)
  const by = new Map<string, string[]>();
  for (const st of sc.steps) by.set(find(st.id), [...(by.get(find(st.id)) ?? []), st.id]);
  const grouped = [...by.values()];
  if (grouped.length < 2) { rows.push(`${name.padEnd(46)} ${whole.bodies.length} bodies, one group (${facts.join(" ")})`); return; }
  let bad = 0;
  for (const ids of grouped) {
    const keep = new Set(ids);
    const alone = build({ ...sc, steps: sc.steps.filter((s) => keep.has(s.id)) });
    verdict.groupsBuilt++;
    const mine = whole.bodies.filter((b) => keep.has(creatorOf(b.id)));
    if (alone.errors.length || alone.bodies.length !== mine.length) { verdict.mismatches.push(`${name}: group ${ids.join("+")} built alone: ${alone.errors[0] ?? `${alone.bodies.length} bodies, in the whole ${mine.length}`}`); bad++; continue; }
    for (const b of mine) {
      verdict.bodiesCompared++;
      const o = alone.bodies.find((x) => x.id === b.id);
      if (!o || !same(o.volume, b.volume) || [0, 1, 2].some((i) => Math.abs(o.min[i]! - b.min[i]!) > 1e-6 || Math.abs(o.max[i]! - b.max[i]!) > 1e-6)) { verdict.mismatches.push(`${name}: body ${b.id} differs when its group is built alone`); bad++; }
    }
    const own = (names: string[]): string => names.filter((n) => ids.some((id) => n.startsWith(`x_${id}:`))).join("|");
    if (own(alone.names) !== own(whole.names)) { verdict.mismatches.push(`${name}: face names of ${ids.join("+")} differ`); bad++; }
  }
  let seed = 777;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let k = 0; k < 3; k++) {
    const order = [...grouped].sort(() => rnd() - 0.5);
    const byId = new Map(sc.steps.map((st) => [st.id, st]));
    const re = build({ ...sc, steps: order.flatMap((ids) => ids.map((id) => byId.get(id)!)) });
    verdict.orders++;
    const key = (b: Built) => JSON.stringify([b.bodies.map((x) => [x.id, Math.round(x.volume * 1e6), x.min.map((v) => Math.round(v * 1e4)), x.max.map((v) => Math.round(v * 1e4))]).sort(), b.names, b.errors]);
    if (key(re) !== key(whole)) { verdict.mismatches.push(`${name}: groups in another order give another model`); bad++; }
  }
  rows.push(`${name.padEnd(46)} ${whole.bodies.length} bodies, ${grouped.length} groups (${facts.join(" ")}): ${bad ? bad + " DIFFERENCES" : "alone and in other orders: the same"}`);
}

const topEdges = (s: Session, x: number, y: number, w: number, d: number) => Object.values(scene(s).parts).filter((p) => p.kind === "line" && p.origin === "body" && !(p as { mid?: unknown }).mid && (() => { const a = scene(s).parts[(p as { a: string }).a], b = scene(s).parts[(p as { b: string }).b]; return a?.kind === "corner" && b?.kind === "corner" && Math.abs(a.at[2] - d) < 1e-6 && Math.abs(b.at[2] - d) < 1e-6 && a.at[0] >= x - 1e-6 && a.at[0] <= x + w + 1e-6 && a.at[1] >= y - 1e-6 && a.at[1] <= y + w + 1e-6; })()).map((p) => p.ref);
const fillet = (s: Session, x: number, y: number, w = 8, d = 5): Session => {
  const edges = topEdges(s, x, y, w, d);
  const st = startOp(scene(s), edges as never, "edge");
  if (!st.ok) throw new Error("no fillet: " + st.why);
  return run(s, opCommand(scene(s), { ...(st as { op: Op }).op, value: 1 })!);
};
const hole = (s: Session, id: string, x: number, y: number, w = 8): Session => {
  const c = drawCircle(scene(s), worldRef("XY"), [x + w / 2, y + w / 2, 0], 1.5);
  return run(run(s, c.command), { type: "addStep", step: { id, type: "extrude", parts: [c.circle], params: { depth: 20, cut: "1" } } });
};
const bodyRef = (s: Session, creator: string): string => Object.values(scene(s).parts).find((p) => p.kind === "body" && (p.ref.startsWith(`b/x_${creator}/`) || (p as { id?: string }).id === `x_${creator}`))!.ref;
const slide = (s: Session, creator: string, by: number): Session => {
  const st = startOp(scene(s), [bodyRef(s, creator)] as never, "move");
  if (!st.ok) throw new Error("no move: " + st.why);
  return run(s, opCommand(scene(s), { ...(st as { op: Op }).op, value: by })!);
};
const lastStep = (s: Session): string => scene(s).steps.at(-1)!.id;
const projectsV2: Record<string, () => Session> = {
  "six boxes apart, each with its top rounded": () => { let s = createSession(kernel); for (let i = 0; i < 6; i++) { s = box(s, i * 20, 0); s = fillet(s, i * 20, 0); } return s; },
  "boxes apart: rounded, with a hole, plain": () => { let s = createSession(kernel); s = box(s, 0, 0); s = fillet(s, 0, 0); s = box(s, 20, 0); s = hole(s, "s_901", 20, 0); s = box(s, 40, 0); s = box(s, 60, 0); s = fillet(s, 60, 0); return box(s, 80, 0); },
  "boxes apart, one slid along the row": () => { let s = createSession(kernel); s = box(s, 0, 0); s = box(s, 20, 0); s = box(s, 40, 0); return slide(s, lastStep(s) === "" ? "" : scene(s).steps.filter((x) => x.type === "extrude")[1]!.id, 5); },
  "boxes, one slid onto its neighbour": () => { let s = createSession(kernel); s = box(s, 0, 0); s = box(s, 20, 0); s = box(s, 40, 0); return slide(s, scene(s).steps.filter((x) => x.type === "extrude")[1]!.id, -14); },
};
test("assemblies with modifying steps: the groups the changes say are built alone, and in other orders, to the same bodies", () => {
  rows.length = 0; verdict.mismatches.length = 0;
  for (const [name, make] of Object.entries(projectsV2)) { try { checkV2(name, scene(make())); } catch (e) { rows.push(`${name.padEnd(46)} threw ${String(e).slice(0, 100)}`); } }
  console.log(rows.join("\n"));
  console.log(`# RULE ${rule.steps} modifying steps: the rule names every body they change in ${rule.covered}, says "all earlier" for ${rule.all}, misses ${rule.missed.length}`);
  for (const m of rule.missed) console.log("# MISS", m);
  console.log(`# V2 ${verdict.groupsBuilt} groups built alone, ${verdict.orders} other orders, ${verdict.bodiesCompared} bodies compared, ${verdict.mismatches.length} differences`);
  for (const m of verdict.mismatches.slice(0, 20)) console.log("# DIFF", m);
});

test("fixtures of several bodies with modifying steps: the same, by what each step changes", () => {
  rows.length = 0; verdict.mismatches.length = 0;
  const dir = new URL("../../app/test/fixtures/", import.meta.url);
  for (const f of ["combine-move-in_298", "cylinder-grow-in_295-before", "cylinder-in-hole-in_436", "hole-after-cylinder-in_412", "hole-body-move-in_348", "lofts-and-block-in_446", "mated-in_436", "mates-at-odds", "sweep-and-block-in_457", "grid-4x4"]) {
    const r = openSession(kernel, readFileSync(new URL(`${f}.cad.json`, dir), "utf8"));
    if (!r.ok) continue;
    try { checkV2(f, scene(r.value)); } catch (e) { rows.push(`${f.padEnd(46)} threw ${String(e).slice(0, 100)}`); }
  }
  console.log(rows.join("\n"));
  console.log(`# RULEF ${rule.steps} modifying steps so far: the rule names every body they change in ${rule.covered}, says "all earlier" for ${rule.all}, misses ${rule.missed.length}`);
  for (const m of rule.missed) console.log("# MISS", m);
  console.log(`# V2F ${verdict.groupsBuilt} groups built alone, ${verdict.orders} other orders, ${verdict.bodiesCompared} bodies compared, ${verdict.mismatches.length} differences`);
  for (const m of verdict.mismatches.slice(0, 20)) console.log("# DIFF", m);
});

test("debug a slide", { skip: !process.env.DEBUG_SLIDE }, () => {
  let s = createSession(kernel);
  s = box(s, 0, 0); s = box(s, 20, 0);
  const cre = scene(s).steps.filter((x) => x.type === "extrude")[1]!.id;
  s = slide(s, cre, 5);
  const sc = scene(s);
  console.log("# DBG steps", JSON.stringify(sc.steps.map((x) => [x.id, x.type, x.parts, x.params])).slice(0, 600));
  const whole = build(sc);
  console.log("# DBG whole", JSON.stringify(whole.bodies.map((b) => [b.id, b.min[0], b.max[0]])), whole.errors);
  const mv = sc.steps.find((x) => x.type === "move")!;
  const without = build({ ...sc, steps: sc.steps.filter((x) => x.id !== mv.id) });
  console.log("# DBG without", JSON.stringify(without.bodies.map((b) => [b.id, b.min[0], b.max[0]])), without.errors);
});

test("debug names of a slid body", { skip: !process.env.DEBUG_SLIDE }, () => {
  let s = createSession(kernel);
  s = box(s, 0, 0); s = box(s, 20, 0); s = box(s, 40, 0);
  const cre = scene(s).steps.filter((x) => x.type === "extrude")[1]!.id;
  s = slide(s, cre, 5);
  const sc = scene(s);
  const whole = build(sc);
  const keep = new Set([cre, sc.steps.find((x) => x.type === "move")!.id]);
  const alone = build({ ...sc, steps: sc.steps.filter((x) => keep.has(x.id)) });
  const before = build({ ...sc, steps: sc.steps.filter((x) => x.type !== "move") });
  console.log("# DBGN all names before the move", JSON.stringify(before.names));
  console.log("# DBGN all names after the move ", JSON.stringify(whole.names));
  console.log("# DBGN whole", JSON.stringify(whole.names.filter((n) => n.startsWith(`x_${cre}:`))));
  console.log("# DBGN alone", JSON.stringify(alone.names.filter((n) => n.startsWith(`x_${cre}:`))));
});
