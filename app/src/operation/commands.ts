// Every change to the scene is a command: plain data that can be saved, replayed and undone (`dec_clean_engine_design` section 6).
// `apply` is pure: it returns a new scene or says why the command cannot apply. Deleting a part removes the relations that used it in the same command,
// so undo restores both.
import type { Ref } from "../shared/ref.ts";
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Part } from "./part.ts";
import { anchorsOf } from "./part.ts";
import type { Scene, Relation, Step } from "./scene.ts";
import { bumpCounter } from "./scene.ts";

export type Command =
  | { type: "addPart"; part: Part }
  | { type: "movePart"; ref: Ref; to: Vec3 }
  | { type: "setRadius"; ref: Ref; radius: number }
  | { type: "deletePart"; ref: Ref }
  | { type: "deleteParts"; refs: Ref[] }
  | { type: "addRelation"; relation: Relation }
  | { type: "removeRelation"; id: string }
  | { type: "setRelationValue"; id: string; value: number; locked?: boolean }
  | { type: "addStep"; step: Step }
  | { type: "removeStep"; id: string }
  | { type: "batch"; commands: Command[] };

const idOf = (full: string): string => full.slice(full.indexOf("/") + 1).split(/[./]/)[0] ?? full;

/** The parts that go when `ref` goes: itself and every part built on it (a corner takes the lines and circles that use it). */
export function dependentParts(s: Scene, ref: Ref): Ref[] {
  const out = new Set<Ref>([ref]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of Object.values(s.parts)) {
      if (out.has(p.ref) || p.origin !== "drawn") continue;
      if (anchorsOf(p).some((a) => out.has(a) && a !== p.ref) || (p.kind === "face" && p.loop.some((l) => out.has(l)))) {
        out.add(p.ref);
        grew = true;
      }
    }
  }
  return [...out];
}

export function apply(s: Scene, c: Command): Result<Scene> {
  switch (c.type) {
    case "addPart": {
      if (c.part.ref in s.parts) return err(`${c.part.ref} already exists`);
      for (const a of anchorsOf(c.part)) if (a !== c.part.ref && !(a in s.parts)) return err(`${c.part.ref} uses ${a}, which does not exist`);
      if (c.part.plane && !(c.part.plane in s.parts)) return err(`plane ${c.part.plane} does not exist`);
      return ok(bumpCounter({ ...s, parts: { ...s.parts, [c.part.ref]: c.part } }, idOf(c.part.ref)));
    }
    case "movePart": {
      const p = s.parts[c.ref];
      if (!p) return err(`${c.ref} does not exist`);
      if (!p.movable) return err(`${c.ref} is a reference and cannot move`);
      if (p.kind !== "corner") return err("only corners move directly; move their corners");
      return ok({ ...s, parts: { ...s.parts, [c.ref]: { ...p, at: c.to } } });
    }
    case "setRadius": {
      const p = s.parts[c.ref];
      if (!p || p.kind !== "circle") return err(`${c.ref} is not a circle`);
      if (!p.movable) return err(`${c.ref} is a reference and cannot change`);
      if (!(c.radius > 0)) return err("the radius must be positive");
      return ok({ ...s, parts: { ...s.parts, [c.ref]: { ...p, radius: c.radius } } });
    }
    case "deletePart": {
      const p = s.parts[c.ref];
      if (!p) return err(`${c.ref} does not exist`);
      if (!p.movable) return err(`${c.ref} is a reference and cannot be deleted`);
      const gone = new Set(dependentParts(s, c.ref));
      const parts = Object.fromEntries(Object.entries(s.parts).filter(([k]) => !gone.has(k as Ref)));
      const relations = s.relations.filter((r) => !r.parts.some((x) => gone.has(x)));
      return ok({ ...s, parts, relations });
    }
    case "deleteParts": {
      // several at once: everything built on any of them goes too (a part that an earlier one already took is not an error)
      const gone = new Set<Ref>();
      for (const r of c.refs) {
        const p = s.parts[r];
        if (!p) continue;
        if (!p.movable) return err(`${r} is a reference and cannot be deleted`);
        for (const d of dependentParts(s, r)) gone.add(d);
      }
      if (!gone.size) return err("nothing to delete");
      const parts = Object.fromEntries(Object.entries(s.parts).filter(([k]) => !gone.has(k as Ref)));
      return ok({ ...s, parts, relations: s.relations.filter((r) => !r.parts.some((x) => gone.has(x))) });
    }
    case "addRelation": {
      if (s.relations.some((r) => r.id === c.relation.id)) return err(`relation ${c.relation.id} already exists`);
      for (const r of c.relation.parts) if (!(r in s.parts)) return err(`relation uses ${r}, which does not exist`);
      return ok(bumpCounter({ ...s, relations: [...s.relations, c.relation] }, c.relation.id));
    }
    case "removeRelation": {
      if (!s.relations.some((r) => r.id === c.id)) return err(`relation ${c.id} does not exist`);
      return ok({ ...s, relations: s.relations.filter((r) => r.id !== c.id) });
    }
    case "setRelationValue": {
      if (!s.relations.some((r) => r.id === c.id)) return err(`relation ${c.id} does not exist`);
      return ok({ ...s, relations: s.relations.map((r) => (r.id === c.id ? { ...r, value: c.value, locked: c.locked ?? r.locked } : r)) });
    }
    case "addStep":
      if (s.steps.some((x) => x.id === c.step.id)) return err(`step ${c.step.id} already exists`);
      return ok(bumpCounter({ ...s, steps: [...s.steps, c.step] }, c.step.id));
    case "removeStep":
      if (!s.steps.some((x) => x.id === c.id)) return err(`step ${c.id} does not exist`);
      return ok({ ...s, steps: s.steps.filter((x) => x.id !== c.id) });
    case "batch": {
      let cur = s;
      for (const sub of c.commands) {
        const r = apply(cur, sub);
        if (!r.ok) return r; // all or nothing: the scene is returned unchanged by the caller
        cur = r.value;
      }
      return ok(cur);
    }
  }
}

