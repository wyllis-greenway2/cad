// A joint played and scrubbed (`dec_mechanism_motion`, stage 1): starting it from the selected body, changing what it turns or slides, and keeping the pose (the one thing that writes). The pure parts are in `../motion.ts`.
import type { AppState } from "./state.ts";
import { scene as sceneOf, selection as selectionOf, run } from "../session.ts";
import { startMotion, setPlaying, keepCommand } from "../motion.ts";
import { mateStatus } from "../../operation/mates.ts";
import { gearOfBody, camFollower } from "../../operation/gearcouple.ts";
import { bodyCentre } from "../objects.ts";
import { dot, sub, normalize } from "../../math/vec.ts";
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
  if (m.noKeep) return { ...s, session: { ...s.session, message: m.noKeep } };
  const c = keepCommand(sceneOf(s.session), m);
  if (!c) return { ...s, motion: null, session: { ...s.session, message: "the joint is at rest: there is no pose to keep" } };
  const next = run(s.session, c);
  return next.message ? { ...s, session: next } : { ...s, motion: null, session: next };
}

/** Follower: of the two bodies selected, the cam (made with its record) and the rod that slides in a guide (the first body of a coaxial mate); the rod then rides the cam's edge when the cam is played. A rod already linked is let go (select the cam alone). */
export function doCamFollow(s: AppState): AppState {
  const sc = sceneOf(s.session);
  const bodies = selectionOf(s.session).filter((r) => sc.parts[r]?.kind === "body");
  const say = (message: string): AppState => ({ ...s, menu: null, session: { ...s.session, message } });
  const cam = bodies.map((b) => gearOfBody(sc, b)).find((g) => !!g?.spec.cam);
  if (!cam) return say("select a cam with its body, then the rod that rides it");
  if (bodies.length === 1) {
    if (!cam.follower) return say("this cam has no follower: select it and the rod that rides it");
    const done = run(s.session, { type: "setGear", id: cam.id, spec: cam.spec, follower: null });
    return { ...s, menu: null, session: done };
  }
  const rod = bodies.find((b) => gearOfBody(sc, b) === undefined);
  const m = rod ? mateStatus(sc).find((x) => x.state === "ok" && x.mode === "coaxial" && x.mover?.body === rod) : undefined;
  const centre = rod ? bodyCentre(sc, rod) : null;
  if (!m?.mover || !centre) return say("the rod has to slide in a guide: it is the first body of a coaxial mate");
  const side = dot(sub(centre, cam.at), normalize(m.mover.dir)) >= 0 ? 1 : -1;
  const link = { mate: m.id, side } as const;
  const probe = camFollower({ ...sc, gears: sc.gears!.map((g) => (g.id === cam.id ? { ...g, follower: link } : g)) }, { ...cam, follower: link });
  if ("why" in probe) return say(probe.why);
  return { ...s, menu: null, session: run(s.session, { type: "setGear", id: cam.id, spec: cam.spec, follower: link }) };
}
