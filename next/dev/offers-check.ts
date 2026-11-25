// A dev check (not a test, `in_1444`) of the offers as a value (`interaction/offers.ts`, `dec_helper_constraint_bubble`), without a page: node --experimental-strip-types dev/offers-check.ts
import { addLine, addRect, emptySketch, keep, refOf, viewSystem, type Sol } from "../src/interaction/drawing.ts";
import { helpersAt } from "../src/engine/helpers.ts";
import { newOffers, offerBubbles, takeOffer } from "../src/interaction/offers.ts";
import { solveDefinition } from "../src/engine/definition.ts";
import { settings } from "../src/settings.ts";
import type { SketchParams } from "../src/engine/sketch.ts";
import { check, failureCount } from "./lib.ts";

const t = settings.offer, sol = (p: SketchParams): Sol => { const s = solveDefinition(p); return { points: s.points, radii: s.radii }; };
let p0 = emptySketch(); const s00 = sol(p0), k0 = keep(addRect(p0, s00, refOf(p0, s00, [0, 0], 0.5), refOf(p0, s00, [40, 25], 0.5))!); if (!k0.ok) throw new Error(k0.why); p0 = k0.params;
const s0 = sol(p0), start = refOf(p0, s0, [0, 0], 0.5); if (!("id" in start)) throw new Error("no corner");
const help = helpersAt(viewSystem(p0, s0), { shape: "line", from: [0, 0], startId: start.id }, [60, 0.3], 0.1, settings.helpers);
const at = help.at, k1 = keep(addLine(p0, s0, start, { at })!); if (!k1.ok) throw new Error(k1.why); const p1 = k1.params, s1 = sol(p1), sys1 = viewSystem(p1, s1);
const cur = { key: "k", p: p1 };

check("a figure placed with nothing held has no offers", newOffers("k", p1, sys1, s1, null, at, [0, 0], 0, t) === null);
let o = newOffers("k", p1, sys1, s1, help, at, [0, 0], 0, t);
check("a line placed level has the level offered, on the line that was made", !!o && o.items.some((i) => i.c.kind === "horizontal" && i.c.parts.length === 1 && p1.lines!.some((l) => l.id === i.c.parts[0])) && o!.items.every((i) => i.state === "open"));
check("it makes no constraint by itself", (p1.constraints ?? []).length === (p0.constraints ?? []).length);
let r = offerBubbles(o, cur, sys1, false, 100, t);
check("the bubbles stand: open, a question, not faded", r.bubbles.length >= 1 && r.bubbles.every((b) => b.tone === "offer" && b.offer === "open" && b.fade === 1));
r = offerBubbles(o, cur, sys1, false, t.stayMs - 300, t);
check("in the last moments they fade", r.bubbles.length >= 1 && r.bubbles.every((b) => b.fade! < 1 && b.fade! > 0));
check("when the time is up they are gone", offerBubbles(o, cur, sys1, false, t.stayMs + 1, t).offers === null);
let held = offerBubbles(o, cur, sys1, true, t.stayMs - 10, t);
check("while the pointer is on one they wait", offerBubbles(held.offers, cur, sys1, false, t.stayMs + 500, t).bubbles.length >= 1 && offerBubbles(held.offers, cur, sys1, false, t.stayMs + t.hoverMs + 50, t).offers === null);
check("on another sketch, or another plane, they are gone", offerBubbles(o, { key: "k", p: p0 }, sys1, false, 100, t).offers === null && offerBubbles(o, { key: "other", p: p1 }, sys1, false, 100, t).offers === null);
check("a click on one that is not there, or on another sketch, makes nothing", takeOffer(o!, "offer:99", cur, 100, t) === null && takeOffer(o!, "offer:0", { key: "k", p: p0 }, 100, t) === null);
const took = takeOffer(o!, o!.items.find((i) => i.c.kind === "horizontal")!.id, cur, 100, t);
check("a click makes the constraint", !!took && took.ok && (took.params.constraints ?? []).some((c) => c.kind === "horizontal"));
if (took && took.ok) {
  const sys2 = viewSystem(took.params, sol(took.params)), after = offerBubbles(took.offers, { key: "k", p: took.params }, sys2, false, 150, t);
  check("the bubble then shows a check, in green", after.bubbles.some((b) => b.offer === "taken" && b.tone === "applied"));
  check("and it goes after the check has shown", offerBubbles(took.offers, { key: "k", p: took.params }, sys2, false, 100 + t.takenMs + 1, t).bubbles.every((b) => b.offer !== "taken"));
  check("a second click on the same one does nothing", takeOffer(took.offers, took.offers.items.find((i) => i.state === "taken")!.id, { key: "k", p: took.params }, 200, t) === null);
}
process.exit(failureCount() ? 1 : 0);
