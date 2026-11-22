// The engine (E2, E13, E18, E19, E20): a recipe of steps, run in an order that suits their inputs; each result has a status, and a failed step is flagged and passes its input through,
// so the model is never lost (E13). An edit recomputes only the steps that depend on it and stops where an answer is unchanged (E18).
import * as K from "./kernel.ts";
import { ParamError, type Table, canonical, resolve, scopeOf } from "./params.ts";
import { type Note, Body, RefLost } from "./lineage.ts";
import { type Ctx, type Step, type Value, NoBody, Refusal, kinds, passthrough } from "./steps.ts";
import { insertStep, moveStep, removeStep, swapWithInput, validateRecipe } from "./recipe.ts";
import "./curved.ts"; // registers revolve, loft, sweep and shell
import "./pull.ts"; // registers moveFace and offsetFace (pull modes 3 and 4)
import "./sketch.ts"; // registers the constrained sketch (E49)
import "./exchange.ts"; // registers import (a STEP file as a body, E21)
import "./pattern.ts"; // registers pattern and mirror (copies of a body, E44 to E47)
import { scopeKinds } from "./scope.ts"; // steps that name a body work on that body alone (E40, E41)
scopeKinds();

export type Status = { kind: "ok" } | { kind: "flagged"; why: string; /** the constraints that hold the change back, by name (E55) */ victims?: string[] } | { kind: "orphaned"; why: string };
export interface Changes { recomputed: string[]; changed: string[] }
export interface Result { value: Value; status: Status; fingerprint: string; notes: Note[] }

/** a value shared by a pass-through is freed when the last result holding it lets go (E17) */
class Held { refs = 0; readonly v: Value; constructor(v: Value) { this.v = v; } }
interface Slot { held: Held; status: Status; fingerprint: string }

const fingerprintOf = (v: Value): string => (v instanceof Body ? v.fingerprint() : v instanceof NoBody ? "empty" : JSON.stringify([v.lines.map((l) => [l.id, l.a, l.b, l.mid ?? null]), v.circle ?? null, (v.inner ?? []).map(fingerprintOf), v.regions ?? null, v.normal, v.open ?? false, v.face ?? null, (v.reference ?? []).map((l) => [l.id, l.a, l.b]), v.solve ?? null, canonical(v.definition ?? null), v.carried ?? null])); // everything a step could read of it: a circle has no lines

export class Engine {
  private steps = new Map<string, Step>();
  private order: string[] = [];
  private dependents = new Map<string, string[]>();
  private slots = new Map<string, Slot>();
  private age = new Map<string, number>();
  /** how many steps were computed so far (for measuring what an edit cost) */
  computes = 0;
  /** steps that are not run at all but flagged with a reason: what the host says of a step that ran past its time or stopped the kernel (E16) */
  private forced = new Map<string, string>();
  /** told which step is about to run, so a host that has to stop the kernel knows which one it was */
  watch: ((id: string) => void) | null = null;
  /** the named numbers (E66) and how each step's numbers came out with them: a step whose numbers are the same is not run again */
  private table: Table = {};
  private lookup = scopeOf({});
  private used = new Map<string, string>();

  constructor(steps: readonly Step[], opts: { forced?: Record<string, string>; watch?: (id: string) => void; parameters?: Table } = {}) {
    this.forced = new Map(Object.entries(opts.forced ?? {})); this.watch = opts.watch ?? null; this.table = { ...(opts.parameters ?? {}) }; this.lookup = scopeOf(this.table); this.install(steps);
  }
  /** the table of named numbers, as given (numbers and expressions) */
  parameters(): Table { return { ...this.table }; }
  /** a step with its expressions worked out, or the words that say why not (E66) */
  private resolveStep(step: Step): { step: Step } | { error: string } {
    try { return { step: { ...step, params: resolve(step.params, this.lookup) } }; } catch (e) { if (e instanceof ParamError) return { error: e.message }; throw e; }
  }
  private signature(step: Step): string { const r = this.resolveStep(step); return "error" in r ? `error:${r.error}` : JSON.stringify(r.step.params); }
  /** change the named numbers; exactly the steps whose numbers come out different run again (E66) */
  setParameters(next: Table): Changes {
    this.table = { ...next }; this.lookup = scopeOf(this.table);
    const dirty = new Set<string>(); for (const id of this.order) if (this.used.get(id) !== this.signature(this.steps.get(id)!)) dirty.add(id);
    return this.settle(dirty);
  }
  /** change which steps are held back; the steps whose hold changed run again (or are held), and what depends on them */
  setForced(next: Record<string, string>): Changes {
    const now = new Map(Object.entries(next)), dirty = new Set<string>();
    for (const id of new Set([...this.forced.keys(), ...now.keys()])) if (this.forced.get(id) !== now.get(id) && this.steps.has(id)) dirty.add(id);
    this.forced = now; return this.settle(dirty);
  }
  /** take a list of steps as the recipe: the order, who depends on whom, how old each is (older ids lead when faces merge) */
  private install(steps: readonly Step[]): void {
    validateRecipe(steps);
    this.steps = new Map(steps.map((s) => [s.id, s])); this.order = steps.map((s) => s.id);
    this.age = new Map(this.order.map((id, i) => [id, i])); this.dependents = new Map(this.order.map((id) => [id, [] as string[]]));
    for (const id of this.order) for (const inp of this.steps.get(id)!.inputs) this.dependents.get(inp)?.push(id);
  }

