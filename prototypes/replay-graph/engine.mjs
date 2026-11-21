// Spike 3: replay cost of an edit through a recipe held as a flat list, a dependency graph, or a graph that stops where a step's output did not change.
// Throwaway (CLAUDE.md rule 9). A step is { id, kind, params, inputs: [ids] }; the history order is a valid order to compute in.

/** A value is shared by a pass-through, so it is counted and freed when the last result that holds it lets go. */
class Held { constructor(v, free) { this.v = v; this.refs = 0; this.free = free; } }

export function makeEngine(kernel, steps) {
  const byId = new Map(steps.map((s, i) => [s.id, { ...s, index: i }]));
  const dependents = new Map(steps.map((s) => [s.id, []]));
  for (const s of steps) for (const i of s.inputs) dependents.get(i).push(s.id);
  const res = new Map(); // id -> { held, hash, flagged, note }
  let computes = 0;

  const release = (r) => { if (!r) return; r.held.refs--; if (r.held.refs <= 0) r.held.free?.(); };
  function compute(id) {
    const s = byId.get(id), ins = s.inputs.map((i) => res.get(i));
    computes++;
    let held, flagged = false, note = "";
    try {
      const v = kernel.run(s.kind, s.params, ins.map((r) => r.held.v));
      held = new Held(v, () => kernel.free(v));
    } catch (e) {
      flagged = true; note = String(e.message ?? e).slice(0, 60);
      held = ins[0]?.held ?? new Held(null); // the step is flagged and passes its first input through
    }
    held.refs++;
    const old = res.get(id);
    const hash = held.v ? kernel.hash(held.v) : "empty";
    res.set(id, { held, hash, flagged, note });
    release(old);
    return { changed: !old || old.hash !== hash };
  }
  const buildAll = () => { for (const s of steps) compute(s.id); };

  /**
   * An edit to step `id` (its params already changed). mode:
   *  flat:   every step from the edited one on, in list order (a recipe replayed after the point of the edit)
   *  graph:  the edited step and everything that depends on it
   *  cutoff: as graph, but a step whose inputs all came out unchanged is not recomputed
   */
  function edit(id, mode) {
    const t0 = performance.now(), before = computes;
    const start = byId.get(id).index;
    if (mode === "flat") for (let i = start; i < steps.length; i++) compute(steps[i].id);
    else {
      const dirty = new Set([id]), changed = new Set();
      for (let i = start; i < steps.length; i++) {
        const s = steps[i];
        if (!dirty.has(s.id)) continue;
        const r = compute(s.id);
        if (mode === "cutoff" && !r.changed) continue; // the output is the same as before: nothing downstream moves
        changed.add(s.id);
        for (const d of dependents.get(s.id)) dirty.add(d);
      }
    }
    return { computes: computes - before, ms: performance.now() - t0 };
  }
  const flaggedCount = () => [...res.values()].filter((r) => r.flagged).length;
  const dispose = () => { for (const r of res.values()) release(r); res.clear(); };
  return { buildAll, edit, byId, steps, res, flaggedCount, dispose, computeCount: () => computes };
}

/** A recipe of `bodies` bodies of `per` steps each, interleaved as a person would (a step on one body, then another), then joins in groups of four. */
export function makeRecipe(bodies, per, seed = 1) {
  let a = seed; const rnd = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const chains = [];
  for (let b = 0; b < bodies; b++) {
    const x0 = b * 15, chain = [{ id: `b${b}s0`, kind: "box", params: { x: x0, w: 40, h: 30, d: 10 }, inputs: [], body: b }];
    for (let j = 1; j < per; j++) {
      const kind = ["hole", "boss", "fillet"][(j - 1) % 3], prev = chain[j - 1].id;
      const params = kind === "hole" ? { x: x0 + 5 + rnd() * 30, y: 5 + rnd() * 20, r: 1.5 + rnd() * 2, d: 10 }
        : kind === "boss" ? { x: x0 + 2 + rnd() * 20, y: 2 + rnd() * 15, w: 8, h: 8, t: 3, d: 10 }
        : { r: 0.5 + rnd(), which: Math.floor((j - 1) / 3) % 4, x: x0, w: 40, h: 30, d: 10 };
      chain.push({ id: `b${b}s${j}`, kind, params, inputs: [prev], body: b });
    }
    chains.push(chain);
  }
  const steps = [];
  for (let j = 0; j < per; j++) for (let b = 0; b < bodies; b++) steps.push(chains[b][j]);
  let g = 0;
  for (let b0 = 0; b0 < bodies; b0 += 4) {
    let acc = chains[b0][per - 1].id;
    for (let b = b0 + 1; b < Math.min(bodies, b0 + 4); b++) { const id = `join${g++}`; steps.push({ id, kind: "join", params: {}, inputs: [acc, chains[b][per - 1].id], body: -1 }); acc = id; }
  }
  return { steps, chains };
}
