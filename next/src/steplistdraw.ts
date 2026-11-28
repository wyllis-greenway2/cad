// The step list on the page (`in_1567`, `q_lean_ui`): a small panel at the top left, shown when the "..." menu's History item is on (`in_1600`) and there is a step. Each step of the recipe: its icon
// and name, a mark when the engine flagged it (with its words), and its numbers as pills to type over (the same pill as the bubbles'). It draws `interaction/steplist.ts`'s rows and says what was typed; it decides nothing.
import { equal } from "./equal.ts";
import { iconSvg } from "./icons.ts";
import type { Row } from "./interaction/steplist.ts";
import { settings } from "./settings.ts";

export interface StepListHandlers {
  edit(step: string, key: string, value: number): void;
}
export interface StepListState {
  rows: Row[];
}
const TONE = { ok: "#d6d7db", flagged: "#e0a82e", orphaned: "#e46a6a", unknown: "#d6d7db" } as const;

export function createStepList(host: HTMLElement, h: StepListHandlers) {
  const el = document.createElement("div");
  el.style.cssText = `position:fixed;left:12px;top:12px;display:none;flex-direction:column;gap:6px;z-index:8;max-width:300px;font:12px ${settings.ui.font};color:${settings.ui.text};user-select:none;-webkit-user-select:none`;
  el.addEventListener("pointerdown", (e) => e.stopPropagation());
  el.addEventListener("contextmenu", (e) => e.preventDefault());
  host.appendChild(el);
  let sig: unknown = null, // (what is drawn now; null: nothing, or it must be drawn again)
    editing = false;
  function pill(row: Row, n: Row["numbers"][number]): HTMLElement {
    const d = document.createElement("div"),
      val = document.createElement("span");
    d.style.cssText =
      "display:flex;align-items:center;gap:5px;padding:2px 8px;border-radius:12px;background:#fff;border:1px solid #d6d7db;white-space:nowrap";
    const label = document.createElement("span");
    label.textContent = n.label;
    label.style.cssText = "opacity:.65;overflow:hidden;text-overflow:ellipsis;max-width:150px";
    val.textContent = `${Math.round(n.value * 1000) / 1000}${n.unit === "deg" ? "°" : ""}`;
    val.style.cssText = "font-weight:600;cursor:text";
    val.title = "Type a new number";
    val.dataset.number = `${row.id}:${n.key}`;
    val.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const input = document.createElement("input");
      input.value = String(Math.round(n.value * 1000) / 1000);
      input.style.cssText = `width:${Math.max(4, input.value.length + 1)}ch;font:inherit;font-weight:600;border:0;outline:0;background:transparent;padding:0`;
      val.replaceWith(input);
      input.focus();
      input.select();
      editing = true;
      const done = (commit: boolean) => {
        if (!editing) return;
        editing = false;
        const v = Number(input.value.trim());
        if (commit && input.value.trim() !== "" && isFinite(v) && v !== n.value) h.edit(row.id, n.key, v);
        sig = null;
      };
      input.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") done(true);
        else if (e.key === "Escape") done(false);
      });
      input.addEventListener("blur", () => done(false));
    });
    d.append(label, val);
    return d;
  }
  return {
    show(st: StepListState): void {
      if (!st.rows.length) {
        el.style.display = "none";
        return;
      }
      el.style.display = "flex";
      if (equal(st, sig) || editing) return;
      sig = st;
      const rows = st.rows.map((r) => {
        const box = document.createElement("div");
        box.dataset.step = r.id;
        box.style.cssText = `display:flex;flex-direction:column;gap:4px;padding:6px 8px;border-radius:12px;background:rgba(255,255,255,.92);border:1px solid ${TONE[r.status]};box-shadow:0 1px 3px rgba(0,0,0,.12)`;
        const t = document.createElement("div");
        t.style.cssText = "display:flex;align-items:center;gap:6px;font-weight:600";
        const i = document.createElement("span");
        i.innerHTML = iconSvg(r.icon);
        i.style.display = "flex";
        t.append(i, document.createTextNode(r.title));
        box.append(t);
        if (r.status === "flagged" || r.status === "orphaned") {
          const w = document.createElement("div");
          w.textContent = r.why || r.status;
          w.style.cssText = `font-weight:400;color:${r.status === "orphaned" ? "#c44" : "#a06b00"};white-space:normal`;
          box.append(w);
        }
        for (const n of r.numbers) box.append(pill(r, n));
        return box;
      });
      el.replaceChildren(...rows);
    },
    editing: (): boolean => editing,
  };
}