  build(): void { for (const id of this.order) this.compute(id); }
  step(id: string): Step { return this.steps.get(id)!; }
  result(id: string): Result {
    const s = this.slots.get(id)!, v = s.held.v;
    return { value: v, status: s.status, fingerprint: s.fingerprint, notes: v instanceof Body ? v.notes : [] };
  }
  ids(): readonly string[] { return this.order; }

  /**
   * Would doing this step before the one it works on help? Built on the side; nothing of this engine changes (E15: a rescue is offered, never done unasked).
   * It helps when the step is then fine and no more steps are flagged or orphaned than now.
   */
  trySwap(id: string): { worked: boolean; why: string; now: number; after: number } {
    const bad = (e: Engine) => e.ids().filter((i) => e.result(i).status.kind !== "ok").length, now = bad(this);
    let steps: Step[]; try { steps = swapWithInput(this.recipe(), id); } catch (e) { return { worked: false, why: e instanceof Error ? e.message : String(e), now, after: now }; }
    const scratch = new Engine(steps, { parameters: this.table }); try { scratch.build(); const r = scratch.result(id), after = bad(scratch); return { worked: r.status.kind === "ok" && after <= now, why: "why" in r.status ? r.status.why : "", now, after }; } finally { scratch.release(); }
  }
  /** the recipe as it is now, as a list of steps (a fresh engine built from it gives the same answers) */
  recipe(): Step[] { return this.order.map((id) => this.steps.get(id)!); }
  /** change a step's numbers; the steps that depend on it run again, and only those whose inputs came out different */
  edit(id: string, params: Record<string, any>): Changes {
    if (!this.steps.has(id)) throw new Error(`no step ${id}`);
    return this.setRecipe(this.recipe().map((s) => (s.id === id ? { ...s, params } : s)));
  }
  insert(step: Step, opts: { after?: string; splice?: boolean } = {}): Changes { return this.setRecipe(insertStep(this.recipe(), step, opts)); }
  remove(id: string): Changes { return this.setRecipe(removeStep(this.recipe(), id)); }
  move(id: string, after: string | null): Changes { return this.setRecipe(moveStep(this.recipe(), id, after)); }
  swapWithInput(id: string): Changes { return this.setRecipe(swapWithInput(this.recipe(), id)); }

  /**
   * Take a new list of steps (E19). A step that is new, or whose kind, numbers or inputs are different, runs; so does one whose place among the steps it keeps company with has changed
   * (older ids lead when faces merge); then whatever depends on a step whose answer came out different. A step that is gone lets its answer go.
   */
  setRecipe(next: readonly Step[], forced?: Record<string, string>, parameters?: Table): Changes {
    validateRecipe(next); if (parameters) { this.table = { ...parameters }; this.lookup = scopeOf(this.table); }
    const before = new Map(this.steps), ageBefore = new Map(this.age), keep = new Set(next.map((s) => s.id));
    for (const id of this.order) if (!keep.has(id)) { const slot = this.slots.get(id); if (slot) { this.letGo(slot.held); this.slots.delete(id); } }
    this.install(next);
    const same = (a: Step, b: Step) => a.kind === b.kind && JSON.stringify(a.inputs) === JSON.stringify(b.inputs) && JSON.stringify(a.params) === JSON.stringify(b.params);
    const dirty = new Set<string>();
    for (const s of next) { const p = before.get(s.id); if (!p || !same(p, s) || !this.slots.has(s.id) || this.used.get(s.id) !== this.signature(s)) dirty.add(s.id); }
    if (forced) { // which steps are held back is settled together with the recipe, so a step that was changed and is let go runs once, with its new numbers
      const now = new Map(Object.entries(forced));
      for (const id of new Set([...this.forced.keys(), ...now.keys()])) if (this.forced.get(id) !== now.get(id) && this.steps.has(id)) dirty.add(id);
      this.forced = now;
    }
    const kept = next.filter((s) => before.has(s.id)).map((s) => s.id);
    for (let i = 0; i < kept.length; i++) for (let j = i + 1; j < kept.length; j++) if (ageBefore.get(kept[i]!)! > ageBefore.get(kept[j]!)!) { dirty.add(kept[i]!); dirty.add(kept[j]!); }
    return this.settle(dirty);
  }
  /** run the dirty steps in order; what depends on a step whose answer changed is dirty too, and a step whose answer is the same stops it (E18) */
  private settle(dirty: Set<string>): Changes {
    const recomputed: string[] = [], changed: string[] = [];
    for (const sid of this.order) {
      if (!dirty.has(sid)) continue;
      const moved = this.compute(sid); recomputed.push(sid);
      if (!moved) continue;
      changed.push(sid); for (const d of this.dependents.get(sid)!) dirty.add(d);
    }
    return { recomputed, changed };
  }

