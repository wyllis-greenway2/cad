// The manufacturing contract and its boundary (`dec_manufacturing_contract`, `inv_manufacturing_boundary`): a part, a toolpath, a finding, a route and a plan are plain data that survive a worker boundary;
// the boundary script finds each kind of stray import in a small tree made for the purpose (and finds none in the real one).
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { CONTRACT_VERSION } from "../src/manufacturing/index.ts";
import type { PartSnapshot, Toolpath, Finding, Route, ManufacturingPlan, MachineDefinition } from "../src/manufacturing/index.ts";

const script = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "tools", "check_manufacturing_boundary.py");
const run = (root?: string) => spawnSync("python3", root ? [script, "--root", root] : [script], { encoding: "utf8" });

/** a small src tree: each key is a path under src, each value the file's text */
function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "mfg-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, dirname(path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}
const withTree = (files: Record<string, string>, fn: (out: string, code: number | null) => void): void => {
  const root = tree(files);
  try { const r = run(root); fn(r.stdout, r.status); } finally { rmSync(root, { recursive: true, force: true }); }
};

const part: PartSnapshot = {
  contract: CONTRACT_VERSION, id: "b/s_137", name: "Bracket", kind: "solid", units: "mm",
  mesh: { vertices: new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0]), normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), triangles: new Uint32Array([0, 1, 2]) },
  outlines: [{ plane: { origin: [0, 0, 0], xDir: [1, 0, 0], normal: [0, 0, 1] }, pieces: [{ kind: "line", p: [0, 0], q: [10, 0] }, { kind: "circle", center: [5, 5], radius: 2 }] }],
  bbox: { min: [0, 0, 0], max: [10, 10, 0] },
};
const toolpath: Toolpath = { units: "mm", operations: [{ id: "o1", label: "Outline", layer: "cut", moves: [{ op: "travel", to: [0, 0, 0] }, { op: "cut", to: [10, 0, 0], feed: 600, power: 1 }] }] };
const finding: Finding = { id: "thin-wall:b/s_137", severity: "caution", message: "Wall under 0.8 mm", refs: [{ kind: "face", n: [0, 0, 1], d: 0, point: [0, 0, 0] }], fix: { label: "Thicken", action: "thicken", values: { mm: 0.8 } } };

test("the contract has a version and its data survives structuredClone (a worker boundary)", () => {
  assert.equal(CONTRACT_VERSION, 1);
  for (const v of [part, toolpath, finding]) assert.deepEqual(structuredClone(v), v);
  assert.ok(structuredClone(part).mesh!.vertices instanceof Float32Array);
});

test("a route can leave stages out, and a plan names a part, a route and a machine by id", () => {
  const route: Route = { contract: CONTRACT_VERSION, id: "print-ready", name: "Print readiness", process: "fdm", family: "toolpath", accepts: ["solid"], uses: ["machine", "material"], params: [{ id: "minWall", label: "Minimum wall", kind: "number", unit: "mm", default: 0.8 }], check: () => [finding] };
  assert.equal(route.plan, undefined);
  assert.equal(route.check!(part, { machine: {} as MachineDefinition, settings: {} }).length, 1);
  const plan: ManufacturingPlan = { contract: CONTRACT_VERSION, id: "p1", part: part.id, route: route.id, machine: "generic-220-marlin", settings: { minWall: 0.8 } };
  assert.deepEqual(structuredClone(plan), plan);
});

test("the real tree keeps the boundary", () => {
  const r = run();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /OK: \d+ manufacturing files/);
});

test("the boundary script finds a module that imports the app, a package or the browser", () => {
  withTree({
    "manufacturing/index.ts": `export * from "./contract/index.ts";`,
    "manufacturing/contract/index.ts": `export const CONTRACT_VERSION = 1;`,
    "manufacturing/routes/laser/plan.ts": `import { kernel } from "../../../compiler/kernel/index.ts";\nimport clipper from "clipper2";\nconst w = window;`,
    "compiler/kernel/index.ts": `export const kernel = 1;`,
  }, (out, code) => {
    assert.equal(code, 1);
    assert.match(out, /imports \.\.\/\.\.\/\.\.\/compiler\/kernel\/index\.ts, outside manufacturing/);
    assert.match(out, /imports the package 'clipper2'/);
    assert.match(out, /browser API \(window\)/);
  });
});

test("the boundary script finds the app reaching into a module, and one route using another", () => {
  withTree({
    "manufacturing/index.ts": `export * from "./contract/index.ts";`,
    "manufacturing/contract/index.ts": `export const CONTRACT_VERSION = 1;`,
    "manufacturing/routes/laser/plan.ts": `export const a = 1;`,
    "manufacturing/routes/waterjet/plan.ts": `import { a } from "../laser/plan.ts";`,
    "interaction/panel.ts": `import { a } from "../manufacturing/routes/laser/plan.ts";\nimport { CONTRACT_VERSION } from "../manufacturing/index.ts";`,
  }, (out, code) => {
    assert.equal(code, 1);
    assert.match(out, /interaction\/panel\.ts: imports \.\.\/manufacturing\/routes\/laser\/plan\.ts: go through manufacturing\/index\.ts/);
    assert.match(out, /route 'waterjet' imports \.\.\/laser\/plan\.ts/);
    assert.equal((out.match(/interaction\/panel\.ts/g) ?? []).length, 1); // the door itself is allowed
  });
});

test("the boundary script finds a contract that is not plain data or reaches outside its folder", () => {
  withTree({
    "manufacturing/index.ts": `export * from "./contract/index.ts";`,
    "manufacturing/contract/index.ts": `import { helper } from "../core/helper.ts";\nexport class Thing {}\nexport type Bag = Map<string, number>;`,
    "manufacturing/core/helper.ts": `export const helper = 1;`,
  }, (out, code) => {
    assert.equal(code, 1);
    assert.match(out, /the contract imports \.\.\/core\/helper\.ts/);
    assert.match(out, /the contract is plain data and types \(class is not\)/);
  });
});

test("the boundary script passes a tidy tree, and a tree with no manufacturing folder", () => {
  withTree({
    "manufacturing/index.ts": `export * from "./contract/index.ts";`,
    "manufacturing/contract/index.ts": `export const CONTRACT_VERSION = 1;`,
    "manufacturing/core/offset.ts": `import type { Point2 } from "../contract/index.ts";\nexport type P = Point2;`,
    "manufacturing/routes/laser/plan.ts": `import type { Point2 } from "../../contract/index.ts";\nimport { offset } from "../../core/offset.ts";\nexport const x = [offset, 1] as unknown as Point2;`,
    "interaction/panel.ts": `import { CONTRACT_VERSION } from "../manufacturing/index.ts";\nexport const v = CONTRACT_VERSION;`,
  }, (out, code) => { assert.equal(code, 0, out); });
  withTree({ "interaction/a.ts": `export const a = 1;` }, (out, code) => { assert.equal(code, 0); assert.match(out, /no manufacturing modules yet/); });
});
