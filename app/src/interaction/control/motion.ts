// A joint played and scrubbed (`dec_mechanism_motion`, stage 1): starting it from the selected body, changing what it turns or slides, and keeping the pose (the one thing that writes). The pure parts are in `../motion.ts`.
import type { AppState } from "./state.ts";
import { scene as sceneOf, selection as selectionOf, run } from "../session.ts";
import { startMotion, setPlaying, keepCommand } from "../motion.ts";
import type { Command } from "../../operation/commands.ts";
import { mateStatus } from "../../operation/mates.ts";
import { gearOfBody, camFollower, animatedBodies } from "../../operation/gearcouple.ts";
import { bodyCentre } from "../objects.ts";
import { dot, sub, normalize } from "../../math/vec.ts";
import { linksOf } from "../../operation/coupling.ts";
import { restCommand } from "../mate.ts";
import { featureOf } from "../../operation/mates.ts";
import { pivotOfBody } from "../../operation/pivot.ts";
import { axisVec } from "../operations.ts";
import type { Intent } from "../../shared/input.ts";
import type { JointKind } from "../motion.ts";

/** Play the joint of the selected body: it starts turning (a pin) at once; the bar has the scrubber, the turn or slide, keep and close. */
export function doMotionPlay(s: AppState): AppState {
  const body = selectionOf(s.session).find((r) => sceneOf(s.session).parts[r]?.kind === "body");
  if (!body) return { ...s, session: { ...s.session, message: "select a body that turns on a pin or slides on a rod, then Play" } };
  const r = startMotion(sceneOf(s.session), body, "turn", s.session.outcome);
  if (!r.ok) return { ...s, session: { ...s.session, message: r.why } };
  return { ...s, motion: setPlaying(r.motion, true), menu: null, session: { ...s.session, message: r.motion.note ?? null } }; // (a partner that is not turned along says why, `in_1117`)
}
/** The body turns or slides (what the bar's switch says): the same joint, from rest. */
export function doMotionKind(s: AppState, kind: JointKind): AppState {
  if (!s.motion || s.motion.kind === kind) return s;
  const r = startMotion(sceneOf(s.session), s.motion.body, kind, s.session.outcome);
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

/**
 * Link the two joints selected (the first body of each of two coaxial mates): the second turns as much as the first (a ratio of 1, changed on the bar), and the first is played at once so the bar shows the link.
 */
export function doLink(s: AppState): AppState {
  const sc = sceneOf(s.session);
  const bodies = selectionOf(s.session).filter((r) => sc.parts[r]?.kind === "body");
  const say = (message: string): AppState => ({ ...s, menu: null, session: { ...s.session, message } });
  const mates = bodies.map((b) => mateStatus(sc).find((x) => x.state === "ok" && x.mode === "coaxial" && x.mover?.body === b));
  if (bodies.length !== 2 || mates.some((m) => !m)) return say("select two bodies that each turn on a pin or slide on a rod (the first body of a coaxial mate), then Link joints");
  const made = run(s.session, { type: "couple", a: mates[0]!.id, b: mates[1]!.id, ka: "turn", kb: "turn", ratio: 1 });
  if (made.message) return say(made.message);
  const r = startMotion(sceneOf(made), bodies[0]!, "turn", made.outcome);
  return r.ok ? { ...s, menu: null, session: { ...made, message: null }, motion: setPlaying(r.motion, true) } : { ...s, menu: null, session: made };
}
/** The bar's edit of a link of the joint played: its ratio or what the other end does, as seen from this joint (the link may be stored the other way round), or taking it away. The motion starts again from where it stands. */
export function doMotionLink(s: AppState, i: Extract<Intent, { type: "motionLink" }>): AppState {
  const m = s.motion;
  if (!m || !m.mate) return s;
  const sc = sceneOf(s.session);
  const c = sc.couplings?.find((x) => x.id === i.id);
  const l = linksOf(sc, m.mate, m.kind).find((x) => x.id === i.id);
  if (!c || !l) return s;
  const mine = c.a === m.mate; // (stored as this joint to the other, or the other way round)
  const command: Command = i.remove ? { type: "deleteCoupling", id: i.id }
    : { type: "setCoupling", id: i.id, ...(i.ratio !== undefined ? { ratio: mine ? i.ratio : 1 / i.ratio } : {}), ...(i.kind ? (mine ? { kb: i.kind } : { ka: i.kind }) : {}) };
  const next = run(s.session, command);
  if (next.message) return { ...s, session: next };
  const r = startMotion(sceneOf(next), m.body, m.kind, next.outcome);
  return { ...s, session: next, motion: r.ok ? { ...r.motion, amount: m.amount, playing: m.playing, from: m.amount, startedAt: null, speed: m.speed } : null };
}

/**
 * The play button on a body hooked up to an animation: it plays what moves the body (the body itself, or the crank of a Geneva drive it belongs to, or the cam its rod rides) or, when that is what is already playing, pauses or goes on with it.
 * The selection is not changed.
 */
export function doBodyPlay(s: AppState, ref: import("../../shared/ref.ts").Ref): AppState {
  const sc = sceneOf(s.session);
  const target = animatedBodies(sc).get(ref);
  if (!target) return { ...s, session: { ...s.session, message: "this body is not hooked up to an animation" } };
  if (s.motion && s.motion.body === target) return { ...s, motion: setPlaying(s.motion, !s.motion.playing) };
  const r = startMotion(sc, target, "turn", s.session.outcome);
  return r.ok ? { ...s, motion: setPlaying(r.motion, true), session: { ...s.session, message: r.motion.note ?? null } } : { ...s, session: { ...s.session, message: r.why } };
}

/**
 * Make a body turn about an axis of its own, with no partner (`in_941`). The axis comes from the first of: a rotate that is open on the body (its pivot, where the orb has put it, and the axis it is turning about); a round face of a body that is selected (the axis of the face). The body then has its play
 * button, and plays at once. Nothing else is needed: whatever it meets then yields or does not by what is hard and linked.
 */
export function doMakeTurn(s: AppState): AppState {
  const sc = sceneOf(s.session);
  const say = (message: string): AppState => ({ ...s, menu: null, session: { ...s.session, message } });
  let from: { body: import("../../shared/ref.ts").Ref; point: import("../../math/vec.ts").Vec3; dir: import("../../math/vec.ts").Vec3 } | null = null;
  const op = s.op;
  if (op && op.kind === "rotate" && op.pivot) {
    const body = op.parts.find((r) => sc.parts[r]?.kind === "body") ?? (op.bodyId ? Object.values(sc.parts).find((p) => p.kind === "body" && p.id === op.bodyId)?.ref : undefined);
    if (body) from = { body, point: op.pivot, dir: axisVec(op) };
  }
  if (!from) {
    for (const r of selectionOf(s.session)) {
      const f = sc.parts[r]?.kind === "plane" ? featureOf(sc, r, "coaxial") : null;
      if (f) { from = { body: f.body, point: f.point, dir: f.dir }; break; }
    }
  }
  if (!from) return say("select a round face of the body (its axis is the pivot), or open Rotate on the body, put the orb where it should turn and choose Pivot");
  const id = (sc.parts[from.body] as { id?: string } | undefined)?.id;
  if (!id) return say("this is not a body of the model");
  const made = run(s.session, { type: "pivot", body: id, point: from.point, dir: from.dir });
  if (made.message) return say(made.message);
  const r = startMotion(sceneOf(made), from.body, "turn", made.outcome);
  const closed: AppState = { ...s, op: null, opBase: null, moverSphere: false, moverWas: null, menu: null, drag: null };
  return r.ok ? { ...closed, session: { ...made, message: null }, motion: setPlaying(r.motion, true) } : { ...closed, session: made };
}
/** A body that was made to turn is still again (the pivot is taken away); a motion of it that is open ends. */
export function doStopTurning(s: AppState): AppState {
  const sc = sceneOf(s.session);
  const body = selectionOf(s.session).find((r) => !!pivotOfBody(sc, r));
  const pv = body ? pivotOfBody(sc, body) : undefined;
  if (!body || !pv) return { ...s, menu: null, session: { ...s.session, message: "select a body that was made to turn" } };
  const made = run(s.session, { type: "deletePivot", body: pv.body });
  return { ...s, menu: null, motion: s.motion?.body === body ? null : s.motion, session: made };
}

/** Set (or take away, with null) where a body that yields by contact goes back to when nothing holds it away: the rest of its pivot, or of the joint of its mate (`in_1020`). The motion starts again from where it stands. */
export function doMotionRest(s: AppState, i: Extract<Intent, { type: "motionRest" }>): AppState {
  const m = s.motion;
  const p = m?.contact?.pushables.find((x) => x.body === i.ref);
  if (!m || !p) return s;
  const sc = sceneOf(s.session);
  const body = sc.parts[i.ref as import("../../shared/ref.ts").Ref];
  const pv = pivotOfBody(sc, i.ref);
  const command: Command | null = pv && body?.kind === "body" && body.id ? { type: "pivot", body: body.id, point: pv.point, dir: pv.dir, rest: i.rest } : p.mate ? restCommand(sc, p.mate, "turn", i.rest) : null;
  if (!command) return s;
  const next = run(s.session, command);
  if (next.message) return { ...s, session: next };
  const r = startMotion(sceneOf(next), m.body, m.kind, next.outcome);
  return { ...s, session: next, motion: r.ok ? { ...r.motion, amount: m.amount, playing: m.playing, from: m.amount, startedAt: null, speed: m.speed } : null };
}
