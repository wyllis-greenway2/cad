// A body moved and turned by the mover orb (`dec_task_handles`): the draft is the orb's frame, from the body's middle to where it has been taken. The orb (`orbcontrol.ts`) is given this as its subject; the body is shown moved (the world takes `preview()`); the steps are made
// when the task commits. Knows nothing of the orb's maths or of the engine's: `interaction/bodymove.ts` has them.
import type { Step } from "./engine/steps.ts";
import { baseFrame, matrixOf, moveSteps } from "./interaction/bodymove.ts";
import type { Frame } from "./planes.ts";
import type { BodyMesh } from "./studio.ts";
import type { V3 } from "./vec.ts";

export interface BodyMoveHost {
  meshes(): readonly BodyMesh[];
  recipe(): readonly Step[];
  /** the last change is still being made */
  busy(): boolean;
  change(steps: Step[]): void;
  say(text: string): void;
  /** the orb's memory of a draft that is over */
  forget(id: string): void;
}
export function createBodyMove(host: BodyMoveHost) {
  let cur: { id: string; body: string; owners: string[]; all: boolean; base: Frame; now: Frame } | null = null,
    n = 0;
  return {
    on: (): boolean => cur !== null,
    /** the orb has been taken somewhere (a drag has set a frame) */
    moved: (): boolean => cur !== null && cur.now !== cur.base,
    /** the orb's subject: a name of its own for each draft (its pose is new each time), and the frame it has been taken to */
    target: (): { id: string; frame: Frame } | null => (cur ? { id: cur.id, frame: cur.now } : null),
    set(f: Frame): void {
      if (cur) cur = { ...cur, now: f };
    },
    /** the bodies are shown moved */
    preview: (): { body: string; owners: string[]; all: boolean; matrix: number[] } | null =>
      cur ? { body: cur.body, owners: cur.owners, all: cur.all, matrix: matrixOf(cur.base, cur.now) } : null,
    /** begin on bodies of a mesh (the step that made it; `owners`: which of its bodies, by name; none: all): the orb stands in the middle of their box */
    start(body: string, owners: readonly string[] = []): boolean {
      if (host.busy()) {
        host.say("Still making the last change: a moment"); // (a move begun on a picture that is not yet of the steps before it would take the wrong body)
        return false;
      }
      const m = host.meshes().find((x) => x.id === body);
      if (!m || !m.positions.length) {
        host.say("That body is not there");
        return false;
      }
      const all = m.bodies.map((b) => b.key),
        which = owners.length ? [...owners] : all,
        lo: V3 = [Infinity, Infinity, Infinity],
        hi: V3 = [-Infinity, -Infinity, -Infinity];
      for (const f of m.faces) {
        if (all.length > 1 && !which.includes(f.body ?? "")) continue;
        for (let k = f.start; k < f.start + f.count; k++)
          for (let c = 0; c < 3; c++) {
            const v = m.positions[3 * m.indices[k]! + c]!;
            lo[c] = Math.min(lo[c]!, v);
            hi[c] = Math.max(hi[c]!, v);
          }
      }
      if (!isFinite(lo[0])) {
        host.say("That body is not there");
        return false;
      }
      const base = baseFrame([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2]);
      cur = { id: `move:${++n}`, body, owners: which, all: which.length >= all.length, base, now: base };
      return true;
    },
    /** the steps are made (nothing moved: nothing made) */
    commit(): void {
      const c = cur;
      cur = null;
      if (!c) return;
      host.forget(c.id);
      const m = host.meshes().find((x) => x.id === c.body),
        all = m?.bodies ?? [],
        // one body in the answer: no name; all of several: "all"; some: each by name
        which =
          all.length < 2
            ? []
            : all.every((b) => c.owners.includes(b.key))
              ? (["all"] as const)
              : all.filter((b) => c.owners.includes(b.key)).map((b) => b.id),
        steps = moveSteps(host.recipe(), c.body, c.base, c.now, which);
      if (steps.length) host.change([...host.recipe(), ...steps]);
    },
    cancel(): void {
      if (cur) host.forget(cur.id);
      cur = null;
    },
    debug: () => (cur ? { body: cur.body, now: cur.now } : null),
  };
}
