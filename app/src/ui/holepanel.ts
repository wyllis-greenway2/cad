// The fastener tool's panel (`dec_parts_tool`, `in_931`, `in_932`): the settings of a row of holes as labelled rows in the same panel as the gear box (`ui/panelkit.ts`), in three groups (the hole, where the holes go, the hardware put in),
// each row with its name, its box, its unit and a line saying what it is. The surfaces are chosen in the view, the holes are drawn there as the numbers change, and this panel only holds the settings. It knows nothing of what they mean: it
// shows a description and reports the values.
import { textButton } from "./look.ts";
import { panelShell, noteBox, setNote, panelTitle, sectionTitle, panelRow, numberInput, choiceSelect, fillSelect, panelButtons } from "./panelkit.ts";
import type { Row } from "./panelkit.ts";

export interface HolePanelValues { kind: string; size: string; by: string; value: string; ends: string; corners: string; offset: string; shift: string; depth: string; far: string; drill: string; insert: string; length: string; rows: string; rowCount: string; rowGap: string }
/** What the panel shows: the choices of the receiver and the size, the values, which surface is selected (a face, a line, or none yet), and a line of words (how many holes, or why none). */
export interface HolePanelView { kinds: { id: string; label: string }[]; sizes: string[]; values: HolePanelValues; mode: "face" | "line" | "picked" | "none"; /** the surface is a round face (`in_946`) */ round?: boolean; /** how thick the body of the face is, and how far everything in the way reaches (`in_949`) */ reach?: { body: number; stack: number }; note: string; problem: string | null }
export interface HolePanelHandlers { change(values: HolePanelValues): void; commit(): void; close(): void; /** make points of the holes, to move with the move tools (`in_980`) */ points(): void }

