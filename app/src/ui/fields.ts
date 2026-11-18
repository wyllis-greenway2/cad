// How one field of a dialog description is drawn and how it answers (`interaction/transfer.ts`): choices as radio buttons, cards with a drawing or chips, a picture, text and numbers. Shared by the modal dialog (`dialog.ts`) and the
// options panel that stands beside the model view (`optionspanel.ts`, `dec_parts_tool`), so the two cannot differ. Knows nothing of what the choices mean.
import type { Field, FieldValue } from "../interaction/transfer.ts";

export type Values = Record<string, FieldValue>;
export const line = (text: string, css: string): HTMLElement => { const d = document.createElement("div"); d.textContent = text; d.style.cssText = css; return d; };

/** One field as an element. `redraw` draws the description again (a choice can change what else is asked); `live`: a typed answer draws it again when it is finished (a picture follows it); `compact`: cards in as many columns as fit a narrow panel. */
export function fieldRow(f: Field, values: Values, redraw: () => void, live = false, compact = false): HTMLElement {
  const r = document.createElement("div");
  r.style.cssText = "margin:10px 0";
  const label = line(f.label, "font-size:12px;color:#666;margin-bottom:4px");
  r.appendChild(label);
  if (f.type === "picture") { // (a drawing the program made of the answers so far: not editable)
    label.remove();
    const box = document.createElement("div");
    box.style.cssText = "display:flex;justify-content:center;padding:8px;background:#f6f7f9;border-radius:10px";
    box.innerHTML = String(f.value);
    r.appendChild(box);
  } else if (f.readonly) r.appendChild(line(String(values[f.id] ?? f.value), "padding:2px 0;word-break:break-all"));
  else if (f.type === "choice" && f.layout) { // cards with a drawing each, or chips in a row
    const cards = f.layout === "cards";
    const grid = document.createElement("div");
    grid.style.cssText = cards ? (compact ? "display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:6px" : `display:grid;grid-template-columns:repeat(${Math.min(f.choices!.length, 5)},1fr);gap:8px`) : "display:flex;flex-wrap:wrap;gap:6px";
    for (const c of f.choices!) {
      const on = values[f.id] === c.value;
      const b = document.createElement("button");
      b.type = "button";
      b.disabled = !!c.disabled;
      if (c.disabled) b.title = c.disabled;
      b.setAttribute("aria-pressed", String(on));
      b.style.cssText = `font:inherit;cursor:${c.disabled ? "default" : "pointer"};opacity:${c.disabled ? 0.45 : 1};border:${on ? "2px solid #1f7a7a" : "1px solid #cfd0d4"};background:${on ? "#e8f4f4" : "#fff"};border-radius:${cards ? "10px" : "16px"};padding:${cards ? "6px 6px 8px" : "4px 12px"};display:flex;flex-direction:column;align-items:center;gap:4px;color:#222`;
      if (cards && c.image) { const im = document.createElement("div"); im.innerHTML = c.image; b.appendChild(im); }
      const t = document.createElement("div");
      t.textContent = c.label;
      t.style.cssText = cards ? "font-size:12px;text-align:center;line-height:1.25" : "font-size:13px";
      b.appendChild(t);
      b.addEventListener("click", () => { values[f.id] = c.value; redraw(); });
      grid.appendChild(b);
    }
    r.appendChild(grid);
  } else if (f.type === "choice") {
    for (const c of f.choices!) {
      const l = document.createElement("label");
      l.style.cssText = `display:flex;gap:8px;align-items:center;padding:6px 4px;border-radius:6px;cursor:${c.disabled ? "default" : "pointer"};opacity:${c.disabled ? 0.45 : 1}`;
      if (c.disabled) l.title = c.disabled;
      const i = document.createElement("input");
      i.type = "radio"; i.name = f.id; i.checked = values[f.id] === c.value; i.disabled = !!c.disabled;
      i.addEventListener("change", () => { values[f.id] = c.value; redraw(); });
      l.append(i, document.createTextNode(c.label));
      r.appendChild(l);
    }
  } else if (f.type === "check") {
    const l = document.createElement("label");
    l.style.cssText = "display:flex;gap:8px;align-items:center;cursor:pointer";
    const i = document.createElement("input");
    i.type = "checkbox"; i.checked = !!values[f.id];
    i.addEventListener("change", () => { values[f.id] = i.checked; });
    l.append(i, document.createTextNode(f.note ?? f.label));
    r.appendChild(l);
    label.remove();
    return r;
  } else {
    const i = document.createElement("input");
    i.type = f.type === "number" ? "number" : "text";
    i.dataset.field = f.id; // (so a panel that draws again can put the cursor back)
    if (f.type === "number") i.step = "any";
    i.value = String(values[f.id] ?? f.value);
    i.style.cssText = "width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #cfd0d4;border-radius:8px;font:inherit";
    i.addEventListener("input", () => { values[f.id] = f.type === "number" ? Number(i.value) : i.value; });
    i.addEventListener("change", () => { if (live) redraw(); }); // (the picture follows a number once it is typed)
    r.appendChild(i);
  }
  if (f.note && f.type !== "check") r.appendChild(line(f.note, "font-size:12px;color:#777;margin-top:3px"));
  return r;
}
