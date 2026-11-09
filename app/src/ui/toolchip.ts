// The sketching tool that is on (`in_193`): a little pill at the top of the page with the tool's icon and a cross; the tool stays on until a right click or this cross puts it away.
import { iconSvg } from "./icons.ts";

export function createToolChip(host: HTMLElement, cancel: () => void, apply: () => void) {
  const chip = document.createElement("div");
  chip.style.cssText = "position:fixed;z-index:7;top:12px;left:50%;transform:translateX(-50%);display:none;align-items:center;gap:6px;height:40px;padding:0 6px 0 14px;border-radius:20px;background:#34363b;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.25);user-select:none;-webkit-user-select:none;touch-action:manipulation";
  const icon = document.createElement("span");
  icon.style.cssText = "display:inline-flex;width:20px;height:20px";
  const x = document.createElement("div");
  x.style.cssText = "display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:14px;cursor:pointer;background:rgba(255,255,255,.14)";
  x.innerHTML = iconSvg("cross");
  x.addEventListener("click", (e) => { e.stopPropagation(); cancel(); });
  const tick = document.createElement("div");
  tick.style.cssText = x.style.cssText;
  tick.innerHTML = iconSvg("check");
  tick.addEventListener("click", (e) => { e.stopPropagation(); apply(); });
  chip.append(icon, tick, x);
  host.appendChild(chip);
  let shown = "";
  return {
    /** The tool that is on (its icon key and the words for the tooltip), or null. */
    update(tool: { kind: string; label: string } | null, confirm: { kind: string; label: string } | null = null) {
      const on = confirm ?? tool;
      chip.style.display = on ? "flex" : "none";
      tick.style.display = confirm ? "inline-flex" : "none";
      if (!on) return;
      const key = `${confirm ? "c" : "t"}:${on.kind}`;
      if (key === shown) return;
      shown = key;
      icon.innerHTML = iconSvg(on.kind);
      if (confirm) {
        chip.title = `${confirm.label}: Enter or a right click applies, Esc cancels`;
        tick.title = "Apply (Enter or right click)";
        x.title = "Cancel (Esc)";
      } else {
        chip.title = `${on.label}: stays on until a right click or the cross`;
        x.title = "Stop sketching (or right click)";
      }
    },
  };
}
