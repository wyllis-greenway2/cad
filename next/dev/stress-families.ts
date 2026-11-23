// A dev stress run (not a test, `in_1444`, `in_1548`) for the kinds of model `dev/stress.ts` does not make: curved starts (revolve, loft, sweep, shell), sketches with arcs and holes, named parameters, the document (undo, redo, save and open),
// exchange (STEP out and back, the STL mesh) and placement (mates between bodies). The checks of `dev/stress.ts` run on the first two (random operations, live equals fresh, an edit put back, nothing changed in place); the others check what
// is theirs.
//   node --experimental-strip-types dev/stress-families.ts family [models] [seed] [steps] [from-to]
//   family: curved | sketch | params | document | exchange | place
import { initKernel } from "../src/engine/kernel.ts";
import * as K from "../src/engine/kernel.ts";
import { Engine } from "../src/engine/engine.ts";
import { Body } from "../src/engine/lineage.ts";
import { idKey, type Id } from "../src/engine/id.ts";
import { rectangle } from "../src/engine/sketch.ts";
import * as D from "../src/engine/document.ts";
import { exportBody, meshOf, toBase64 } from "../src/engine/exchange.ts";
import type { Step } from "../src/engine/steps.ts";
import { C0, families, type C } from "./curved-recipe.ts";
import { same } from "./lib.ts";
import { driveModel, makeCtx, report, tweakable, type Ctx } from "./stress-lib.ts";
import { writeFileSync } from "node:fs";
await initKernel();
const FAMILY = process.argv[2] ?? "curved", MODELS = Number(process.argv[3] ?? 20), SEED = Number(process.argv[4] ?? 1), LEN = Number(process.argv[5] ?? 8);
const c = makeCtx(SEED), { pick, num } = c;
const RANGE = (process.argv[6] ?? `0-${MODELS - 1}`).split("-").map(Number), LO = RANGE[0]!, HI = RANGE[1] ?? LO, t0 = Date.now();
const fp = (e: Engine) => Object.fromEntries(e.ids().map((i) => [i, e.result(i).fingerprint]));
const sameFp = (a: Record<string, string>, b: Record<string, string>) => Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => k in b && same(a[k]!, b[k]!));
const bodyOf = (e: Engine, id: string): Body | null => { const v = e.result(id).value; return e.result(id).status.kind === "ok" && v instanceof Body ? v : null; };
const finalBody = (e: Engine): { id: string; body: Body } | null => { const ids = e.ids(); for (let i = ids.length - 1; i >= 0; i--) { const b = bodyOf(e, ids[i]!); if (b) return { id: ids[i]!, body: b }; } return null; };

// ---------------------------------------------------------------- the starts
const jitter = (): C => {
  const ch: { [k in keyof C]: readonly C[k][] } = {
    r1: [6, 10, 14], h1: [3, 6, 9], r2: [3, 6, 9], H: [12, 18], deg: [360, 360, 270, 90], w1: [14, 20, 30], d1: [6, 10, 14], w2: [8, 12, 20], d2: [4, 6, 12], dx: [0, 3, 6], LH: [8, 15, 25], ruled: [false, false, true],
    w: [20, 40, 60], h: [20, 30, 44], d: [10, 20, 35], t: [0.8, 3, 5], r: [2, 3, 5], l1: [20, 30, 50], l2: [10, 25, 40], R: [8, 30, 50], rf: [0.5, 1, 1.8],
  };
  const out: Record<string, unknown> = { ...C0 }; for (const k of Object.keys(ch) as (keyof C)[]) out[k] = pick(ch[k] as readonly unknown[]); return out as unknown as C;
};
const P = (id: string, x: number, y: number) => ({ id, x, y });
const sk = (id: string, p: Record<string, unknown>): Step => ({ id, kind: "sketch", params: p, inputs: [] });
/** a plate with holes, a slot, or a D: a sketch with circles or arcs, then an extrude */
function sketchStart(): Step[] {
  const kind = pick(["plate", "plate2", "slot", "D"]), d = num(4, 20);
  let p: Record<string, unknown>;
  if (kind === "plate" || kind === "plate2") {
    const w = num(30, 60), h = num(20, 40), r = rectangle(0, 0, w, h), circles: unknown[] = [], pts = [...r.points], cons = [...(r.constraints ?? [])];
    for (let i = 0; i < (kind === "plate" ? 1 : 2); i++) {
      const x = (i + 1) * (w / 3), y = h / 2, rad = num(1.5, Math.min(h / 4, w / 8)); pts.push(P(`H${i}`, x, y)); circles.push({ id: `hole${i}`, c: `H${i}`, r: rad });
      cons.push({ id: `hr${i}`, kind: "radius", parts: [`hole${i}`], value: rad }, { id: `hc${i}`, kind: "fixed", parts: [`H${i}`], at: [x, y] });
    }
    p = { ...r, points: pts, circles, constraints: cons };
  } else if (kind === "slot") {
    const len = num(8, 30), rad = num(2, 8);
    p = { points: [P("A", 0, -rad), P("B", len, -rad), P("C", len, rad), P("D", 0, rad), P("M", len, 0), P("N", 0, 0)], lines: [{ id: "bot", a: "A", b: "B" }, { id: "top", a: "C", b: "D" }], arcs: [{ id: "right", c: "M", a: "B", b: "C" }, { id: "left", c: "N", a: "D", b: "A" }],
      constraints: [{ id: "h1", kind: "horizontal", parts: ["bot"] }, { id: "t1", kind: "tangent", parts: ["bot", "right"] }, { id: "t2", kind: "tangent", parts: ["top", "right"] }, { id: "t3", kind: "tangent", parts: ["bot", "left"] }, { id: "t4", kind: "tangent", parts: ["top", "left"] },
        { id: "er", kind: "equalRadius", parts: ["right", "left"] }, { id: "r", kind: "radius", parts: ["right"], value: rad }, { id: "len", kind: "distance", parts: ["M", "N"], value: len }, { id: "fN", kind: "fixed", parts: ["N"], at: [0, 0] }] };
  } else {
    const rad = num(4, 14);
    p = { points: [P("A", -rad, 0), P("B", rad, 0), P("C", 0, 0)], lines: [{ id: "base", a: "A", b: "B" }], arcs: [{ id: "arc", c: "C", a: "B", b: "A" }], constraints: [{ id: "f", kind: "fixed", parts: ["A"], at: [-rad, 0] }, { id: "r", kind: "radius", parts: ["arc"], value: rad }, { id: "m", kind: "midpoint", parts: ["C", "base"] }] };
  }
  return [sk("s", p), { id: "A", kind: "extrude", params: { d }, inputs: ["s"] }];
}

