// Who uses whom (`dec_constraint_ownership`): derived from the scene, never stored. Answers without a screen:
// what relations touch this part (so they can be shown when it is clicked), what a deletion would take with it, and which relations or steps point at something gone.
import type { Ref } from "../shared/ref.ts";
import type { Scene } from "./scene.ts";
import { hasPart, figureRefs } from "./scene.ts";
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

/**
 * The drawn parts an extrude has used up: its lines or circle, their corners, and the closed figure's face. They stay in the scene (undo and deleting the step bring them
 * back, and relations on them still hold) but are not drawn or picked while the step uses them, as in the prototype.
 */
/** The scene without what an extrude has used up (and what a deleted body took with it): the drawing as it is to work on. Snapping, alignment and suggested constraints look here, so nothing hidden is suggested or snapped to. */
export function live(s: Scene): Scene {
  const used = consumed(s);
  return used.size ? { ...s, parts: Object.fromEntries(Object.entries(s.parts).filter(([r]) => !used.has(r as Ref))) } : s;
}

/** The hidden parts of the sketch plane being sketched in (`in_211`): what the caller must not count as used up. */
function revealedOn(s: Scene): (r: Ref) => boolean {
  const plane = s.reveal;
  return (r) => !!plane && (s.parts[r] as { plane?: Ref | null } | undefined)?.plane === plane;
}


export function consumed(s: Scene): Set<Ref> {
  const all = consumedAll(s);
  if (!s.reveal) return all;
  const hide = revealedOn(s);
  for (const r of [...all]) if (hide(r)) all.delete(r);
  return all;
}

function consumedAll(s: Scene): Set<Ref> {
  const out = new Set<Ref>();
  for (const st of s.steps) {
    if (st.type !== "extrude") continue;
    for (const r of figureRefs(st)) {
      out.add(r);
      const p = s.parts[r];
      if (p) for (const a of anchorsOf(p)) out.add(a);
    }
  }
  if (!out.size) return out;
  // a figure is used up when its own sides are; a piece of a circle that shares a side with a piece that was extruded is not (the shared side is shown again for it)
  const faces = Object.values(s.parts).filter((p): p is Extract<typeof p, { kind: "face" }> => p.kind === "face");
  const used = (f: (typeof faces)[number]) => (!!f.disk && out.has(f.disk)) || (f.loop.length > 0 && !f.pieces && f.loop.some((l) => out.has(l))) || (!!f.pieces && f.loop.every((l) => out.has(l)));
  const usedFaces = faces.filter(used);
  for (const f of faces) if (f.pieces && !usedFaces.includes(f)) for (const l of f.loop) { out.delete(l); const p = s.parts[l]; if (p) for (const a of anchorsOf(p)) out.delete(a); }
  for (const f of usedFaces) out.add(f.ref);
  // the curve a used piece was cut from (an arc, a line, a circle that other curves cross or end on) is the body's too, unless a piece of it still belongs to a region that was not extruded: it goes with the body, it is not left behind (`in_201`)
  const sourceOf = (r: Ref): Ref | null => { const m = /^d\/(?:arc|seg)@([^@]+)@/.exec(r); return m ? (`d/${m[1]}` as Ref) : null; };
  const stillNeeded = new Set<Ref>();
  for (const f of faces) if (f.pieces && !usedFaces.includes(f)) for (const l of f.loop) { const src = sourceOf(l); if (src) stillNeeded.add(src); stillNeeded.add(l); }
  for (const r of [...out]) {
    const src = sourceOf(r);
    const part = src ? s.parts[src] : undefined;
    if (!src || !part || stillNeeded.has(src) || out.has(src)) continue;
    out.add(src);
    for (const a of anchorsOf(part)) if (!Object.values(s.parts).some((q) => q.kind === "face" && q.pieces && !usedFaces.includes(q) && q.corners.includes(a))) out.add(a);
  }
  return out;
}
