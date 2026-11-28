// A box drawn on the screen to pick what it holds of the bodies (`MD-38`): from the ring's Select section, the next press and drag on the view draws it (dashed teal, as the sketch's candidates are), and
// letting go picks what is wholly in it and seen (`interaction/pick.ts` `boxPick`). It is one wait: Esc, or a press that goes nowhere, puts it away. Knows nothing of the camera or the bodies: the page says.
import type { Cam } from "./camera.ts";
import { boxPick } from "./interaction/pick.ts";
import type { Selection } from "./selection.ts";
import type { BodyMesh } from "./studio.ts";

export interface BoxHost {
  view(): { cam: Cam; w: number; h: number };
  meshes(): readonly BodyMesh[];
  selection: Selection;
  /** a sentence for the person */
  say(text: string): void;
}
export function createBoxSelect(parent: HTMLElement, host: BoxHost) {
  const el = document.createElement("div");
  el.style.cssText =
    "position:fixed;display:none;pointer-events:none;z-index:6;border:1.5px dashed #1ab8b3;background:rgba(26,184,179,.08);border-radius:2px";
  parent.appendChild(el);
  let armed = false,
    from: { x: number; y: number } | null = null;
  const show = (x: number, y: number) => {
    if (!from) return;
    const r = parent.getBoundingClientRect?.() ?? { left: 0, top: 0 };
    el.style.display = "block";
    el.style.left = `${r.left + Math.min(from.x, x)}px`;
    el.style.top = `${r.top + Math.min(from.y, y)}px`;
    el.style.width = `${Math.abs(x - from.x)}px`;
    el.style.height = `${Math.abs(y - from.y)}px`;
  };
  const stop = () => {
    armed = false;
    from = null;
    el.style.display = "none";
  };
  return {
    armed: (): boolean => armed,
    /** the next drag draws a box */
    arm(): void {
      armed = true;
      host.say("Drag a box round what to select (Esc to leave)");
    },
    /** Esc: whether there was something to put away */
    cancel(): boolean {
      const was = armed;
      stop();
      return was;
    },
    /** a right drag has begun at (x, y): the box is drawn from there, with nothing to arm first */
    start(x: number, y: number): void {
      armed = true;
      from = { x, y };
    },
    /** a press: when a box is waited for, it is the box's corner (true) */
    grab(x: number, y: number): boolean {
      if (!armed) return false;
      from = { x, y };
      return true;
    },
    move: show,
    /** the press ends: what the box holds is picked (a box with nothing in it, or none drawn, leaves the pick as it was) */
    end(x: number, y: number): void {
      const a = from;
      if (!a) return;
      const { cam, w, h } = host.view(),
        got =
          Math.hypot(x - a.x, y - a.y) < 4
            ? null
            : boxPick(host.meshes(), cam, w, h, { x0: a.x, y0: a.y, x1: x, y1: y });
      stop();
      if (got) host.selection.setBody(got);
      else host.say("Nothing in the box");
    },
  };
}
