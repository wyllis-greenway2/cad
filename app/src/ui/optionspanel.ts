// The options panel (`dec_parts_tool`, `in_847`): the settings of a tool as a panel that stands still on the left of the page beside the model view, drawn from the same field descriptions as a dialog (`ui/fields.ts`), so a choice of a
// card or a chip, a number typed, answers at once and the preview in the view follows. It knows nothing of what the fields mean: it shows a description (title, fields, a message, two buttons) and reports the values.
import type { Dialog } from "../interaction/transfer.ts";
import type { Values } from "./fields.ts";
import { fieldRow, line } from "./fields.ts";
import { textButton } from "./look.ts";

export interface OptionsHandlers { change(values: Values): void; commit(): void; close(): void }
/** What the panel shows: a dialog's description, a line that says why nothing can be done yet (null when it can), and the label of the main button. */
export interface Options { dialog: Dialog; message: string | null; action: string }

export function createOptionsPanel(host: HTMLElement, h: OptionsHandlers) {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;left:14px;top:84px;width:min(340px,calc(100vw - 28px));max-height:calc(100vh - 110px);overflow-y:auto;display:none;box-sizing:border-box;padding:12px 14px;background:#fff;border:1px solid #cfd0d4;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.14);font:13px system-ui,sans-serif;z-index:20";
  host.appendChild(el);
  for (const t of ["pointerdown", "pointerup", "wheel", "contextmenu", "click"]) el.addEventListener(t, (e) => { e.stopPropagation(); if (t === "contextmenu") e.preventDefault(); });
  let values: Values = {};
  let sig = "";
  const draw = (o: Options): void => {
    const scroll = el.scrollTop;
    const active = document.activeElement instanceof HTMLInputElement && el.contains(document.activeElement) ? { id: document.activeElement.dataset.field ?? "", at: document.activeElement.selectionStart ?? 0 } : null; // (the cursor in a number being typed)
    const dlg = o.dialog;
    for (const f of dlg.fields) if (!(f.id in values) || (f.type === "choice" && !f.choices!.some((c) => c.value === values[f.id] && !c.disabled))) values[f.id] = f.value;
    el.replaceChildren(line(dlg.title, "font-weight:600;font-size:15px;margin-bottom:8px"));
    if (o.message) el.appendChild(line(o.message, "padding:8px 10px;margin-bottom:8px;border-radius:8px;background:#fff6e5;color:#6b4a00;font-size:12px"));
    const live = dlg.fields.some((f) => f.type === "picture");
    for (const f of dlg.fields) {
      const row = fieldRow(f, values, () => { h.change({ ...values }); }, live, true);
      row.style.margin = "8px 0";
      el.appendChild(row);
    }
    const bar = document.createElement("div");
    bar.style.cssText = "display:flex;gap:8px;justify-content:flex-end;margin-top:12px;position:sticky;bottom:0;background:#fff;padding-top:6px";
    bar.append(textButton("Close", { tone: "plain", click: () => h.close() }), textButton(o.action, { tone: "primary", click: () => h.commit() }));
    el.appendChild(bar);
    el.scrollTop = scroll;
    if (active?.id) { const i = el.querySelector<HTMLInputElement>(`input[data-field="${active.id}"]`); if (i) { i.focus(); i.setSelectionRange(active.at, active.at); } }
  };
  // a number typed answers as it is typed: the preview follows each key
  el.addEventListener("input", (e) => { if (e.target instanceof HTMLInputElement && e.target.type === "text") h.change({ ...values }); });
  return {
    /** Show the panel, or hide it (null). `reset`: take `v` as the values (when the tool is opened); else what was answered stays. */
    update(o: Options | null, v?: Values): void {
      if (!o) { el.style.display = "none"; sig = ""; return; }
      if (v) values = { ...v };
      const now = JSON.stringify([o.dialog, o.message, o.action]);
      if (now === sig && el.style.display !== "none") return;
      sig = now;
      el.style.display = "block";
      draw(o);
    },
    /** The values answered so far. */
    values(): Values { return { ...values }; },
    get isOpen() { return el.style.display !== "none"; },
    contains(t: EventTarget | null): boolean { return t instanceof Node && el.contains(t); },
  };
}
