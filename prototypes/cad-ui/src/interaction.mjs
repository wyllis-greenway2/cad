// The sketching session on one plane: tools, snapping, typed sizes, selection. Pure (no DOM, no three.js).
// Tools: select | line (polyline) | rect | circle. Local plane coordinates are (u right, v up) in mm.
import { snap, dist, hitEntity } from "./sketch.mjs";
import { evalExpr } from "./expr.mjs";

const FIELDS = {
  rect: [{ name: "w", label: "W" }, { name: "h", label: "H" }],
  circle: [{ name: "d", label: "Ø" }],
  line: [{ name: "len", label: "L" }, { name: "ang", label: "∠" }],
};
const TYPE_START = /^[0-9.\-]$/;
const TYPE_ANY = /^[0-9.+\-*/() ]$/;
const r6 = (v) => Math.round(v * 1e6) / 1e6;

export class SketchSession {
  constructor(settings, store) {
    this.s = settings;
    this.store = store;
    this.plane = null;
    this.tool = "select";
    this.draft = null; // { pts: [[u,v]...] }
    this.entry = null; // { fields: [{label, name, text}], active }
    this.selectedId = null;
    this.cursor = null;
    this.snapInfo = null;
    this.scale = 1; // pixels per mm on the plane (set by the view)
  }

  entities() {
    return this.plane ? this.store.entities(this.plane) : [];
  }

  setPlane(plane) {
    if (plane !== this.plane) this.reset();
    this.plane = plane;
  }

  reset() {
    this.draft = null;
    this.entry = null;
    this.selectedId = null;
    this.tool = "select";
    this.cursor = null;
    this.snapInfo = null;
  }

  setTool(tool) {
    this.draft = null;
    this.entry = null;
    this.tool = tool;
    if (tool !== "select") this.selectedId = null;
  }

  // ------------------------------------------------------------ pointer
  move(raw, { shift = false } = {}) {
    const d = this.draft?.pts;
    const anchor = d?.length ? d[d.length - 1] : null;
    this.snapInfo = snap(raw, { entities: this.entities(), extra: d ?? [], anchor, scale: this.scale, settings: { snap: this.s.sketch }, disabled: shift });
    this.cursor = this.snapInfo.point;
    return this.snapInfo;
  }

  /** Returns a short message when the click was ignored (so the UI can explain), else null. */
  click(raw, mods = {}) {
    if (this.tool === "select") {
      const hit = hitEntity(raw, this.entities(), this.s.sketch.selectTolPx / this.scale);
      this.selectedId = hit?.id ?? null;
      return null;
    }
    const p = this.move(raw, mods).point;
    if (!this.draft) {
      this.draft = { pts: [p] };
      return null;
    }
    const a = this.draft.pts[0];
    if (this.tool === "rect") {
      if (Math.abs(p[0] - a[0]) < 1e-9 || Math.abs(p[1] - a[1]) < 1e-9) return "Move away from the first corner, then click the opposite corner.";
      this.#add({ type: "rect", x0: a[0], y0: a[1], x1: p[0], y1: p[1] });
    } else if (this.tool === "circle") {
      const r = dist(a, p);
      if (r < 1e-9) return "Move away from the centre, then click to set the radius.";
      this.#add({ type: "circle", cx: a[0], cy: a[1], r });
    } else if (this.tool === "line") {
      const pts = this.draft.pts;
      if (pts.length >= 3 && dist(p, pts[0]) < 1e-9) this.#addPoly(true);
      else if (dist(p, pts[pts.length - 1]) > 1e-9) pts.push(p);
    }
    this.entry = null;
    return null;
  }

