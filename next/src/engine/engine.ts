// The engine (E2, E13, E18, E19, E20): a recipe of steps, run in an order that suits their inputs; each result has a status, and a failed step is flagged and passes its input through,
// so the model is never lost (E13). An edit recomputes only the steps that depend on it and stops where an answer is unchanged (E18).
import * as K from "./kernel.ts";
import { type Note, Body, RefLost } from "./lineage.ts";
import { type Ctx, type Step, type Value, NoBody, kinds, passthrough } from "./steps.ts";

export type Status = { kind: "ok" } | { kind: "flagged"; why: string } | { kind: "orphaned"; why: string };
export interface Result { value: Value; status: Status; fingerprint: string; notes: Note[] }

/** a value shared by a pass-through is freed when the last result holding it lets go (E17) */
class Held { refs = 0; readonly v: Value; constructor(v: Value) { this.v = v; } }
interface Slot { held: Held; status: Status; fingerprint: string }

const fingerprintOf = (v: Value): string => (v instanceof Body ? v.fingerprint() : v instanceof NoBody ? "empty" : JSON.stringify(v.lines.map((l) => [l.id, l.a, l.b])));

export class Engine {
  private steps = new Map<string, Step>();
  private order: string[] = [];
  private dependents = new Map<string, string[]>();
  private slots = new Map<string, Slot>();
  private age = new Map<string, number>();
  /** how many steps were computed so far (for measuring what an edit cost) */
  computes = 0;

  constructor(steps: readonly Step[]) {
    steps.forEach((s, i) => {
      if (this.steps.has(s.id)) throw new Error(`two steps are called ${s.id}`);
      for (const inp of s.inputs) if (!this.steps.has(inp)) throw new Error(`step ${s.id} works on ${inp}, which is not an earlier step`);
      this.steps.set(s.id, s); this.order.push(s.id); this.age.set(s.id, i); this.dependents.set(s.id, []);
      for (const inp of s.inputs) this.dependents.get(inp)!.push(s.id);
    });
  }

  build(): void { for (const id of this.order) this.compute(id); }
  step(id: string): Step { return this.steps.get(id)!; }
  result(id: string): Result {
    const s = this.slots.get(id)!, v = s.held.v;
    return { value: v, status: s.status, fingerprint: s.fingerprint, notes: v instanceof Body ? v.notes : [] };
  }
  ids(): readonly string[] { return this.order; }

  /** change a step's numbers; the steps that depend on it run again, and only those whose inputs came out different */
  edit(id: string, params: Record<string, any>): { recomputed: string[]; changed: string[] } {
    const old = this.steps.get(id); if (!old) throw new Error(`no step ${id}`);
    this.steps.set(id, { ...old, params });
    const dirty = new Set([id]), recomputed: string[] = [], changed: string[] = [];
    for (const sid of this.order.slice(this.age.get(id)!)) {
      if (!dirty.has(sid)) continue;
      const moved = this.compute(sid); recomputed.push(sid);
      if (!moved) continue; // the answer is the same as before: nothing after it moves
      changed.push(sid); for (const d of this.dependents.get(sid)!) dirty.add(d);
    }
    return { recomputed, changed };
  }

  /** run one step; true when its answer (value or status) differs from before */
  private compute(id: string): boolean {
    const step = this.steps.get(id)!, kind = kinds[step.kind];
    const inputs = step.inputs.map((i) => this.slots.get(i)!.held.v);
    const ctx: Ctx = { step, age: (s) => this.age.get(s) ?? -1 };
    this.computes++;
    let value: Value, status: Status = { kind: "ok" };
    if (!kind) { value = new NoBody(); status = { kind: "flagged", why: `there is no step kind ${step.kind}` }; }
    else {
      try { value = K.scoped(() => kind.run(inputs, ctx)); }
      catch (e) {
        status = e instanceof RefLost ? { kind: "orphaned", why: e.message } : { kind: "flagged", why: e instanceof Error ? e.message : String(e).slice(0, 80) };
        value = passthrough(kind, inputs, step);
      }
    }
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
