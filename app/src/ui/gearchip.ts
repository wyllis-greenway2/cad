// The gear's own icon (`in_693`, `in_697`): when a gear (its sketch or its 3D body) is selected or the pointer is over it, a small gear button stands by it; a click opens a short list (edit its numbers, the helix, a gear, rack or ring that meshes with it).
// Like the eye on a body (`bodychips.ts`) it only shows and reports the click: the actions are the ring's (`gear:edit`, `gear:helix`, `gear:mesh`, ...).
import { iconSvg } from "./icons.ts";
import type { Vec3 } from "../interaction/api.ts";

export interface GearChip { at: Vec3; items: { id: string; label: string; icon: string; enabled: boolean; why: string | null }[] }

export function createGearChip(host: HTMLElement, run: (id: string) => void) {
  const box = document.createElement("div");
  box.style.cssText = "position:fixed;left:0;top:0;display:none;z-index:7;flex-direction:column;align-items:flex-start;gap:4px";
  const button = document.createElement("div");
  button.style.cssText = "width:32px;height:32px;box-sizing:border-box;border-radius:16px;background:#fff;border:1px solid #1ab8b3;color:#2b2b2d;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.2)";
  button.innerHTML = iconSvg("gear");
  button.title = "This is a gear: edit it or make one that meshes with it";
  const list = document.createElement("div");
  list.style.cssText = "display:none;flex-direction:column;background:#fff;border:1px solid #cfd0d4;border-radius:10px;padding:4px;box-shadow:0 2px 8px rgba(0,0,0,.2);min-width:150px";
  box.append(button, list);
  for (const t of ["pointerdown", "pointerup", "wheel", "contextmenu"]) box.addEventListener(t, (e) => { e.stopPropagation(); if (t === "contextmenu") e.preventDefault(); });
  host.appendChild(box);
  let open = false, sig = "", last: GearChip | null = null;
  document.addEventListener("pointerdown", (e) => { if (open && !box.contains(e.target as Node)) { open = false; list.style.display = "none"; } }); // (a click elsewhere closes the list)
  const show = () => { list.style.display = open ? "flex" : "none"; };
  button.addEventListener("click", (e) => { e.stopPropagation(); open = !open; show(); });
  return {
    rect(): DOMRect | null { return box.style.display === "none" ? null : box.getBoundingClientRect(); },
    /** `chip` null when no gear is selected (or something is in use); `screen` puts a point of the scene on the page. */
    update(chip0: GearChip | null, screen: (q: Vec3) => [number, number] | null): void {
      const chip = chip0 ?? (last && (open || box.matches(":hover")) ? last : null); // (the pointer going from the gear to its icon, or the list being open, keeps it)
      if (chip0) last = chip0;
      const at = chip ? screen(chip.at) : null;
      if (!chip || !at) { box.style.display = "none"; open = false; sig = ""; last = null; return; }
      const now = JSON.stringify(chip.items);
      if (now !== sig) {
        sig = now;
        list.replaceChildren();
        for (const it of chip.items) {
          const row = document.createElement("div");
          row.style.cssText = `display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;font:13px system-ui,sans-serif;white-space:nowrap;${it.enabled ? "cursor:pointer;color:#222" : "color:#aaa"}`;
          row.innerHTML = `${iconSvg(it.icon)}<span>${it.label}</span>`;
          row.title = it.enabled ? "" : it.why ?? "";
          if (it.enabled) {
            row.addEventListener("mouseenter", () => { row.style.background = "#eef7f7"; });
            row.addEventListener("mouseleave", () => { row.style.background = ""; });
            row.addEventListener("click", (e) => { e.stopPropagation(); open = false; show(); run(it.id); });
          }
          list.appendChild(row);
        }
      }
      box.style.transform = `translate(${Math.round(at[0] - 16)}px, ${Math.round(at[1] - 16)}px)`;
      box.style.display = "flex";
      show();
    },
  };
}