  /** run one step; true when its answer (value or status) differs from before */
  private compute(id: string): boolean {
    const raw = this.steps.get(id)!, kind = kinds[raw.kind], pr = this.resolveStep(raw), step = "error" in pr ? raw : pr.step; // the numbers are worked out before the step runs: it only ever sees numbers (E66)
    this.used.set(id, "error" in pr ? `error:${pr.error}` : JSON.stringify(step.params));
    const inputs = step.inputs.map((i) => this.slots.get(i)?.held.v ?? new NoBody()); // a step taken out leaves nothing: the step that worked on it is orphaned
    const temps: Body[] = [], ctx: Ctx = { step, age: (s) => this.age.get(s) ?? -1, temp: (b) => { temps.push(b); return b; } };
    this.computes++; this.watch?.(id);
    let value: Value, status: Status = { kind: "ok" };
    if (this.forced.has(id)) { status = { kind: "flagged", why: this.forced.get(id)! }; value = kind ? passthrough(kind, inputs, step) : new NoBody(); }
    else if (!kind) { value = new NoBody(); status = { kind: "flagged", why: `there is no step kind ${step.kind}` }; }
    else if ("error" in pr) { status = { kind: "flagged", why: pr.error }; value = passthrough(kind, inputs, step); }
    else {
      try { value = K.scoped(() => kind.run(inputs, ctx)); }
      catch (e) {
        status = e instanceof RefLost ? { kind: "orphaned", why: e.message } : e instanceof Refusal ? { kind: "flagged", why: e.message, victims: e.victims } : { kind: "flagged", why: e instanceof Error ? e.message : "the kernel could not make this step" };
        value = passthrough(kind, inputs, step);
      }
    }
    for (const b of temps) if (b !== value) b.release(); // the bodies made on the way are not kept (E17)
    const fresh = this.slots.get(id), shared = fresh?.held.v === value;
    const held = shared ? fresh!.held : this.hold(value);
    const next: Slot = { held, status, fingerprint: fingerprintOf(value) };
    const moved = !fresh || fresh.fingerprint !== next.fingerprint || fresh.status.kind !== status.kind || ("why" in fresh.status ? fresh.status.why : "") !== ("why" in status ? status.why : "") || JSON.stringify((fresh.status as { victims?: string[] }).victims ?? null) !== JSON.stringify((status as { victims?: string[] }).victims ?? null);
    if (!shared) held.refs++;
    this.slots.set(id, next);
    if (fresh && !shared) this.letGo(fresh.held);
    return moved;
  }
  private heldBy = new Map<Value, Held>();
  private hold(v: Value): Held { const h = this.heldBy.get(v) ?? new Held(v); this.heldBy.set(v, h); return h; }
  private letGo(h: Held): void { if (--h.refs <= 0) { this.heldBy.delete(h.v); if (h.v instanceof Body || h.v instanceof NoBody) h.v.release(); } }

  /** the unified list of lines the interface works with (E5): the edges of a body, each by the two faces beside it, or the lines of a sketch */
  lines(id: string): { id: string; ends?: [K.V3, K.V3]; from: "sketch" | "body" }[] {
    const v = this.slots.get(id)!.held.v;
    if (v instanceof Body) return v.edges().map((e) => ({ id: e.ref ? JSON.stringify([e.ref.a, e.ref.b]) : "free", ends: K.edgeEnds(e.h), from: "body" as const }));
    if (v instanceof NoBody) return [];
    return v.lines.map((l) => ({ id: JSON.stringify(l.id), ends: [l.a, l.b] as [K.V3, K.V3], from: "sketch" as const }));
  }
  release(): void { for (const s of this.slots.values()) this.letGo(s.held); this.slots.clear(); }
}
