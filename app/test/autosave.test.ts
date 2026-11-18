// A copy of the project is kept in the browser as it is worked, and the copy of the session before is kept for a restore (`in_910`).
import test from "node:test";
import assert from "node:assert/strict";
import { createAutosave } from "../src/platform/autosave.ts";

function rig(initial: Record<string, string> = {}, limit = Infinity) {
  const data = new Map(Object.entries(initial));
  const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { if (v.length > limit) throw new Error("quota"); data.set(k, v); }, removeItem: (k: string) => { data.delete(k); } };
  let clock = 1000;
  const waiting: { f: () => void; id: number }[] = [];
  let nextId = 1;
  const make = () => createAutosave(store, { now: () => clock, later: (f) => { const id = nextId++; waiting.push({ f, id }); return id; }, cancel: (h) => { const i = waiting.findIndex((w) => w.id === h); if (i >= 0) waiting.splice(i, 1); } });
  return { data, store, make, tick: () => { const w = waiting.splice(0); for (const x of w) x.f(); }, waiting, at: (t: number) => { clock = t; } };
}

test("a change is written a moment later, once for a run of changes, and the text is asked for only then", () => {
  const r = rig();
  const a = r.make();
  let asked = 0;
  for (let i = 1; i <= 5; i++) a.remember(() => { asked++; return `project ${i}`; }, i);
  assert.equal(r.waiting.length, 1, "one write waits");
  assert.equal(asked, 0);
  r.at(5000); r.tick();
  assert.equal(asked, 1);
  const kept = JSON.parse(r.data.get("cad.autosave")!);
  assert.deepEqual([kept.text, kept.steps, kept.savedAt], ["project 5", 5, 5000]);
});

test("an empty project is not written; closing the page writes what waits at once", () => {
  const r = rig();
  const a = r.make();
  a.remember(() => "nothing", 0); r.tick();
  assert.equal(r.data.has("cad.autosave"), false);
  a.remember(() => "two steps", 2);
  a.flush();
  assert.equal(JSON.parse(r.data.get("cad.autosave")!).text, "two steps");
});

test("the next session finds the copy of the one before, and an empty session in between does not lose it", () => {
  const r = rig();
  const first = r.make();
  first.remember(() => "the crashed work", 40); first.flush();
  const second = r.make(); // (the page opened again after the crash)
  assert.equal(second.previous()?.text, "the crashed work");
  assert.equal(second.previous()?.steps, 40);
  assert.equal(r.data.has("cad.autosave"), false, "this session has nothing of its own yet");
  const third = r.make(); // (opened again without a change: nothing of the second to move over the first)
  assert.equal(third.previous()?.text, "the crashed work");
  third.remember(() => "new work", 3); third.flush();
  const fourth = r.make();
  assert.equal(fourth.previous()?.text, "new work", "a session with something of its own takes the place");
  fourth.forgetPrevious();
  assert.equal(fourth.previous(), null);
});

test("a project that does not fit is not kept, and the person is told once", () => {
  const r = rig({}, 50);
  const a = r.make();
  const said: string[] = [];
  a.remember(() => "x".repeat(200), 9, (w) => said.push(w)); r.tick();
  a.remember(() => "y".repeat(200), 10, (w) => said.push(w)); r.tick();
  assert.equal(said.length, 1);
  assert.match(said[0]!, /too big to keep a copy/);
  assert.equal(r.data.has("cad.autosave"), false);
});

test("no storage at all is not an error", () => {
  const a = createAutosave(null, { later: (f) => f() });
  a.remember(() => "x", 1); a.flush();
  assert.equal(a.previous(), null);
  a.forgetPrevious();
});
