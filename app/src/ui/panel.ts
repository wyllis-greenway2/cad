// The list card opened from the ⋯ menu (`in_132`): the bodies with their names, or the history of steps. It displays what the interaction layer says and reports which row was chosen.
import { iconSvg } from "./icons.ts";

export interface PanelData { kind: string; title: string; rows: { detail?: string; param?: { name: string; expr: string; value: number | null }; id: string; label: string; active: boolean; removable: boolean; edit?: boolean; error?: string; sketch?: boolean; hidden?: boolean; future?: boolean; current?: boolean; fields?: { key: string; label: string; value: number; expr?: string }[]; open?: boolean }[]; note?: string; actions?: { id: string; label: string; title: string }[]; tabs?: { id: string; label: string; on: boolean }[] }
export interface PanelHandlers { row(id: string, act: "select" | "remove" | "sketch" | "edit" | "hide"): void; action(id: string): void; go(id: string): void; tab(id: string): void; edit(id: string): void; set(id: string, key: string, value: number): void; link(id: string, key: string, expr: string): void; param(name: string, expr: string): void; unparam(name: string): void; undo(): void; redo(): void; close(): void }

export function createPanel(host: HTMLElement, h: PanelHandlers) {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;left:14px;top:14px;display:none;min-width:200px;max-width:280px;max-height:60vh;overflow:auto;background:#fff;border:1px solid #cfd0d4;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.14);padding:6px;font:13px system-ui,sans-serif;color:#2b2b2d;z-index:9;user-select:none;-webkit-user-select:none";
  host.appendChild(el);
  let sig = "";
  const btn = (text: string, title: string, on: () => void): HTMLElement => {
    const b = document.createElement("div");
    b.innerHTML = text;
    b.title = title;
    b.style.cssText = "display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:26px;border-radius:7px;cursor:pointer";
    b.addEventListener("pointerenter", () => (b.style.background = "#eef6f6"));
    b.addEventListener("pointerleave", () => (b.style.background = ""));
    b.addEventListener("click", (e) => { e.stopPropagation(); on(); });
    return b;
  };
  return {
    update(p: PanelData | null) {
      if (!p) { el.style.display = "none"; sig = ""; return; }
      const now = JSON.stringify(p);
      if (now === sig) return;
      sig = now;
      el.replaceChildren();
      const head = document.createElement("div");
      head.style.cssText = "display:flex;align-items:center;gap:4px;padding:2px 4px 6px";
      const title = document.createElement("span");
      title.textContent = p.title;
      title.style.cssText = "font-weight:600;flex:1";
      head.appendChild(title);
      if (p.kind === "history") { head.appendChild(btn("↶", "Undo", h.undo)); head.appendChild(btn("↷", "Redo", h.redo)); }
      head.appendChild(btn(iconSvg("cross"), "Close", h.close));
      el.appendChild(head);
      if (p.tabs?.length) {
        const bar = document.createElement("div");
        bar.style.cssText = "display:flex;gap:2px;padding:0 4px 6px";
        for (const t of p.tabs) { const b = btn(t.label, "", () => { if (!t.on) h.tab(t.id); }); b.style.cssText += `;flex:1;padding:0 8px;font-size:12px;${t.on ? "background:#dff1f0;font-weight:600" : "border:1px solid #e1e2e5"}`; if (t.on) b.onpointerleave = () => (b.style.background = "#dff1f0"); bar.appendChild(b); }
        el.appendChild(bar);
      }
      if (p.actions?.length) {
        const bar = document.createElement("div");
        bar.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;padding:0 4px 6px";
        for (const a of p.actions) { const b = btn(a.label, a.title, () => h.action(a.id)); b.style.cssText += ";padding:0 8px;font-size:12px;border:1px solid #cfd0d4"; bar.appendChild(b); }
        el.appendChild(bar);
      }
      if (p.note) { const note = document.createElement("div"); note.textContent = p.note; note.style.cssText = "padding:0 8px 6px;font-size:12px;color:#6b6e75"; el.appendChild(note); }
      for (const r of p.rows) {
        const row = document.createElement("div");
        row.style.cssText = `display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:7px;cursor:${p.kind === "bodies" || p.kind === "groups" || p.kind === "history" || p.kind === "sketches" ? "pointer" : "default"};background:${r.active || r.current ? "#dff1f0" : ""};opacity:${r.future ? ".45" : "1"}`;
        const label = document.createElement("span");
        label.textContent = r.label;
        label.style.flex = "1";
        if (r.detail) { label.textContent = ""; const a = document.createElement("div"); a.textContent = r.label; const d = document.createElement("div"); d.textContent = r.detail; d.style.cssText = "font-size:11px;color:#6b6e75;font-weight:400"; label.append(a, d); }
        if (r.error) { label.style.color = "#c0392b"; row.title = r.error; label.textContent = `${r.label} ✕`; } // a step that could not be made: red, the reason on hover
        row.appendChild(label);
        if (r.param) {
          label.textContent = "";
          const nm = document.createElement("div"); nm.textContent = r.param.name; nm.style.fontWeight = "600";
          const val = document.createElement("div"); val.textContent = r.param.value === null ? "no value" : `= ${Math.round(r.param.value * 1e6) / 1e6}`; val.style.cssText = `font-size:11px;color:${r.error ? "#c0392b" : "#6b6e75"}`;
          if (r.detail) val.textContent += ` · ${r.detail}`;
          label.append(nm, val);
          const input = document.createElement("input");
          input.type = "text"; input.value = r.param.expr; input.title = r.error ?? "the number, or a formula of other parameters";
          input.style.cssText = "width:92px;padding:3px 6px;border:1px solid #cfd0d4;border-radius:6px;font:12px system-ui,sans-serif";
          const commit = () => { const t = input.value.trim(); if (t && t !== r.param!.expr) h.param(r.param!.name, t); };
          input.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") { commit(); input.blur(); } });
          input.addEventListener("change", commit);
          input.addEventListener("click", (e) => e.stopPropagation());
          row.appendChild(input);
        }
        if (r.hidden !== undefined) { label.style.opacity = r.hidden ? ".45" : "1"; row.appendChild(btn(iconSvg(r.hidden ? "eyeOff" : "eye"), r.hidden ? "Hidden: show this body" : "Shown: hide this body", () => h.row(r.id, "hide"))); }
        if (r.sketch !== undefined) { const b = btn(iconSvg("sketch"), r.sketch ? "Put the sketch away" : "Show the sketch this extrusion was made from", () => h.row(r.id, "sketch")); if (r.sketch) b.style.background = "#dff1f0"; row.appendChild(b); }
        if (r.edit) row.appendChild(btn(iconSvg("linear"), "Change the numbers of this repeat", () => h.row(r.id, "edit")));
        if (r.fields?.length) { const b = btn(iconSvg("pencil"), r.open ? "Close the numbers of this step" : "Change the numbers of this step", () => h.edit(r.id)); if (r.open) b.style.background = "#dff1f0"; row.appendChild(b); }
        if (r.removable) row.appendChild(btn(iconSvg("cross"), p.kind === "parameters" ? "Take this parameter away (refused while something uses it)" : p.kind === "groups" ? "Break this group (what is inside it stays grouped)" : p.kind === "bodies" ? "Delete this body (with the steps and sketches that made it)" : "Take this step out", () => h.row(r.id, "remove")));
        if (p.kind === "bodies" || p.kind === "groups") row.addEventListener("click", () => h.row(r.id, "select"));
        if (p.kind === "sketches" && r.sketch !== undefined) row.addEventListener("click", () => h.row(r.id, "sketch"));
        if (p.kind === "parameters") row.style.cursor = "default";
        if (p.kind === "history") { row.title = r.future ? "A step that comes after: go to it" : "Go to this step: the model as it was when it had been made"; row.addEventListener("click", () => h.go(r.id)); }
        if (r.current) label.style.fontWeight = "600";
        el.appendChild(row);
        if (r.open && r.fields) {
          const box = document.createElement("div");
          box.style.cssText = "display:flex;flex-direction:column;gap:4px;padding:2px 8px 8px 20px";
          for (const f of r.fields) {
            const line = document.createElement("label");
            line.style.cssText = "display:flex;align-items:center;gap:8px;font-size:12px";
            const name = document.createElement("span"); name.textContent = f.label; name.style.flex = "1";
            const input = document.createElement("input");
            input.type = "text"; input.value = f.expr ?? String(f.value); input.title = f.expr ? `a formula: now ${f.value}` : "a number, or a name or formula of parameters";
            input.style.cssText = "width:84px;padding:3px 6px;border:1px solid #cfd0d4;border-radius:6px;font:12px system-ui,sans-serif";
            const commit = () => { const t = input.value.trim(); if (t === "" || t === (f.expr ?? String(f.value))) return; if (/^-?(\d+\.?\d*|\.\d+)$/.test(t)) h.set(r.id, f.key, Number(t)); else h.link(r.id, f.key, t); };
            input.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") { commit(); input.blur(); } });
            input.addEventListener("change", commit);
            input.addEventListener("click", (e) => e.stopPropagation());
            line.append(name, input);
            box.appendChild(line);
          }
          el.appendChild(box);
        }
      }
      if (p.kind === "parameters") {
        const add = document.createElement("div");
        add.style.cssText = "display:flex;gap:4px;padding:6px 8px 4px;align-items:center";
        const mk = (ph: string, w: number) => { const i = document.createElement("input"); i.type = "text"; i.placeholder = ph; i.style.cssText = `width:${w}px;padding:3px 6px;border:1px solid #cfd0d4;border-radius:6px;font:12px system-ui,sans-serif`; i.addEventListener("keydown", (e) => { e.stopPropagation(); }); return i; };
        const nm = mk("name", 70), ex = mk("value or formula", 96);
        const go = () => { const n = nm.value.trim(), x = ex.value.trim(); if (n && x) { h.param(n, x); } };
        ex.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
        add.append(nm, ex, btn("+", "Add this parameter", go));
        el.appendChild(add);
      }
      if (!p.rows.length && p.kind !== "parameters") { const none = document.createElement("div"); none.textContent = "—"; none.style.cssText = "padding:6px 8px;opacity:.5"; el.appendChild(none); }
      el.style.display = "block";
    },
  };
}