// ---------------------------------------------------------------- the checks that belong to a family
/** named parameters: numbers become expressions of a table; editing the table must equal a fresh build; an expression that is wrong is a reason, not a crash */
function paramsCheck(e: Engine): string[] {
  const out: string[] = [], rec = e.recipe(), table: Record<string, number | string> = {}; let n = 0;
  const steps = rec.map((s) => { const p = { ...(s.params as Record<string, unknown>) }; for (const [k, v] of tweakable(s)) { if (c.rnd() < 0.7) { const name = `p${n++}`; table[name] = v; p[k] = c.rnd() < 0.5 ? `=${name}` : `=${name} * 1`; } } return { ...s, params: p }; });
  if (!n) return out;
  c.note("params", "ok", "", 0);
  try {
    e.setRecipe(steps, undefined, table); const base = fp(e);
    const f0 = new Engine(steps, { parameters: table }); f0.build(); if (!sameFp(base, fp(f0))) out.push("a recipe given its numbers as parameters differs from a fresh build"); f0.release();
    const names = Object.keys(table), nm = pick(names), changed = { ...table, [nm]: (table[nm] as number) * 1.2 };
    e.setParameters(changed); const f1 = new Engine(steps, { parameters: changed }); f1.build(); if (!sameFp(fp(e), fp(f1))) out.push(`after changing ${nm} the live engine differs from a fresh build`); f1.release();
    e.setParameters(table); if (!sameFp(fp(e), base)) out.push(`changing ${nm} and back changed the answers`);
    // a parameter that cannot be worked out: the steps that use it say so and name it; nothing throws
    const bad = { ...table, [nm]: pick(["1/0", "nope + 1", "sqrt(-4)", `${nm}`]) } as Record<string, number | string>; e.setParameters(bad);
    const users = e.ids().filter((i) => JSON.stringify(e.step(i).params).includes(`=${nm}`)), why = users.map((i) => (e.result(i).status as { why?: string }).why ?? "");
    if (users.length && !users.every((i) => e.result(i).status.kind !== "ok")) out.push(`a parameter that cannot be worked out (${bad[nm]}) left a step using it ok`);
    else if (users.length && !why.some((w) => w.includes(nm) || (typeof bad[nm] === "string" && /nope/.test(bad[nm] as string) && w.includes("nope")))) out.push(`the refusal for ${nm} = ${bad[nm]} does not name the parameter: ${why[0]}`);
    e.setParameters(table); if (!sameFp(fp(e), base)) out.push("putting the parameters right again did not give the first answers back");
  } catch (x) { out.push(`parameters THREW ${(x as Error).message.slice(0, 160)}`); }
  return out;
}

