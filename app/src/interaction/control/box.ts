// The end of a drag select (`in_235`): the rectangle is let go, what is in it is selected (Shift adds it to what is selected); a hold that never moved picks nothing.
import { scene as sceneOf, selection as selectionOf } from "../session.ts";
import { projector } from "../camera.ts";
import { settings } from "../../shared/settings.ts";
import { boxSelect } from "../boxselect.ts";
import type { AppState, Env } from "./state.ts";

export function finishBox(s: AppState, env: Env): AppState {
  const b = s.box;
  if (!b) return s;
  if (Math.hypot(b.x - b.x0, b.y - b.y0) < settings.view.clickMovePx) return { ...s, box: null };
  const pr = projector(s.cam, env.w, env.h);
  const found = boxSelect(sceneOf(s.session), b, pr.project, pr.view);
  const now = selectionOf(s.session);
  const sel = b.shift ? [...now, ...found.filter((r) => !now.includes(r))] : found;
  return { ...s, box: null, menu: null, spread: null, session: { ...s.session, hover: undefined, click: { ...s.session.click, selection: sel }, message: null } };
}
