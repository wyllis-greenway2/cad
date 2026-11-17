// Hiding and showing bodies, and the Bodies list's own actions (`dec_hidden_bodies`, `in_489`, `in_497`): the eye on a body or on a row, select all and none, hide all and show all, delete a body.
import type { Ref } from "../../shared/ref.ts";
import { scene as sceneOf, selection as selectionOf, run } from "../session.ts";
import { actionsFor } from "../actions.ts";
import { inHiddenBody } from "../objects.ts";
import type { AppState } from "./state.ts";
import { withSession } from "./state.ts";

/** The refs of the bodies of the scene, in the order the Bodies list has them. */
export const bodyRefs = (sc: ReturnType<typeof sceneOf>): Ref[] => Object.values(sc.parts).filter((p) => p.kind === "body").map((p) => p.ref);

/** Hide bodies or show them again: the command is made, and what is selected of a body that is now hidden is taken out of the selection (it cannot be reached). */
export function doHideBodies(s: AppState, refs: readonly Ref[], hidden: boolean): AppState {
  const real = refs.filter((r) => sceneOf(s.session).parts[r]?.kind === "body");
  if (!real.length) return s;
  const session = run(s.session, { type: "hideBodies", refs: [...real], hidden });
  const sc = sceneOf(session);
  const keep = selectionOf(session).filter((r) => { const p = sc.parts[r]; return !p || !inHiddenBody(sc, p); });
  const trimmed = keep.length === selectionOf(session).length ? session : { ...session, click: { ...session.click, selection: keep } };
  return withSession({ ...s, menu: null }, { ...trimmed, message: null });
}

/** The eye of one body: hidden bodies are shown, shown ones hidden. */
export function doBodyEye(s: AppState, ref: Ref): AppState {
  const hidden = !!sceneOf(s.session).hiddenBodies?.includes(ref);
  return doHideBodies(s, [ref], !hidden);
}

/** The Bodies list's own buttons: select all (the bodies that are not hidden), select none, hide all, show all. */
export function doBodiesAction(s: AppState, id: string): AppState {
  const sc = sceneOf(s.session);
  const all = bodyRefs(sc);
  if (id === "bodies:all") return withSession(s, { ...s.session, click: { ...s.session.click, selection: all.filter((r) => !sc.hiddenBodies?.includes(r)) }, message: null });
  if (id === "bodies:none") return withSession(s, { ...s.session, click: { ...s.session.click, selection: [] }, message: null });
  if (id === "bodies:hide") return doHideBodies(s, all, true);
  if (id === "bodies:show") return doHideBodies(s, all, false);
  return s;
}

/** The cross of a row of the Bodies list: the body goes with its steps and sketches, as when it is selected and Delete is pressed (`in_192`). */
export function doDeleteBody(s: AppState, ref: Ref): AppState {
  if (s.tool || s.op || s.repeat) return s;
  const sc = sceneOf(s.session);
  if (sc.parts[ref]?.kind !== "body") return s;
  const a = actionsFor(sc, [ref]).find((x) => x.id === "delete");
  if (!a) return s;
  const session = run({ ...s.session, click: { ...s.session.click, selection: [ref] } }, a.run());
  return withSession({ ...s, menu: null }, { ...session, click: { ...session.click, selection: [] } });
}

/** The bodies a selection is, or its faces, edges and corners are in (the ones Hide body hides): a part says its body, or, with one body only, it is that one's (`in_697`). */
export function selectedBodies(sc: ReturnType<typeof sceneOf>, sel: readonly Ref[]): Ref[] {
  const all = bodyRefs(sc);
  return [...new Set(sel.flatMap((r) => { const p = sc.parts[r]; return !p ? [] : p.kind === "body" ? [r] : p.origin === "body" ? (p.of && sc.parts[p.of] ? [p.of] : all.length === 1 ? all : []) : []; }))];
}
