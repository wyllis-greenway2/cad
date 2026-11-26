// A dev check (not a test) of the failure questions across the worker boundary: the answers are plain data, the recipe and the picture are not changed, and a question that cannot be answered says so.
//   node --experimental-strip-types dev/failure-worker-check.ts
import { EngineHost } from "../src/engine/host.ts";
import { nodeWorker } from "../src/engine/host-node.ts";
import { edgeRef, mint } from "../src/engine/id.ts";
import type { Step } from "../src/engine/steps.ts";
import { check, fail, failureCount } from "./lib.ts";
const W = 40,
  H = 30,
  D = 10,
  top = mint("A", "end"),
  side = (i: number) => mint("A", "side", mint("sk", "line", i));
const recipe: Step[] = [
  {
    id: "sk",
    kind: "sketchPolygon",
    params: {
      points: [
        [0, 0],
        [W, 0],
        [W, H],
        [0, H],
      ],
    },
    inputs: [],
  },
  { id: "A", kind: "extrude", params: { d: D }, inputs: ["sk"] },
  {
    id: "C",
    kind: "round",
    params: { mode: "chamfer", size: 3, edges: [0, 1, 2, 3].map((i) => edgeRef(top, side(i))) },
    inputs: ["A"],
  },
  { id: "M", kind: "moveFace", params: { face: top, dist: 12.5 }, inputs: ["C"] },
];
const host = new EngineHost(nodeWorker(), { timeoutMs: 60000, memoryMb: 3000 });
try {
  const none = await host.ask({ what: "options", step: "M" });
  check("nothing is loaded yet: said in words", !none.ok && /no recipe/.test(none.why), JSON.stringify(none));
  const out = await host.load(recipe),
    before = JSON.stringify(out.snapshot.steps.map((s) => [s.id, s.status, s.fingerprint]));
  check(
    "the recipe is loaded and M is flagged",
    out.snapshot.steps.find((s) => s.id === "M")?.status.kind === "flagged",
  );
  const o = await host.ask({ what: "options", step: "M" });
  check(
    "options come back as data",
    o.ok && Array.isArray(o.data) && (o.data as any[]).length === 5,
    o.ok ? (o.data as any[]).map((x) => `${x.kind}${x.worked ? "+" : ""}`).join(" ") : o.why,
  );
  const mesh = await host.ask({ what: "mesh", step: "A" });
  check(
    "a mesh comes back as plain data, by face id",
    mesh.ok &&
      (mesh.data as any).triangles > 0 &&
      (mesh.data as any).faces.length > 0 &&
      typeof (mesh.data as any).faces[0].id === "string",
    mesh.ok ? `${(mesh.data as any).triangles} triangles` : mesh.why,
  );
  const stl = await host.ask({ what: "export", step: "A", format: "stl" });
  check(
    "an STL comes back as bytes in base64 of the right length",
    stl.ok &&
      (stl.data as any).bytes === 84 + 50 * (mesh.ok ? (mesh.data as any).triangles : -1) &&
      typeof (stl.data as any).base64 === "string",
    stl.ok ? String((stl.data as any).bytes) : stl.why,
  );
  const step = await host.ask({ what: "export", step: "A", format: "step" });
  check(
    "a STEP comes back",
    step.ok && (step.data as any).bytes > 1000,
    step.ok ? String((step.data as any).bytes) : step.why,
  );
  const noMesh = await host.ask({ what: "mesh", step: "sk" });
  check(
    "a mesh of a step with no body is refused in words",
    !noMesh.ok && /no body/.test(noMesh.why),
    noMesh.ok ? "" : noMesh.why,
  );
  const t = await host.ask({ what: "trial", change: { op: "edit", step: "M", params: { face: top, dist: 8 } } });
  check(
    "a trial comes back as data and is ok",
    t.ok && (t.data as any).kind === "ok" && typeof (t.data as any).volume === "number",
    t.ok ? JSON.stringify(t.data).slice(0, 120) : t.why,
  );
  const p = await host.ask({ what: "probe", step: "M", key: "dist", lo: -8, hi: 20 });
  check(
    "a probe comes back as data: works from -8 to 12",
    p.ok && (p.data as any).ok.length === 1 && Math.abs((p.data as any).ok[0].to - 12) < 0.01,
    p.ok ? JSON.stringify((p.data as any).ok) : p.why,
  );
  const e = await host.ask({ what: "options", step: "nothing" });
  check(
    "a question about a step that is not there is refused in words",
    !e.ok && /no step nothing/.test(e.why),
    e.ok ? "" : e.why,
  );
  const again = await host.apply(recipe);
  check(
    "the recipe and the picture are as they were",
    JSON.stringify(again.snapshot.steps.map((s) => [s.id, s.status, s.fingerprint])) === before,
  );
} finally {
  host.dispose();
}
console.log(failureCount() ? `\n${failureCount()} failureCount()` : "\nno failure");
process.exit(failureCount() ? 1 : 0);
