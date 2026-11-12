// The helpers of the touch cursor (`in_160`, `in_283`): a finger has no hover, so while a figure is being drawn there is a cursor (the line follows it, with its guides and hints), a round handle beside it
// with a finger-drag icon that drags the cursor about to place a point exactly, and a green apply icon that sets the point where the cursor is. A tap anywhere else sets the point there, as a click does.
// The handle only draws; the touches go to the page's input as usual (it lets them through). The apply icon is a button.
import { iconSvg } from "./icons.ts";

const ROUND = "position:fixed;left:0;top:0;display:none;width:48px;height:48px;box-sizing:border-box;border-radius:24px;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(0,0,0,.25);z-index:6";

export function createTouchCursor(host: HTMLElement, apply: () => void) {
  const drag = document.createElement("div");
  drag.innerHTML = iconSvg("fingerdrag");
  drag.style.cssText = `${ROUND};background:#fff;color:#1a8f8b;border:2px solid #1ab8b3;pointer-events:none`;
  (drag.firstElementChild as SVGElement).setAttribute("width", "26");
  (drag.firstElementChild as SVGElement).setAttribute("height", "26");
  const ok = document.createElement("div");
  ok.innerHTML = iconSvg("check");
  ok.title = "Set the point here";
  ok.style.cssText = `${ROUND};background:#2fbf71;color:#fff;border:2px solid #fff;cursor:pointer;touch-action:manipulation`;
  (ok.firstElementChild as SVGElement).setAttribute("width", "26");
  (ok.firstElementChild as SVGElement).setAttribute("height", "26");
  ok.addEventListener("click", (e) => { e.stopPropagation(); apply(); });
  ok.addEventListener("pointerdown", (e) => e.stopPropagation()); // (the page's input must not take the press as a tap or a drag of its own)
  host.append(drag, ok);
  return {
    /** `at`: the page position of the centre of the drag icon (null: hide both). The check stands beside it, on the side with room; `withCheck` false: nothing is open to apply (an arrow has been tapped on a selection that has not started an operation). */
    update(at: [number, number] | null, room = { left: true }, withCheck = true) {
      if (!at) { drag.style.display = "none"; ok.style.display = "none"; return; }
      drag.style.display = "flex";
      ok.style.display = withCheck ? "flex" : "none";
      drag.style.transform = `translate(${Math.round(at[0] - 24)}px, ${Math.round(at[1] - 24)}px)`;
      ok.style.transform = `translate(${Math.round(at[0] + (room.left ? -62 : 62) - 24)}px, ${Math.round(at[1] - 24)}px)`;
    },
  };
}
