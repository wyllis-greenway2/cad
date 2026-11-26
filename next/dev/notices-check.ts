// A dev check (not a test, `in_1444`) of the notices as a value (`interaction/notices.ts`, `dec_three_surfaces`), without a page, with a clock of its own: node --experimental-strip-types dev/notices-check.ts
import { createNotices, FADE_MS } from "../src/interaction/notices.ts";
import { check, failureCount } from "./lib.ts";

let t = 0;
const n = createNotices(3, () => t), text = (now = t) => n.visible(now).map((x) => x.text).join("|");
check("nothing to say: nothing stands", n.visible().length === 0);
n.notify("Saved", { ttl: 1000 });
check("a temporary notice stands, whole", text() === "Saved" && n.visible()[0]!.fade === 1 && !n.visible()[0]!.persistent);
t = 1000 - FADE_MS / 2;
check("it fades in its last moments", n.visible()[0]!.fade > 0 && n.visible()[0]!.fade < 1);
t = 1000;
check("and goes at its time", text() === "");
const p = n.notify("Select the face to extrude", { persistent: true });
t = 1e9;
check("a persistent notice stays until its owner clears it, however long", text() === "Select the face to extrude" && n.visible()[0]!.persistent && n.visible()[0]!.fade === 1);
p.set("Select the second profile");
check("its words can go on to the next thing to ask", text() === "Select the second profile");
p.clear();
check("and it goes when its owner says", text() === "");
p.set("too late");
check("a cleared notice stays cleared (set does nothing)", text() === "");
// the same words again begin again, they are not stacked
t = 0; n.clearAll(); n.notify("Saved", { ttl: 1000 }); t = 600; n.notify("Saved", { ttl: 1000 });
check("the same words said again are one notice, begun again", n.visible().length === 1);
t = 1500;
check("and it lasts from the second time", text() === "Saved");
// order and the limit
t = 0; n.clearAll();
const a = n.notify("making", { persistent: true }); n.notify("one", { ttl: 9e3 }); n.notify("two", { ttl: 9e3 }); n.notify("three", { ttl: 9e3 });
check("only three stand: the oldest temporary one goes, a persistent one never does", text() === "making|two|three", text());
a.clear();
check("kinds are kept (a refusal is a warning, a problem an error)", (() => { n.clearAll(); n.notify("x", { kind: "warn" }); n.notify("y", { kind: "error", persistent: true }); return n.visible().map((v) => v.kind).join() === "warn,error"; })());
check("many persistent ones are all kept (they belong to things that are going on)", (() => { n.clearAll(); for (let i = 0; i < 5; i++) n.notify(`p${i}`, { persistent: true }); return n.visible().length === 5; })());
process.exit(failureCount() ? 1 : 0);
