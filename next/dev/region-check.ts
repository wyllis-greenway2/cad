// Checks of the regions of a sketch (E63): crossings, holes, islands, arcs, picks, the numbers of the sides.
import { type Seg, regions } from "../src/engine/region.ts";
let bad = 0;
const ok = (c: boolean, what: string) => {
  if (!c) {
    bad++;
    console.log("FAIL", what);
  }
};
const line = (name: string, a: [number, number], b: [number, number]): Seg => ({ name, kind: "line", a, b });
const circle = (name: string, c: [number, number], r: number): Seg => ({
  name,
  kind: "arc",
  c,
  r,
  t0: 0,
  sweep: 2 * Math.PI,
});
const rect = (x0: number, y0: number, x1: number, y1: number, p = "r"): Seg[] => [
  line(`${p}b`, [x0, y0], [x1, y0]),
  line(`${p}r`, [x1, y0], [x1, y1]),
  line(`${p}t`, [x1, y1], [x0, y1]),
  line(`${p}l`, [x0, y1], [x0, y0]),
];
const area = (r: ReturnType<typeof regions>) =>
  r.profiles.reduce((s, p) => s + p.outer.area + p.holes.reduce((t, h) => t + h.area, 0), 0);

// 1. a rectangle: one profile, four sides, no holes
let r = regions(rect(0, 0, 4, 3));
ok(r.profiles.length === 1 && r.profiles[0]!.outer.pieces.length === 4 && Math.abs(area(r) - 12) < 1e-9, "rectangle");
// 2. a circle alone: its disc, whole
r = regions([circle("c", [0, 0], 2)]);
ok(
  r.profiles.length === 1 && !!r.profiles[0]!.outer.whole && Math.abs(r.profiles[0]!.outer.area - Math.PI * 4) < 0.02,
  "lone circle",
);
// 3. a circle in a rectangle (apart): the rectangle with a hole
r = regions([...rect(0, 0, 10, 10), circle("c", [5, 5], 2)]);
ok(
  r.profiles.length === 1 &&
    r.profiles[0]!.holes.length === 1 &&
    !!r.profiles[0]!.holes[0]!.whole &&
    r.profiles[0]!.holes[0]!.area < 0,
  "hole",
);
ok(Math.abs(area(r) - (100 - Math.PI * 4)) < 0.05, `area of the plate with a hole ${area(r)}`);
// 4. a circle across the rectangle's edge: even-odd makes the lens a hole of the union? count profiles
r = regions([...rect(0, 0, 10, 10), circle("c", [10, 5], 3)]);
ok(r.faces.length === 3, `three regions: ${r.faces.length}`);
const filled = r.faces.filter((f) => f.filled);
ok(filled.length === 2, "even-odd fills the two crescents, not the lens");
// 5. the lens alone by pick
r = regions([...rect(0, 0, 10, 10), circle("c", [10, 5], 3)], { pick: [[9, 5]] });
ok(
  r.profiles.length === 1 && r.profiles[0]!.holes.length === 0 && r.profiles[0]!.outer.pieces.length === 2,
  "pick the lens: two sides",
);
ok(
  r.profiles[0]!.outer.pieces.some((p) => p.arc) && r.profiles[0]!.outer.pieces.some((p) => !p.arc),
  "the lens: one arc, one line",
);
// 6. a line across a rectangle makes two regions; picked together they are the rectangle again, and the line vanishes
r = regions([...rect(0, 0, 10, 10), line("cut", [5, -1], [5, 11])]);
ok(r.faces.length === 2, "the line makes two regions");
r = regions([...rect(0, 0, 10, 10), line("cut", [0, 5], [10, 5])], {
  pick: [
    [5, 2],
    [5, 8],
  ],
});
ok(r.profiles.length === 1 && Math.abs(area(r) - 100) < 1e-9, "both halves picked: the rectangle");
ok(
  r.profiles[0]!.outer.pieces.length === 4,
  `the cut's edge is inside, the sides are merged back: ${r.profiles[0]!.outer.pieces.length}`,
);
r = regions([...rect(0, 0, 10, 10), line("cut", [0, 5], [10, 5])], { pick: [[5, 2]] });
ok(r.profiles.length === 1 && Math.abs(area(r) - 50) < 1e-9, "one half picked");
ok(
  r.profiles[0]!.outer.pieces.map((p) => p.name)
    .sort()
    .join() === "cut,rb,rl,rr",
  `its sides ${r.profiles[0]!.outer.pieces.map((p) => `${p.name}/${p.k}of${p.of}`)}`,
);
// the left side was cut in two pieces by the line; only the lower one is on this boundary, so it is the part's only side
ok(
  r.profiles[0]!.outer.pieces.every((p) => p.of === 1),
  "single sides carry no number",
);
// 7. a rectangle with another over it (overlapping): the whole union's profile when both pick
r = regions([...rect(0, 0, 6, 6, "a"), ...rect(3, 3, 9, 9, "b")], {
  pick: [
    [1, 1],
    [4, 4],
    [8, 8],
  ],
});
ok(r.profiles.length === 1 && Math.abs(area(r) - (36 + 36 - 9)) < 1e-9, `union ${area(r)}`);
ok(r.profiles[0]!.outer.pieces.length === 8, `eight sides ${r.profiles[0]!.outer.pieces.length}`);
// 8. two separate rectangles: two profiles
r = regions([...rect(0, 0, 2, 2, "a"), ...rect(5, 0, 7, 2, "b")]);
ok(r.profiles.length === 2, "two profiles");
// 9. a D shape: a line and an arc (half circle)
r = regions([line("d", [-2, 0], [2, 0]), { name: "arc", kind: "arc", c: [0, 0], r: 2, t0: 0, sweep: Math.PI }]);
ok(r.profiles.length === 1 && Math.abs(area(r) - 2 * Math.PI) < 0.02, `D ${area(r)}`);
// 10. a plate with a rectangle in it with a circle in that: nested islands (fills alternate)
r = regions([...rect(0, 0, 20, 20, "o"), ...rect(5, 5, 15, 15, "i"), circle("c", [10, 10], 2)]);
ok(r.profiles.length === 2 && r.profiles.some((p) => p.holes.length === 1), `nested: ${r.profiles.length} profiles`);
// 11. tangent circles, a chain: touching circles are not crossing
r = regions([circle("a", [0, 0], 1), circle("b", [2, 0], 1)]);
ok(r.profiles.length === 2, `two touching circles are two discs, ${r.profiles.length}`);
// 12. a dangling line inside is not a boundary
r = regions([...rect(0, 0, 10, 10), line("s", [5, 5], [8, 5])]);
ok(
  r.profiles.length === 1 && r.profiles[0]!.outer.pieces.length === 4 && r.profiles[0]!.holes.length === 0,
  "a loose line does nothing",
);
// 13. a repeated drawing of the same line adds nothing
r = regions([...rect(0, 0, 4, 4), line("again", [0, 0], [4, 0])]);
ok(r.profiles.length === 1 && r.profiles[0]!.outer.pieces.length === 4, "a line drawn twice");
// 14. the same input twice gives the same bytes
ok(
  JSON.stringify(regions([...rect(0, 0, 10, 10), circle("c", [10, 5], 3)])) ===
    JSON.stringify(regions([...rect(0, 0, 10, 10), circle("c", [10, 5], 3)])),
  "deterministic",
);
// 15. random: a rectangle with random chords across: every region's areas add up to the rectangle, the pick of all gives the rectangle
let seed = 11;
const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
let rcount = 0;
for (let k = 0; k < 200; k++) {
  const segs = rect(0, 0, 10, 10),
    n = 1 + Math.floor(rnd() * 4);
  for (let i = 0; i < n; i++)
    segs.push(
      rnd() < 0.5
        ? line(`l${i}`, [rnd() * 10, rnd() * 10], [rnd() * 10, rnd() * 10])
        : circle(`c${i}`, [3.5 + rnd() * 3, 3.5 + rnd() * 3], 0.5 + rnd() * 2.9),
    );
  const res = regions(segs),
    inside = res.faces.filter((f) => f.sample[0] > 0 && f.sample[0] < 10 && f.sample[1] > 0 && f.sample[1] < 10);
  // every region inside the rectangle has a positive area; picking every one of them gives the rectangle's own outline
  const pick = inside.map((f) => f.sample),
    all = regions(segs, { pick });
  const a = all.profiles.reduce((s, p) => s + p.outer.area + p.holes.reduce((t, h) => t + h.area, 0), 0),
    total = inside.reduce((s, f) => s + f.area, 0);
  rcount++;
  if (Math.abs(a - 100) > 0.3) {
    ok(false, `case ${k}: boundary area ${a}, sum of the regions ${total}, both should be 100`);
  }
}
console.log(`random: ${rcount} drawings checked`);
console.log(bad ? `${bad} failed` : "all passed");
