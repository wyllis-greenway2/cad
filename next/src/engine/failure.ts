// Failure handling (E28, E35, E30): what a change would do, where a number works, and what the person can do when a step has failed. Everything is built on the side, on a copy of the recipe in a scratch
// engine: **the engine asked is never changed** (a refusal and a trial leave it as it was), and nothing is applied unasked (E15). The answers are plain data, so they cross the worker boundary (E16).
import { Engine, type Status } from "./engine.ts";
import type { EdgeRef, Id } from "./id.ts";
import * as K from "./kernel.ts";
import { Body } from "./lineage.ts";
import { scopeOf } from "./params.ts";
import { originalEdit } from "./pull.ts";
import { pointedLimit, rimOf } from "./rounds.ts";
import { kinds, type Step } from "./steps.ts";

/** a change to the recipe, as data: it is applied with the engine's own methods */
export type Change =
  | { op: "edit"; step: string; params: Record<string, any> }
  | { op: "swap"; step: string }
  | { op: "remove"; step: string }
  | { op: "batch"; changes: Change[] }
  | { op: "param"; name: string; value: number | string };
export interface Verdict {
  kind: "ok" | "notes" | "refused";
  /** in words: why it was refused, or what to look at */ why: string;
  step: string;
  status: Status;
  /** the constraints that hold the change back, by name (E55) */ victims?: string[];
  /** of those, the ones that were there before the change (what is asked for is not what holds it back) */ holding?: string[];
  /** the steps that fail after the change and did not before */ failing?: string[];
  notes: string[];
  /** steps not ok now, and after the change */ now: number;
  after: number;
  /** the body the last body step makes after the change: for the picture shown while the person decides */ volume:
    number | null;
  faces: number | null;
}
const notOk = (e: Engine) => e.ids().filter((i) => e.result(i).status.kind !== "ok").length;
const lastBody = (e: Engine): Body | null => {
  for (const id of [...e.ids()].reverse()) {
    const v = e.result(id).value;
    if (v instanceof Body) return v;
  }
  return null;
};
const apply = (e: Engine, c: Change): void => {
  if (c.op === "edit") e.edit(c.step, c.params);
  else if (c.op === "swap") e.swapWithInput(c.step);
  else if (c.op === "remove") e.remove(c.step);
  else if (c.op === "param") e.setParameters({ ...e.parameters(), [c.name]: c.value });
  else for (const x of c.changes) apply(e, x);
};
// a face that is replaced by the one that takes its place is "dropped" in every step that moves a face: only an unnamed face and a tie are worth the person's attention
/** the constraints a change asks for: those of a sketch whose numbers or parts are not as they were (what is asked for is not what holds it back) */
function changedConstraints(engine: Engine, change: Change): string[] {
  if (change.op === "batch") return change.changes.flatMap((c) => changedConstraints(engine, c));
  if (change.op !== "edit" || !engine.ids().includes(change.step)) return [];
  const old = new Map(
      ((engine.step(change.step).params.constraints ?? []) as { id: string }[]).map((c) => [c.id, JSON.stringify(c)]),
    ),
    now = (change.params.constraints ?? []) as { id: string }[];
  return now.filter((c) => old.get(c.id) !== JSON.stringify(c)).map((c) => c.id);
}
const NOTEWORTHY = new Set(["defect", "tie", "sliver"]);

