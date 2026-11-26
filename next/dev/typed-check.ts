// A dev check (not a test, `in_1444`) of typed numbers while a figure is drawn (`dec_dimensions_measure_then_lock`, slice b), without a page: node --experimental-strip-types dev/typed-check.ts
import { placeTyped, measureAt } from "../src/engine/typed.ts";
import { FIELDS, chipFields, emptyTyped, freeOf, typeKey, typedMeasures } from "../src/interaction/typing.ts";
import type { System } from "../src/engine/solver.ts";
import { check, failureCount } from "./lib.ts";

const empty: System = { points: [], lines: [], circles: [], constraints: [] }, near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
const place = (kind: "rect" | "line" | "circle", from: [number, number], pointer: [number, number], typed: string[]) => {
  const free = freeOf(kind, from), live = FIELDS[kind].map((f) => measureAt(empty, free, pointer, f.kind, f.parts)), ms = typedMeasures(kind, typed, live);
  return { at: placeTyped(empty, free, pointer, ms), ms, free };
};
// keys
check("digits, a point, a minus and Backspace edit the active number", typeKey(["", ""], 0, "4").join() === "4," && typeKey(["4", ""], 0, "2").join() === "42," && typeKey(["4.", ""], 0, ".").join() === "4.," && typeKey(["", ""], 0, ".").join() === "0.," && typeKey(["", ""], 0, "-").join() === "-," && typeKey(["4", ""], 0, "-").join() === "4," && typeKey(["42", ""], 0, "Backspace").join() === "4," && typeKey(["", ""], 1, "7").join() === ",7");
check("another key changes nothing", typeKey(["4", ""], 0, "q").join() === "4,");
check("each tool has its numbers: a rectangle two, a line and a circle one, an arc none", FIELDS.rect.length === 2 && FIELDS.line.length === 1 && FIELDS.circle.length === 1 && FIELDS.arc.length === 0 && emptyTyped("rect").length === 2);
// a rectangle from (10, 10)
let r = place("rect", [10, 10], [40, 25], ["", ""]);
check("nothing typed: the place is the pointer's", r.ms.length === 0 && r.at![0] === 40 && r.at![1] === 25);
r = place("rect", [10, 10], [40, 25], ["20", ""]);
check("a width typed keeps the pointer's height and its side", near(r.at![0], 30) && near(r.at![1], 25));
r = place("rect", [10, 10], [-5, 25], ["20", ""]);
check("pointer on the left: the same width goes to the left", near(r.at![0], -10) && near(r.at![1], 25));
r = place("rect", [10, 10], [40, 25], ["-20", ""]);
check("a width typed with a minus goes the other way (left) even with the pointer on the right", near(r.at![0], -10));
r = place("rect", [10, 10], [40, 5], ["20", "8"]);
check("a width and a height typed are the corner (the pointer picks the quarter)", near(r.at![0], 30) && near(r.at![1], 2));
check("a measure holds the number typed: width 20 across", r.ms.length === 2 && r.ms[0]!.kind === "horizontalDistance" && near(Math.abs(r.ms[0]!.value), 20) && r.ms[1]!.kind === "verticalDistance" && near(r.ms[1]!.value, -8));
// a line from (0, 0)
r = place("line", [0, 0], [30, 40], ["25"]);
check("a length typed goes along the pointer's direction (3-4-5: 15, 20)", near(r.at![0], 15) && near(r.at![1], 20));
r = place("line", [0, 0], [-30, 0.0001], ["10"]);
check("a length typed with the pointer to the left goes left", near(r.at![0], -10));
// a circle about (5, 5)
r = place("circle", [5, 5], [15, 5], ["8"]);
check("a diameter typed 8 is radius 4, through the pointer's direction", near(r.at![0], 9) && near(r.at![1], 5) && near(r.ms[0]!.value, 4));
// not numbers yet
check("a lone minus, or nothing, holds nothing", typedMeasures("line", ["-"], [10]).length === 0 && typedMeasures("line", [""], [10]).length === 0 && typedMeasures("circle", ["0"], [3]).length === 0);
// the chip
const chip = chipFields("rect", ["20", ""], 1, [12.345, -4.1]);
check("the chip shows typed numbers as typed, the others as measured and the active one marked", chip[0]!.text === "20" && chip[0]!.typed && !chip[0]!.active && chip[1]!.text === "4.1" && !chip[1]!.typed && chip[1]!.active && chip[0]!.label === "Width");
check("a circle's chip shows the diameter, twice the radius", chipFields("circle", [""], 0, [3.5])[0]!.text === "7");
process.exit(failureCount() ? 1 : 0);
