// Drawing tool state machine. Pure (no DOM, no three.js): gestures in, sketch entities out.
// Tools: select | rect | circle | poly.  rect: two clicks. circle: centre then radius.
// poly: click points; click the first point (or Enter with >= 3 points) to close; Backspace removes the last point.
import { snap, dist } from "./sketch.mjs";

export class SketchSession {
  constructor(settings) {
    this.s = settings;
    this.entities = [];
    this.nextId = 1;
    this.tool = "select";
    this.draft = null; // { pts: [[x,y]...] }
    this.cursor = null; // snapped cursor [x,y]
    this.snapInfo = null;
    this.scale = 1; // pixels per mm, set by the view
  }

  setTool(tool) {
    this.draft = null;
    this.tool = tool;
  }

  cancel() {
    this.draft = null;
  }

  addEntity(e) {
    this.entities.push({ id: `e_${String(this.nextId++).padStart(3, "0")}`, ...e });
  }

  removeEntity(id) {
    this.entities = this.entities.filter((e) => e.id !== id);
  }

  /** Re-add an entity (used by undo), keeping its id. */
  restoreEntity(e) {
    if (!this.entities.some((x) => x.id === e.id)) this.entities.push(e);
  }

  move(raw, { shift = false } = {}) {
    const anchor = this.draft?.pts.length ? this.draft.pts[this.draft.pts.length - 1] : null;
    this.snapInfo = snap(raw, { entities: this.entities, extra: this.draft?.pts ?? [], anchor, scale: this.scale, settings: this.s, disabled: shift });
    this.cursor = this.snapInfo.point;
    return this.snapInfo;
  }

  /** Returns a short message when the click was ignored (so the UI can explain), else null. */
  click(raw, mods = {}) {
    if (this.tool === "select") return null;
    const p = this.move(raw, mods).point;
    if (!this.draft) {
      this.draft = { pts: [p] };
      return null;
    }
    const a = this.draft.pts[0];
    if (this.tool === "rect") {
      if (Math.abs(p[0] - a[0]) < 1e-9 || Math.abs(p[1] - a[1]) < 1e-9) return "Move away from the first corner, then click the opposite corner.";
      this.addEntity({ type: "rect", x0: a[0], y0: a[1], x1: p[0], y1: p[1] });
      this.draft = null;
    } else if (this.tool === "circle") {
      const r = dist(a, p);
      if (r < 1e-9) return "Move away from the centre, then click to set the radius.";
      this.addEntity({ type: "circle", cx: a[0], cy: a[1], r });
      this.draft = null;
    } else if (this.tool === "poly") {
      if (this.draft.pts.length >= 3 && dist(p, a) < 1e-9) this.#closePoly();
      else if (dist(p, this.draft.pts[this.draft.pts.length - 1]) > 1e-9) this.draft.pts.push(p);
    }
    return null;
  }

  #closePoly() {
    this.addEntity({ type: "poly", points: this.draft.pts.map((p) => p.slice()), closed: true });
    this.draft = null;
  }

  key(k) {
    if (k === "Escape") this.draft = null;
    else if (k === "Enter" && this.tool === "poly" && this.draft?.pts.length >= 3) this.#closePoly();
    else if (k === "Backspace" && this.tool === "poly" && this.draft) {
      this.draft.pts.pop();
      if (!this.draft.pts.length) this.draft = null;
    }
  }

  /** What the user should do next, for the hint line. */
  prompt() {
    const n = this.draft?.pts.length ?? 0;
    if (this.tool === "rect") return n ? "Click the opposite corner. Esc cancels." : "Rectangle: click the first corner.";
    if (this.tool === "circle") return n ? "Click to set the radius. Esc cancels." : "Circle: click the centre.";
    if (this.tool === "poly") return n ? "Click the next point. Click the first point or press Enter to close. Backspace removes a point." : "Polyline: click the first point.";
    return "Select: click a closed region to extrude it. Draw with R (rectangle), C (circle), L (polyline).";
  }

  /** The shape under construction, including the cursor, for drawing the rubber band. */
  draftShape() {
    if (!this.draft || !this.cursor) return null;
    const a = this.draft.pts[0];
    const c = this.cursor;
    if (this.tool === "rect") return { type: "rect", x0: a[0], y0: a[1], x1: c[0], y1: c[1] };
    if (this.tool === "circle") return { type: "circle", cx: a[0], cy: a[1], r: dist(a, c) };
    if (this.tool === "poly") return { type: "poly", points: [...this.draft.pts, c], closed: false };
    return null;
  }

  /** Live dimension text next to the cursor. */
  readout() {
    const d = this.draftShape();
    if (!d) return "";
    if (d.type === "rect") return `${Math.abs(d.x1 - d.x0).toFixed(2)} x ${Math.abs(d.y1 - d.y0).toFixed(2)} mm`;
    if (d.type === "circle") return `r ${d.r.toFixed(2)}  (dia ${(2 * d.r).toFixed(2)}) mm`;
    const n = d.points.length;
    return `${dist(d.points[n - 2], d.points[n - 1]).toFixed(2)} mm`;
  }
}
