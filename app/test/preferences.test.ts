// The settings page's logic and the menu keeping every icon (`in_568`, `dec_settings_page`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { chordOf, specText, rebind, unbind, takenBy, keysToText, keysFromText, KEY_ACTIONS } from "../src/interaction/preferences.ts";
import { settings } from "../src/shared/settings.ts";
import { keyIntents } from "../src/interaction/input/keys.ts";

const usual = () => JSON.parse(JSON.stringify(settings.input.keys)) as Record<string, string[]>;
const none = { shift: false, ctrl: false, alt: false };

test("a key press becomes a binding, and a key kept for typing is refused with a reason", () => {
  assert.deepEqual(chordOf("z", { ...none, ctrl: true, shift: true }), { ok: true, spec: "mod+shift+z" });
  assert.deepEqual(chordOf("R", { ...none, shift: true }), { ok: true, spec: "shift+r" });
  for (const k of ["5", ".", "-", "Tab", "Enter", "ArrowUp", " ", "Shift", "Control"]) assert.equal(chordOf(k, none).ok, false, k);
  assert.equal(chordOf("w", none).ok, false, "W A S D fly the view");
  assert.equal(chordOf("w", { ...none, ctrl: true }).ok, true);
  assert.equal(specText("mod+shift+z"), "Ctrl+Shift+Z");
  assert.equal(specText("escape"), "Esc");
});

test("every action the keyboard starts is on the page, with the usual keys on the ones that have them", () => {
  const ids = KEY_ACTIONS.map((a) => a.id);
  for (const a of Object.keys(settings.input.keys)) assert.ok(ids.includes(a), `${a} is listed`);
  assert.equal(new Set(ids).size, ids.length);
});

test("a binding set on the page works as a key: R starts the rectangle tool; the old key stops", () => {
  const { keys } = rebind(usual(), "toolRect", 0, "r");
  const press = (key: string, ctrl = false) => keyIntents({ kind: "key", key, down: true, mods: { shift: false, ctrl, alt: false }, t: 0 }, { ...settings.input, keys });
  assert.deepEqual(press("r"), [{ type: "begin", name: "rect" }]);
  assert.deepEqual(press("z", true), [{ type: "undo" }]);
  const moved = rebind(keys, "undo", 0, "u").keys;
  const press2 = (key: string, ctrl = false) => keyIntents({ kind: "key", key, down: true, mods: { shift: false, ctrl, alt: false }, t: 0 }, { ...settings.input, keys: moved });
  assert.deepEqual(press2("u"), [{ type: "undo" }]);
  assert.deepEqual(press2("z", true), [], "the old Ctrl+Z no longer undoes");
});

test("a key another action has is moved to the new one, and said so; remove and add work", () => {
  const k = usual();
  assert.equal(takenBy(k, "mod+z", "redo"), "undo");
  const r = rebind(k, "redo", 2, "mod+z");
  assert.equal(r.tookFrom, "undo");
  assert.deepEqual(r.keys.undo, []);
  assert.ok(r.keys.redo!.includes("mod+z"));
  assert.deepEqual(unbind(k, "redo", 0).redo, ["mod+y"]);
  assert.equal(rebind(k, "save", 5, "mod+s").keys.save!.length, 1, "the same key twice is one");
});

test("only the changed bindings are kept, read back over the usual ones, and rubbish is ignored", () => {
  const u = usual();
  const changed = rebind(u, "toolRect", 0, "r").keys;
  const text = keysToText(changed, u);
  assert.deepEqual(JSON.parse(text), { toolRect: ["r"] });
  assert.deepEqual(keysFromText(text, u).toolRect, ["r"]);
  assert.deepEqual(keysFromText(text, u).undo, ["mod+z"]);
  assert.deepEqual(keysFromText("{{not json", u), u);
  assert.deepEqual(keysFromText(JSON.stringify({ nonsense: ["x"], undo: [3] }), u), u);
});