/** build the change on a copy and say what happened. `engine` is not touched. */
export function trial(engine: Engine, change: Change): Verdict {
  const now = notOk(engine),
    scratch = new Engine(engine.recipe(), { parameters: engine.parameters(), forced: engine.held() });
  try {
    scratch.build();
    apply(scratch, change);
    const focus = change.op === "remove" || change.op === "batch" || change.op === "param" ? null : change.step,
      r = focus && scratch.ids().includes(focus) ? scratch.result(focus) : null,
      status: Status = r ? r.status : { kind: "ok" };
    const after = notOk(scratch),
      body = lastBody(scratch),
      notes = r ? r.notes.filter((n) => NOTEWORTHY.has(n.kind)).map((n) => n.text) : [];
    const volume = body ? K.volume(body.solid) : null,
      faces = body ? body.faces.length : null;
    const before = new Map(engine.ids().map((i) => [i, engine.result(i).status.kind])),
      failing = scratch.ids().filter((i) => scratch.result(i).status.kind !== "ok" && (before.get(i) ?? "ok") === "ok");
    const asked = changedConstraints(engine, change),
      victimsOf = (st: Status) => ("victims" in st && st.victims ? st.victims : undefined);
    const give = (st: Status, step: string, why: string): Verdict => {
      const v = victimsOf(st);
      return {
        kind: "refused",
        why,
        step,
        status: st,
        ...(v ? { victims: v, holding: v.filter((id) => !asked.includes(id)) } : {}),
        ...(failing.length ? { failing } : {}),
        notes,
        now,
        after,
        volume,
        faces,
      };
    };
    if (status.kind !== "ok") return give(status, focus ?? "", status.why);
    if (failing.length) {
      const first = failing[0]!,
        st = scratch.result(first).status;
      return give(st, first, `${first}: ${"why" in st ? st.why : "it would fail"}`);
    } // the step that would fail is named, and what holds it back
    if (after > now)
      return {
        kind: "refused",
        why: `${after - now} more step${after - now === 1 ? "" : "s"} would fail after this change`,
        step: focus ?? "",
        status,
        notes,
        now,
        after,
        volume,
        faces,
      };
    return {
      kind: notes.length ? "notes" : "ok",
      why: notes.join("; "),
      step: focus ?? "",
      status,
      notes,
      now,
      after,
      volume,
      faces,
    };
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    return {
      kind: "refused",
      why,
      step: "step" in change ? change.step : "",
      status: { kind: "flagged", why },
      notes: [],
      now,
      after: now,
      volume: null,
      faces: null,
    };
  } finally {
    scratch.release();
  }
}

export interface Range {
  from: number;
  to: number;
}
export interface Probe {
  step: string;
  key: string;
  value: number;
  /** where the number works, in order */ ok: Range[];
  /** the range looked at */ looked: Range;
  samples: number;
}
/**
 * Where a step's number works: the step and everything after it are no worse than they are now. The number is tried at `samples` places across `looked`, and each edge between a place that works and one
 * that does not is found by halving (to 1e-4 of the range). One scratch engine takes all the edits, so each costs what an edit costs (E18).
 */
export function probe(
  engine: Engine,
  step: string,
  key: string,
  opts: { lo?: number; hi?: number; samples?: number } = {},
): Probe {
  if (!engine.ids().includes(step)) throw new Error(`no step ${step}`);
  const st = engine.step(step),
    value = st.params[key];
  if (typeof value !== "number") throw new Error(`${step} has no number called ${key}`);
  return scan(
    engine,
    value,
    opts,
    (e, v) => e.edit(step, { ...st.params, [key]: v }),
    (e) => e.result(step).status.kind === "ok",
    { step, key },
  );
}
/** where a named parameter works (E67): the same question as for a step's number, asked of a name; the steps that use it are the ones that decide */
export function probeParam(
  engine: Engine,
  name: string,
  opts: {
    lo?: number;
    hi?: number;
    samples?: number;
    /** a step that must come out fine (a failed step being mended) */ focus?: string;
  } = {},
): Probe {
  const table = engine.parameters();
  if (!(name in table)) throw new Error(`no parameter ${name}`);
  const value = scopeOf(table)(name);
  return scan(
    engine,
    value,
    opts,
    (e, v) => e.setParameters({ ...e.parameters(), [name]: v }),
    (e) => !opts.focus || e.result(opts.focus).status.kind === "ok",
    { step: opts.focus ?? "", key: name },
  );
}
function scan(
  engine: Engine,
  value: number,
  opts: { lo?: number; hi?: number; samples?: number },
  set: (e: Engine, v: number) => void,
  focusOk: (e: Engine) => boolean,
  name: { step: string; key: string },
): Probe {
  const { step, key } = name,
    lo = opts.lo ?? (value >= 0 ? 0 : value * 3),
    hi = opts.hi ?? (value >= 0 ? (value === 0 ? 1 : value * 3) : 0),
    n = opts.samples ?? 24,
    base = notOk(engine),
    scratch = new Engine(engine.recipe(), { parameters: engine.parameters(), forced: engine.held() });
  try {
    scratch.build();
    const works = (v: number): boolean => {
      try {
        set(scratch, v);
        return focusOk(scratch) && notOk(scratch) <= base;
      } catch {
        return false;
      }
    };
    const xs = Array.from({ length: n + 1 }, (_, i) => lo + ((hi - lo) * i) / n),
      ok = xs.map(works),
      tol = (hi - lo) * 1e-4;
    const edge = (a: number, b: number): number => {
      // a works, b does not (or the other way about): the place between
      let good = ok[xs.indexOf(a)] ? a : b,
        bad = good === a ? b : a;
      for (let i = 0; i < 30 && Math.abs(good - bad) > tol; i++) {
        const m = (good + bad) / 2;
        if (works(m)) good = m;
        else bad = m;
      }
      return good;
    };
    const ranges: Range[] = [];
    let from: number | null = null;
    for (let i = 0; i <= n; i++) {
      if (ok[i]) {
        if (from === null) from = i === 0 ? xs[0]! : edge(xs[i - 1]!, xs[i]!);
        if (i === n) ranges.push({ from, to: xs[n]! });
      } else if (from !== null) {
        ranges.push({ from, to: edge(xs[i - 1]!, xs[i]!) });
        from = null;
      }
    }
    return { step, key, value, ok: ranges, looked: { from: lo, to: hi }, samples: n + 1 };
  } finally {
    scratch.release();
  }
}
const spell = (p: Probe): string =>
  p.ok.length
    ? "works " + p.ok.map((r) => `from ${r.from.toFixed(3)} to ${r.to.toFixed(3)}`).join(" and ")
    : `works nowhere in ${p.looked.from.toFixed(3)} to ${p.looked.to.toFixed(3)}`;

