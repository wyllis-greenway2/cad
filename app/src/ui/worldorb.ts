// The orb at the junction of the world axes (`in_463`): a little dot there; a click puts the axes and the little panes away, another brings them back; pointing at it shows what a click does, an eye (show) or a crossed eye (put away).
import { iconSvg } from "./icons.ts";

export function createWorldOrb(host: HTMLElement, toggle: () => void) {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;left:0;top:0;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;box-sizing:border-box;background:rgba(60,62,68,.55);border:1px solid rgba(255,255,255,.7);z-index:5;display:none;align-items:center;justify-content:center;cursor:pointer;color:#2b2b2d;transition:width .12s,height .12s,margin .12s,background .12s";
  host.appendChild(el);
  let hovering = false;
  let hiddenNow = false;
  const draw = (): void => {
    if (hovering) {
      el.style.cssText += ";width:26px;height:26px;margin:-13px 0 0 -13px;background:#fff;border-color:#8a8f98;box-shadow:0 1px 3px rgba(0,0,0,.25)";
      el.innerHTML = iconSvg(hiddenNow ? "eye" : "eyeOff"); // (what a click does: show, or put away)
      el.title = hiddenNow ? "Show the axes and the planes" : "Hide the axes and the planes";
    } else {
      el.style.cssText += ";width:12px;height:12px;margin:-6px 0 0 -6px;background:rgba(60,62,68,.55);border-color:rgba(255,255,255,.7);box-shadow:none";
      el.innerHTML = "";
    }
  };
  el.addEventListener("pointerenter", () => { hovering = true; draw(); });
  el.addEventListener("pointerleave", () => { hovering = false; draw(); });
  el.addEventListener("pointerdown", (e) => e.stopPropagation());
  el.addEventListener("click", (e) => { e.stopPropagation(); toggle(); });
  return {
    /** `at`: the page position of the origin, or null when it is not in view. */
    update(at: [number, number] | null, hidden: boolean, behind = false): void {
      if (!at || (behind && !hovering)) { el.style.display = "none"; return; } // (behind the model it is not shown through it, `in_1194`)
      el.style.display = "flex";
      el.style.left = `${Math.round(at[0])}px`;
      el.style.top = `${Math.round(at[1])}px`;
      if (hidden !== hiddenNow) { hiddenNow = hidden; draw(); }
    },
  };
}
