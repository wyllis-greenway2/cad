// A body that just turns (`dec_mechanism_motion`, `in_941`): a joint between a body and the world, an axis and nothing else, with no partner body and no mate. It is what makes any body playable: the body turns about the axis through `point` with
// direction `dir`; the pose is not kept in the model (as with every motion), the pivot is. The axis is set from a round face of the body (its axis) or from the orb mover's pivot and axes. One pivot to a body, named by the body's id. Pure: scenes in, scenes out.
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import type { Vec3 } from "../math/vec.ts";
import { normalize } from "../math/vec.ts";
import type { Scene } from "./scene.ts";

/** `body`: the body's id (`Part` body `id`, kept through the history); the body turns about the line through `point` along `dir`. */
export interface Pivot { body: string; point: Vec3; dir: Vec3; /** where it goes back to (degrees from where it is drawn) when a body that pushes lets it, as a spring would; none: it stays where it was pushed (`dec_contact_push`, `in_1020`) */ rest?: number }
const pivotsOf = (s: Scene): readonly Pivot[] => s.pivots ?? [];
const hasBody = (s: Scene, id: string): boolean => Object.values(s.parts).some((p) => p.kind === "body" && p.id === id);

/** A pivot for a body, replacing the one it had. */
export function setPivot(s: Scene, body: string, point: Vec3, dir: Vec3, rest?: number | null): Result<Scene> {
  if (!hasBody(s, body)) return err(`body ${body} does not exist`);
  const l = Math.hypot(dir[0], dir[1], dir[2]);
  if (!(l > 1e-9) || !point.every(Number.isFinite)) return err("the pivot needs a point and a direction");
  if (rest !== undefined && rest !== null && !Number.isFinite(rest)) return err("the rest needs a number");
  const had = pivotsOf(s).find((q) => q.body === body);
  const keep = rest === undefined ? had?.rest : rest ?? undefined; // (not given: what it had; null: none)
  const p: Pivot = { body, point: [...point] as unknown as Vec3, dir: normalize(dir), ...(keep !== undefined ? { rest: keep } : {}) };
  return ok({ ...s, pivots: [...pivotsOf(s).filter((q) => q.body !== body), p] });
}
export function deletePivot(s: Scene, body: string): Result<Scene> {
  if (!pivotsOf(s).some((q) => q.body === body)) return err(`body ${body} has no pivot`);
  const left = pivotsOf(s).filter((q) => q.body !== body);
  const { pivots: _p, ...rest } = s;
  return ok(left.length ? { ...rest, pivots: left } : rest);
}
/** The pivot of a body (by its place in the scene), if it has one. */
export function pivotOfBody(s: Scene, ref: string): Pivot | undefined {
  const b = s.parts[ref as never];
  return b?.kind === "body" && b.id ? pivotsOf(s).find((q) => q.body === b.id) : undefined;
}
export { pivotsOf };
