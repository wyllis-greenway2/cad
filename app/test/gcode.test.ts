// The shared Emit stage (`in_567`, `dec_manufacturing_contract`): a toolpath and a machine's dialect make a G-code file, the same code for every route. The dialects here are test fixtures, not the official ones
// (those come from checked sources, `in_558`'s rule): they show that a change of dialect changes the file and nothing else.
import test from "node:test";
import assert from "node:assert/strict";
import { writeGcode, CONTRACT_VERSION } from "../src/manufacturing/index.ts";
import type { DialectDefinition, Toolpath, Route } from "../src/manufacturing/index.ts";

const header = { kind: "dialect" as const, version: 1, provenance: { author: "test", date: "2026-11-16", licence: "CC0", origin: "user" as const, trust: "user" as const } };
const beam: DialectDefinition = { ...header, id: "test-beam", name: "Test beam", extension: "nc", decimals: 3, comment: { open: "(", close: ")" }, lineNumbers: false,
  start: ["G21", "G90"], end: ["M2"], words: { rapid: "G0", linear: "G1", arcCw: "G2", arcCcw: "G3" }, dwell: "G4 P{sec}", toolChange: "M6 T{tool}", power: { on: "M4 S{s}", off: "M5", max: 1000, offOnTravel: true } };
const printer: DialectDefinition = { ...header, id: "test-fdm", name: "Test printer", extension: "gcode", decimals: 2, comment: { open: ";" }, lineNumbers: false,
  start: ["G28"], end: [], words: { rapid: "G0", linear: "G1", arcCw: "G2", arcCcw: "G3" }, extrude: { axis: "E", absolute: true } };
const text = (b: Uint8Array) => new TextDecoder().decode(b);
const lines = (tp: Toolpath, d: DialectDefinition) => text(writeGcode(tp, d).files[0]!.bytes).trimEnd().split("\n");

const square: Toolpath = { units: "mm", operations: [{ id: "o1", label: "Outline", layer: "cut", moves: [
  { op: "travel", to: [0, 0, 0] }, { op: "cut", to: [10, 0, 0], feed: 600, power: 1 }, { op: "cut", to: [10, 10, 0] }, { op: "cut", to: [0, 10, 0] }, { op: "cut", to: [0, 0, 0] },
] }] };

test("a beam path: header, start lines, a rapid, the power on once, moves with the feed only when it changes, the power off, the end lines", () => {
  assert.deepEqual(lines(square, beam), [
    "(toolpath)", "G21", "G90", "(Outline)",
    "G0 X0 Y0 Z0", "M4 S1000", "G1 X10 F600", "G1 Y10", "G1 X0", "G1 Y0", "M5", "M2",
  ]);
});

test("the same toolpath in another dialect changes only the file: line numbers, comment style, decimals", () => {
  const numbered: DialectDefinition = { ...beam, lineNumbers: true, comment: { open: ";" }, decimals: 1, power: undefined };
  const l = lines(square, numbered);
  assert.equal(l[0], "N10 ;toolpath");
  assert.ok(l.every((x, i) => x.startsWith(`N${(i + 1) * 10} `)));
  assert.ok(!l.some((x) => x.includes("M4") || x.includes("M5")), "no power in this dialect: the power is left out");
  assert.ok(l.includes("N60 G1 X10 F600"));
});

test("the power goes off for a travel move and comes back on for the next cut; a different power is a new line", () => {
  const tp: Toolpath = { units: "mm", operations: [{ id: "o", label: "Two", layer: "cut", moves: [
    { op: "travel", to: [0, 0, 0] }, { op: "cut", to: [5, 0, 0], feed: 300, power: 0.5 },
    { op: "travel", to: [20, 0, 0] }, { op: "cut", to: [25, 0, 0], power: 0.5 }, { op: "cut", to: [30, 0, 0], power: 0.25 },
  ] }] };
  assert.deepEqual(lines(tp, beam).slice(4), ["G0 X0 Y0 Z0", "M4 S500", "G1 X5 F300", "M5", "G0 X20", "M4 S500", "G1 X25", "M4 S250", "G1 X30", "M5", "M2"]);
});

