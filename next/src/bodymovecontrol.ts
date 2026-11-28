// A body moved and turned by the mover orb (`dec_task_handles`): the draft is the orb's frame, from the body's middle to where it has been taken. The orb (`orbcontrol.ts`) is given this as its subject; the body is shown moved (the world takes `preview()`); the steps are made
// when the task commits. Knows nothing of the orb's maths or of the engine's: `interaction/bodymove.ts` has them.
import type { Step } from "./engine/steps.ts";
import { baseFrame, matrixOf, moveSteps } from "./interaction/bodymove.ts";
import type { Frame } from "./planes.ts";
import type { BodyMesh } from "./studio.ts";
import type { V3 } from "./vec.ts";

export interface BodyMoveHost {
  meshes(): readonly BodyMesh[];
  /** how many bodies the whole model makes (one: a move needs no name; more: it is not built yet) */
  bodies(): number;
  recipe(): readonly Step[];
  change(steps: Step[]): void;
  say(text: string): void;
  /** the orb's memory of a draft that is over */
  forget(id: string): void;
}
export function createBodyMove(host: BodyMoveHost) {
  let cur: { id: string; body: string; base: Frame; now: Frame } | null = null,
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
    /** the body is shown moved */
    preview: (): { body: string; matrix: number[] } | null =>
      cur ? { body: cur.body, matrix: matrixOf(cur.base, cur.now) } : null,
    /** begin on a body (the step that made it): the orb stands in the middle of its box */
    start(body: string): boolean {
      const m = host.meshes().find((x) => x.id === body);
      if (!m || !m.positions.length) {
        host.say("That body is not there");
        return false;
      }
      if (host.bodies() > 1) {
        host.say("Moving one of several bodies is not built yet");
        return false;
      }
      const lo: V3 = [Infinity, Infinity, Infinity],
        hi: V3 = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < m.positions.length; i += 3)
        for (let k = 0; k < 3; k++) {
          lo[k] = Math.min(lo[k]!, m.positions[i + k]!);
          hi[k] = Math.max(hi[k]!, m.positions[i + k]!);
        }
      const base = baseFrame([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2]);
      cur = { id: `move:${++n}`, body, base, now: base };
      return true;
    },
    /** the steps are made (nothing moved: nothing made) */
    commit(): void {
      const c = cur;
      cur = null;
      if (!c) return;
      host.forget(c.id);
      const steps = moveSteps(host.recipe(), c.body, c.base, c.now);
      if (steps.length) host.change([...host.recipe(), ...steps]);
    },
    cancel(): void {
      if (cur) host.forget(cur.id);
      cur = null;
    },
    debug: () => (cur ? { body: cur.body, now: cur.now } : null),
  };
}