/** the document: the recipe saved and opened (same text, same answers), every change undone and redone, a number edited with a merge key, equal to fresh builds throughout */
function documentCheck(e: Engine): string[] {
  const out: string[] = [], rec = e.recipe(); let doc = D.emptyDoc(); c.note("document", "ok", "", 0);
  try {
    for (const s of rec) doc = D.insert(doc, s);
    const text = D.save(doc), back = D.open(text);
    if (back.warnings.length) out.push(`a saved document opens with warnings: ${back.warnings[0]}`);
    if (D.save(back.doc) !== text) out.push("a saved and opened document is not the same text");
    const build = (d: D.Doc) => { const x = new Engine(d.steps as never, { parameters: d.parameters }); x.build(); const r = fp(x); x.release(); return r; };
    const first = build(doc); if (!sameFp(first, build(back.doc))) out.push("an opened document builds a different picture");
    const h = new D.History(doc), states: D.Doc[] = [doc], cands = rec.filter((x) => tweakable(x).length);
    for (let i = 0; i < 5 && cands.length; i++) {
      const st = pick(cands), [key, val] = pick(tweakable(st)), cur = h.doc.steps.find((x) => x.id === st.id)!;
      const next = D.editStep(h.doc, st.id, { ...(cur.params as object), [key]: val * (1 + 0.1 * (i + 1)) }); h.do(next, `edit ${st.id}.${key}`, { merge: c.rnd() < 0.3 ? `${st.id}.${key}` : undefined }); states.push(next);
    }
    const mid = h.doc; let undone = 0; while (h.canUndo && undone < 3) { h.undo(); undone++; }
    for (let i = 0; i < undone; i++) h.redo();
    if (D.save(h.doc) !== D.save(mid)) out.push("undo and redo did not come back to the same document");
    while (h.canUndo) h.undo(); if (D.save(h.doc) !== text) out.push("undoing everything did not give back the first document");
    if (!sameFp(build(h.doc), first)) out.push("the first document, got back by undo, builds a different picture");
    while (h.canRedo) h.redo(); if (!sameFp(build(h.doc), build(D.open(D.save(h.doc)).doc))) out.push("the last document differs from itself saved and opened");
  } catch (x) { out.push(`the document THREW ${(x as Error).message.slice(0, 160)}`); }
  return out;
}

/** exchange: the part as STEP and read back (same volume, same number of faces, ids from its own order), and as a mesh that encloses the part's volume */
function exchangeCheck(e: Engine): string[] {
  const out: string[] = [], fin = finalBody(e); if (!fin) return out; c.note("exchange", "ok", "", 0);
  try {
    const v = K.volume(fin.body.solid), bytes = exportBody(fin.body, "step");
    const back = new Engine([{ id: "I", kind: "import", params: { format: "step", data: toBase64(bytes) }, inputs: [] }]); back.build();
    const b = bodyOf(back, "I"); if (!b) out.push(`a STEP file of the part does not come back in: ${(back.result("I").status as { why?: string }).why ?? back.result("I").status.kind}`);
    else {
      const w = K.volume(b.solid); if (Math.abs(v - w) > 1e-4 * Math.max(1, v)) out.push(`a STEP file comes back with another volume: ${v} against ${w}`);
      const mine = fin.body.faces.length, theirs = b.faces.length; if (mine !== theirs) out.push(`a STEP file comes back with ${theirs} faces, the part has ${mine}`);
    }
    back.release();
    const m = meshOf(fin.body); let enc = 0; const P = m.positions, I = m.indices;
    for (let t = 0; t < I.length; t += 3) { const a = I[t]! * 3, bb = I[t + 1]! * 3, cc = I[t + 2]! * 3; enc += (P[a]! * (P[bb + 1]! * P[cc + 2]! - P[bb + 2]! * P[cc + 1]!) - P[a + 1]! * (P[bb]! * P[cc + 2]! - P[bb + 2]! * P[cc]!) + P[a + 2]! * (P[bb]! * P[cc + 1]! - P[bb + 1]! * P[cc]!)) / 6; }
    if (Math.abs(enc - v) > 0.03 * Math.max(1, Math.abs(v))) out.push(`the mesh encloses ${enc.toFixed(2)} but the part is ${v.toFixed(2)}`);
    if (m.faces.length !== fin.body.faces.length) out.push(`the mesh has ${m.faces.length} face groups for ${fin.body.faces.length} faces`);
  } catch (x) { out.push(`exchange THREW ${(x as Error).message.slice(0, 160)}`); }
  return out;
}

