// Cut (`in_294`): each part the selected bodies make has a round control with a plus (kept) or a minus (tossed) and its letter; one more says whether what is kept is joined where it touches or kept as separate bodies.
// It only draws and reports clicks; which parts there are and what is kept is the interaction layer's.
export function createCutParts(host: HTMLElement, toggle: (mask: number) => void, join: () => void) {
  const root = document.createElement("div");
  root.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;z-index:7;font:600 13px system-ui,sans-serif";
  host.appendChild(root);
  const joinEl = document.createElement("div");
  joinEl.style.cssText = "position:fixed;z-index:7;left:50%;transform:translateX(-50%);top:64px;display:none;height:32px;padding:0 14px;border-radius:16px;background:#34363b;color:#fff;align-items:center;cursor:pointer;user-select:none;-webkit-user-select:none;touch-action:manipulation;box-shadow:0 2px 8px rgba(0,0,0,.25)";
  joinEl.addEventListener("pointerdown", (e) => e.stopPropagation());
  joinEl.addEventListener("click", (e) => { e.stopPropagation(); join(); });
  host.appendChild(joinEl);
  const els = new Map<number, HTMLElement>();
  return {
    /** `parts`: where each control stands (page pixels), its letters and whether it is kept; null hides all. */
    update(parts: { mask: number; at: [number, number]; label: string; tip: string; kept: boolean }[] | null, joined = true) {
      if (!parts) { root.style.display = "none"; joinEl.style.display = "none"; return; }
      root.style.display = "block";
      joinEl.style.display = "flex";
      joinEl.textContent = joined ? "Kept parts are joined \u2022 tap to keep them separate" : "Kept parts stay separate \u2022 tap to join them";
      for (const p of parts) {
        let el = els.get(p.mask);
        if (!el) {
          el = document.createElement("div");
          el.style.cssText = "position:fixed;left:0;top:0;height:34px;padding:0 10px;border-radius:17px;display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none;-webkit-user-select:none;touch-action:manipulation;box-shadow:0 2px 8px rgba(0,0,0,.25);border:2px solid #fff";
          el.addEventListener("pointerdown", (e) => e.stopPropagation());
          el.addEventListener("click", (e) => { e.stopPropagation(); toggle(p.mask); });
          root.appendChild(el);
          els.set(p.mask, el);
        }
        el.title = `${p.tip}: ${p.kept ? "kept (tap to toss it)" : "tossed (tap to keep it)"}`;
        el.style.background = p.kept ? "#1ab8b3" : "#8d9097";
        el.style.color = "#fff";
        el.innerHTML = `<span style="font-size:18px;line-height:1">${p.kept ? "+" : "\u2212"}</span><span>${p.label}</span>`;
        el.style.transform = `translate(${Math.round(p.at[0] - 30)}px, ${Math.round(p.at[1] - 17)}px)`;
        el.style.display = "flex";
      }
      for (const [mask, el] of els) if (!parts.some((p) => p.mask === mask)) el.style.display = "none";
    },
  };
}