  #add(entity) {
    const e = this.store.add(this.plane, entity);
    this.draft = null;
    this.entry = null;
    return e;
  }
  #addPoly(closed) {
    this.#add({ type: "poly", points: this.draft.pts.map((p) => p.slice()), closed });
  }

  // ------------------------------------------------------------ typed sizes
  /** Offer a typed character. Returns true if the session consumed it. */
  type(ch) {
    if (!this.draft || this.tool === "select") return false;
    if (!this.entry) {
      if (!TYPE_START.test(ch)) return false;
      this.entry = { fields: FIELDS[this.tool].map((f) => ({ ...f, text: "" })), active: 0 };
    } else if (!TYPE_ANY.test(ch)) return false;
    this.entry.fields[this.entry.active].text += ch;
    return true;
  }

  backspace() {
    if (!this.entry) return false;
    const f = this.entry.fields[this.entry.active];
    f.text = f.text.slice(0, -1);
    if (this.entry.fields.every((x) => !x.text)) this.entry = null;
    return true;
  }

  tab(back = false) {
    if (!this.entry) return false;
    const n = this.entry.fields.length;
    this.entry.active = (this.entry.active + (back ? n - 1 : 1)) % n;
    return true;
  }

  fieldValue(name) {
    const f = this.entry?.fields.find((x) => x.name === name);
    if (!f || !f.text.trim()) return undefined;
    return evalExpr(f.text);
  }

  /** Enter: commit typed sizes, or finish a polyline. Returns a message if it was refused, true if consumed, else false. */
  enter() {
    if (!this.draft || this.tool === "select") return false;
    const shape = this.resolve();
    if (this.entry) {
      if (!shape.valid) return "Check the typed numbers (they must be positive and valid).";
      if (this.tool === "line") {
        this.draft.pts.push(shape.next);
        this.entry = null;
        return true;
      }
      this.#add(shape.entity);
      return true;
    }
    if (this.tool === "line" && this.draft.pts.length >= 2) {
      this.#addPoly(false);
      return true;
    }
    return false;
  }

  /** Esc steps back one level. Returns true if it did something, false if there was nothing left to back out of. */
  escape() {
    if (this.entry) {
      this.entry = null;
      return true;
    }
    if (this.draft) {
      this.draft = null;
      return true;
    }
    if (this.tool !== "select") {
      this.tool = "select";
      return true;
    }
    if (this.selectedId) {
      this.selectedId = null;
      return true;
    }
    return false;
  }

  deleteSelected() {
    if (!this.selectedId) return false;
    const ok = this.store.remove(this.plane, this.selectedId);
    this.selectedId = null;
    return ok;
  }

  // ------------------------------------------------------------ geometry of the shape being drawn
  /** Resolve the in-progress shape from the cursor and any typed sizes. */
  resolve() {
    const out = { valid: true, entity: null, preview: null, next: null, values: {} };
    if (!this.draft || !this.cursor) return { ...out, valid: false };
    const a = this.draft.pts[0];
    const last = this.draft.pts[this.draft.pts.length - 1];
    const c = this.cursor;
    const typed = (name) => this.fieldValue(name);
    const bad = (v) => v !== undefined && !(Number.isFinite(v) && v > 0);
    if (this.tool === "rect") {
      const sx = c[0] - a[0] < 0 ? -1 : 1;
      const sy = c[1] - a[1] < 0 ? -1 : 1;
      const tw = typed("w");
      const th = typed("h");
      const w = tw ?? Math.abs(c[0] - a[0]);
      const h = th ?? Math.abs(c[1] - a[1]);
      out.valid = !bad(tw) && !bad(th) && w > 1e-9 && h > 1e-9;
      out.values = { w, h };
      out.preview = { type: "rect", x0: a[0], y0: a[1], x1: a[0] + sx * w, y1: a[1] + sy * h };
      out.entity = { type: "rect", x0: r6(out.preview.x0), y0: r6(out.preview.y0), x1: r6(out.preview.x1), y1: r6(out.preview.y1) };
    } else if (this.tool === "circle") {
      const td = typed("d");
      const r = td !== undefined ? td / 2 : dist(a, c);
      out.valid = !bad(td) && r > 1e-9;
      out.values = { d: r * 2 };
      out.preview = { type: "circle", cx: a[0], cy: a[1], r };
      out.entity = { type: "circle", cx: r6(a[0]), cy: r6(a[1]), r: r6(r) };
    } else if (this.tool === "line") {
      const tl = typed("len");
      const ta = typed("ang");
      const base = Math.atan2(c[1] - last[1], c[0] - last[0]);
      const theta = ta !== undefined && Number.isFinite(ta) ? (ta * Math.PI) / 180 : base;
      const len = tl ?? dist(last, c);
      out.valid = !bad(tl) && (ta === undefined || Number.isFinite(ta)) && len > 1e-9;
      out.values = { len, ang: (theta * 180) / Math.PI };
      out.next = [r6(last[0] + len * Math.cos(theta)), r6(last[1] + len * Math.sin(theta))];
      out.preview = { type: "poly", points: [...this.draft.pts, out.next], closed: false };
    }
    return out;
  }

  /** The shape under construction (cursor-driven, with typed sizes applied) for the rubber band. */
  draftShape() {
    if (!this.draft || !this.cursor) return null;
    return this.resolve().preview;
  }

  /** What to show next to the cursor: segments of {label, text, active, typed, invalid}. */
  readout() {
    if (!this.draft || !this.cursor) return [];
    const r = this.resolve();
    const fmt = (v) => (Number.isFinite(v) ? String(Math.round(v * 100) / 100) : "?");
    return FIELDS[this.tool].map((f, i) => {
      const e = this.entry?.fields[i];
      const typed = !!e?.text;
      const v = e?.text ? evalExpr(e.text) : undefined;
      return { label: f.label, text: typed ? e.text : fmt(r.values[f.name]), active: !!this.entry && this.entry.active === i, typed, invalid: typed && !(Number.isFinite(v) && v > 0 || (f.name === "ang" && Number.isFinite(v))) };
    });
  }

  /** What the user should do next, for the hint line. */
  prompt() {
    const n = this.draft?.pts.length ?? 0;
    const typing = this.entry ? "  Tab: next field   Enter: apply   Esc: stop typing" : "  (or just type a size)";
    if (this.tool === "rect") return n ? `Click the opposite corner${typing}` : "Rectangle: click the first corner.";
    if (this.tool === "circle") return n ? `Click to set the size${typing}` : "Circle: click the centre.";
    if (this.tool === "line") return n ? `Click the next point; click the first point to close; Enter to finish${typing}` : "Line: click the first point.";
    return this.selectedId ? "Selected. Delete removes it." : "Select: click a shape. R rectangle, C circle, L line.";
  }
}
