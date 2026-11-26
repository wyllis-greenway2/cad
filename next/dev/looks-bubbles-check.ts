// A dev check (not a test, `in_1444`) of the looks and the bubbles, without a page: node --experimental-strip-types dev/looks-bubbles-check.ts
import { SEE_THROUGH, SOLID, mix, surfaceOf } from "../src/looks.ts";
import { anchorOf, bubblesOn, placed } from "../src/interaction/bubbles.ts";
import { solve, type System } from "../src/engine/solver.ts";
let bad = 0;
const ok = (c: boolean, what: string) => {
  console.log(`${c ? "ok  " : "FAIL"} ${what}`);
  if (!c) bad++;
};

// looks
const s = surfaceOf(SOLID),
  t = surfaceOf(SEE_THROUGH);
ok(s.opacity === 1 && !s.transparent && s.depthWrite, "Solid is opaque and writes depth");
ok(t.opacity < 0.2 && t.transparent && !t.depthWrite, "See-through is nearly clear and writes no depth");
for (const base of ["solid", "seeThrough"] as const)
  for (const mark of ["pick", "clash", "tie"] as const) {
    const m = surfaceOf({ base, mark }),
      b = surfaceOf({ base });
    ok(
      m.color !== b.color && (base === "solid" ? m.opacity === 1 : m.opacity < 1),
      `${base} marked ${mark} changes the colour and keeps its kind of surface`,
    );
  }
ok(mix(0x000000, 0xffffff, 0.5) === 0x808080 && mix(0x102030, 0x102030, 0.7) === 0x102030, "mix of colours");
ok(
  surfaceOf({ base: "solid", mark: "pick" }).color === surfaceOf({ base: "solid", mark: "pick" }).color,
  "a look comes to the same surface every time",
);

// bubbles
const S0: System = {
  points: [
    { id: "A", x: 0, y: 0 },
    { id: "B", x: 10, y: 1 },
    { id: "C", x: 10, y: 8 },
    { id: "O", x: 4, y: 4 },
  ],
  lines: [
    { id: "L0", a: "A", b: "B" },
    { id: "L1", a: "B", b: "C" },
  ],
  circles: [{ id: "K", c: "O", r: 2 }],
  constraints: [
    { id: "h", kind: "horizontal", parts: ["L0"] },
    { id: "n", kind: "length", parts: ["L0"], value: 10 },
    { id: "v", kind: "vertical", parts: ["L1"] },
    { id: "r", kind: "radius", parts: ["K"], value: 2 },
    { id: "p", kind: "perpendicular", parts: ["L0", "L1"] },
    { id: "f", kind: "fixed", parts: ["A"], at: [0, 0] },
  ],
};
const S = placed(S0, solve(S0).solution);
ok(bubblesOn(S, []).length === 0, "nothing selected: no bubbles");
const L0 = bubblesOn(S, ["L0"]);
ok(L0.map((b) => b.id).join() === "h,n,p", `a selected line shows its own constraints only (${L0.map((b) => b.id)})`);
ok(
  L0.find((b) => b.id === "n")!.kind === "dimension" &&
    L0.find((b) => b.id === "n")!.text === "10" &&
    L0.find((b) => b.id === "h")!.icon === "horizontal",
  "a length is a dimension with its number; a horizontal is its icon",
);
ok(
  bubblesOn(S, ["K"])[0]!.symbol === "Ø" && bubblesOn(S, ["K"])[0]!.text === "4",
  "a circle's number is its diameter (twice the radius 2), with the diameter sign",
);
ok(
  (() => {
    const A = { ...S, circles: S.circles.map((c) => ({ ...c, arc: true })) };
    const b = bubblesOn(A, ["K"])[0]!;
    return b.symbol === "R" && b.text === "2";
  })(),
  "an arc's number is its radius, with R",
);
const at = anchorOf(
  S,
  S.constraints.find((c) => c.id === "n")!,
);
ok(Math.abs(at[0] - 5) < 1e-6, `a length stands at the middle of its line (${at.map((v) => v.toFixed(2))})`);
ok(
  bubblesOn(S, ["L0"], { refused: ["n"] }).find((b) => b.id === "n")!.tone === "refused" &&
    bubblesOn(S, ["L0"], { applied: ["h"] }).find((b) => b.id === "h")!.tone === "applied",
  "flashes give the tone",
);
process.exit(bad ? 1 : 0);
