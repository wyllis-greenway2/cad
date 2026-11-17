// A joint played and scrubbed (`dec_mechanism_motion`, stage 1): starting it from the selected body, changing what it turns or slides, and keeping the pose (the one thing that writes). The pure parts are in `../motion.ts`.
import type { AppState } from "./state.ts";
import { scene as sceneOf, selection as selectionOf, run } from "../session.ts";
import { startMotion, setPlaying, keepCommand } from "../motion.ts";
import type { JointKind } from "../motion.ts";

/** Play the joint of the selected body: it starts turning (a pin) at once; the bar has the scrubber, the turn or slide, keep and close. */
export function doMotionPlay(s: AppState): AppState {
  const body = selectionOf(s.session).find((r) => sceneOf(s.session).parts[r]?.kind === "body");
  if (!body) return { ...s, session: { ...s.session, message: "select a body that turns on a pin or slides on a rod, then Play" } };
  const r = startMotion(sceneOf(s.session), body, "turn");
  if (!r.ok) return { ...s, session: { ...s.session, message: r.why } };
  return { ...s, motion: setPlaying(r.motion, true), menu: null, session: { ...s.session, message: null } };
}
/** The body turns or slides (what the bar's switch says): the same joint, from rest. */
export function doMotionKind(s: AppState, kind: JointKind): AppState {
  if (!s.motion || s.motion.kind === kind) return s;
  const r = startMotion(sceneOf(s.session), s.motion.body, kind);
  return r.ok ? { ...s, motion: { ...setPlaying(r.motion, s.motion.playing) } } : { ...s, session: { ...s.session, message: r.why } };
}
/** Keep the pose: the amount it stands at is made the joint's value as the ordinary drive step (one undo), and the motion ends; at rest there is nothing to keep. */
export function doMotionKeep(s: AppState): AppState {
  const m = s.motion;
  if (!m) return s;
  const c = keepCommand(sceneOf(s.session), m);
  if (!c) return { ...s, motion: null, session: { ...s.session, message: "the joint is at rest: there is no pose to keep" } };
  const next = run(s.session, c);
  return next.message ? { ...s, session: next } : { ...s, motion: null, session: next };
}
