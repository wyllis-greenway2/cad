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
s.setBody({ body: "B1", faces: [face], edges: [], vertices: [], whole: [], at: [0, 0, 0] });
check(
  "picking on a body puts the sketch selection away (one value)",
  s.sketch("xy").length === 0 && s.body()?.body === "B1" && s.get()?.kind === "body",
);
s.setSketch("xy", ["P2"]);
check("selecting in a sketch puts the body pick away", s.body() === null && s.sketch("xy").join() === "P2");
s.setSketch("xy", []);
check("selecting no parts is nothing selected", s.get() === null);
s.setBody({ body: "B1", faces: [], edges: [edge], vertices: [], whole: [], at: [0, 0, 0] });
check("an edge pick is a body pick", s.body()?.edges.length === 1);
s.setBody({ body: "B1", faces: [], edges: [], vertices: [], whole: [], at: [0, 0, 0] });
check(
  "a pick with no face and no edge is the whole body (a double click, `dec_body_look_and_feel`)",
  s.body()?.body === "B1" && s.body()?.faces.length === 0 && s.body()?.edges.length === 0,
);
s.setBody(null);
check("and a null pick is nothing", s.get() === null);
s.setBody({ body: "B1", faces: [face], edges: [], vertices: [], whole: [], at: [0, 0, 0] });
check("clear says there was something, then nothing", s.clear() === true && s.get() === null && s.clear() === false);
s.setRegion({ key: "xy", at: [3, 4], click: [3, 4, 0] });
check(
  "a closed figure picked is a region pick",
  s.region()?.key === "xy" && s.get()?.kind === "region" && s.body() === null,
);
s.setSketch("xy", ["P2"]);
check(
  "selecting a part of the drawing puts the figure away: one selection",
  s.region() === null && s.sketch("xy").join() === "P2",
);
s.setRegion({ key: "xy", at: [3, 4], click: [3, 4, 0] });
s.setBody({ body: "B1", faces: [face], edges: [], vertices: [], whole: [], at: [0, 0, 0] });
check("and picking on a body does too", s.region() === null && s.body()?.body === "B1");
s.setRegion({ key: "xy", at: [3, 4], click: [3, 4, 0] });
s.setRegion(null);
check("a null region pick is nothing", s.get() === null);
process.exit(failureCount() ? 1 : 0);
