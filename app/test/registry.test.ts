// The registry of routes (`in_568`, `dec_manufacturing_contract` points 4 and 7): the cut point. A route is added and taken away in one call and nothing else knows it; every route runs through the same stages in the same
// order, then the shared Emit stage; a route that fails is a finding and not a crash; nothing blocks. The routes here are fakes made for the tests.
import test from "node:test";
import assert from "node:assert/strict";
import { createRegistry, runRoute, defaultSettings, checkSettings, whyBadParams, CONTRACT_VERSION } from "../src/manufacturing/index.ts";
import type { Route, PartSnapshot, RouteContext, MachineDefinition, DialectDefinition, Toolpath, Finding } from "../src/manufacturing/index.ts";

const part = (kind: "solid" | "flat", name = "Bracket"): PartSnapshot => ({ contract: CONTRACT_VERSION, id: `b/${name}`, name, kind, units: "mm", bbox: { min: [0, 0, 0], max: [40, 20, 3] } });
const machine = (process: string): MachineDefinition => ({ kind: "machine", id: "m1", version: 1, name: `A ${process}`, provenance: { author: "t", date: "2026-11-16", licence: "CC0", origin: "user", trust: "user" },
  process, envelope: { min: [0, 0, 0], max: [400, 400, 50] }, origin: "front-left", kinematics: "cartesian", limits: { feed: 6000 }, capabilities: { axes: 3, rotary: false, arcs: true, toolChange: "none", coolant: false, probe: false }, dialect: "d1", route: {} });
const ctx = (process = "laser", settings: Record<string, number | string | boolean> = {}): RouteContext => ({ machine: machine(process), settings });
const dialect: DialectDefinition = { kind: "dialect", id: "d1", version: 1, name: "D", provenance: { author: "t", date: "2026-11-16", licence: "CC0", origin: "user", trust: "user" },
  extension: "nc", decimals: 2, comment: { open: ";" }, lineNumbers: false, start: [], end: [], words: { rapid: "G0", linear: "G1", arcCw: "G2", arcCcw: "G3" } };
const path: Toolpath = { units: "mm", operations: [{ id: "o", label: "Cut", layer: "cut", moves: [{ op: "travel", to: [0, 0, 0] }, { op: "cut", to: [40, 0, 0], feed: 500 }] }] };

const laser = (over: Partial<Route> = {}): Route => ({ contract: CONTRACT_VERSION, id: "laser-outline", name: "Laser outline", process: "laser", family: "toolpath", accepts: ["flat"], uses: ["machine", "material"],
  params: [{ id: "kerf", label: "Kerf", kind: "number", unit: "mm", min: 0, max: 2, default: 0.2 }, { id: "tabs", label: "Tabs", kind: "boolean", default: false }, { id: "order", label: "Order", kind: "choice", default: "inside-out", choices: [{ value: "inside-out", label: "Inside first" }, { value: "as-drawn", label: "As drawn" }] }],
  fit: (p) => ({ fits: p.bbox.max[0] <= 100, reasons: p.bbox.max[0] <= 100 ? [] : ["wider than 100 mm"] }),
  check: () => [{ id: "thin", severity: "caution", message: "a web under 0.8 mm", refs: [] }],
  plan: () => path, ...over });

test("a route is registered once, listed in order, found by id, and taken away in one call that leaves nothing of it", () => {
  const r = createRegistry();
  assert.deepEqual(r.register(laser()), { ok: true });
  assert.deepEqual(r.register(laser({ id: "waterjet", name: "Waterjet", process: "waterjet" })), { ok: true });
  assert.deepEqual(r.list().map((x) => x.id), ["laser-outline", "waterjet"]);
  assert.equal(r.get("waterjet")!.name, "Waterjet");
  assert.equal(r.forPart(part("flat")).length, 2);
  assert.equal(r.unregister("laser-outline"), true);
  assert.equal(r.unregister("laser-outline"), false, "already gone");
  assert.deepEqual(r.list().map((x) => x.id), ["waterjet"]);
  assert.equal(r.get("laser-outline"), undefined);
  assert.deepEqual(r.forPart(part("flat")).map((o) => o.route), ["waterjet"], "no trace of it in what is offered");
  assert.deepEqual(r.register(laser()), { ok: true }, "and it can be added again");
});

test("a route is refused, with the reason, for another contract version, a repeated id, no kinds of part, or a settings schema that cannot be used", () => {
  const r = createRegistry();
  assert.deepEqual(r.register(laser({ contract: 99 })), { ok: false, error: `laser-outline was written for contract version 99, this app has version ${CONTRACT_VERSION}` });
  assert.equal(r.register(laser({ name: " " })).ok, false);
  assert.equal(r.register(laser({ accepts: [] })).ok, false);
  assert.deepEqual(r.register(laser()), { ok: true });
  assert.deepEqual(r.register(laser()), { ok: false, error: 'a route with the id "laser-outline" is already registered' });
  assert.deepEqual(r.register(laser({ id: "x", params: [{ id: "a", label: "A", kind: "number", default: 5, max: 3 }] })), { ok: false, error: 'x: "a": the default is outside its own limits' });
  assert.equal(r.list().length, 1, "a refused route is not kept");
  assert.equal(whyBadParams([{ id: "a", label: "A", kind: "boolean", default: true }, { id: "a", label: "B", kind: "boolean", default: false }]), 'the setting "a" appears twice');
  assert.equal(whyBadParams([{ id: "c", label: "C", kind: "choice", default: "z", choices: [{ value: "y", label: "Y" }] }]), '"c": the default is not one of the choices');
  assert.equal(whyBadParams([{ id: "t", label: "T", kind: "text", default: 5 as never }]), '"t": the default of a text is a text');
});

