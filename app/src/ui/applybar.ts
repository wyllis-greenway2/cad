// The Apply and Cancel buttons at the top of the screen while a repeat is being set up (`in_141`): it can take a while to get right, so it is only ended by a button, never by a stray click.
import { iconSvg } from "./icons.ts";

export function createApplyBar(host: HTMLElement, h: { apply(): void; cancel(): void }) {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;left:50%;top:14px;transform:translateX(-50%);display:none;gap:10px;z-index:9;user-select:none;-webkit-user-select:none";
  const button = (icon: string, title: string, color: string, on: () => void) => {
    const b = document.createElement("div");
    b.innerHTML = iconSvg(icon);
    b.title = title;
    b.style.cssText = `width:40px;height:40px;box-sizing:border-box;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#fff;border:2px solid ${color};color:${color};box-shadow:0 2px 10px rgba(0,0,0,.16);cursor:pointer`;
    b.addEventListener("pointerup", (e) => { e.stopPropagation(); on(); });
    el.appendChild(b);
  };
  button("check", "Apply the repeat", "#1ab8b3", h.apply);
  button("cross", "Cancel the repeat", "#c0392b", h.cancel);
  host.appendChild(el);
  return { update(show: boolean) { el.style.display = show ? "flex" : "none"; } };
}
