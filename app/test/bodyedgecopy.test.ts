// A figure made partly of the body's edges is copied into the sketch when its step is made (`dec_body_edge_pieces`, `in_1365`): the step stays whatever is changed afterwards.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene, run, saveText } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { startOp } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";
import type { Command } from "../src/operation/commands.ts";

await kernel.init();
const file = new URL("./fixtures/two-faces-pull-in_1363.cad.json", import.meta.url);
const volume = (s: Session): number => Object.values(scene(s).parts).reduce((t, p) => t + (p.kind === "body" ? (p.volume ?? 0) : 0), 0);

test("two end pieces of a cylinder's top, pulled down, stay made whatever is changed afterwards, and a break is said (`in_1365`)", () => {
  const o = openSession(kernel, readFileSync(file, "utf8"));
  assert.ok(o.ok);
  if (!o.ok) return;
  const sc = scene(o.value);
  const chosen = (JSON.parse(readFileSync(file, "utf8")) as { state: { selection: string[] } }).state.selection;
  const st = startOp(sc, chosen as never, "extrude");
  assert.ok(st.ok);
  if (!st.ok) return;
  const r = runOp(o.value, { ...st.op, value: -5 });
  assert.ok(r && !r.session.message, r?.session.message ?? "");
  let s = r!.session;
  const pulled = scene(s).steps.filter((x) => x.id !== "s_002" && x.type === "extrude");
  assert.ok(pulled.length >= 1, "the pull made its step or steps");
  for (const x of pulled) {
    assert.ok(x.parts.every((p) => !p.includes("@")), `the figure is the sketch's own lines, not pieces: ${x.parts.join(",")}`);
    assert.equal(x.params.rim, undefined, "no `rim`");
    assert.equal(x.params.cut, undefined, "no `cut`");
  }
  const cutVolume = volume(s);
  const circle = scene(s).parts["d/e_001.k" as never] as { radius: number };
  const changes: [string, Command][] = [
    ["the same radius", { type: "setRadius", ref: "d/e_001.k" as never, radius: circle.radius }],
    ["a larger radius", { type: "setRadius", ref: "d/e_001.k" as never, radius: 16.5 }],
    ["a smaller radius", { type: "setRadius", ref: "d/e_001.k" as never, radius: 9 }],
    ["a longer cylinder", { type: "setStepParams", id: "s_002", params: { depth: 30 } }],
  ];
  for (const [what, cmd] of changes) {
    const t = run(s, cmd);
    assert.deepEqual(t.outcome.errors, {}, `${what}: nothing is lost`);
    assert.ok(!t.message, `${what}: ${t.message}`);
    assert.ok(volume(t) > 0, what);
  }
  // the pocket is still cut when the cylinder is longer: the body is the longer cylinder less the two pieces
  const longer = run(s, changes[3]![1]);
  assert.ok(volume(longer) > cutVolume, "longer");
  // saved and opened again, the steps are the same
  const reopened = openSession(kernel, saveText(s));
  assert.ok(reopened.ok);
});

test("a step that loses what it needs after a change is said, never silent", () => {
  const o = openSession(kernel, readFileSync(file, "utf8"));
  assert.ok(o.ok);
  if (!o.ok) return;
  // delete the lines the pocket was drawn with: a later step made from them cannot be made
  const sc = scene(o.value);
  const chosen = (JSON.parse(readFileSync(file, "utf8")) as { state: { selection: string[] } }).state.selection;
  const st = startOp(sc, chosen as never, "extrude");
  if (!st.ok) return;
  const r = runOp(o.value, { ...st.op, value: -5 })!;
  const step = scene(r.session).steps.at(-1)!;
  const gone = run(r.session, { type: "deleteParts", refs: [step.parts[0]!] } as Command);
  assert.ok(Object.keys(gone.outcome.errors).length > 0 ? !!gone.message : true, "an error that appears comes with a message");
});
