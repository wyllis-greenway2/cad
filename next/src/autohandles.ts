// What a pick shows by itself, as the old app's `autoOp` did (`dec_body_look_and_feel`): a face picked shows the arrow that pushes or pulls it, edges picked the arrow that rounds or chamfers them, a whole body picked the mover orb. No menu step.
// An arrow that opens this way is untouched until the person drags it, types a number or chooses a kind; an untouched one is put away by the next click, which goes on to do its own work. Knows nothing of the engine or of three.js: the host does the opening.
import type { BodyPick, Picked, RegionPick } from "./selection.ts";
import type { Operation } from "./interaction/operation.ts";

export interface AutoHost {
  /** what is picked on the bodies or in a drawing now (null: nothing, or parts of a sketch) */
  pick(): Extract<Picked, { kind: "body" | "region" }> | null;
  /** a tool, a sketch, or an operation of the person's own is on: nothing is shown by itself */
  busy(): boolean;
  /** the operation `body:pull`, `body:round` or `region:extrude` makes of the pick (null: none) */
  operation(
    action: "body:pull" | "body:round" | "region:extrude",
    pick: BodyPick | RegionPick,
  ): Promise<Operation | null>;
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
  let last: unknown = null, // (the pick last looked at: each click makes a new one, so a click on the same face again is a pick again)
    moving = false; // (the orb was started by a pick of a whole body, so it is ours to put away)
  return {
    /** Each picture: when there is a new pick, the last arrow or orb goes and the new pick's comes. */
    update(): void {
      const pick = host.pick();
      if (pick === last) return;
      last = pick;
      host.drop();
      if (moving) {
        host.mover.commit();
        moving = false;
      }
      if (!pick || host.busy()) return;
      const still = (op: Operation | null) => {
        if (op && host.pick() === pick && !host.busy()) host.show(op);
      };
      if (pick.kind === "region") void host.operation("region:extrude", pick).then(still);
      else if (pick.faces.length === 1 && !pick.edges.length) void host.operation("body:pull", pick).then(still);
      else if (pick.edges.length && !pick.faces.length) void host.operation("body:round", pick).then(still);
      else if (!pick.faces.length && !pick.edges.length && host.mover.bodies() <= 1 && !host.mover.on())
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
      last = null;
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
