// The chip that follows "select similar" (`in_257`): how many were selected and one box for each rule, so a rule can be loosened (size off: every straight edge like this one) or tightened (direction on).
import { PILL, choiceRow } from "./look.ts";
export interface SimilarView { rules: { id: string; label: string; title: string; on: boolean }[]; count: number; noun: string }

export function createSimilarChip(host: HTMLElement, toggle: (rule: string) => void) {
  const chip = document.createElement("div");
  chip.style.cssText = PILL + ";bottom:108px;left:50%;transform:translateX(-50%)";
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
      choiceRow(boxes, v.rules.map((r) => ({ id: r.id, text: `${r.on ? "✓" : "○"} ${r.label}`, title: r.title, on: r.on })), toggle);
    },
  };
}
