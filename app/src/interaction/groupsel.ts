// How groups change selecting (`in_257`, `dec_selection_tools` section 3): a click on a member selects its outermost group; a click on a member whose group is already selected goes one level in (the next
// group inside it, then the single part); Shift + click adds or takes out the whole outermost group; a drag rectangle takes whole groups.
import type { Ref } from "../shared/ref.ts";
import type { Scene } from "../operation/scene.ts";
import { chainOf, membersOf, groupsOf } from "../operation/groups.ts";

const sameSet = (a: readonly Ref[], b: readonly Ref[]) => a.length === b.length && a.every((x) => b.includes(x));

/** The parts that stand for the outermost group of each of these, the part itself first; parts that are in no group stand for themselves. */
export function withGroups(s: Scene, refs: readonly Ref[]): Ref[] {
  if (!groupsOf(s).length) return [...refs];
  const out: Ref[] = [];
  const add = (r: Ref) => { if (!out.includes(r)) out.push(r); };
  for (const r of refs) {
    add(r);
    const top = chainOf(s, r)[0];
    if (top) for (const m of membersOf(s, top.id)) add(m);
  }
  return out;
}
/** The levels a click on `r` can select, outermost first: the parts of each group it is in, then the part alone. */
const levels = (s: Scene, r: Ref): Ref[][] => [...chainOf(s, r).map((g) => membersOf(s, g.id)), [r]];

/** A plain click on `first` while the selection is `now`: one level further in if the selection is a level of its groups already, else null (the usual click, which then takes the whole outermost group). */
export function goIn(s: Scene, now: readonly Ref[], first: Ref): Ref[] | null {
  if (!groupsOf(s).length) return null;
  const lv = levels(s, first);
  if (lv.length < 2) return null;
  const at = lv.findIndex((l) => sameSet(l, now));
  return at >= 0 && at < lv.length - 1 ? withFirst(lv[at + 1]!, first) : null;
}
const withFirst = (l: readonly Ref[], first: Ref): Ref[] => (l.includes(first) ? [first, ...l.filter((x) => x !== first)] : [...l]);

/** The selection after a click, once its groups are taken into account: what the click added brings its whole outermost group, what it took out takes its group out with it. */
export function afterClick(s: Scene, before: readonly Ref[], after: readonly Ref[]): Ref[] {
  if (!groupsOf(s).length) return [...after];
  const added = after.filter((r) => !before.includes(r));
  const removed = before.filter((r) => !after.includes(r));
  let out = [...after];
  for (const r of removed) { const top = chainOf(s, r)[0]; if (top) { const m = new Set(membersOf(s, top.id)); out = out.filter((x) => !m.has(x)); } }
  for (const r of added) { const top = chainOf(s, r)[0]; if (top) for (const m of withFirst(membersOf(s, top.id), r)) if (!out.includes(m)) out.push(m); }
  return out;
}
