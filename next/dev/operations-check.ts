// A dev check (not a test, `in_1444`) of the pull arrow as data (`interaction/operations.ts`, `dec_task_handles`): the one arrow sets a signed distance; for an edge the sign is the kind. node --experimental-strip-types dev/operations-check.ts
import { roundOp } from "../src/interaction/operations.ts";
import { pullDelta } from "../src/orb.ts";
import { home } from "../src/camera.ts";
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
{ // the pull of an arrow: as long as it looks, a pixel is a pixel; looking along it, a movement is not a huge pull
  const c = home(), W = 800, H = 600, base: [number, number, number] = [0, 0, 0];
  const side = pullDelta(c, W, H, base, [1, 0, 0], 50, 0), fwd = [Math.cos(c.pitch) * Math.cos(c.yaw), Math.cos(c.pitch) * Math.sin(c.yaw), Math.sin(c.pitch)] as [number, number, number];
  const along = pullDelta(c, W, H, base, fwd, 0, -50), none = pullDelta(c, W, H, base, [1, 0, 0], 0, 0);
  check("no movement pulls nothing", none === 0);
  check("an arrow across the view: a movement along it pulls its length in mm, the same either way round", Math.abs(side) > 0 && Math.abs(pullDelta(c, W, H, base, [-1, 0, 0], 50, 0) + side) < 0.05 * Math.abs(side), String(side));
  check("an arrow looking straight at the camera: 50 pixels is less than three times what an arrow across the view takes (not a huge pull)", Math.abs(along) < 3 * Math.abs(side) && Number.isFinite(along), `${along}`);
}
process.exit(failureCount() ? 1 : 0);
