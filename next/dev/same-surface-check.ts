// A dev check (not a test, `in_1444`) for the same-surface test (E37): faces that lie on one surface, and faces that do not, for every kind the engine joins.
//   node --experimental-strip-types dev/same-surface-check.ts
import { initKernel } from "../src/engine/kernel.ts";
import * as K from "../src/engine/kernel.ts";
await initKernel();
let failures = 0;
const check = (label: string, got: boolean, want: boolean) => {
  const ok = got === want;
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}: ${got}${ok ? "" : ` (wanted ${want})`}`);
};
type V3 = K.V3;
const rev = (pts: V3[], mids: (V3 | null)[], deg: number) =>
  K.revolve(K.profileFace({ kind: "poly", pts, mids }), [0, 0, 0], [0, 0, 1], deg).solid;
const faceOf = (s: K.Solid, type: string, pick?: (q: K.Facts) => boolean) =>
  s.faces().find((f) => {
    const q = K.facts(f);
    return q.type === type && (!pick || pick(q));
  })!;
const turned = (s: K.Solid, deg: number) => K.turn(s, [0, 0, 1], deg).solid;
const tried = (label: string, f: () => void) => {
  try {
    f();
  } catch (e) {
    failures++;
    console.log(`  FAIL ${label}: ${e instanceof Error ? e.message : String(e)}`);
  }
};

console.log("cone");
tried("cone", () => {
  const A = rev(
      [
        [0, 0, 0],
        [10, 0, 0],
        [4, 0, 12],
        [0, 0, 12],
      ],
      [null, null, null, null],
      180,
    ),
    B = turned(A, 180),
    C = rev(
      [
        [0, 0, 0],
        [10, 0, 0],
        [6, 0, 12],
        [0, 0, 12],
      ],
      [null, null, null, null],
      180,
    );
  const a = faceOf(A, "CONE"),
    b = faceOf(B, "CONE"),
    c = faceOf(C, "CONE");
  check("a half cone and the other half (turned 180)", K.sameSurface(a, b), true);
  check("a cone face and itself", K.sameSurface(a, a), true);
  check("a cone and a cone of another angle", K.sameSurface(a, c), false);
  check("a cone and the same cone moved up 3", K.sameSurface(a, faceOf(K.move(A, [0, 0, 3]).solid, "CONE")), false);
});
console.log("sphere");
tried("sphere", () => {
  const half = (r: number) =>
    rev(
      [
        [0, 0, -r],
        [0, 0, r],
      ],
      [[r, 0, 0], null],
      180,
    );
  const A = half(5),
    B = turned(A, 180),
    C = half(6),
    D = K.move(half(5), [1, 0, 0]).solid;
  const a = faceOf(A, "SPHERE"),
    b = faceOf(B, "SPHERE");
  check("a half sphere and the other half", K.sameSurface(a, b), true);
  check("a sphere of radius 5 and one of 6", K.sameSurface(a, faceOf(C, "SPHERE")), false);
  check("a sphere and one moved 1 aside", K.sameSurface(a, faceOf(D, "SPHERE")), false);
});
console.log("torus (a fillet on a rod's rim)");
tried("torus", () => {
  const rod = (r: number) =>
    K.prism(K.profileFace({ kind: "circle", c: [0, 0, 0], r, normal: [0, 0, 1] }), [0, 0, 30]).solid;
  const rim = (s: K.Solid) =>
    s.faces().find((f) => {
      const q = K.facts(f);
      return q.type === "PLANE" && q.ne[2] > 0.99;
    })!;
  const rounded = (size: number, r = 10) => {
    const s = rod(r);
    return K.roundEdges(s, K.faceEdges(rim(s)), size, "fillet").solid;
  };
  const A = rounded(3),
    B = turned(A, 40),
    C = rounded(4),
    D = rounded(3, 12);
  const a = faceOf(A, "TORUS"),
    b = faceOf(B, "TORUS");
  check("a torus and the same turned 40 degrees about its axis", K.sameSurface(a, b), true);
  check("a torus of minor radius 3 and one of 4", K.sameSurface(a, faceOf(C, "TORUS")), false);
  check("a torus on a rod of radius 10 and on one of 12", K.sameSurface(a, faceOf(D, "TORUS")), false);
  check("a torus and a cylinder", K.sameSurface(a, faceOf(A, "CYLINDRE")), false);
});
console.log("plane and cylinder (as before)");
tried("plane", () => {
  const b = K.prism(
      K.profileFace({
        kind: "poly",
        pts: [
          [0, 0, 0],
          [10, 0, 0],
          [10, 10, 0],
          [0, 10, 0],
        ],
        mids: [null, null, null, null],
      }),
      [0, 0, 5],
    ).solid,
    top = faceOf(b, "PLANE", (q) => q.ne[2] > 0.99),
    bottom = faceOf(b, "PLANE", (q) => q.ne[2] < -0.99);
  check("the top and the bottom of a block", K.sameSurface(top, bottom), false);
  check("the top and itself", K.sameSurface(top, top), true);
});
console.log("two half-revolves joined by the engine: faces and wholes");
tried("engine", async () => {});
{
  const { Engine } = await import("../src/engine/engine.ts"),
    { Body, wholes } = await import("../src/engine/lineage.ts");
  for (const [name, pts, mids] of [
    [
      "cone",
      [
        [0, 0],
        [10, 0],
        [4, 12],
        [0, 12],
      ],
      undefined,
    ],
    [
      "cylinder",
      [
        [0, 0],
        [10, 0],
        [10, 12],
        [0, 12],
      ],
      undefined,
    ],
  ] as const) {
    const e = new Engine([
      { id: "sk", kind: "sketchPolygon", params: { plane: "XZ", points: pts, ...(mids ? { mids } : {}) }, inputs: [] },
      { id: "R", kind: "revolve", params: { deg: 180 }, inputs: ["sk"] },
      { id: "T", kind: "turn", params: { axis: [0, 0, 1], deg: 180 }, inputs: ["R"] },
      { id: "J", kind: "combine", params: { mode: "add" }, inputs: ["R", "T"] },
    ] as any);
    e.build();
    const r = e.result("J"),
      b = r.value as InstanceType<typeof Body>;
    if (r.status.kind !== "ok") {
      failures++;
      console.log(`  FAIL ${name}: ${r.status.kind} ${"why" in r.status ? r.status.why : ""}`);
      e.release();
      continue;
    }
    const ids = b.faces.map((f) =>
        [f.id, ...f.alias].map((x) => `${x.step}.${x.role}${x.pieces.length ? "/" + x.pieces.join(".") : ""}`),
      ),
      dup =
        new Set(b.faces.map((f) => `${f.id.step}.${f.id.role}${JSON.stringify(f.id.of)}${f.id.pieces.join(".")}`))
          .size !== b.faces.length;
    console.log(
      `  ${name.padEnd(11)} ${K.volume(b.solid).toFixed(2)} volume, ${b.faces.length} faces, ${wholes(b).length} wholes, ${b.faces.filter((f) => f.defect).length} unnamed${dup ? ", DUPLICATE ids" : ""}`,
    );
    if (dup || b.faces.some((f) => f.defect)) failures++;
    e.release();
  }
}
{
  // a rod with its rim rounded (a torus), the top pushed down and up: the torus is a neighbour of the moved face
  const { Engine } = await import("../src/engine/engine.ts"),
    { Body, wholes } = await import("../src/engine/lineage.ts"),
    { edgeRef, mint } = await import("../src/engine/id.ts");
  const top = mint("E", "end"),
    wall = mint("E", "side", mint("c", "circle"), 0);
  for (const dist of [-4, 3]) {
    const e = new Engine([
      { id: "c", kind: "sketchCircle", params: { r: 10 }, inputs: [] },
      { id: "E", kind: "extrude", params: { d: 30 }, inputs: ["c"] },
      { id: "F", kind: "round", params: { mode: "fillet", size: 3, edges: [edgeRef(top, wall)] }, inputs: ["E"] },
      { id: "M", kind: "push", params: { face: top, dist }, inputs: ["F"] },
    ] as any);
    e.build();
    const r = e.result("M"),
      b = r.value as InstanceType<typeof Body>;
    if (e.result("F").status.kind !== "ok") {
      failures++;
      console.log(`  FAIL the round: ${e.result("F").status.kind}`);
      e.release();
      continue;
    }
    if (r.status.kind !== "ok") {
      console.log(
        `  rod with a rounded rim, top pushed ${dist}: ${r.status.kind} ${"why" in r.status ? r.status.why : ""}`,
      );
      e.release();
      continue;
    }
    const dup =
      new Set(b.faces.map((f) => JSON.stringify([f.id.step, f.id.role, f.id.of, f.id.pieces]))).size !== b.faces.length;
    console.log(
      `  rod, rounded rim, top pushed ${String(dist).padStart(2)}: ${b.faces.length} faces, ${wholes(b).length} wholes, ${b.faces.filter((f) => f.defect).length} unnamed${dup ? ", DUPLICATE ids" : ""}, types ${[...new Set(b.faces.map((f) => K.facts(f.h).type))].join(" ")}`,
    );
    if (dup || b.faces.some((f) => f.defect)) failures++;
    e.release();
  }
}
console.log(failures ? `\n${failures} failures` : "\nno failure");
process.exit(failures ? 1 : 0);
