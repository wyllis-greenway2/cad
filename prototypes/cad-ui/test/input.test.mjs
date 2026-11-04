import test from "node:test";
import assert from "node:assert/strict";
import { navAction, keyAction, matchKey } from "../src/keymap.mjs";
import { evalExpr } from "../src/expr.mjs";
import { SketchStore } from "../src/sketchstore.mjs";
import { settings } from "../src/settings.js";

const P = settings.input.navPresets;
const ev = (o) => ({ button: 0, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, key: "", ...o });

test("navigation presets: orbit and pan bindings per preset; the left button is never navigation in ours", () => {
  assert.equal(navAction(ev({ button: 2 }), P.ours), "orbit");
  assert.equal(navAction(ev({ button: 1 }), P.ours), "pan");
  assert.equal(navAction(ev({ button: 2, shiftKey: true }), P.ours), "pan");
  assert.equal(navAction(ev({ button: 0 }), P.ours), null);
  assert.equal(navAction(ev({ button: 1, shiftKey: true }), P.fusion), "orbit");
  assert.equal(navAction(ev({ button: 1 }), P.fusion), "pan");
  assert.equal(navAction(ev({ button: 1 }), P.solidworks), "orbit");
  assert.equal(navAction(ev({ button: 1, ctrlKey: true }), P.solidworks), "pan");
  assert.equal(navAction(ev({ button: 1, metaKey: true }), P.solidworks), "pan", "Cmd counts as the mod key");
  assert.equal(navAction(ev({ button: 1, shiftKey: true }), P.blender), "pan");
  assert.equal(navAction(ev({ button: 2, altKey: true }), P.ours), null, "extra modifiers do not match");
  assert.equal(navAction(ev({ button: 0, altKey: true }), P.ours), "orbit", "Alt+left-drag orbits (trackpads, mice without a usable right button)");
  assert.equal(navAction(ev({ button: 0, altKey: true, shiftKey: true }), P.ours), "pan");
});

test("hotkeys: letters, undo and redo with Ctrl or Cmd, Esc, Enter, Delete", () => {
  const K = settings.input.keys;
  assert.equal(keyAction(ev({ key: "r" }), K), "rect");
  assert.equal(keyAction(ev({ key: "R" }), K), "rect", "Caps Lock or Shift does not change a plain letter's meaning");
  assert.equal(keyAction(ev({ key: "z", ctrlKey: true }), K), "undo");
  assert.equal(keyAction(ev({ key: "z", metaKey: true }), K), "undo");
  assert.equal(keyAction(ev({ key: "Z", ctrlKey: true, shiftKey: true }), K), "redo");
  assert.equal(keyAction(ev({ key: "y", ctrlKey: true }), K), "redo");
  assert.equal(keyAction(ev({ key: "Escape" }), K), "cancel");
  assert.equal(keyAction(ev({ key: "Enter" }), K), "confirm");
  assert.equal(keyAction(ev({ key: "Delete" }), K), "delete");
  assert.equal(keyAction(ev({ key: "Tab", shiftKey: true }), K), "prevField");
  assert.equal(keyAction(ev({ key: "Tab" }), K), "nextField");
  assert.equal(keyAction(ev({ key: "z" }), K), null);
  assert.ok(!matchKey(ev({ key: "z", ctrlKey: true }), "mod+shift+z"));
});

test("typed sizes: safe math, no eval", () => {
  assert.equal(evalExpr("40"), 40);
  assert.equal(evalExpr("50/2"), 25);
  assert.equal(evalExpr("3*4+1"), 13);
  assert.equal(evalExpr("(2+3)*4"), 20);
  assert.equal(evalExpr("-5+2"), -3);
  assert.equal(evalExpr(" 12.5 "), 12.5);
  assert.equal(evalExpr(".5*2"), 1);
  for (const bad of ["", "abc", "2+", "(2", "2)", "1/0", "2**3", "alert(1)", "2 3"]) assert.ok(Number.isNaN(evalExpr(bad)), `bad: ${bad}`);
});

test("sketch store: add, remove, undo, redo, version", () => {
  const s = new SketchStore();
  const a = s.add("XY", { type: "rect", x0: 0, y0: 0, x1: 4, y1: 3 });
  const b = s.add("XY", { type: "circle", cx: 1, cy: 1, r: 2 });
  assert.deepEqual(s.entities("XY").map((e) => e.id), [a.id, b.id]);
  assert.equal(s.entities("XZ").length, 0);
  s.remove("XY", a.id);
  assert.deepEqual(s.entities("XY").map((e) => e.id), [b.id]);
  const v = s.version;
  assert.equal(s.undo().type, "remove");
  assert.equal(s.entities("XY").length, 2, "undo of a remove restores the entity");
  assert.equal(s.undo().type, "add");
  assert.deepEqual(s.entities("XY").map((e) => e.id), [a.id]);
  assert.equal(s.redo().type, "add");
  assert.equal(s.entities("XY").length, 2);
  assert.ok(s.version > v);
  s.add("XY", { type: "circle", cx: 0, cy: 0, r: 1 });
  assert.equal(s.canRedo(), false, "a new action clears the redo stack");
  while (s.undo());
  assert.equal(s.entities("XY").length, 0);
  assert.equal(s.canUndo(), false);
  assert.equal(s.undo(), null);
});
