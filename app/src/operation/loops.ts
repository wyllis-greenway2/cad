// Closed shapes from drawn lines: a loop of lines is a face (a sketch is not a thing; this is how a closed shape gets its face, `dec_clean_engine_design` section 2).
import type { Ref } from "../shared/ref.ts";
import { ref as mkRef } from "../shared/ref.ts";
import type { Lookup, Face, Part } from "./part.ts";
import type { Scene } from "./scene.ts";

/** Order the lines into one closed loop of corners, or say why not. */
export function loopOf(get: Lookup, lines: readonly Ref[]): { ok: true; corners: Ref[] } | { ok: false; error: string } {
  const segs = lines.map((r) => get(r)).filter((p): p is Extract<NonNullable<ReturnType<Lookup>>, { kind: "line" }> => p?.kind === "line");
  if (!segs.length || segs.length !== lines.length) return { ok: false, error: "select lines to extrude" };
  const used = new Set<number>();
  const corners: Ref[] = [segs[0]!.a];
  let cur = segs[0]!.b;
  used.add(0);
  while (cur !== corners[0]) {
    corners.push(cur);
    const next = segs.findIndex((s, i) => !used.has(i) && (s.a === cur || s.b === cur));
    if (next < 0) return { ok: false, error: "the lines do not make a closed shape" };
    used.add(next);
    cur = segs[next]!.a === cur ? segs[next]!.b : segs[next]!.a;
  }
  return used.size === segs.length ? { ok: true, corners } : { ok: false, error: "the lines make more than one shape" };
}


/** The names a derived face gets (so a tool can select the figure it just drew). */
export const loopFaceRef = (lines: readonly Ref[]): Ref => mkRef(`d/loop@${[...lines].sort()[0]!.slice(2)}`);
export const diskFaceRef = (circle: Ref): Ref => mkRef(`d/disk@${circle.slice(2)}`);

/** The faces of a scene's drawn lines and circles: each closed loop of lines on a plane, and each circle as a disk. Derived: not saved, rebuilt after any change. */
export function derivedFaces(s: Scene): Face[] {
  const get: Lookup = (r) => s.parts[r];
  const lines = Object.values(s.parts).filter((p): p is Extract<Part, { kind: "line" }> => p.kind === "line" && p.origin === "drawn" && !!p.plane);
  const byPlane = new Map<Ref, typeof lines>();
  for (const l of lines) byPlane.set(l.plane!, [...(byPlane.get(l.plane!) ?? []), l]);
  const out: Face[] = [];
  const base = { origin: "drawn" as const, movable: true };
  for (const [plane, ls] of byPlane) {
    // connected groups of lines (by shared corners)
    const left = new Set(ls.map((l) => l.ref));
    while (left.size) {
      const group: typeof lines = [];
      const first = ls.find((l) => left.has(l.ref))!;
      const queue = [first];
      left.delete(first.ref);
      while (queue.length) {
        const cur = queue.pop()!;
        group.push(cur);
        for (const o of ls) if (left.has(o.ref) && (o.a === cur.a || o.a === cur.b || o.b === cur.a || o.b === cur.b)) (left.delete(o.ref), queue.push(o));
      }
      const loop = loopOf(get, group.map((l) => l.ref));
      if (!loop.ok || (group.length < 3 && !group.some((l) => l.bulge))) continue; // (an arc and its chord are a shape of two lines)
      out.push({ ...base, ref: loopFaceRef(group.map((l) => l.ref)), kind: "face", plane, loop: group.map((l) => l.ref), corners: loop.corners });
    }
  }
  for (const p of Object.values(s.parts)) {
    if (p.kind === "circle" && p.origin === "drawn" && p.plane) out.push({ ...base, ref: diskFaceRef(p.ref), kind: "face", plane: p.plane, loop: [], corners: [p.center], disk: p.ref });
  }
  return out;
}