test("arcs: the centre is I and J from where the arc starts; a full circle says both X and Y; clockwise and counter-clockwise are the dialect's words", () => {
  const tp: Toolpath = { units: "mm", operations: [{ id: "o", label: "Arcs", layer: "cut", moves: [
    { op: "travel", to: [10, 0, 0] }, { op: "arc", to: [0, 10, 0], center: [0, 0, 0], clockwise: false, feed: 400 },
    { op: "arc", to: [0, 10, 0], center: [0, 0, 0], clockwise: true },
  ] }] };
  const l = lines(tp, { ...beam, power: undefined });
  assert.ok(l.includes("G3 X0 Y10 I-10 J0 F400"));
  assert.ok(l.includes("G2 X0 Y10 I0 J-10"), "a second arc that ends where the machine already is still names X and Y");
});

test("an extruder: absolute numbers add up, relative ones are each move's own; a dialect with no extruder says what it left out", () => {
  const tp: Toolpath = { units: "mm", operations: [{ id: "o", label: "Layer", layer: "perimeter", moves: [
    { op: "travel", to: [0, 0, 0.2] }, { op: "extrude", to: [10, 0, 0.2], amount: 0.5, feed: 1800 }, { op: "extrude", to: [10, 10, 0.2], amount: 0.5 },
  ] }] };
  assert.deepEqual(lines(tp, printer).slice(3), ["G0 X0 Y0 Z0.2", "G1 X10 E0.5 F1800", "G1 Y10 E1"]);
  assert.deepEqual(lines(tp, { ...printer, extrude: { axis: "E", absolute: false } }).slice(4), ["G1 X10 E0.5 F1800", "G1 Y10 E0.5"]);
  const none = writeGcode(tp, { ...printer, extrude: undefined });
  assert.equal(none.warnings.length, 2);
  assert.match(none.warnings[0]!, /no extruder axis/);
});

test("a drill goes to its place, plunges the depth below the surface and comes back up; tools and pauses use the dialect's lines, or say they cannot", () => {
  const tp: Toolpath = { units: "mm", operations: [{ id: "o", label: "Holes", layer: "drill", moves: [
    { op: "tool", tool: "3" }, { op: "travel", to: [0, 0, 5] }, { op: "drill", to: [20, 10, 5], depth: 8, feed: 120 }, { op: "pause", seconds: 1.5 },
  ] }] };
  assert.deepEqual(lines(tp, { ...beam, power: undefined }).slice(4), ["M6 T3", "G0 X0 Y0 Z5", "G0 X20 Y10", "G1 Z-3 F120", "G0 Z5", "G4 P1.5", "M2"]);
  const bare = writeGcode(tp, { ...beam, power: undefined, toolChange: undefined, dwell: undefined });
  assert.deepEqual(bare.warnings.map((w) => w.replace(/\d/g, "#")), ["tool #: this dialect has no tool change line, a comment was written", "a pause was left out: this dialect has no pause line"]);
});

test("the file has a name and an ending from the dialect, no minus zero, text a comment cannot hold is cleaned, and the same input always gives the same bytes", () => {
  const tp: Toolpath = { units: "mm", operations: [{ id: "o", label: "Cut (inner); part\nname", layer: "cut", moves: [{ op: "travel", to: [-0.0001, 0, 0] }] }] };
  const r = writeGcode(tp, beam, "bracket");
  assert.equal(r.files[0]!.name, "bracket.nc");
  assert.equal(r.files[0]!.mime, "text/plain");
  const l = text(r.files[0]!.bytes);
  assert.ok(!l.includes("-0"), "no minus zero");
  assert.ok(l.includes("(Cut  inner   part name)"), "brackets, semicolons and line breaks are gone from a comment");
  assert.deepEqual(text(writeGcode(tp, beam, "bracket").files[0]!.bytes), l);
  assert.deepEqual(r.files[0]!.bytes, writeGcode(tp, beam, "bracket").files[0]!.bytes);
});

test("a route has no emit: its stages are fit, check and plan, and the Emit stage works for any toolpath whatever route made it", () => {
  const route: Route = { contract: CONTRACT_VERSION, id: "laser-outline", name: "Laser outline", process: "laser", family: "toolpath", accepts: ["flat"], uses: ["machine", "material"], params: [], plan: () => square };
  assert.equal("emit" in route, false);
  const tp = route.plan!({} as never, {} as never);
  assert.equal(writeGcode(tp, beam).files.length, 1);
  assert.equal(writeGcode(tp, printer).files.length, 1, "the same toolpath, another machine");
});
