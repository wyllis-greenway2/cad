// A dev check (not a test, `in_1444`) of the pull arrow as data (`interaction/operations.ts`, `dec_task_handles`): the one arrow sets a signed distance; for an edge the sign is the kind. node --experimental-strip-types dev/operations-check.ts
import { roundOp } from "../src/interaction/operations.ts";
import { check, failureCount } from "./lib.ts";

const id = { base: "f", pieces: [] } as never, a = { body: "e1", edges: [{ a: id, b: id }], kind: "fillet" as const, at: [0, 0, 0] as [number, number, number], normal: [0, 1, 0] as [number, number, number] };
const r = roundOp(a, 2);
check("an edge's operation has the one pull arrow, out of the body", r.arrow?.normal[1] === 1 && r.pulled === 2);
const c = r.withPull(-3)!;
check("pulled in it is a chamfer of the size dragged, shown as a size above nothing", c.pulled === -3 && c.value === 3 && c.options.find((o) => o.on)?.id === "chamfer");
check("pulled out again it is a round", c.withPull(1.5)!.options.find((o) => o.on)?.id === "fillet" && c.withPull(1.5)!.value === 1.5);
check("a pull to nothing is not allowed (it stays)", r.withPull(0.001) === null);
check("the kind chosen from the info bar flips the sign of the arrow and keeps the size", r.withOption("chamfer").pulled === -2 && r.withOption("chamfer").value === 2);
check("a typed size keeps the kind", c.withValue(4)!.pulled === -4);
check("the steps made carry the kind and the size", (() => { const p = c.plan([]); return p.kind === "steps" && (p.steps[0]!.params as { mode: string; size: number }).mode === "chamfer" && (p.steps[0]!.params as { size: number }).size === 3; })());
process.exit(failureCount() ? 1 : 0);
