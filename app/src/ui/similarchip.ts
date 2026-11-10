// The chip that follows "select similar" (`in_257`): how many were selected and one box for each rule, so a rule can be loosened (size off: every straight edge like this one) or tightened (direction on).
export interface SimilarView { rules: { id: string; label: string; title: string; on: boolean }[]; count: number; noun: string }

export function createSimilarChip(host: HTMLElement, toggle: (rule: string) => void) {
  const chip = document.createElement("div");
  chip.style.cssText = "position:fixed;z-index:7;bottom:64px;left:50%;transform:translateX(-50%);display:none;align-items:center;gap:8px;height:36px;padding:0 12px;border-radius:18px;background:rgba(32,34,38,.92);color:#fff;font:13px system-ui,sans-serif;white-space:nowrap";
  const label = document.createElement("span");
  const boxes = document.createElement("span");
  boxes.style.cssText = "display:inline-flex;gap:6px";
  chip.append(label, boxes);
  host.appendChild(chip);
  let shown = "";
  return {
    update(v: SimilarView | null) {
      if (!v) { chip.style.display = "none"; shown = ""; return; }
      const sig = JSON.stringify(v);
      if (sig === shown) return;
      shown = sig;
      chip.style.display = "flex";
      label.textContent = `${v.count} similar ${v.noun}${v.count === 1 ? "" : "s"}:`;
      boxes.replaceChildren(...v.rules.map((r) => {
        const b = document.createElement("label");
        b.style.cssText = `display:inline-flex;align-items:center;gap:3px;cursor:pointer;padding:3px 8px;border-radius:12px;background:${r.on ? "#1ab8b3" : "rgba(255,255,255,.16)"};color:${r.on ? "#06312f" : "#fff"}`;
        b.title = r.title;
        b.textContent = `${r.on ? "✓" : "○"} ${r.label}`;
        b.addEventListener("click", (e) => { e.stopPropagation(); toggle(r.id); });
        return b;
      }));
    },
  };
}
