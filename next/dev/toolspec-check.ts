// A dev check (not a test, `in_1444`) of the tools as data (`interaction/toolspec.ts`, `dec_three_surfaces`), without a page: node --experimental-strip-types dev/toolspec-check.ts
import { GROUPS, TOOLS, constraintAsk, constraintStatus, faceStatus, toolOf } from "../src/interaction/toolspec.ts";
import { RANGEABLE, RELATIONS, type Relation } from "../src/engine/solver.ts";
import { iconSvg } from "../src/icons.ts";
import { check, failureCount } from "./lib.ts";

check(
  "every tool has an id, a label, a group of the menu and a first sentence to ask (or none to ask)",
  TOOLS.every((t) => t.id && t.label && GROUPS.some((g) => g.id === t.group)) &&
    TOOLS.filter((t) => t.kind !== "plane").every((t) => t.needs.length > 0),
);
check("the ids are all different", new Set(TOOLS.map((t) => t.id)).size === TOOLS.length);
const rels = (Object.keys(RELATIONS) as Relation[]).filter((r) => !RANGEABLE.has(r));
check(
  "every relation that is not a number is a tool of the constraints group, with no code of its own",
  rels.every(
    (r) =>
      toolOf(`rel:${r}`)?.group === "constraint" &&
      toolOf(`rel:${r}`)!.kind === "constraint" &&
      toolOf(`rel:${r}`)!.arg === r,
  ) && TOOLS.filter((t) => t.group === "constraint").length === rels.length + 2,
);
// level and upright are two tools each: of a line itself, and between two points, with their own icons (`in_1670`)
check(
  "level and upright are each two tools: a line (solid icon) and two points (dashed icon), and the constraints group has a lock icon",
  toolOf("rel:horizontal")?.only?.join() === "line" &&
    toolOf("rel:horizontal:points")?.only?.join() === "point,point" &&
    toolOf("rel:horizontal")?.icon === "horizontal" &&
    toolOf("rel:horizontal:points")?.icon === "horizontalPoints" &&
    toolOf("rel:vertical:points")?.icon === "verticalPoints" &&
    toolOf("rel:horizontal:points")?.arg === "horizontal" &&
    GROUPS.find((g) => g.id === "constraint")?.icon === "lock",
);
check(
  "every group of the menu has an icon of its own to show (the constraints group had none)",
  GROUPS.every((g) => iconSvg(g.icon) !== ""),
  GROUPS.filter((g) => iconSvg(g.icon) === "")
    .map((g) => `${g.id}:${g.icon}`)
    .join(),
);
check(
  "each of the two level tools takes only its own shape of parts: a line, or two points",
  constraintStatus("horizontal", ["line"], ["line"]) === "met" &&
    constraintStatus("horizontal", ["point", "point"], ["line"]) === "bad" &&
    constraintStatus("horizontal", ["point", "point"], ["point", "point"]) === "met" &&
    constraintStatus("horizontal", ["point"], ["point", "point"]) === "partial" &&
    constraintStatus("horizontal", ["line"], ["point", "point"]) === "bad" &&
    constraintAsk("horizontal", [], ["point", "point"]) === "Level: select a point and a point",
  constraintAsk("horizontal", [], ["point", "point"]),
);
check(
  "a number is not a tool (it is on the info bar)",
  TOOLS.every((t) => !RANGEABLE.has(t.arg as Relation)),
);
check(
  "every tool has an icon of its own to show (the menu and the badge)",
  TOOLS.every((t) => iconSvg(t.icon) !== ""),
  TOOLS.filter((t) => iconSvg(t.icon) === "")
    .map((t) => `${t.id}:${t.icon}`)
    .join(),
);
check(
  "the drawing tools ask a click for each place, the first as the start",
  toolOf("line")!.needs.length === 2 &&
    toolOf("rect")!.needs.length === 2 &&
    toolOf("circle")!.needs.length === 2 &&
    toolOf("arc")!.needs.length === 3,
);
// constraints against what is selected
check(
  "tangent: a line and a circle meet it in either order; one of them is the start of it; two lines cannot become it",
  constraintStatus("tangent", ["line", "circle"]) === "met" &&
    constraintStatus("tangent", ["circle", "line"]) === "met" &&
    constraintStatus("tangent", ["line"]) === "partial" &&
    constraintStatus("tangent", ["circle"]) === "partial" &&
    constraintStatus("tangent", ["line", "line"]) === "bad" &&
    constraintStatus("tangent", []) === "partial",
);
check(
  "level takes a line, or two points: either meets it, a point is the start of the second",
  constraintStatus("horizontal", ["line"]) === "met" &&
    constraintStatus("horizontal", ["point", "point"]) === "met" &&
    constraintStatus("horizontal", ["point"]) === "partial" &&
    constraintStatus("horizontal", ["circle"]) === "bad",
);
check(
  "the sentence asks for what is still needed",
  constraintAsk("tangent", []) === "Tangent: select a line and a circle, or a circle and a line" ||
    /^Tangent: select/.test(constraintAsk("tangent", [])),
  constraintAsk("tangent", []),
);
check(
  "after a line, tangent asks for a circle; after a point, level asks for a point",
  /circle/.test(constraintAsk("tangent", ["line"])) && /point/.test(constraintAsk("horizontal", ["point"])),
  `${constraintAsk("tangent", ["line"])} | ${constraintAsk("horizontal", ["point"])}`,
);
// face tools against what is picked on a body
const pull = toolOf("pull")!,
  round = toolOf("round")!;
check(
  "push and pull needs faces (several go together), not edges; round takes edges or faces, which stand for their edges; nothing is the start",
  faceStatus(pull, { faces: 1, edges: 0 }) === "met" &&
    faceStatus(pull, { faces: 2, edges: 0 }) === "met" &&
    faceStatus(pull, { faces: 0, edges: 2 }) === "bad" &&
    faceStatus(round, { faces: 0, edges: 3 }) === "met" &&
    faceStatus(round, { faces: 1, edges: 0 }) === "met" &&
    faceStatus(round, null) === "partial" &&
    faceStatus(pull, { faces: 0, edges: 0 }) === "partial",
);
process.exit(failureCount() ? 1 : 0);
