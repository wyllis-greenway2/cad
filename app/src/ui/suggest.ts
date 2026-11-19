// The helpful bar (`in_195`, `in_1160`): one little row of round buttons by what is selected. The icons that belong to it (a body's eye and play button, the icon of its constraints, a sheet's four, the gear's) are on the left, the suggested
// constraints on the right, each an icon with its name as a tooltip; a click runs it. The constraints themselves keep their bubbles on the parts.
import { iconKey, iconSvg } from "./icons.ts";
import { roundButton } from "./look.ts";
import { placeBubbles } from "../interaction/bubbleplace.ts";
import type { Memory } from "../interaction/bubbleplace.ts";
import type { BarIcon, BarGear } from "../interaction/bar.ts";

/** A button that was pressed pops: it grows and settles back (`in_1177`). */
const pop = (el: HTMLElement): void => { el.animate([{ transform: "scale(1)" }, { transform: "scale(1.4)" }, { transform: "scale(1)" }], { duration: 260, easing: "ease-out" }); };

export function createSuggest(host: HTMLElement, run: (id: string, part?: string) => void) {
  const row = document.createElement("div");
  row.style.cssText = "position:fixed;left:0;top:0;z-index:8;display:none;align-items:center;gap:5px;padding:4px;border-radius:18px;background:rgba(255,255,255,.92);border:1px solid #1ab8b3;box-shadow:0 1px 6px rgba(0,0,0,.12);user-select:none;-webkit-user-select:none";
  host.appendChild(row);
  for (const ev of ["pointerdown", "pointerup", "wheel", "contextmenu"]) row.addEventListener(ev, (e) => { e.stopPropagation(); if (ev === "contextmenu") e.preventDefault(); });
  const list = document.createElement("div"); // (the gear's short list, under the row)
  list.style.cssText = "display:none;position:absolute;left:0;top:100%;margin-top:4px;flex-direction:column;background:#fff;border:1px solid #cfd0d4;border-radius:10px;padding:4px;box-shadow:0 2px 8px rgba(0,0,0,.2);min-width:150px;z-index:9";
  row.appendChild(list);
  let open = false, sig = "";
  const iconsBox = document.createElement("div"); // (the icons of what is selected: on the left)
  iconsBox.style.cssText = "display:flex;align-items:center;gap:5px";
  const sep = document.createElement("div");
  sep.style.cssText = "width:1px;align-self:stretch;margin:3px 1px;background:#cfd0d4";
  const seg = document.createElement("div"); // (the suggested constraints: on the right, in a dashed outline of their own, `in_1177`)
  seg.style.cssText = "display:none;align-items:center;gap:5px;padding:2px;border-radius:16px;border:1px dashed #1ab8b3";
  row.append(iconsBox, sep, seg, list);
  const offered = new Map<string, HTMLElement>();
  document.addEventListener("pointerdown", (e) => { if (open && !row.contains(e.target as Node)) { open = false; list.style.display = "none"; } }); // (a click elsewhere closes the list)
  const memory: Memory = new Map();
  return {
    /** The rect the bar fills while it shows (the bubbles keep off it). */
    rect(): DOMRect | null { return row.style.display === "none" ? null : row.getBoundingClientRect(); },
    /**
     * `bar`: the icons of what is selected (left); `items`: the constraints on offer (right); `at`: where (a screen point) to put the row, or null to hide it.
     * `inFront`: boxes of what comes before the row (the ring, the number bubbles, the constraint bubbles): it slides out of their way, or fades if there is no room (`in_264`).
     */
    update(bar: { icons: BarIcon[]; gear: BarGear | null } | null, items: { id: string; label: string }[] | null, at: [number, number] | null, inFront: [number, number, number, number][] = []) {
      const icons = bar?.icons ?? [], gear = bar?.gear ?? null, offers = items ?? [];
      if ((!icons.length && !gear && !offers.length) || !at) { row.style.display = "none"; sig = ""; open = false; list.style.display = "none"; for (const el of offered.values()) el.remove(); offered.clear(); seg.style.display = "none"; return; }
      const now = JSON.stringify([icons, gear]);
      if (now !== sig) {
        sig = now;
        const kids: HTMLElement[] = [];
        for (const ic of icons) {
          const b = roundButton({ icon: ic.icon, size: 28, title: ic.title });
          if (ic.on) { b.style.background = "#d6e8ff"; b.style.borderColor = "#2f6fe0"; }
          b.addEventListener("click", (e) => { e.stopPropagation(); pop(b); run(ic.id); });
          kids.push(b);
        }
        if (gear) {
          const g = roundButton({ icon: "gear", size: 28, title: "This is a gear: edit it or make one that meshes with it" });
          g.addEventListener("click", (e) => { e.stopPropagation(); open = !open; list.style.display = open ? "flex" : "none"; });
          kids.push(g);
          list.replaceChildren();
          for (const it of gear.items) {
            const item = document.createElement("div");
            item.style.cssText = `display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;font:13px system-ui,sans-serif;white-space:nowrap;${it.enabled ? "cursor:pointer;color:#222" : "color:#999;cursor:default"}`;
            item.innerHTML = `${iconSvg(it.icon)}<span>${it.label}</span>`;
            item.title = it.enabled ? "" : it.why ?? "";
            if (it.enabled) {
              item.addEventListener("mouseenter", () => { item.style.background = "#eef7f7"; });
              item.addEventListener("mouseleave", () => { item.style.background = ""; });
              item.addEventListener("click", (e) => { e.stopPropagation(); open = false; list.style.display = "none"; run(it.id, gear.part); });
            }
            list.appendChild(item);
          }
        } else { open = false; list.style.display = "none"; }
        iconsBox.replaceChildren(...kids);
        iconsBox.style.display = kids.length ? "flex" : "none";
      }
      // the suggested constraints: each stays as it is while it is on offer, comes in fading up, and goes out fading when it is applied (or no longer fits), `in_1177`
      const want = new Set(offers.map((o) => o.id));
      for (const o of offers) {
        if (offered.has(o.id)) continue;
        const b = roundButton({ icon: o.id === "fixed" ? "unlock" : iconKey(o.id), size: 28, title: o.label }); // (Fix in place offered: an open padlock to close; once it is made its bubble shows the closed one, `in_292`)
        b.style.transition = "opacity .25s, transform .25s";
        b.style.opacity = "0";
        b.addEventListener("click", (e) => { e.stopPropagation(); pop(b); run(o.id); }); // (it pops; if the constraint is made it is no longer on offer and fades out, else it stays)
        seg.appendChild(b);
        offered.set(o.id, b);
        requestAnimationFrame(() => { b.style.opacity = "1"; });
      }
      for (const [id, el] of [...offered]) {
        if (want.has(id)) continue;
        offered.delete(id);
        el.style.pointerEvents = "none";
        el.style.opacity = "0";
        el.style.transform = "scale(.6)";
        setTimeout(() => { el.remove(); if (!offered.size) seg.style.display = "none"; }, 280);
      }
      const order = offers.map((o) => offered.get(o.id)!).filter(Boolean);
      for (const el of order) seg.appendChild(el); // (in the order offered; the ones fading out stay where they were)
      seg.style.display = offered.size || seg.childElementCount ? "flex" : "none";
      sep.style.display = (iconsBox.style.display !== "none" || !!gear) && seg.style.display !== "none" ? "block" : "none"; // (the icons to the left, the constraints to the right)
      row.style.display = "flex";
      // below the number bubble that sits on the part, unless something in front is there: placed like a bubble whose own place is that one
      const w = row.offsetWidth || 40;
      const p = placeBubbles([{ id: "row", x: at[0] + w / 2 - 20, y: at[1] + 77, w }], { lines: [], dots: [], rects: inFront }, memory)[0]!;
      row.style.left = `${Math.round(p.left)}px`;
      row.style.top = `${Math.round(p.top)}px`;
      row.style.opacity = p.faded ? "0.3" : "";
      row.style.pointerEvents = p.faded ? "none" : "";
    },
  };
}
