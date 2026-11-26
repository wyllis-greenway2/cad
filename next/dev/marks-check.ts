// A dev check (not a test, `in_1444`) of the marks of a sketch and the one rule for which show (`interaction/marks.ts`, `dec_marks_on_things`): node --experimental-strip-types dev/marks-check.ts
import { addCircle, addLine, addRect, emptySketch, keep, refOf, viewSystem } from "../src/interaction/drawing.ts";
import { alphaAt, marksFor } from "../src/interaction/marks.ts";
import { settings } from "../src/settings.ts";
import { check, failureCount } from "./lib.ts";

// a rectangle (its sides locked level and upright), and a line with a circle touching it
let p = emptySketch(); const s0 = { points: {}, radii: {} } as never;
const r = keep(addRect(p, s0, refOf(p, s0, [0, 0], 0.5), refOf(p, s0, [40, 25], 0.5))!); if (!r.ok) throw new Error(r.why); p = r.params;
const R = viewSystem(p, r.sol);
const none = marksFor(R, [], { now: 0 });
check("nothing selected and nothing recent: no marks", none.length === 0);
const one = marksFor(R, ["L1"], { now: 0 });
check("a selected side shows the constraints it has, locked", one.some((m) => m.state === "locked" && m.kind === "constraint") && one.filter((m) => m.state === "locked").every((m) => m.parts.includes("L1") || m.parts.some((q) => R.points.some((pt) => pt.id === q))), one.map((m) => `${m.id}:${m.state}`).join());
check("a selected side shows the number it measures, unlocked", one.some((m) => m.kind === "dimension" && m.state === "offer" && m.locked === false));
const refusedId = p.constraints![0]!.id;
const red = marksFor(R, [], { flash: { refused: [refusedId] }, now: 0 });
check("a refusal shows what held it back, red, with nothing selected", red.length === 1 && red[0]!.state === "refused" && red[0]!.id === refusedId);
check("and with something else selected too", marksFor(R, ["L3"], { flash: { refused: [refusedId] }, now: 0 }).some((m) => m.id === refusedId && m.state === "refused"));

let q = emptySketch(); const z = { points: {}, radii: {} } as never;
const k1 = keep(addLine(q, z, refOf(q, z, [0, 0], 0.5), refOf(q, z, [40, 0], 0.5))!); if (!k1.ok) throw new Error(k1.why); q = k1.params;
const k2 = keep(addCircle(q, k1.sol, refOf(q, k1.sol, [20, 5], 0.5), [25, 5])!); if (!k2.ok) throw new Error(k2.why); q = k2.params;
const T = viewSystem(q, k2.sol);
const sel = marksFor(T, ["L1"], { now: 0 }), tan = sel.find((m) => m.state === "offer" && m.id.startsWith("near:tangent:"));
check("a selected line touching a circle: the tangent is offered on it, unlocked, full strength", !!tan && tan.alpha === 1 && tan.over?.join() === "L1", sel.map((m) => `${m.id}:${m.state}`).join());
const recent = { ids: ["L1"], until: 1000 };
const soon = marksFor(T, [], { recent, now: 100 }), late = marksFor(T, [], { recent, now: 1000 - settings.marks.fadeMs / 2 }), gone = marksFor(T, [], { recent, now: 1000 });
check("nothing selected, a part just made: its offers show, and not its number", soon.some((m) => m.id.startsWith("near:tangent:")) && soon.every((m) => m.kind === "constraint" && m.state === "offer" && m.alpha === 1), soon.map((m) => m.id).join());
check("they fade at the end and are gone after", late.length > 0 && late.every((m) => m.alpha > 0.4 && m.alpha < 0.6) && gone.length === 0, `${late.map((m) => m.alpha)} ${gone.length}`);
check("something selected: the recent ones do not show beside it (the selection's own do)", marksFor(T, ["K1"], { recent, now: 100 }).every((m) => m.over === undefined || m.over.join() === "K1"));
check("the fade is a clean 1 to 0", alphaAt(1000, 0) === 1 && alphaAt(1000, 1000) === 0 && alphaAt(1000, 2000) === 0);
process.exit(failureCount() ? 1 : 0);