export function createHolePanel(host: HTMLElement, h: HolePanelHandlers) {
  const el = panelShell(host);
  const warn = noteBox("warn");
  const info = noteBox("info");
  const where = noteBox("info");
  el.append(warn, panelTitle("Fastener tool"), info);
  let read = (): HolePanelValues => ({}) as HolePanelValues;
  const change = (): void => h.change(read());
  const num = (placeholder = ""): HTMLInputElement => numberInput({ placeholder, onInput: change, onEnter: () => h.commit(), onEscape: () => h.close() });
  const rowsFrom = choiceSelect(change), kind = choiceSelect(change), size = choiceSelect(change), far = choiceSelect(change), insert = choiceSelect(change), by = choiceSelect(change), ends = choiceSelect(change), corners = choiceSelect(change);
  const rowCount = num(), rowGap = num(), depth = num("through"), drill = num("auto"), value = num(), offset = num(), shift = num(), length = num("auto");
  const rows = {
    kind: panelRow("Type", kind), size: panelRow("Size", size), drill: panelRow("Drill to", drill, "mm"), depth: panelRow("Depth", depth, "mm"), far: panelRow("Nut", far),
    rowsFrom: panelRow("Line", rowsFrom), rowCount: panelRow("Rows", rowCount), rowGap: panelRow("Row spacing", rowGap, "mm"), by: panelRow("Spacing", by), value: panelRow("Every", value, "mm"), offset: panelRow("Inset", offset, "mm"), shift: panelRow("Shift", shift, "mm"), corners: panelRow("Corners", corners), ends: panelRow("Ends", ends),
    insert: panelRow("Insert", insert), length: panelRow("Length", length, "mm"),
  } satisfies Record<string, Row>;
    rows.drill.hint.textContent = "clearance to here, tapped past it (empty: 1.5 diameters tapped)";
  rows.depth.hint.textContent = "empty goes right through";
  rows.far.hint.textContent = "a nut socket on the far side";
  rows.insert.hint.textContent = "yes: put the screw and nuts into the holes";
  rows.length.hint.textContent = "empty: longest standard that fits";
  el.append(sectionTitle("The hole"), rows.kind.el, rows.size.el, rows.drill.el, rows.depth.el, rows.far.el);
  el.append(sectionTitle("Where"), where, rows.rowsFrom.el, rows.by.el, rows.value.el, rows.offset.el, rows.shift.el, rows.rowCount.el, rows.rowGap.el, rows.corners.el, rows.ends.el);
  const pointsRow = document.createElement("div");
  pointsRow.style.cssText = "padding:8px 0;border-top:1px solid #f0f1f3";
  const pointsBtn = textButton("Make points", { click: () => h.points() });
  pointsBtn.title = "make a point at each hole, to move precisely with the move tools; the holes then follow the points";
  const pointsHint = document.createElement("div");
  pointsHint.textContent = "a point at each hole, to move with the move tools (arrows, typed numbers); the holes follow them";
  pointsHint.style.cssText = "font-size:11.5px;color:#777;margin-top:4px;line-height:1.35";
  pointsRow.append(pointsBtn, pointsHint);
  el.append(pointsRow);
  el.append(sectionTitle("Hardware"), rows.insert.el, rows.length.el);
  el.append(panelButtons({ label: "Close", click: () => h.close() }, { label: "Cut", click: () => h.commit() }));
  read = (): HolePanelValues => ({ kind: kind.value, size: size.value, by: by.value, value: value.value, ends: ends.value, corners: corners.value, offset: offset.value, shift: shift.value, depth: depth.value, far: far.value, rows: rowsFrom.value, rowCount: rowCount.value, rowGap: rowGap.value, drill: drill.value, insert: insert.value, length: length.value });
  const setText = (i: HTMLInputElement, v: string): void => { if (document.activeElement !== i && i.value !== v) i.value = v; };
  const show = (r: Row, on: boolean): void => { r.el.style.display = on ? "" : "none"; };
  return {
    update(v: HolePanelView | null): void {
      if (!v) { el.style.display = "none"; return; }
      el.style.display = "block";
      const distance = v.values.by !== "count";
      fillSelect(kind, v.kinds, v.values.kind);
      fillSelect(size, v.sizes.map((s) => ({ id: s, label: s })), v.values.size);
      fillSelect(by, [{ id: "distance", label: "by distance" }, { id: "count", label: "by number" }], v.values.by === "count" ? "count" : "distance");
      fillSelect(ends, [{ id: "fit", label: "fit" }, { id: "remainder", label: "leave the rest" }, { id: "centre", label: "centre" }], v.values.ends);
      fillSelect(far, [{ id: "none", label: "none" }, { id: "nut", label: "pocket on the other side" }], v.values.far === "nut" ? "nut" : "none");
      fillSelect(corners, distance ? [{ id: "each", label: "every corner" }, { id: "ignore", label: "none" }, { id: "inward", label: "from the corners" }] : [{ id: "each", label: "every corner" }, { id: "ignore", label: "none" }], v.values.corners === "inward" && !distance ? "each" : v.values.corners);
      fillSelect(insert, [{ id: "none", label: "no" }, { id: "screw", label: "yes" }], v.values.insert === "screw" ? "screw" : "none");
      fillSelect(rowsFrom, [{ id: "auto", label: "automatic" }, { id: "outline", label: "edges stepped in" }, { id: "edge", label: "one edge in" }, { id: "midline", label: "one edge, centred" }], v.values.rows === "edge" || v.values.rows === "midline" || v.values.rows === "outline" ? v.values.rows : "auto");
      setText(rowCount, v.values.rowCount);
      setText(rowGap, v.values.rowGap);
      setText(value, v.values.value);
      setText(offset, v.values.offset);
      setText(shift, v.values.shift);
      setText(depth, v.values.depth);
      setText(drill, v.values.drill);
      setText(length, v.values.length);
      const from = v.values.rows === "edge" || v.values.rows === "midline" || v.values.rows === "outline" ? v.values.rows : "auto";
      const rd = (x: number): string => String(Math.round(x * 10) / 10);
      const below = !!v.reach && v.reach.stack > v.reach.body + 1e-6 && !v.round;
      rows.depth.hint.textContent = v.reach && !v.round ? (below ? `empty: right through everything, ${rd(v.reach.stack)} mm (this body is ${rd(v.reach.body)} mm thick)` : `empty: right through (${rd(v.reach.body)} mm)`) : "empty goes right through";
      drill.placeholder = below ? rd(v.reach!.body) : "auto";
      rows.drill.hint.textContent = below ? "clearance to here (the body's thickness), tapped past it" : "clearance to here, tapped past it (empty: 1.5 diameters tapped)";
      rows.value.label.textContent = distance ? "Every" : "Number";
      rows.value.unit.textContent = distance ? "mm" : "";
      rows.value.hint.textContent = distance ? "between holes along the path" : "of holes along the path";
      rows.offset.hint.textContent = from === "auto" ? "the inset wanted: kept clear of the edge and of the face's middle" : "how far in from the edge";
      rows.rowCount.hint.textContent = "lines of holes, each stepped in a further row spacing";
      rows.rowsFrom.hint.textContent = "the lines the rows follow are made from the face's edges";
      rows.shift.hint.textContent = v.mode === "face" ? "walk the holes round the outline" : "move the row along the line";
      rows.corners.hint.textContent = "a hole at each corner (the number counts them), or none";
      rows.ends.hint.textContent = "how the row meets the line's ends";
      const path = v.mode === "face" || v.mode === "line"; // (the spacing and the rest are for a path)
      pointsRow.style.display = v.mode === "none" || v.round ? "none" : "";
      show(rows.by, path); show(rows.value, path); show(rows.shift, path);
      show(rows.rowsFrom, v.mode === "face");
      show(rows.offset, v.mode === "face" && from !== "midline");
      show(rows.rowCount, path); show(rows.rowGap, path && Number(v.values.rowCount) > 1);
      show(rows.corners, v.mode === "face" && from === "outline"); // (automatic chooses the corners itself)
      show(rows.ends, (v.mode === "line" || (v.mode === "face" && (from === "edge" || from === "midline"))) && distance);
      show(rows.drill, v.values.kind === "drillTap");
      show(rows.far, !(v.values.kind === "tapped" || v.values.kind === "nutPocket" || v.values.kind === "drillTap")); // (a nut on the far side goes with a hole right through)
      show(rows.length, v.values.insert === "screw" && v.values.kind !== "nutPocket");
      setNote(where, v.mode === "face" ? "Along lines made from the face's edges." : v.mode === "line" ? "Along the line selected." : v.mode === "picked" ? "At the places picked." : "Select a face or a line.");
      setNote(warn, v.problem);
      setNote(info, v.problem ? "" : v.note);
    },
    contains(t: EventTarget | null): boolean { return t instanceof Node && el.contains(t); },
  };
}
