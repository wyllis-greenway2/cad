// The operation bar (`dec_ui_unification` step 2, `q_lean_ui`): one pill at the top for whatever operation is open: its icon and name, a check that applies it and a cross that gives it up. The same for every operation, on every device.
import { iconSvg } from "./icons.ts";
import { settings } from "./settings.ts";

export function createOpBar(host: HTMLElement, on: { apply(): void; cancel(): void }) {
  const el = document.createElement("div");
  el.style.cssText = `position:fixed;left:50%;top:14px;transform:translateX(-50%);display:none;align-items:center;gap:8px;padding:5px 8px 5px 12px;border-radius:20px;background:${settings.ui.pill};color:${settings.ui.pillText};font:13px ${settings.ui.font};z-index:9;user-select:none;-webkit-user-select:none`;
  const label = document.createElement("span"), mk = (icon: string, title: string, bg: string, f: () => void) => {
    const b = document.createElement("div"); b.innerHTML = iconSvg(icon); b.title = title; b.dataset.op = icon;
    b.style.cssText = `display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:${bg};color:#fff;cursor:pointer`;
    b.addEventListener("click", (e) => { e.stopPropagation(); f(); }); return b;
  };
  el.append(label, mk("check", "Apply (Enter)", "#1ab8b3", on.apply), mk("cross", "Cancel (Esc)", "#6b6e75", on.cancel));
  el.addEventListener("pointerdown", (e) => e.stopPropagation());
  host.appendChild(el);
  return { show(text: string | null) { el.style.display = text ? "flex" : "none"; if (text) label.textContent = text; } };
}
