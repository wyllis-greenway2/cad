// The studio: the document's recipe, the engine's worker behind the host, and what the screen shows of its answer (`in_1566`). A change is a new recipe; it goes to the worker, which makes every step (a sketch, an extrude, ...) and answers with each
// step's status; the body the last step made is then asked for as a mesh. Changes are made one after another and the screen is told when the answer is in; while it is out, the screen has its own ghost. Nothing here decides geometry: it sends and reads.
import { EngineHost } from "./engine/host.ts";
import type { Spawn } from "./engine/host.ts";
import { webWorker } from "./engine/host-web.ts";
import type { Step } from "./engine/steps.ts";
import type { MeshSnap } from "./engine/exchange.ts";
import type { StepSnap } from "./engine/protocol.ts";

export interface BodyMesh { id: string; positions: Float32Array; normals: Float32Array; indices: Uint32Array; /** pairs of points: the edges as short lines */ edges: Float32Array }
export interface StudioState { steps: readonly Step[]; meshes: readonly BodyMesh[]; busy: boolean; /** what the last answer said was wrong with a step, in words ("" when all is well) */ problem: string; snapshot: readonly StepSnap[] }

/** an engine mesh as buffers: each edge's points are joined by short lines */
export function meshBuffers(id: string, m: MeshSnap): BodyMesh {
  const segs: number[] = [];
  for (const g of m.edges) for (let i = g.start; i + 1 < g.start + g.count; i++) segs.push(m.lines[3 * i]!, m.lines[3 * i + 1]!, m.lines[3 * i + 2]!, m.lines[3 * i + 3]!, m.lines[3 * i + 4]!, m.lines[3 * i + 5]!);
  return { id, positions: new Float32Array(m.positions), normals: new Float32Array(m.normals), indices: new Uint32Array(m.indices), edges: new Float32Array(segs) };
}

export function createStudio(spawn: Spawn = webWorker()) {
  const host = new EngineHost(spawn, { timeoutMs: 30000, memoryMb: 1500 });
  let state: StudioState = { steps: [], meshes: [], busy: false, problem: "", snapshot: [] }, loaded = false, version = 0, pending = 0, queue: Promise<void> = Promise.resolve();
  const listeners = new Set<() => void>(), tell = () => listeners.forEach((f) => f());
  const set = (p: Partial<StudioState>) => { state = { ...state, ...p }; tell(); };

  async function run(steps: Step[], mine: number): Promise<void> {
    const out = await (loaded ? host.apply(steps) : host.load(steps)); loaded = true;
    if (mine !== version) return; // (a newer recipe is on its way)
    const snap = out.snapshot.steps, bad = snap.filter((s) => s.status.kind !== "ok"), last = [...snap].reverse().find((s) => s.output === "body" && s.status.kind !== "orphaned");
    const problem = out.fresh ? (bad.length ? bad.map((s) => `${s.id}: ${(s.status as { why?: string }).why ?? s.status.kind}`).join("; ") : out.events.join("; ")) : out.events.join("; ");
    let meshes: BodyMesh[] = [];
    if (last) { const r = await host.ask({ what: "mesh", step: last.id }); if (r.ok) meshes = [meshBuffers(last.id, r.data as MeshSnap)]; else if (!problem) set({ problem: r.why }); }
    if (mine === version) set({ meshes, problem, snapshot: snap });
  }
  return {
    state: (): StudioState => state,
    subscribe(f: () => void): () => void { listeners.add(f); return () => listeners.delete(f); },
    /** A new recipe: made by the worker after the ones before it; the screen is told when it is in. */
    change(steps: Step[]): void {
      const mine = ++version; pending++; set({ steps, busy: true });
      queue = queue.then(() => run(steps, mine)).catch((e: unknown) => { set({ problem: e instanceof Error ? e.message : String(e) }); }).finally(() => { pending--; if (!pending) set({ busy: false }); });
    },
    /** Ready when everything asked for so far has been answered. */
    settled: (): Promise<void> => queue.then(() => undefined),
    dispose: () => host.dispose(),
  };
}
