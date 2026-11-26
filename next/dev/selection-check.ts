// A dev check (not a test, `in_1444`) of the page's one selection (`selection.ts`, `in_1588`), without a page: node --experimental-strip-types dev/selection-check.ts
import { createSelection } from "../src/selection.ts";
import { check, failureCount } from "./lib.ts";

const face = { id: "F1", ref: "F1", start: 0, count: 6 } as never,
  edge = { key: "E1", ref: "E1", start: 0, count: 2 } as never;
const s = createSelection();
check(
  "nothing is selected at first",
  s.get() === null && s.sketch("xy").length === 0 && s.body() === null && s.clear() === false,
);
s.setSketch("xy", ["P1", "L1"]);
check(
  "parts of a sketch are selected by plane",
  s.sketch("xy").join() === "P1,L1" && s.sketch("xz").length === 0 && s.body() === null,
);
s.setBody({ body: "B1", faces: [face], edges: [], at: [0, 0, 0] });
check(
  "picking on a body puts the sketch selection away (one value)",
  s.sketch("xy").length === 0 && s.body()?.body === "B1" && s.get()?.kind === "body",
);
s.setSketch("xy", ["P2"]);
check("selecting in a sketch puts the body pick away", s.body() === null && s.sketch("xy").join() === "P2");
s.setSketch("xy", []);
check("selecting no parts is nothing selected", s.get() === null);
s.setBody({ body: "B1", faces: [], edges: [edge], at: [0, 0, 0] });
check("an edge pick is a body pick", s.body()?.edges.length === 1);
s.setBody({ body: "B1", faces: [], edges: [], at: [0, 0, 0] });
check("a pick with no face and no edge is nothing", s.get() === null);
s.setBody({ body: "B1", faces: [face], edges: [], at: [0, 0, 0] });
check("clear says there was something, then nothing", s.clear() === true && s.get() === null && s.clear() === false);
process.exit(failureCount() ? 1 : 0);
