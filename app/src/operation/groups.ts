// Selection groups (`in_257`, `dec_selection_tools` section 3): a set of selected things the model remembers, so that selecting any member selects all of them. A group's items are parts or other groups, so
// groups are layered; ungrouping breaks only the group asked for and what is inside it stays grouped. Pure: scenes in, scenes out. A group has no effect on how anything is drawn or solved.
import type { Ref } from "../shared/ref.ts";
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import type { Scene } from "./scene.ts";

/** `items` are refs of parts or ids of other groups ("g_003"). A part belongs to at most one group, a group to at most one other. */
export interface Group { id: string; items: string[] }

export const groupsOf = (s: Scene): readonly Group[] => s.groups ?? [];
const isGroupId = (s: Scene, x: string): boolean => groupsOf(s).some((g) => g.id === x);
const byId = (s: Scene, id: string): Group | undefined => groupsOf(s).find((g) => g.id === id);

/** The group that has this item (a part or a group) directly, if any. */
export const parentOf = (s: Scene, item: string): Group | undefined => groupsOf(s).find((g) => g.items.includes(item));
/** The groups the part is in, the outermost first. */
export function chainOf(s: Scene, item: string): Group[] {
  const out: Group[] = [];
  for (let g = parentOf(s, item); g; g = parentOf(s, g.id)) out.unshift(g);
  return out;
}
/** The parts in a group, at any depth, in the order they were grouped; parts that are not in the scene (a body edge that is gone) are left out. */
export function membersOf(s: Scene, id: string): Ref[] {
  const g = byId(s, id);
  if (!g) return [];
  return g.items.flatMap((x) => (isGroupId(s, x) ? membersOf(s, x) : x in s.parts ? [x as Ref] : []));
}

/** What to group a selection as: each selected part stands for the outermost group it is in (so a group is grouped as a whole), each once. Fewer than two things: nothing to group. */
export function topItems(s: Scene, selection: readonly Ref[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of selection) {
    const top = chainOf(s, r)[0]?.id ?? r;
    if (!seen.has(top)) { seen.add(top); out.push(top); }
  }
  return out;
}
/** The groups a selection could be broken into: the outermost groups that are wholly selected. */
export function breakable(s: Scene, selection: readonly Ref[]): Group[] {
  const sel = new Set(selection);
  const tops = new Set(selection.map((r) => chainOf(s, r)[0]?.id).filter((x): x is string => !!x));
  return [...tops].map((id) => byId(s, id)!).filter((g) => membersOf(s, g.id).every((m) => sel.has(m)));
}

export function addGroup(s: Scene, id: string, items: readonly string[]): Result<Scene> {
  if (isGroupId(s, id)) return err(`group ${id} already exists`);
  if (new Set(items).size !== items.length || items.length < 2) return err("a group needs at least two different things");
  for (const x of items) {
    if (!(isGroupId(s, x) || x in s.parts)) return err(`${x} does not exist`);
    if (parentOf(s, x)) return err(`${x} is already in a group`);
  }
  return ok({ ...s, groups: [...groupsOf(s), { id, items: [...items] }] });
}
/** Break one group: its items stay (a group inside it stays a group), and it is replaced in the group it was in by what was in it. */
export function removeGroup(s: Scene, id: string): Result<Scene> {
  const g = byId(s, id);
  if (!g) return err(`group ${id} does not exist`);
  return ok({ ...s, groups: groupsOf(s).filter((x) => x.id !== id).map((x) => (x.items.includes(id) ? { ...x, items: x.items.flatMap((i) => (i === id ? g.items : [i])) } : x)) });
}
/** After parts are deleted: they leave their groups, and a group left with fewer than two things is dissolved into the group it was in. */
export function withoutParts(s: Scene, gone: ReadonlySet<string>): Scene {
  if (!groupsOf(s).length) return s;
  let gs = groupsOf(s).map((g) => ({ ...g, items: g.items.filter((x) => !gone.has(x)) }));
  for (let again = true; again;) {
    again = false;
    const small = gs.find((g) => g.items.length < 2);
    if (!small) break;
    gs = gs.filter((g) => g !== small).map((g) => (g.items.includes(small.id) ? { ...g, items: g.items.flatMap((i) => (i === small.id ? small.items : [i])) } : g));
    again = true;
  }
  return { ...s, groups: gs };
}
