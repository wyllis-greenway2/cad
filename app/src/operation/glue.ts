// Glue (`dec_glue`, `in_1146`): bodies that are fixed to one another, so that they move as one for motion. A gear glued to its shaft turns with it; a pulley on a rod; the parts of a cage. It is not a mate (it says nothing of faces and keeps no
// gap): it is a group of bodies, named by their ids (as a pivot's body is), and a motion that moves one of them moves them all the same way. Pure: scenes in, scenes out.
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import type { Scene } from "./scene.ts";

/** `id` is the group's name; `bodies` the ids of the bodies glued together (two or more) */
export interface GlueGroup { id: string; bodies: string[] }
const groupsOf = (s: Scene): readonly GlueGroup[] => s.glue ?? [];
// (a body is also known by the step that makes it, `x_` + the step: a project is replayed before the kernel has made its bodies)
const hasBody = (s: Scene, id: string): boolean => Object.values(s.parts).some((p) => p.kind === "body" && p.id === id) || s.steps.some((st) => id === `x_${st.id}`);

/** Glue these bodies together; a body that is in a group already brings its group in (so groups only grow together) */
export function addGlue(s: Scene, bodies: readonly string[]): Result<Scene> {
  const ids = [...new Set(bodies)];
  if (ids.length < 2) return err("glue needs two bodies or more");
  for (const id of ids) if (!hasBody(s, id)) return err(`body ${id} does not exist`);
  const touched = groupsOf(s).filter((g) => g.bodies.some((b) => ids.includes(b)));
  const all = [...new Set([...touched.flatMap((g) => g.bodies), ...ids])];
  const id = touched[0]?.id ?? `glue_${all[0]}`;
  const rest = groupsOf(s).filter((g) => !touched.includes(g));
  return ok({ ...s, glue: [...rest, { id, bodies: all }] });
}
/** Take a body out of its group (the group goes if one is left) */
export function removeGlue(s: Scene, body: string): Result<Scene> {
  const g = groupsOf(s).find((x) => x.bodies.includes(body));
  if (!g) return err(`body ${body} is not glued`);
  const left = g.bodies.filter((b) => b !== body);
  const groups = [...groupsOf(s).filter((x) => x !== g), ...(left.length >= 2 ? [{ ...g, bodies: left }] : [])];
  const { glue: _g, ...rest } = s;
  return ok(groups.length ? { ...rest, glue: groups } : rest);
}
/** The group a body is in, if it is glued */
export const glueOf = (s: Scene, body: string): GlueGroup | undefined => groupsOf(s).find((g) => g.bodies.includes(body));
export { groupsOf as glueGroups };
