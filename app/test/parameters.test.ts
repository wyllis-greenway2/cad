// Named parameters (`dec_named_parameters`): the formulas.
import test from "node:test";
import assert from "node:assert/strict";
import { evaluate, evaluateAll, usesOf, nameOk, parseExpr } from "../src/operation/parameters.ts";

test("numbers, the four operations, powers, brackets, a minus", () => {
  assert.equal(evaluate("2 + 3 * 4", {}), 14);
  assert.equal(evaluate("(2 + 3) * 4", {}), 20);
  assert.equal(evaluate("-2 ^ 2", {}), -4);
  assert.equal(evaluate("2 ^ 3 ^ 2", {}), 512);
  assert.equal(evaluate("10 / 4 - 1", {}), 1.5);
  assert.equal(evaluate("=1.5e1", {}), 15);
});
test("names, constants and functions (angles in degrees)", () => {
  assert.equal(evaluate("w / 2 + 1", { w: 10 }), 6);
  assert.ok(Math.abs((evaluate("2 * pi", {}) as number) - 2 * Math.PI) < 1e-12);
  assert.ok(Math.abs((evaluate("sin(30)", {}) as number) - 0.5) < 1e-12);
  assert.equal(evaluate("max(1, w, 3)", { w: 7 }), 7);
  assert.equal(evaluate("sqrt(16)", {}), 4);
});
test("mistakes say what they are", () => {
  assert.match(evaluate("2 +", {}) as string, /stops too soon/);
  assert.match(evaluate("(2", {}) as string, /\)/);
  assert.match(evaluate("x + 1", {}) as string, /x is not a parameter/);
  assert.match(evaluate("foo(1)", {}) as string, /not a function/);
  assert.match(evaluate("1 / 0", {}) as string, /no value/);
  assert.equal(typeof parseExpr(""), "string");
});
test("the names a formula uses, and what a name can be", () => {
  assert.deepEqual(usesOf("a * 2 + max(b, pi)").sort(), ["a", "b"]);
  assert.equal(nameOk("wall_1"), true);
  assert.equal(nameOk("1wall"), false);
  assert.equal(nameOk("sin"), false);
  assert.equal(nameOk("pi"), false);
});
test("all the parameters at once: in any order, a circle and a missing name are caught", () => {
  const ok = evaluateAll({ b: "a * 2", a: "5", c: "a + b" });
  assert.deepEqual(ok.values, { a: 5, b: 10, c: 15 });
  assert.deepEqual(ok.errors, {});
  const bad = evaluateAll({ a: "b + 1", b: "a + 1", c: "zzz", d: "c + 1", e: "3" });
  assert.equal(bad.values.e, 3);
  assert.ok(bad.errors.a && bad.errors.b && bad.errors.c && bad.errors.d);
});
