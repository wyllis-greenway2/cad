// An operation open on the screen, as a description (`in_1576`, `q_lean_ui`): extrude, push or pull a face (its kinds), round, chamfer, and what comes after (revolve, offset, hollow) are all this one thing: a title, options, a number, an arrow (the one pull handle, `dec_task_handles`), a ghost, and what applying makes.
// Pure: no page, no three.js. The one controller (`operationcontrol.ts`) draws it and takes the pointer and the keys; a new operation is a new description, not a new controller.
import type { Step } from "../engine/steps.ts";
import type { Ask } from "../engine/protocol.ts";
import type { V3 } from "../vec.ts";

/** a kind of the operation, as a chip (the one chosen is filled; one that cannot be chosen is dim with its reason) */
export interface OpOption { id: string; label: string; on: boolean; enabled: boolean; why?: string }
/** what the pull would make, shown before the engine has made it: a prism of an outline in a plane's axes, or a face moved along its normal */
export type Ghost =
  | { frame: { origin: V3; u: V3; v: V3; n: V3 }; loops: [number, number][][]; d: number }
  | { faceMove: { positions: Float32Array; n: V3; d: number } };
/** what applying does: the recipe it makes; or a question for the worker first, whose answer makes it (or says why it cannot); or nothing */
export type Plan =
  | { kind: "steps"; steps: Step[] }
  | { kind: "ask"; ask: Ask; then(data: unknown): { steps: Step[] } | { why: string } }
  | { kind: "nothing" };

export interface Operation {
  /** what it is, for the dev hooks and the history (`extrude`, `push`, `round`) */ kind: string;
  /** the words on the operation bar */ title: string;
  options: readonly OpOption[];
  /** the number: its value, and what it is called when it is typed over */ value: number; valueTitle: string;
  /** where the number stands when there is no arrow */ at: V3;
  /** the arrow: where it starts and the way it points (null: the operation is typed, not pulled) */ arrow: { base: V3; normal: V3 } | null;
  /** how far the arrow's tip is pulled, signed (along the arrow's way): the number, or the number with the sign of the kind (round one way, chamfer the other) */ pulled: number;
  /** the arrow pulled to a signed distance: what the drag makes of the operation (null: not allowed, it stays) */ withPull(d: number): Operation | null;
  ghost: Ghost | null;
  /** when it opens, the view turns about this to look at the plane from the side (null: it stays) */ tilt: { frame: { origin: V3; normal: V3; u: V3 }; centre: V3; size: number } | null;
  /** a new number (null: that number is not allowed: a size of nothing or less) */ withValue(v: number): Operation | null;
  /** another kind chosen */ withOption(id: string): Operation;
  /** what applying makes, from the recipe now */ plan(recipe: readonly Step[]): Plan;
  /** for the dev hooks */ debug: Record<string, unknown>;
}
