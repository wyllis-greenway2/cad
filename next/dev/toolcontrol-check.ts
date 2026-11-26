// A dev check (not a test, `in_1444`) of the tool controller and its tasks (`toolcontrol.ts`, `tasks.ts`, `dec_three_surfaces`) with a fake page, no browser: node --experimental-strip-types dev/toolcontrol-check.ts
import { createToolControl, type ToolHost } from "../src/toolcontrol.ts";
import { check, failureCount } from "./lib.ts";

function fake() {
  const log: string[] = []; const notices: { text: string; persistent: boolean; cleared: boolean }[] = [];
  const st = { step: null as number | null, open: false, valid: false, kinds: [] as string[], pick: null as { faces: string[]; edges: string[] } | null, orient: false };
  const selection = { body: () => st.pick, clear: () => { st.kinds = []; st.pick = null; log.push("clear"); } };
  const host = {
    notify: (text: string, o?: { persistent?: boolean }) => { const n = { text, persistent: !!o?.persistent, cleared: false }; notices.push(n); return { clear: () => { n.cleared = true; }, set: (t: string) => { n.text = t; } }; },
    selection, draw: (k: string) => { st.step = 0; log.push(`draw ${k}`); }, drawStep: () => st.step, drawStop: () => { if (st.step === null) return false; if (st.step > 0) { st.step = 0; return true; } st.step = null; return false; },
    extrude: { show: () => {}, start: () => log.push("ext"), active: () => false, open: () => st.open, valid: () => st.valid, apply: () => { st.open = false; log.push("apply"); return true; }, cancel: () => { st.open = false; log.push("cancel"); return true; }, words: () => null },
    plane: () => log.push("plane"), sketchFace: () => log.push("sketchFace"), bodyOp: async (a: string) => { st.open = true; log.push(`face ${a}`); return null; },
    selectedKinds: () => st.kinds, relate: (r: string) => { log.push(`relate ${r}`); return true; },
    orient: { on: () => st.orient, keep: () => { st.orient = false; log.push("keep"); return true; }, cancel: () => { st.orient = false; log.push("back"); return true; } },
    endGame: () => {},
  } as unknown as ToolHost;
  const live = () => notices.filter((n) => n.persistent && !n.cleared).map((n) => n.text);
  return { st, log, host, live, tc: createToolControl(host) };
}
{ const f = fake(); f.tc.arm("line"); f.tc.update(1);
  check("a drawing tool is armed and asks its first need in one persistent notice", f.tc.armed()?.id === "line" && f.live().length === 1, f.live().join());
  f.st.step = 2; check("a figure under way: the right click throws it away and disarms, the ring does not open", f.tc.finish() && f.tc.armed() === null && f.live().length === 0 && f.st.step === null);
  f.tc.arm("line"); f.st.step = 1; f.tc.cancel(); check("Esc on a begun figure throws it away and the tool stays", f.tc.armed() !== null && f.st.step === 0);
  f.tc.cancel(); check("Esc again puts the tool away", f.tc.armed() === null && f.tc.cancel() === false); }
{ const f = fake(); f.st.kinds = ["line", "line"]; f.tc.arm("rel:parallel"); f.tc.update(1);
  check("a constraint with what it needs already selected runs at once, clears, stays armed and is additive", f.log.includes("relate parallel") && f.tc.armed() !== null && f.tc.additive());
  f.log.length = 0; f.st.kinds = ["line"]; f.tc.update(2); check("a part that is the start of it waits", !f.log.includes("relate parallel"));
  f.st.kinds = ["circle", "line", "point"]; f.tc.update(3); check("what cannot become it is refused and cleared", f.st.kinds.length === 0); }
{ const f = fake(); f.tc.arm("pull"); f.tc.update(1000);
  check("a face tool with nothing picked asks and does not run", f.live().length === 1 && !f.log.some((l) => l.startsWith("face")));
  f.st.pick = { faces: ["f"], edges: [] }; f.tc.update(1100); f.tc.update(1200);
  check("a pick runs it, the draft is open and the tool waits for the operation", f.log.includes("face body:pull") && f.tc.armed() !== null);
  f.tc.finish(); check("the right click with no valid size throws the draft away", f.log.includes("cancel") && !f.log.includes("apply") && f.tc.armed() === null);
  const g = fake(); g.st.pick = { faces: ["f"], edges: [] }; g.tc.arm("pull"); g.tc.update(9000);
  check("a face already picked runs at once, and it waits for its operation however long the page has run", g.log.includes("face body:pull") && g.tc.armed() !== null);
  g.st.valid = true; g.tc.finish(); check("a valid draft is made by the right click", g.log.includes("apply")); }
{ const f = fake(); f.st.orient = true; f.tc.update(1);
  check("with no tool, the mover's orient says its sentence and a right click keeps it", f.live().length === 1 && f.tc.finish() && f.log.includes("keep") && f.live().length === 0);
  f.st.orient = true; f.tc.cancel(); check("Esc puts it back", f.log.includes("back")); }
process.exit(failureCount() ? 1 : 0);
