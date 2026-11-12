// The helper of a touch screen (`in_160`, `in_283`, `in_286`): a finger has no hover and cannot press, drag and let go on small things, so a round icon with a finger-drag drawing stands by the cursor of a figure being
// drawn, or by the arrow or ring of an operation that was tapped; a finger dragging it does what a mouse's hover or drag would. There is no check: a tap elsewhere is what sets the point or applies (a right click does).
// The icon only draws; the touches go to the page's input as usual (it lets them through).
import { iconSvg } from "./icons.ts";

export function createTouchCursor(host: HTMLElement) {
  const drag = document.createElement("div");
  drag.innerHTML = iconSvg("fingerdrag");
  drag.style.cssText = "position:fixed;left:0;top:0;display:none;width:48px;height:48px;box-sizing:border-box;border-radius:24px;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(0,0,0,.25);z-index:6;background:#fff;color:#1a8f8b;border:2px solid #1ab8b3;pointer-events:none";
  (drag.firstElementChild as SVGElement).setAttribute("width", "26");
  (drag.firstElementChild as SVGElement).setAttribute("height", "26");
  host.appendChild(drag);
  return {
    /** `at`: the page position of the centre of the drag icon (null: hide it). */
    update(at: [number, number] | null) {
      if (!at) { drag.style.display = "none"; return; }
      drag.style.display = "flex";
      drag.style.transform = `translate(${Math.round(at[0] - 24)}px, ${Math.round(at[1] - 24)}px)`;
    },
  };
}
