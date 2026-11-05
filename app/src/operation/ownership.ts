// Who uses whom (`dec_constraint_ownership`): derived from the scene, never stored. Answers without a screen:
// what relations touch this part (so they can be shown when it is clicked), what a deletion would take with it, and which relations or steps point at something gone.
import type { Ref } from "../shared/ref.ts";
import type { Scene } from "./scene.ts";
import { hasPart } from "./scene.ts";
import { anchorsOf } from "./part.ts";
import { dependentParts } from "./commands.ts";

export interface Use { ref: Ref; exists: boolean }
export interface OwnedItem { id: string; type: "relation" | "step"; kind: string; uses: Use[]; broken: boolean }
export interface OwnershipMap {
  items: Map<string, OwnedItem>;
  /** item ids that name this part directly */
  byPart: Map<Ref, string[]>;
}

export function buildMap(s: Scene): OwnershipMap {
  const items = new Map<string, OwnedItem>();
  const byPart = new Map<Ref, string[]>();
  const add = (id: string, type: OwnedItem["type"], kind: string, parts: Ref[]) => {
    const uses = parts.map((ref) => ({ ref, exists: hasPart(s, ref) }));
    items.set(id, { id, type, kind, uses, broken: uses.some((u) => !u.exists) });
    for (const u of uses) byPart.set(u.ref, [...(byPart.get(u.ref) ?? []), id]);
  };
  for (const r of s.relations) add(r.id, "relation", r.kind, r.parts);
  for (const st of s.steps) add(st.id, "step", st.type, st.parts);
  return { items, byPart };
}

/** Items that touch a part: those naming it directly, and those naming the corners a line or circle is made of. */
export function touching(s: Scene, map: OwnershipMap, ref: Ref): { id: string; type: "relation" | "step"; kind: string; others: Ref[] }[] {
  const part = s.parts[ref];
  const mine = new Set<Ref>([ref, ...(part ? anchorsOf(part) : [])]);
  const ids = new Set<string>();
  for (const m of mine) for (const id of map.byPart.get(m) ?? []) ids.add(id);
  return [...ids].map((id) => {
    const it = map.items.get(id)!;
    return { id, type: it.type, kind: it.kind, others: it.uses.map((u) => u.ref).filter((r) => !mine.has(r)) };
  });
}

/** What deleting a part would take with it: the parts built on it and the relations that use any of them. */
export function deletionEffect(s: Scene, ref: Ref): { parts: Ref[]; relations: string[]; steps: string[] } {
  const parts = dependentParts(s, ref);
  const gone = new Set(parts);
  return {
    parts,
    relations: s.relations.filter((r) => r.parts.some((p) => gone.has(p))).map((r) => r.id),
    steps: s.steps.filter((st) => st.parts.some((p) => gone.has(p))).map((st) => st.id),
  };
}

/** Relations and steps that refer to something that is gone. */
export const broken = (map: OwnershipMap): OwnedItem[] => [...map.items.values()].filter((i) => i.broken);
