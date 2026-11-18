// The helper bar of the hardware holes tool (`dec_parts_tool`, `in_850` to `in_852`): a small pill at the top of the page, in the style of the operation bar, with the few settings of a row of holes as small boxes to type in or choose
// from, and a check and a cross. The surfaces are chosen in the view (a face, or a line), the holes are drawn there as the numbers change, and this bar only holds the numbers. It knows nothing of what they mean: it shows a
// description and reports the values.
import { roundButton } from "./look.ts";

export interface HoleBarValues { kind: string; size: string; by: string; value: string; ends: string; corners: string; offset: string; depth: string }
/** What the bar shows: the choices of the receiver and the size, the numbers, which surface is selected (a face, a line, or none yet), and a line of words (how many holes, or why none). */
export interface HoleBarView { kinds: { id: string; label: string }[]; sizes: string[]; values: HoleBarValues; mode: "face" | "line" | "picked" | "none"; note: string; problem: string | null }
export interface HoleBarHandlers { change(values: HoleBarValues): void; commit(): void; close(): void }

const INK = "background:#4a4d54;color:#fff;border:1px solid #5d6068;border-radius:12px;font:13px system-ui,sans-serif;height:26px;box-sizing:border-box";
export function createHoleBar(host: HTMLElement, h: HoleBarHandlers) {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;z-index:7;top:12px;left:50%;transform:translateX(-50%);display:none;flex-direction:column;align-items:center;gap:4px;max-width:calc(100vw - 16px);user-select:none;-webkit-user-select:none;touch-action:manipulation";
  const pill = document.createElement("div");
  pill.style.cssText = "display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:6px;min-height:40px;padding:4px 6px 4px 14px;border-radius:20px;background:#34363b;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.25)";
  const note = document.createElement("div");
  note.style.cssText = "font:12px system-ui,sans-serif;padding:2px 10px;border-radius:10px;background:rgba(52,54,59,.9);color:#e8e8ea;max-width:min(560px,calc(100vw - 24px))";
  el.append(pill, note);
  host.appendChild(el);
  for (const t of ["pointerdown", "pointerup", "wheel", "contextmenu", "click"]) el.addEventListener(t, (e) => { e.stopPropagation(); if (t === "contextmenu" && !(e.target instanceof HTMLInputElement)) e.preventDefault(); });

  const words = (text: string): HTMLSpanElement => { const s = document.createElement("span"); s.textContent = text; s.style.cssText = "font:600 13px system-ui,sans-serif;white-space:nowrap"; return s; };
  const select = (): HTMLSelectElement => { const s = document.createElement("select"); s.style.cssText = `${INK};padding:0 6px;cursor:pointer`; return s; };
  const box = (width: number, placeholder = ""): HTMLInputElement => { const i = document.createElement("input"); i.type = "text"; i.inputMode = "decimal"; i.placeholder = placeholder; i.style.cssText = `${INK};width:${width}px;padding:0 8px;text-align:center`; return i; };
  const group = (...kids: HTMLElement[]): HTMLSpanElement => { const g = document.createElement("span"); g.style.cssText = "display:inline-flex;align-items:center;gap:4px"; g.append(...kids); return g; };
  const fill = (s: HTMLSelectElement, items: readonly { id: string; label: string }[], value: string): void => {
    const sig = items.map((i) => i.id + i.label).join("|");
    if (s.dataset.sig !== sig) { s.replaceChildren(...items.map((i) => { const o = document.createElement("option"); o.value = i.id; o.textContent = i.label; return o; })); s.dataset.sig = sig; }
    if (s.value !== value) s.value = value;
  };
  const kind = select(), size = select(), by = select(), ends = select(), corners = select();
  const value = box(46), offset = box(46), depth = box(50, "through");
  const mode = words("");
  const insetG = group(words("Inset"), offset);
  const endsG = group(words("Ends"), ends);
  const cornersG = group(words("Corners"), corners);
  const tick = roundButton({ icon: "check", size: 28, tone: "dark", title: "Cut the holes (Enter)" });
  const cross = roundButton({ icon: "cross", size: 28, tone: "dark", title: "Close (Esc)" });
  tick.addEventListener("click", (e) => { e.stopPropagation(); h.commit(); });
  cross.addEventListener("click", (e) => { e.stopPropagation(); h.close(); });
  pill.append(words("Holes"), kind, size, mode, by, value, insetG, cornersG, endsG, group(words("Depth"), depth), tick, cross);
  const read = (): HoleBarValues => ({ kind: kind.value, size: size.value, by: by.value, value: value.value, ends: ends.value, corners: corners.value, offset: offset.value, depth: depth.value });
  for (const c of [kind, size, by, ends, corners]) c.addEventListener("change", () => h.change(read()));
  for (const c of [value, offset, depth]) c.addEventListener("input", () => h.change(read())); // (the preview follows each key)
  const setText = (i: HTMLInputElement, v: string) => { if (document.activeElement !== i && i.value !== v) i.value = v; };
  return {
    update(v: HoleBarView | null): void {
      if (!v) { el.style.display = "none"; return; }
      el.style.display = "flex";
      fill(kind, v.kinds, v.values.kind);
      fill(size, v.sizes.map((s) => ({ id: s, label: s })), v.values.size);
      fill(by, [{ id: "distance", label: "Every" }, { id: "count", label: "Number" }], v.values.by === "count" ? "count" : "distance");
      fill(ends, [{ id: "fit", label: "fit" }, { id: "remainder", label: "leave rest" }, { id: "centre", label: "centre" }], v.values.ends);
      fill(corners, [{ id: "each", label: "every corner" }, { id: "ignore", label: "none" }, { id: "inward", label: "from corners" }], v.values.corners);
      setText(value, v.values.value);
      setText(offset, v.values.offset);
      setText(depth, v.values.depth);
      mode.textContent = v.mode === "face" ? "along the outline" : v.mode === "line" ? "along the line" : v.mode === "picked" ? "at the places picked" : "select a face or a line";
      const distance = v.values.by !== "count";
      value.title = distance ? "the distance between holes, mm" : "how many holes";
      value.placeholder = distance ? "mm" : "n";
      const rules = v.mode === "face" || v.mode === "line"; // (the spacing and the rest are for a path)
      by.style.display = value.style.display = rules ? "" : "none";
      insetG.style.display = v.mode === "face" ? "inline-flex" : "none";
      cornersG.style.display = v.mode === "face" ? "inline-flex" : "none";
      endsG.style.display = v.mode === "line" && distance ? "inline-flex" : "none";
      note.textContent = v.problem ?? v.note;
      note.style.display = note.textContent ? "block" : "none";
      note.style.background = v.problem ? "rgba(120,80,0,.92)" : "rgba(52,54,59,.9)";
    },
    contains(t: EventTarget | null): boolean { return t instanceof Node && el.contains(t); },
  };
}
