// The studio: the document's recipe, the engine's worker behind the host, and what the screen shows of its answer (`in_1566`). A change is a new recipe; it goes to the worker, which makes every step (a sketch, an extrude, ...) and answers with each
// step's status; the body the last step made is then asked for as a mesh. Changes are made one after another and the screen is told when the answer is in; while it is out, the screen has its own ghost. Nothing here decides geometry: it sends and reads.
import type { MeshSnap } from "./engine/exchange.ts";
import { webWorker } from "./engine/host-web.ts";
import type { Spawn } from "./engine/host.ts";
import { EngineHost } from "./engine/host.ts";
import type { EdgeRef, Id, VertexRef } from "./engine/id.ts";
import type { Ask, StepSnap } from "./engine/protocol.ts";
import type { Step } from "./engine/steps.ts";

export interface FaceInfo {
  id: string;
  ref: Id;
  /** where its triangles are in `indices` (index units) */ start: number;
  count: number;
  /** the body it is in (its name; null: none) */ body: string | null;
}
export interface EdgeInfo {
  key: string;
  ref: EdgeRef;
  body: string | null;
  /** where its polyline is in `lines` (points) */ start: number;
  count: number;
}
/** a corner of a body that has a name (three faces or more meet there), for picking and marking */
export interface VertexInfo {
  key: string;
  ref: VertexRef;
  body: string | null;
  at: [number, number, number];
}
export interface BodyMesh {
  /** the step that made it */ id: string;
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  /** pairs of points: the edges as short lines */ edges: Float32Array;
  /** the faces and edges, by name, for picking and marking (only edges that have a name: two faces beside them) */ faces: FaceInfo[];
  edgeInfo: EdgeInfo[];
  vertexInfo: VertexInfo[];
  /** the bodies in it: the name each is known by and as data (a step takes it to name the body it works on) */ bodies: {
    key: string;
    id: Id;
  }[];
  /** which of `edges` (in pairs of points) belong to which body, in order */ edgeParts: {
    body: string | null;
    from: number;
    to: number;
  }[];
  /** the points of every edge's polyline, x y z each */ lines: Float32Array;
}
export interface StudioState {
  steps: readonly Step[];
  meshes: readonly BodyMesh[];
  busy: boolean;
  /** what the last answer said was wrong with a step, in words ("" when all is well) */ problem: string;
  snapshot: readonly StepSnap[];
  /** the step that made the model as it is now, from the engine (null: no body) */
  current: string | null;
}

/** an engine mesh as buffers: each edge's points are joined by short lines */
export function meshBuffers(id: string, m: MeshSnap): BodyMesh {
  const segs: number[] = [],
    edgeParts: { body: string | null; from: number; to: number }[] = [];
  for (const g of m.edges) {
    if (g.seam) continue; // (the seam of a cylinder is not a line the body has, to look at)
    const from = segs.length / 6;
    for (let i = g.start; i + 1 < g.start + g.count; i++)
      segs.push(
        m.lines[3 * i]!,
        m.lines[3 * i + 1]!,
        m.lines[3 * i + 2]!,
        m.lines[3 * i + 3]!,
        m.lines[3 * i + 4]!,
        m.lines[3 * i + 5]!,
      );
    edgeParts.push({ body: g.body, from, to: segs.length / 6 });
  }
  return {
    id,
    positions: new Float32Array(m.positions),
    normals: new Float32Array(m.normals),
    indices: new Uint32Array(m.indices),
    edges: new Float32Array(segs),
    lines: new Float32Array(m.lines),
    faces: m.faces.map((f) => ({ id: f.id, ref: f.ref, start: f.start, count: f.count, body: f.body })),
    bodies: m.bodies,
    edgeParts,
    edgeInfo: m.edges.flatMap((e) =>
      e.key && e.ref ? [{ key: e.key, ref: e.ref, body: e.body, start: e.start, count: e.count }] : [],
    ),
    vertexInfo: m.vertices,
  };
}

export function createStudio(spawn: Spawn = webWorker()) {
  const host = new EngineHost(spawn, { timeoutMs: 30000, memoryMb: 1500 });
  let state: StudioState = { steps: [], meshes: [], busy: false, problem: "", snapshot: [], current: null },
    loaded = false,
    version = 0,
    pending = 0,
    queue: Promise<void> = Promise.resolve();
  const listeners = new Set<() => void>(),
    tell = () => listeners.forEach((f) => f());
  const set = (p: Partial<StudioState>) => {
    state = { ...state, ...p };
    tell();
  };

  async function run(steps: Step[], mine: number): Promise<void> {
    const out = await (loaded ? host.apply(steps) : host.load(steps));
    loaded = true;
    if (mine !== version) return; // (a newer recipe is on its way)
    const snap = out.snapshot.steps,
      bad = snap.filter((s) => s.status.kind !== "ok"),
      current = out.snapshot.current; // (the engine says which step is the model now; the page does not guess)
    const problem = out.fresh
      ? bad.length
        ? bad.map((s) => `${s.id}: ${(s.status as { why?: string }).why ?? s.status.kind}`).join("; ")
        : out.events.join("; ")
      : out.events.join("; ");
    let meshes: BodyMesh[] = [];
    if (current) {
      const r = await host.ask({ what: "mesh", step: current });
      if (r.ok) meshes = [meshBuffers(current, r.data as MeshSnap)];
      else if (!problem) set({ problem: r.why });
    }
    if (mine === version) set({ meshes, problem, snapshot: snap, current });
  }
  return {
    state: (): StudioState => state,
    subscribe(f: () => void): () => void {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    /** A new recipe: made by the worker after the ones before it; the screen is told when it is in. */
    change(steps: Step[]): void {
      const mine = ++version;
      pending++;
      set({ steps, busy: true });
      queue = queue
        .then(() => run(steps, mine))
        .catch((e: unknown) => {
          set({ problem: e instanceof Error ? e.message : String(e) });
        })
        .finally(() => {
          pending--;
          if (!pending) set({ busy: false });
        });
    },
    /** A question about the recipe the worker holds (a file of the body: `export`). */
    ask: (q: Ask) => host.ask(q),
    /** Ready when everything asked for so far has been answered. */
    settled: (): Promise<void> => queue.then(() => undefined),
    dispose: () => host.dispose(),
  };
}