export type OptionKind = "range" | "continue" | "editOriginal" | "swap" | "remove";
export interface Option {
  kind: OptionKind;
  label: string;
  applies: boolean;
  /** why not, or what it did when tried */ why: string;
  /** tried on a copy: did it work, no worse than now */ worked: boolean | null;
  change?: Change;
  probe?: Probe;
}
/**
 * What the person can do about a step that has failed (E35). Each option is tried on a copy and says whether it worked; none is applied. Built so far: a number that works (the nearest one),
 * the number of the step that made the face (for a pull), doing the step before the one it works on, and leaving the step out. (A variable size and a split chain are not built, E36.)
 */
export function options(engine: Engine, step: string): Option[] {
  if (!engine.ids().includes(step)) throw new Error(`no step ${step}`);
  const st = engine.step(step),
    r = engine.result(step),
    out: Option[] = [];
  if (r.status.kind === "ok") return out;
  const key = kinds[st.kind]?.main || undefined;
  const raw = key ? st.params[key] : undefined,
    exprName = typeof raw === "string" && /^=\s*[A-Za-z_][A-Za-z0-9_]*\s*$/.test(raw) ? raw.slice(1).trim() : null;
  if (key && typeof raw === "string" && !exprName)
    out.push({
      kind: "range",
      label: `${key} is ${raw}, an expression`,
      applies: false,
      why: "change one of the parameters it uses",
      worked: null,
    });
  else if (key && exprName) {
    // the number is a named parameter (E67): the range is asked of the parameter
    const p = probeParam(engine, exprName, { focus: step }),
      v = scopeOf(engine.parameters())(exprName);
    if (p.ok.length) {
      const near = p.ok.flatMap((g) => [g.from, g.to]).sort((a, b) => Math.abs(a - v) - Math.abs(b - v))[0]!,
        change: Change = { op: "param", name: exprName, value: near },
        t = trial(engine, change);
      out.push({
        kind: "range",
        label: `${exprName}: ${spell(p)}`,
        applies: true,
        why:
          t.kind === "refused"
            ? `the nearest place, ${near.toFixed(3)}, was tried: ${t.why}`
            : `the nearest place is ${near.toFixed(3)}`,
        worked: t.kind !== "refused",
        change,
        probe: p,
      });
    } else
      out.push({
        kind: "range",
        label: `${exprName}: ${spell(p)}`,
        applies: true,
        why: "no value of this parameter works",
        worked: false,
        probe: p,
      });
  } else if (key) {
    const p = probe(engine, step, key),
      v = st.params[key] as number;
    if (p.ok.length) {
      const near = p.ok.flatMap((g) => [g.from, g.to]).sort((a, b) => Math.abs(a - v) - Math.abs(b - v))[0]!,
        change: Change = { op: "edit", step, params: { ...st.params, [key]: near } },
        t = trial(engine, change);
      out.push({
        kind: "range",
        label: `${key}: ${spell(p)}`,
        applies: true,
        why:
          t.kind === "refused"
            ? `the nearest place, ${near.toFixed(3)}, was tried: ${t.why}`
            : `the nearest place is ${near.toFixed(3)}`,
        worked: t.kind !== "refused",
        change,
        probe: p,
      });
    } else
      out.push({
        kind: "range",
        label: `${key}: ${spell(p)}`,
        applies: true,
        why: "no value of this number works",
        worked: false,
        probe: p,
      });
  } else
    out.push({ kind: "range", label: "this step has no one number to change", applies: false, why: "", worked: null });
  // a fillet of a rod's rim past the kernel's limit: our own construction, the pointed end (E34, tier 2); offered, never applied
  if (st.kind === "round" && st.params.mode !== "chamfer" && !st.params.sizes && st.params.past !== true) {
    const body = engine.ids().includes(st.inputs[0] ?? "") ? engine.result(st.inputs[0]!).value : null,
      asked = body instanceof Body ? (st.params.edges as EdgeRef[]).flatMap((x) => body.findEdges(x)) : [];
    const rim = asked.length === 1 ? rimOf(body as Body, asked[0]!) : null,
      s = st.params.size as number;
    if (!rim)
      out.push({
        kind: "continue",
        label: "continue past the limit (a pointed end)",
        applies: false,
        why: "this edge is not the rim of a rod's flat end",
        worked: null,
      });
    else if (!(s > rim.r))
      out.push({
        kind: "continue",
        label: "continue past the limit (a pointed end)",
        applies: false,
        why: "the size is not above the rod's radius: the kernel's round is the same shape",
        worked: null,
      });
    else {
      const limit = pointedLimit(rim.r, rim.height),
        change: Change = { op: "edit", step, params: { ...st.params, past: true } },
        t = s > limit ? null : trial(engine, change);
      out.push({
        kind: "continue",
        label: `continue past the limit: a pointed end (largest size ${limit.toFixed(3)})`,
        applies: s <= limit,
        why:
          s > limit
            ? `the size is above the largest, ${limit.toFixed(3)}`
            : t!.kind === "refused"
              ? t!.why
              : "tried on a copy: it works",
        worked: t ? t.kind !== "refused" : false,
        change,
      });
    }
  } else
    out.push({
      kind: "continue",
      label: "continue past the limit (a pointed end)",
      applies: false,
      why: "this step is not a fillet of one edge",
      worked: null,
    });
  // a pull of a face that a step made: change that step's number instead
  if ((st.kind === "push" || st.kind === "moveFace") && st.params.face) {
    const from = st.inputs[0]!,
      o = originalEdit(engine, from, st.params.face as Id, st.params.dist as number);
    if ("why" in o)
      out.push({
        kind: "editOriginal",
        label: "change the step that made the face",
        applies: false,
        why: o.why,
        worked: null,
      });
    else {
      // the original step gets its new number and the pull is left out: the face is then where the person wanted it, made by the step that knows how to make it
      const change: Change = {
          op: "batch",
          changes: [
            { op: "edit", step: o.step, params: o.params },
            { op: "remove", step },
          ],
        },
        t = trial(engine, change);
      out.push({
        kind: "editOriginal",
        label: `change the step that made the face (${o.step}) instead of pulling it`,
        applies: true,
        why:
          t.kind === "refused"
            ? t.why
            : `${o.step} would have ${Object.entries(o.params)
                .filter(([k, x]) => x !== engine.step(o.step).params[k])
                .map(([k, x]) => `${k} ${typeof x === "number" ? x.toFixed(3) : x}`)
                .join(", ")}`,
        worked: t.kind !== "refused",
        change,
      });
    }
  } else
    out.push({
      kind: "editOriginal",
      label: "change the step that made the face",
      applies: false,
      why: "this step does not pull a face",
      worked: null,
    });
  // do the step before the one it works on
  {
    const s = engine.trySwap(step);
    const body = engine.ids().includes(st.inputs[0] ?? "");
    out.push({
      kind: "swap",
      label: "do this step before the one it works on",
      applies: body && st.inputs.length > 0 && kinds[engine.step(st.inputs[0]!).kind]?.outputs === "body",
      why: s.why || (s.worked ? "this order works" : "this order does not help"),
      worked: s.worked,
      change: { op: "swap", step },
    });
  }
  // leave it out
  {
    const change: Change = { op: "remove", step },
      t = trial(engine, change);
    out.push({
      kind: "remove",
      label: "leave this step out",
      applies: true,
      why: t.kind === "refused" ? t.why : "the steps after it would use what it worked on",
      worked: t.kind !== "refused",
      change,
    });
  }
  return out;
}
export type { Step };