test("the routes offered for a part are those that take its kind, each with whether it fits and why not (a route that does not fit is still listed)", () => {
  const r = createRegistry();
  r.register(laser());
  r.register(laser({ id: "print-ready", name: "Print readiness", process: "fdm", accepts: ["solid"], fit: undefined }));
  assert.deepEqual(r.forPart(part("solid")).map((o) => [o.route, o.fit.fits]), [["print-ready", true]], "a route with no fit stage fits");
  const wide = { ...part("flat"), bbox: { min: [0, 0, 0] as const, max: [250, 20, 0] as const } };
  assert.deepEqual(r.forPart(wide).map((o) => [o.route, o.fit]), [["laser-outline", { fits: false, reasons: ["wider than 100 mm"] }]]);
});

test("a route runs the standard stages: fit, check and plan, then the shared Emit; the findings and the file come back together", () => {
  const run = runRoute(laser(), part("flat"), ctx(), dialect);
  assert.equal(run.route, "laser-outline");
  assert.deepEqual(run.fit, { fits: true, reasons: [] });
  assert.deepEqual(run.findings.map((f) => f.id), ["thin"]);
  assert.deepEqual(run.toolpath, path);
  assert.equal(run.files[0]!.name, "Bracket.nc");
  assert.match(new TextDecoder().decode(run.files[0]!.bytes), /G1 X40 F500/);
  assert.deepEqual(run.warnings, []);
  assert.deepEqual(runRoute(laser(), part("flat"), ctx()).files, [], "no dialect: the toolpath, no file");
  assert.equal(runRoute(laser({ plan: undefined }), part("flat"), ctx(), dialect).toolpath, undefined, "a route that stops at check has no toolpath");
});

test("nothing blocks: a part that does not fit, another kind of part or another process of machine are findings, and the route still runs", () => {
  const wide = { ...part("solid", "Big"), bbox: { min: [0, 0, 0] as const, max: [250, 20, 5] as const } };
  const run = runRoute(laser(), wide, ctx("router"), dialect);
  const msgs = run.findings.map((f) => f.message);
  assert.ok(msgs.some((m) => /is for laser, and A router is a router machine/.test(m)));
  assert.ok(msgs.some((m) => /takes flat parts, and Big is a solid one/.test(m)));
  assert.ok(msgs.some((m) => /may not suit Big: wider than 100 mm/.test(m)));
  assert.ok(run.findings.every((f) => f.severity !== "warning"), "advice, not alarms");
  assert.ok(run.toolpath && run.files.length === 1, "and it still planned and wrote the file");
});

test("a stage that throws is a finding and the run goes on: no crash from a route", () => {
  const boom = laser({ id: "boom", name: "Boom", check: () => { throw new Error("no thickness"); }, plan: () => { throw new Error("bad plan"); }, fit: () => { throw new Error("no fit"); } });
  const run = runRoute(boom, part("flat"), ctx(), dialect);
  assert.deepEqual(run.findings.filter((f) => f.severity === "warning").map((f) => f.message).sort(), ["Boom failed in its check stage: no thickness", "Boom failed in its fit stage: no fit", "Boom failed in its plan stage: bad plan"]);
  assert.equal(run.toolpath, undefined);
  assert.deepEqual(run.files, []);
  const r = createRegistry();
  r.register(boom);
  assert.deepEqual(r.forPart(part("flat"))[0]!.fit, { fits: false, reasons: ["Boom failed in its fit stage: no fit"] }, "listing does not crash either");
});

test("settings: the defaults are each setting's default; out of limits, the wrong kind, not a choice and unknown ones are advice", () => {
  const route = laser();
  assert.deepEqual(defaultSettings(route), { kerf: 0.2, tabs: false, order: "inside-out" });
  const f = (s: Record<string, number | string | boolean>): string[] => checkSettings(route, s).map((x: Finding) => x.message);
  assert.deepEqual(f({ kerf: 0.3, tabs: true, order: "as-drawn" }), []);
  assert.deepEqual(f({ kerf: 5 }), ["Kerf is above 2 mm"]);
  assert.deepEqual(f({ kerf: -1 }), ["Kerf is below 0 mm"]);
  assert.deepEqual(f({ kerf: "wide" }), ["Kerf needs a number"]);
  assert.deepEqual(f({ order: "random", tabs: "yes" }), ["Order is not one of the choices", "Tabs needs yes or no"]);
  assert.deepEqual(f({ nozzle: 0.4 }), ["Laser outline has no setting \"nozzle\""]);
  assert.deepEqual(f({}), [], "missing settings are not wrong: the default is used");
  assert.deepEqual(runRoute(route, part("flat"), ctx("laser", { kerf: 9 })).findings.map((x) => x.id), ["laser-outline:settings:kerf", "thin"]);
});
