// A dev check (not a test, `in_1444`) of the helper bar's descriptions: node --experimental-strip-types dev/helperbar-check.ts
import { barFor } from "../src/interaction/helperbar.ts";
import { addRect, emptySketch, keep, viewSystem } from "../src/interaction/drawing.ts";
import { refOf } from "../src/interaction/drawing.ts";
import { check, failureCount } from "./lib.ts";
let p = emptySketch(); const s0 = { points: {}, radii: {} };
const n = addRect(p, s0, refOf(p, s0, [0, 0], 0.5), refOf(p, s0, [40, 25], 0.5))!; const k = keep(n); if (!k.ok) throw new Error(k.why); p = k.params;
const S = viewSystem(p, k.sol);
check("nothing selected: no bar", barFor(S, []).left.length === 0 && barFor(S, []).right.length === 0);
const one = barFor(S, ["L1"]);
check("a side: delete on the left (a click on nothing puts the selection away)", one.left.map((b) => b.id).join() === "delete");
check("a side: a number first (length), then the relations that fit", one.right[0]!.id === "rel:length" && /40/.test(one.right[0]!.label), one.right.map((b) => b.id).join());
check("a side that is level: the level relation is said already and is not offered; a vertical is offered refused with what holds it back", !one.right.some((b) => b.id === "rel:horizontal") && one.right.find((b) => b.id === "rel:vertical")?.tone === "refused" && /holds|hold/.test(one.right.find((b) => b.id === "rel:vertical")?.note ?? ""));
const two = barFor(S, ["L1", "L3"]);
check("two opposite level sides: parallel follows from what is there so it is not offered; an angle is a number", !two.right.some((b) => b.id === "rel:parallel") && two.right.some((b) => b.id === "rel:angle"), two.right.map((b) => `${b.id}:${b.tone}`).join());
const pts = barFor(S, ["P1", "P2"]);
check("two points: a distance", pts.right.some((b) => b.id === "rel:distance") && pts.right.some((b) => b.id === "rel:horizontalDistance"));
check("every button has an icon key and words", [...one.right, ...two.right, ...pts.right, ...one.left].every((b) => b.icon && b.label));
process.exit(failureCount() ? 1 : 0);