/** placement: two copies of a part and some mates between faces of the two: no throw, a reason when refused, ids and volume unchanged when it works, an edit equal to a fresh build, a number put back */
function placeStart(): Step[] {
  const w = num(15, 30), h = num(15, 30), kind = pick(["rect", "circle"]);
  const s: Step = kind === "circle" ? { id: "s", kind: "sketchCircle", params: { r: num(6, 14), at: [0, 0] }, inputs: [] } : { id: "s", kind: "sketchPolygon", params: { points: [[0, 0], [w, 0], [w, h], [0, h]] }, inputs: [] };
  return [s, { id: "A", kind: "extrude", params: { d: num(6, 20) }, inputs: ["s"] }, { id: "P", kind: "pattern", params: { kind: "linear", by: [num(50, 80), num(-5, 5), 0], count: 2 }, inputs: ["A"] }];
}
function placeCheck(e: Engine): string[] {
  const out: string[] = [], sc = bodyOf(e, "P"); if (!sc || sc.bodies.length < 2) return out;
  const planes = (i: number) => sc.bodies[i]!.faces.filter((f) => K.facts(f.h).type === "PLANE").map((f) => f.id as Id);
  const A = planes(0), B = planes(1); if (!A.length || !B.length) return out;
  const kinds = ["flush", "flush", "parallel", "perpendicular", "angle"], mates = Array.from({ length: 1 + Math.floor(c.rnd() * 3) }, (_x, i) => { const kind = pick(kinds); return { id: `m${i}`, kind, a: pick(A), b: pick(B), ...(kind === "flush" ? { value: num(0, 6) } : kind === "angle" ? { value: pick([30, 45, 60, 90]) } : {}) }; });
  const step: Step = { id: "M", kind: "place", params: { mates }, inputs: ["P"] };
  try {
    const before = new Set(sc.faces.map((f) => idKey(f.id))), v0 = K.volume(sc.solid);
    e.insert(step); const r = e.result("M"), why = (r.status as { why?: string }).why ?? ""; c.note("place " + mates.map((x) => x.kind).join("+"), r.status.kind, why, 0); c.events++;
    if (r.status.kind !== "ok") { if (!why) out.push(`a placement was ${r.status.kind} with no reason`); return out; }
    const after = bodyOf(e, "M")!, ids = new Set(after.faces.map((f) => idKey(f.id)));
    if (ids.size !== before.size || [...before].some((i) => !ids.has(i))) out.push("a placement changed the face ids");
    if (Math.abs(K.volume(after.solid) - v0) > 1e-6 * v0) out.push("a placement changed the volume");
    const flush = mates.find((x) => x.kind === "flush"); if (flush) {
      const gap = (flush.value as number), f0 = e.step("M").params as { mates: { id: string; value?: number }[] };
      const moved = { ...f0, mates: f0.mates.map((x) => (x.id === flush.id ? { ...x, value: gap + 1.5 } : x)) }; e.edit("M", moved);
      const fresh = new Engine(e.recipe()); fresh.build(); if (!sameFp(fp(e), fp(fresh))) out.push("after editing a gap the live engine differs from a fresh build"); fresh.release();
      e.edit("M", f0);
      const again = new Engine(e.recipe()); again.build(); if (!sameFp(fp(e), fp(again))) out.push("putting a gap back differs from a fresh build"); again.release();
    }
  } catch (x) { out.push(`placement THREW ${(x as Error).message.slice(0, 160)}`); }
  return out;
}

// ---------------------------------------------------------------- the run
for (let m = LO; m <= Math.min(HI, MODELS - 1); m++) {
  c.reseed(SEED * 7919 + m * 104729 + FAMILY.length); c.models++; const mseed = `${FAMILY} ${SEED}/${m}`;
  let start: Step[];
  if (FAMILY === "curved") { const fam = pick(Object.keys(families)); start = families[fam]!(jitter()); }
  else if (FAMILY === "place") start = placeStart();
  else if (FAMILY === "sketch") start = sketchStart();
  else { const p = sketchStart(), b = [{ id: "s", kind: "sketchPolygon", params: { points: [[0, 0], [num(20, 50), 0], [num(20, 50), num(15, 35)], [0, num(15, 35)]] }, inputs: [] }, { id: "A", kind: "extrude", params: { d: num(6, 25) }, inputs: ["s"] }] as Step[]; start = pick([p, b]); }
  const e = new Engine(start); e.build();
  const first = finalBody(e); if (!first) { c.note("start", "flagged", "the start was not ok", 0); e.release(); continue; }
  const lenFor = FAMILY === "curved" || FAMILY === "sketch" ? LEN : Math.min(LEN, 4);
  const extra = FAMILY === "params" ? paramsCheck : FAMILY === "document" ? documentCheck : FAMILY === "exchange" ? exchangeCheck : FAMILY === "place" ? placeCheck : undefined;
  if (FAMILY === "place") { const w = extra!(e); for (const x of w) c.problems.push(`model ${m} (seed ${mseed}): ${x}`); if (w.length) writeFileSync(`/tmp/stress-${FAMILY}-${SEED}-${m}.json`, JSON.stringify(e.recipe())); e.release(); continue; }
  driveModel(c, m, mseed, e, lenFor, extra);
}
process.exit(report(c, t0));
