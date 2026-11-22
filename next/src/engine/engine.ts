// The engine (E2, E13, E18, E19, E20): a recipe of steps, run in an order that suits their inputs; each result has a status, and a failed step is flagged and passes its input through,
// so the model is never lost (E13). An edit recomputes only the steps that depend on it and stops where an answer is unchanged (E18).
import * as K from "./kernel.ts";
import { type Note, Body, RefLost } from "./lineage.ts";
import { type Ctx, type Step, type Value, NoBody, kinds, passthrough } from "./steps.ts";
import { insertStep, moveStep, removeStep, swapWithInput, validateRecipe } from "./recipe.ts";
import "./curved.ts"; // registers revolve, loft, sweep and shell
import "./pull.ts"; // registers moveFace and offsetFace (pull modes 3 and 4)
import "./pattern.ts"; // registers pattern and mirror (copies of a body, E44 to E47)
import { scopeKinds } from "./scope.ts"; // steps that name a body work on that body alone (E40, E41)
scopeKinds();

export type Status = { kind: "ok" } | { kind: "flagged"; why: string } | { kind: "orphaned"; why: string };
export interface Changes { recomputed: string[]; changed: string[] }
export interface Result { value: Value; status: Status; fingerprint: string; notes: Note[] }

/** a value shared by a pass-through is freed when the last result holding it lets go (E17) */
class Held { refs = 0; readonly v: Value; constructor(v: Value) { this.v = v; } }
interface Slot { held: Held; status: Status; fingerprint: string }

const fingerprintOf = (v: Value): string => (v instanceof Body ? v.fingerprint() : v instanceof NoBody ? "empty" : JSON.stringify([v.lines.map((l) => [l.id, l.a, l.b]), v.circle ?? null, v.normal, v.open ?? false, v.face ?? null])); // everything a step could read of it: a circle has no lines

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

  constructor(steps: readonly Step[], opts: { forced?: Record<string, string>; watch?: (id: string) => void } = {}) {
    this.forced = new Map(Object.entries(opts.forced ?? {})); this.watch = opts.watch ?? null; this.install(steps);
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
    const scratch = new Engine(steps); try { scratch.build(); const r = scratch.result(id), after = bad(scratch); return { worked: r.status.kind === "ok" && after <= now, why: "why" in r.status ? r.status.why : "", now, after }; } finally { scratch.release(); }
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
  setRecipe(next: readonly Step[], forced?: Record<string, string>): Changes {
    validateRecipe(next);
    const before = new Map(this.steps), ageBefore = new Map(this.age), keep = new Set(next.map((s) => s.id));
    for (const id of this.order) if (!keep.has(id)) { const slot = this.slots.get(id); if (slot) { this.letGo(slot.held); this.slots.delete(id); } }
    this.install(next);
    const same = (a: Step, b: Step) => a.kind === b.kind && JSON.stringify(a.inputs) === JSON.stringify(b.inputs) && JSON.stringify(a.params) === JSON.stringify(b.params);
    const dirty = new Set<string>();
    for (const s of next) { const p = before.get(s.id); if (!p || !same(p, s) || !this.slots.has(s.id)) dirty.add(s.id); }
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
    const step = this.steps.get(id)!, kind = kinds[step.kind];
    const inputs = step.inputs.map((i) => this.slots.get(i)?.held.v ?? new NoBody()); // a step taken out leaves nothing: the step that worked on it is orphaned
    const temps: Body[] = [], ctx: Ctx = { step, age: (s) => this.age.get(s) ?? -1, temp: (b) => { temps.push(b); return b; } };
    this.computes++; this.watch?.(id);
    let value: Value, status: Status = { kind: "ok" };
    if (this.forced.has(id)) { status = { kind: "flagged", why: this.forced.get(id)! }; value = kind ? passthrough(kind, inputs, step) : new NoBody(); }
    else if (!kind) { value = new NoBody(); status = { kind: "flagged", why: `there is no step kind ${step.kind}` }; }
    else {
      try { value = K.scoped(() => kind.run(inputs, ctx)); }
      catch (e) {
        status = e instanceof RefLost ? { kind: "orphaned", why: e.message } : { kind: "flagged", why: e instanceof Error ? e.message : "the kernel could not make this step" };
        value = passthrough(kind, inputs, step);
      }
    }
    for (const b of temps) if (b !== value) b.release(); // the bodies made on the way are not kept (E17)
    const fresh = this.slots.get(id), shared = fresh?.held.v === value;
    const held = shared ? fresh!.held : this.hold(value);
    const next: Slot = { held, status, fingerprint: fingerprintOf(value) };
    const moved = !fresh || fresh.fingerprint !== next.fingerprint || fresh.status.kind !== status.kind || ("why" in fresh.status ? fresh.status.why : "") !== ("why" in status ? status.why : "");
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
