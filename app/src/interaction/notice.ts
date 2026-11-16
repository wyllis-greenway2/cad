// THE ONE NOTIFICATION DESCRIPTION (`in_547`, `q_ui_unification`): everything the app tells the person while they work, as one list that one renderer (`ui/notices.ts`) draws. A message of the status line, a refused
// change with its way through, the help on an arrow and the "working" sign are all `Notice`s: what each is (its kind), what it says, where it stands, and the button it offers (what it sends back is an intent).
// The interaction layer makes them; nothing draws a message of its own any more.
import type { Vec3 } from "../math/vec.ts";
import type { Intent } from "../shared/input.ts";

export type NoticeKind =
  | "status" // a sentence about what just happened or why something cannot be done: the bottom line
  | "refusal" // a change that was refused, beside the constraint that stopped it, with a button that goes through (`in_366`)
  | "help" // a few words on an arrow ("pull to copy", `in_236`)
  | "busy"; // the kernel is working
export interface NoticeAction { label: string; title: string; /** what pressing it sends */ intent: Intent; /** what the pointer being on the notice sends, to keep it from fading */ hold?: Intent }
export interface Notice { kind: NoticeKind; text: string; /** a place in the scene it stands at (help) */ at?: Vec3; /** the constraint whose bubble it stands beside (a refusal) */ beside?: string; action?: NoticeAction }

/** The notices of a frame, in the order they are drawn. At most one of each kind. */
export function noticesOf(f: { message: string; refusal: { text: string; button: string; beside: string } | null; helper: { at: Vec3; text: string } | null; busy: boolean }): Notice[] {
  const out: Notice[] = [];
  if (f.refusal) out.push({ kind: "refusal", text: f.refusal.text, beside: f.refusal.beside, action: { label: f.refusal.button, title: "Delete the constraints that stopped it, and make the change (one undo takes both back)", intent: { type: "overrideRefusal" }, hold: { type: "holdFlash" } } });
  else if (f.message) out.push({ kind: "status", text: f.message });
  if (f.helper) out.push({ kind: "help", text: f.helper.text, at: f.helper.at });
  if (f.busy) out.push({ kind: "busy", text: "Working…" });
  return out;
}
