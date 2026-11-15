// The chips on the cross section plane (`in_394`): which axis it is across (a click goes round X, Y, Z), which half is cut away (swap), and whether its handles move or turn it. They only show and report the click.
import { iconSvg } from "./icons.ts";

export function createSectionChip(host: HTMLElement, run: (id: string) => void) {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;left:0;top:0;display:none;gap:6px;z-index:6;align-items:center";
  host.appendChild(el);
  const button = (id: string, title: string) => {
    const b = document.createElement("div");
    b.style.cssText = "width:30px;height:30px;box-sizing:border-box;border-radius:15px;background:#fff;border:1px solid #1ab8b3;color:#2b2b2d;display:flex;align-items:center;justify-content:center;cursor:pointer;font:700 13px system-ui,sans-serif;box-shadow:0 1px 6px rgba(0,0,0,.18);user-select:none;-webkit-user-select:none";
    b.title = title;
    b.addEventListener("pointerdown", (e) => e.stopPropagation());
    b.addEventListener("click", (e) => { e.stopPropagation(); run(id); });
    el.appendChild(b);
    return b;
  };
  const axis = button("section:axis", "Which way the plane faces: X, Y or Z (tap to go round)");
  const side = button("section:side", "Swap which half is cut away");
  side.innerHTML = iconSvg("invert");
  const mode = button("section:mode", "");
  let shown = "";
  return {
    /** The rect the chips fill (the bubbles keep off them), or null while hidden. */
    rect(): DOMRect | null { return el.style.display === "none" ? null : el.getBoundingClientRect(); },
    /** `at`: the page position of the plane's corner; null hides them. */
    update(sec: { axis: string; mode: "move" | "rotate" } | null, at: [number, number] | null) {
      if (!sec || !at) { el.style.display = "none"; return; }
      const sig = `${sec.axis}|${sec.mode}`;
      if (sig !== shown) {
        shown = sig;
        axis.textContent = sec.axis;
        mode.innerHTML = iconSvg(sec.mode === "move" ? "rotate" : "move");
        mode.title = sec.mode === "move" ? "The handles move the plane: tap to turn it instead" : "The handles turn the plane: tap to move it instead";
      }
      el.style.display = "flex";
      el.style.transform = `translate(${Math.round(at[0] + 8)}px, ${Math.round(at[1] + 8)}px)`;
    },
  };
}
