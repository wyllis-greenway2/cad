// A dev check (not a test, `in_1444`) for the document layer (E72 to E75): save and open, refusals in words, every kind of change, parameters renamed and deleted, names of bodies, undo and redo that equal a fresh build.
//   node --experimental-strip-types dev/document-check.ts
import { initKernel } from "../src/engine/kernel.ts";
import { Engine } from "../src/engine/engine.ts";
import * as D from "../src/engine/document.ts";
import { idKey } from "../src/engine/id.ts";
import { Body } from "../src/engine/lineage.ts";
import { rectangle } from "../src/engine/sketch.ts";
await initKernel();
import { check, fail, failureCount } from "./lib.ts";
const throws = (f: () => unknown): string => {
  try {
    f();
    return "";
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};
const rect = rectangle(0, 0, 10, 5);
let doc = D.emptyDoc();
doc = D.setParameter(doc, "width", 10);
doc = D.setParameter(doc, "depth", "width / 5");
doc = D.insert(doc, {
  id: "s",
  kind: "sketch",
  params: { ...rect, constraints: rect.constraints!.map((c) => (c.id === "w" ? { ...c, value: "=width" } : c)) },
  inputs: [],
});
doc = D.insert(doc, { id: "E", kind: "extrude", params: { d: "=depth" }, inputs: ["s"] });
doc = D.labelStep(doc, "E", "Base plate");
const build = (d: D.Doc) => {
  const e = new Engine(d.steps as never, { parameters: d.parameters });
  e.build();
  return e;
};
const fp = (e: Engine) =>
  e
    .ids()
    .map((i) => e.result(i).fingerprint)
    .join("|");

console.log("1. save and open");
{
  const text = D.save(doc),
    back = D.open(text);
  check(
    "the same document is the same text, and the text opens as the same document",
    D.save(back.doc) === text && D.save(doc) === text && back.warnings.length === 0,
  );
  check(
    "keys are in order and each step is one line",
    text.split("\n").filter((l) => l.startsWith('{"id"')).length === 2 &&
      text.indexOf('"labels"') < text.indexOf('"steps"'),
  );
  const e1 = build(doc),
    e2 = build(back.doc);
  check("the opened document builds the same picture", fp(e1) === fp(e2) && e1.result("E").status.kind === "ok");
  e1.release();
  e2.release();
  const keyOrder = D.save({ ...doc, parameters: { b: 1, a: 2 } });
  check("parameters are written in name order", keyOrder.indexOf('"a"') < keyOrder.indexOf('"b"'));
}
console.log("2. a file that is wrong is refused in words, and nothing is changed");
{
  const t = D.save(doc),
    msg = (s: string) => throws(() => D.open(s));
  check("not JSON", /not readable as JSON/.test(msg("hello")), msg("hello"));
  check("not ours", /not a document of this program/.test(msg('{"format":"other"}')), msg('{"format":"other"}'));
  check(
    "a newer version",
    /newer version/.test(msg(t.replace('"version":1', '"version":9'))),
    msg(t.replace('"version":1', '"version":9')),
  );
  check(
    "a step that is not a step names its number",
    /step number 2 is not a step/.test(
      msg(
        JSON.stringify({
          format: D.FORMAT,
          version: 1,
          steps: [{ id: "a", kind: "extrude", params: {}, inputs: [] }, { id: "b" }],
        }),
      ),
    ),
    msg(
      JSON.stringify({
        format: D.FORMAT,
        version: 1,
        steps: [{ id: "a", kind: "extrude", params: {}, inputs: [] }, { id: "b" }],
      }),
    ),
  );
  check(
    "steps that do not hold together say which",
    /step E works on s, which is not an earlier step/.test(
      msg(
        JSON.stringify({
          format: D.FORMAT,
          version: 1,
          steps: [
            { id: "E", kind: "extrude", params: {}, inputs: ["s"] },
            { id: "s", kind: "sketch", params: {}, inputs: [] },
          ],
        }),
      ),
    ),
  );
  check(
    "a parameter that is neither",
    /parameter x is neither/.test(
      msg(JSON.stringify({ format: D.FORMAT, version: 1, steps: [], parameters: { x: [1] } })),
    ),
  );
  const w = D.open(JSON.stringify({ format: D.FORMAT, version: 1, steps: [], labels: { gone: "Old" } }));
  check(
    "a name for a step that is not there is kept and reported",
    w.warnings.length === 1 && /gone/.test(w.warnings[0]!),
    w.warnings.join(),
  );
}
console.log("3. changes");
{
  let d = doc;
  d = D.editStep(d, "E", { d: 3 });
  check(
    "edit a step",
    (d.steps[1]!.params as { d: number }).d === 3 && (doc.steps[1]!.params as { d: string }).d === "=depth",
    "the old document is not touched",
  );
  check("a step that is not there", /no step nope/.test(throws(() => D.editStep(d, "nope", {}))));
  d = D.insert(d, { id: "F", kind: "round", params: {}, inputs: ["E"] }, { after: "E" });
  check("insert", d.steps.map((s) => s.id).join() === "s,E,F");
  d = D.labelStep(d, "F", "Edge round");
  d = D.remove(d, "F");
  check("remove takes the step's name with it", d.steps.length === 2 && !("F" in d.labels));
  check("a free id", D.freshId(d, "E") === "E1" && D.freshId(d, "X") === "X1");
  check(
    "a bad parameter name is refused",
    /not a name/.test(throws(() => D.setParameter(d, "2x", 1))) &&
      /constant or a function/.test(throws(() => D.setParameter(d, "sin", 1))),
  );
  check(
    "an expression that does not parse, or goes round, is refused and nothing changes",
    /position/.test(throws(() => D.setParameter(d, "q", "1 +* 2"))) &&
      /depends on itself/.test(throws(() => D.setParameter(D.setParameter(d, "a", 1), "a", "a + 1"))),
  );
  check(
    "delete a parameter that is used: refused, naming who uses it",
    /used by step s, step E|used by step E, step s|used by .*parameter depth/.test(
      throws(() => D.deleteParameter(doc, "width")),
    ),
    throws(() => D.deleteParameter(doc, "width")),
  );
  const free = D.deleteParameter(D.setParameter(doc, "spare", 4), "spare");
  check("delete one that is not used", !("spare" in free.parameters));
  const r = D.renameParameter(doc, "width", "w"),
    e1 = build(doc),
    e2 = build(r);
  check(
    "rename a parameter: every expression that used it follows, and the picture is the same",
    fp(e1) === fp(e2) && "w" in r.parameters && !("width" in r.parameters) && r.parameters.depth === "w / 5",
    JSON.stringify(r.parameters),
  );
  e1.release();
  e2.release();
  const sine = D.renameParameter(D.setParameter(D.setParameter(doc, "sin2", 2), "x", "sin(30) + sin2"), "sin2", "k");
  check("a function of the same start is left alone", sine.parameters.x === "sin(30) + k", String(sine.parameters.x));
  check(
    "rename onto a name that is there is refused",
    /already a parameter/.test(throws(() => D.renameParameter(doc, "width", "depth"))),
  );
}
console.log("4. names of bodies and steps, kept by the body's id");
{
  const e = build(doc),
    b = e.result("E").value as Body,
    key = idKey(b.bodies[0]!.id);
  let d = D.nameBody(doc, key, "Plate");
  const back = D.open(D.save(d)).doc;
  check(
    "the name is found again after saving and opening, by the body's id",
    D.bodyName(back, [key]) === "Plate" && back.labels.E === "Base plate",
  );
  check("a body answers to its aliases' names too", D.bodyName(back, ["other", key]) === "Plate");
  check(
    "two bodies cannot have one name",
    /already called Plate/.test(throws(() => D.nameBody(d, "another", "Plate"))),
  );
  check("an empty name takes it away", Object.keys(D.nameBody(d, key, "").names).length === 0);
  check("names no body answers to are listed", D.unusedNames(D.nameBody(d, "gone", "Old"), [key]).join() === "gone");
  e.release();
}
console.log("5. undo and redo");
{
  const h = new D.History(doc),
    at = (d: D.Doc) => (d.steps[1]!.params as { d: unknown }).d;
  h.do(D.editStep(h.doc, "E", { d: 3 }), "depth 3");
  h.do(D.setParameter(h.doc, "width", 20), "width 20");
  h.do(D.editStep(h.doc, "E", { d: 4 }), "depth 4");
  check(
    "three changes, and what undo would undo is named",
    h.next.undo === "depth 4" && h.next.redo === null && h.canUndo && !h.canRedo,
  );
  const u = h.undo()!;
  check("undo gives the state before, exactly", at(u) === 3 && u.parameters.width === 20 && h.next.redo === "depth 4");
  h.undo();
  const u3 = h.undo()!;
  check("undo to the start gives the opened document", D.save(u3) === D.save(doc) && !h.canUndo);
  const e1 = build(u3),
    e0 = build(doc);
  check("and it builds the same picture as the document that was opened", fp(e1) === fp(e0));
  e1.release();
  e0.release();
  h.redo();
  h.redo();
  check("redo twice", h.doc.parameters.width === 20 && h.next.redo === "depth 4");
  h.do(D.editStep(h.doc, "E", { d: 9 }), "depth 9");
  check("a new change after an undo drops the redo", !h.canRedo && at(h.doc) === 9);
  const m = new D.History(doc);
  m.do(D.editStep(m.doc, "E", { d: 1 }), "depth", { merge: "E.d" });
  m.do(D.editStep(m.doc, "E", { d: 2 }), "depth", { merge: "E.d" });
  m.do(D.editStep(m.doc, "E", { d: 3 }), "depth", { merge: "E.d" });
  check(
    "a number dragged is one change: three drags, one undo",
    at(m.doc) === 3 && (m.undo(), at(m.doc) === "=depth") && !m.canUndo,
  );
  const s = new D.History(doc);
  s.do(D.editStep(s.doc, "E", { d: 1 }), "a");
  check("modified until saved", s.modified);
  s.markSaved();
  check("then not", !s.modified);
  s.do(D.editStep(s.doc, "E", { d: 2 }), "b");
  check("modified again", s.modified);
  s.undo();
  check("undo back to the saved state is not modified", !s.modified);
  const l = new D.History(doc, 5);
  for (let i = 0; i < 20; i++) l.do(D.editStep(l.doc, "E", { d: i }), `n${i}`);
  let n = 0;
  while (l.undo()) n++;
  check("the history is bounded: 5 states, 4 undos", n === 4, String(n));
}
console.log("6. a long random session: every undo and redo equals a fresh build of that state");
{
  let seed = 3;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const h = new D.History(doc),
    states: string[] = [D.save(doc)];
  let bad = 0,
    ops = 0;
  for (let i = 0; i < 40; i++) {
    const r = rnd();
    const d = h.doc;
    try {
      if (r < 0.4) h.do(D.setParameter(d, "width", 5 + Math.floor(rnd() * 20)), "width");
      else if (r < 0.6) h.do(D.editStep(d, "E", { d: 1 + Math.floor(rnd() * 8) }), "depth");
      else if (r < 0.7) h.do(D.editStep(d, "E", { d: "=depth" }), "depth back");
      else if (r < 0.9) {
        if (h.undo()) ops++;
      } else if (h.redo()) ops++;
    } catch {
      /* a refused change changes nothing */
    }
    const e = build(h.doc),
      f = new Engine(h.doc.steps as never, { parameters: h.doc.parameters });
    f.build();
    if (fp(e) !== fp(f)) bad++;
    e.release();
    f.release();
  }
  check(
    `40 random changes, undos and redos (${ops} of them undo or redo): each state builds the same as a fresh engine`,
    bad === 0,
    `${bad} differ`,
  );
  const e = build(h.doc),
    inc = new Engine(doc.steps as never, { parameters: doc.parameters });
  inc.build();
  inc.setRecipe(h.doc.steps as never, undefined, h.doc.parameters);
  check("and an engine that is told the final state arrives at the fresh picture", fp(inc) === fp(e));
  e.release();
  inc.release();
}
console.log(failureCount() ? `\n${failureCount()} failure(s)` : "\nno failure");
process.exit(failureCount() ? 1 : 0);
