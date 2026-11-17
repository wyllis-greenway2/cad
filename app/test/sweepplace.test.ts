// The two ways to place a sweep's shape (`dec_sweep_modes`, `in_657`, `in_658`): "from the sketch" carries it from where it is drawn (what older files do), "along the line" stands a copy with the middle of its box on
// the start of the path, square to it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession } from "../src/interaction/session.ts";

await kernel.init();
const raw = readFileSync(new URL("./fixtures/sweep-chamfer-in_653.cad.json", import.meta.url), "utf8");
const withPlace = (place?: string) => {
  const d = JSON.parse(raw);
  const st = d.commands[25].step;
  if (place) st.params.place = place;
  return openSession(kernel, JSON.stringify(d));
};

test("a file without the setting keeps its old behaviour (from the sketch): the crease note is still said", () => {
  const r = withPlace();
  assert.ok(r.ok);
  assert.match(r.value.outcome.notes?.["s_027"] ?? "", /off square to the path/);
});

test("along the line: the shape starts square to the path, so no crease is said, and the body is made", () => {
  const r = withPlace("path");
  assert.ok(r.ok);
  assert.equal(r.value.outcome.notes?.["s_027"], undefined);
  assert.equal(r.value.outcome.errors?.["s_027"], undefined);
});

test("saying from the sketch is the same as saying nothing", () => {
  const [a, b] = [withPlace(), withPlace("sketch")];
  assert.ok(a.ok && b.ok);
  assert.equal(a.value.outcome.notes?.["s_027"], b.value.outcome.notes?.["s_027"]);
});
