// The page that asks the questions of the Import and Export dialogs (`dec_import_export_menu`): it draws a description (`interaction/transfer.ts`) and gives back the answers, or null when it is cancelled. It knows nothing of what the choices mean.
import type { Dialog, Field, FieldValue } from "../interaction/transfer.ts";
import { textButton, guardOpenClicks } from "./look.ts";

export type Values = Record<string, FieldValue>;
const valuesOf = (d: Dialog): Values => Object.fromEntries(d.fields.map((f) => [f.id, f.value]));

export function createDialog(host: HTMLElement) {
  const veil = document.createElement("div");
  veil.style.cssText = "position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(20,22,26,.32);z-index:1000;font:14px system-ui,sans-serif";
  const card = document.createElement("div");
  card.style.cssText = "background:#fff;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.25);padding:18px 20px;min-width:320px;max-width:min(520px,92vw);max-height:90vh;overflow:auto";
  veil.appendChild(card);
  const armed = guardOpenClicks(veil); // (the press that opened the dialog must not click on it, `in_599`)
  host.appendChild(veil);
  let finish: ((v: Values | null) => void) | null = null;
  let current: Values = {};
  // while a question is open its keys are its own, wherever the focus is: Escape cancels, Enter answers (a button keeps its own Enter), and no key goes on to the page's shortcuts (a letter typed in the name must not start the game mode)
  const onKey = (e: KeyboardEvent): void => {
    if (!finish) return;
    e.stopPropagation();
    if (e.key === "Escape") { e.preventDefault(); close(null); }
    else if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); close({ ...current }); }
  };
  const close = (v: Values | null) => { veil.style.display = "none"; window.removeEventListener("keydown", onKey, true); window.removeEventListener("keyup", onKey, true); const f = finish; finish = null; f?.(v); };
  veil.addEventListener("contextmenu", (e) => e.preventDefault());
  veil.addEventListener("pointerdown", (e) => { e.stopPropagation(); if (e.target === veil) close(null); });

  let live = false;
  const line = (text: string, css: string): HTMLElement => { const d = document.createElement("div"); d.textContent = text; d.style.cssText = css; return d; };
  const draw = (build: (v: Values) => Dialog, values: Values): void => {
    const dlg = build(values);
    // a value the description no longer offers (a format that has gone) falls back to what it says now
    for (const f of dlg.fields) if (!(f.id in values) || (f.type === "choice" && !f.choices!.some((c) => c.value === values[f.id] && !c.disabled))) values[f.id] = f.value;
    card.replaceChildren(line(dlg.title, "font-weight:600;font-size:16px;margin-bottom:12px"));
    const redraw = () => draw(build, values);
    live = dlg.fields.some((f) => f.type === "picture"); // (a dialog that shows a picture of the answers draws it again when a typed answer is finished)
    for (const f of dlg.fields) card.appendChild(row(f, values, redraw));
    const bar = document.createElement("div");
    bar.style.cssText = "display:flex;gap:8px;justify-content:flex-end;margin-top:16px";
    const button = (label: string, primary: boolean, click: () => void) => textButton(label, { tone: primary ? "primary" : "plain", click });
    bar.append(button("Cancel", false, () => close(null)), button(dlg.ok, true, () => close({ ...values })));
    card.appendChild(bar);
  };
  const row = (f: Field, values: Values, redraw: () => void): HTMLElement => {
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
      grid.style.cssText = cards ? `display:grid;grid-template-columns:repeat(${Math.min(f.choices!.length, 5)},1fr);gap:8px` : "display:flex;flex-wrap:wrap;gap:6px";
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
      if (f.type === "number") i.step = "any";
      i.value = String(values[f.id] ?? f.value);
      i.style.cssText = "width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #cfd0d4;border-radius:8px;font:inherit";
      i.addEventListener("input", () => { values[f.id] = f.type === "number" ? Number(i.value) : i.value; });
      i.addEventListener("change", () => { if (live) redraw(); }); // (the picture follows a number once it is typed)
      r.appendChild(i);
    }
    if (f.note && f.type !== "check") r.appendChild(line(f.note, "font-size:12px;color:#777;margin-top:3px"));
    return r;
  };

  return {
    /** Ask: `build` makes the description from the answers so far (it is asked again at every change, so a choice can change what else is asked); resolves to the answers, or null. */
    open(build: (v: Values) => Dialog, initial: Values): Promise<Values | null> {
      if (finish) close(null);
      const values: Values = { ...initial };
      current = values;
      armed();
      draw(build, values);
      veil.style.display = "flex";
      const first = card.querySelector("input"); // (a question that begins with a text to type, as the material's does, has the cursor in it: the others begin with a choice)
      if (first && first.type === "text") { first.focus(); first.select(); }
      window.addEventListener("keydown", onKey, true);
      window.addEventListener("keyup", onKey, true);
      return new Promise((resolve) => { finish = resolve; });
    },
    get isOpen() { return veil.style.display !== "none"; },
  };
}
