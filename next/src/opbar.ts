// The operation bar (`dec_ui_unification` step 2, `q_lean_ui`): one pill at the top for whatever operation is open: its icon and name, a check that applies it and a cross that gives it up. The same for every operation, on every device.
import { iconSvg } from "./icons.ts";
import { settings } from "./settings.ts";

export interface OpOption { id: string; label: string; on: boolean; enabled: boolean; why?: string }
export function createOpBar(host: HTMLElement, on: { apply(): void; cancel(): void; option?(id: string): void }) {
  const el = document.createElement("div");
  el.style.cssText = `position:fixed;left:50%;top:14px;transform:translateX(-50%);display:none;align-items:center;gap:8px;padding:5px 8px 5px 12px;border-radius:20px;background:${settings.ui.pill};color:${settings.ui.pillText};font:13px ${settings.ui.font};z-index:9;user-select:none;-webkit-user-select:none`;
  const label = document.createElement("span"), mk = (icon: string, title: string, bg: string, f: () => void) => {
    const b = document.createElement("div"); b.innerHTML = iconSvg(icon); b.title = title; b.dataset.op = icon;
    b.style.cssText = `display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:${bg};color:#fff;cursor:pointer`;
    b.addEventListener("click", (e) => { e.stopPropagation(); f(); }); return b;
  };
  const opts = document.createElement("div"); opts.style.cssText = "display:flex;gap:4px"; let optSig = "";
  el.append(label, opts, mk("check", "Apply (Enter)", "#1ab8b3", on.apply), mk("cross", "Cancel (Esc)", "#6b6e75", on.cancel));
  el.addEventListener("pointerdown", (e) => e.stopPropagation());
  host.appendChild(el);
  return {
    /** The words of the operation, and its options (the kinds of it, as small chips: the one chosen is filled; one that cannot be chosen is dim with its reason in the tooltip). */
    show(text: string | null, options: readonly OpOption[] = []) {
      el.style.display = text ? "flex" : "none"; if (text) label.textContent = text;
      const sig = JSON.stringify(options); if (sig === optSig) return; optSig = sig;
      opts.replaceChildren(...options.map((o) => {
        const c = document.createElement("div"); c.textContent = o.label; c.dataset.option = o.id; c.title = o.enabled ? o.label : o.why ?? "";
        c.style.cssText = `padding:3px 9px;border-radius:13px;font-size:12px;border:1px solid ${o.on ? "#1ab8b3" : "rgba(255,255,255,.35)"};background:${o.on ? "#1ab8b3" : "transparent"};color:#fff;${o.enabled ? "cursor:pointer" : "opacity:.4"}`;
        if (o.enabled) c.addEventListener("click", (e) => { e.stopPropagation(); on.option?.(o.id); });
        return c;
      }));
    },
  };
}
