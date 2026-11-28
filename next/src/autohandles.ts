// What a pick shows by itself, as the old app's `autoOp` did (`dec_body_look_and_feel`): a face picked shows the arrow that pushes or pulls it, edges picked the arrow that rounds or chamfers them, a whole body picked the mover orb. No menu step.
// An arrow that opens this way is untouched until the person drags it, types a number or chooses a kind; an untouched one is put away by the next click, which goes on to do its own work. Knows nothing of the engine or of three.js: the host does the opening.
import type { BodyPick } from "./selection.ts";
import type { Operation } from "./interaction/operation.ts";

export interface AutoHost {
  /** what is picked on the bodies now (null: nothing) */
  pick(): BodyPick | null;
  /** a tool, a sketch, or an operation of the person's own is on: nothing is shown by itself */
  busy(): boolean;
  /** the operation `body:pull` or `body:round` makes of the pick (null: none) */
  operation(action: "body:pull" | "body:round", pick: BodyPick): Promise<Operation | null>;
  /** open it as one that came by itself */
  show(op: Operation): void;
  /** an arrow that came by itself and was not touched is put away */
  drop(): void;
  /** an arrow that came by itself has been touched (dragged, a number typed, a kind chosen): it is a draft now; made if it is valid, given up */
  draft: { on(): boolean; apply(): void; cancel(): void };
  mover: {
    /** how many bodies the model has (the mover is for one, for now) */ bodies(): number;
    start(body: string): boolean;
    on(): boolean;
    /** the orb has been taken somewhere */ moved(): boolean;
    /** what the orb was taken to is made (nothing: nothing) */ commit(): void;
    cancel(): void;
  };
}
export function createAutoHandles(host: AutoHost) {
  let key = "",
    moving = false; // (the orb was started by a pick of a whole body, so it is ours to put away)
  const keyOf = (p: BodyPick | null): string =>
    p ? `${p.body}|${p.faces.map((f) => f.id)}|${p.edges.map((e) => e.key)}` : "";
  return {
    /** Each picture: when what is picked has changed, the last arrow or orb goes and the new pick's comes. */
    update(): void {
      const pick = host.pick(),
        now = keyOf(pick);
      if (now === key) return;
      key = now;
      host.drop();
      if (moving) {
        host.mover.commit();
        moving = false;
      }
      if (!pick || host.busy()) return;
      if ((pick.faces.length === 1 && !pick.edges.length) || (pick.edges.length && !pick.faces.length)) {
        const action = pick.edges.length ? "body:round" : "body:pull";
        void host.operation(action, pick).then((op) => {
          if (op && keyOf(host.pick()) === now && !host.busy()) host.show(op);
        });
      } else if (!pick.faces.length && !pick.edges.length && host.mover.bodies() <= 1 && !host.mover.on())
        moving = host.mover.start(pick.body);
    },
    /** A right click: a draft that was touched is made (true); with none, the ring may open (false). */
    finish(): boolean {
      if (host.draft.on()) {
        host.draft.apply();
        return true;
      }
      if (!moving || !host.mover.moved()) return false;
      host.mover.commit();
      moving = false;
      key = "";
      return true;
    },
    /** Esc: a draft that was touched is thrown away (true); with none, the pick is put away as before (false). */
    cancel(): boolean {
      if (host.draft.on()) host.draft.cancel();
      else if (moving && host.mover.moved()) host.mover.cancel();
      else return false;
      return true;
    },
  };
}
