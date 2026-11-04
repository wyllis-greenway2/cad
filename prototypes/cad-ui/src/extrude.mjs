// The extrude step: a distance along the plane's normal, set by dragging or typing. Pure (no DOM, no three.js).
import { evalExpr } from "./expr.mjs";
import { featureMode } from "./features.mjs";

const TYPE_START = /^[0-9.\-]$/;
const TYPE_ANY = /^[0-9.+\-*/() ]$/;

export class ExtrudeSession {
  /** plane, shape (data of the closed shape), distance (start), featureId (when editing one), hasBody (is there a body to cut?) */
  constructor(settings, { plane, shape, distance = 0, featureId = null, hasBody = false }) {
    this.s = settings;
    this.plane = plane;
    this.shape = shape;
    this.distance = distance;
    this.featureId = featureId;
    this.hasBody = hasBody;
    this.text = ""; // typed distance (replaces the dragged one while present)
  }

  /** Set the distance from a dragged value, rounded to a step (fine with Shift); close to zero snaps to zero. */
  drag(raw, fine = false) {
    const step = fine ? this.s.extrude.fineStepMm : this.s.extrude.dragStepMm;
    const d = Math.round(raw / step) * step;
    this.distance = Math.abs(d) < step / 2 ? 0 : Number(d.toFixed(6));
    this.text = "";
  }

  type(ch) {
    if (!this.text ? !TYPE_START.test(ch) : !TYPE_ANY.test(ch)) return false;
    this.text += ch;
    return true;
  }
  backspace() {
    this.text = this.text.slice(0, -1);
  }

  /** The distance that applies now: typed (if valid) or dragged. NaN when the typed text is not a number. */
  value() {
    if (!this.text.trim()) return this.distance;
    const v = evalExpr(this.text);
    return Number.isFinite(v) ? v : NaN;
  }
  invalid() {
    return !!this.text.trim() && !Number.isFinite(evalExpr(this.text));
  }
  mode() {
    return featureMode(this.value(), this.hasBody);
  }
  /** Is the distance too small to mean anything? */
  isEmpty() {
    return !(Math.abs(this.value()) >= this.s.extrude.minMm);
  }
  prompt() {
    const v = this.value();
    if (!Number.isFinite(v)) return "Type a number (math works). Backspace corrects, Esc cancels.";
    const what = this.isEmpty() ? "no change yet" : this.mode() === "cut" ? "cut" : this.hasBody || v >= 0 ? "add" : "add (nothing to cut yet)";
    return `Drag, or type a distance: ${what}. Up adds, down cuts. Enter applies, Esc cancels.`;
  }
}
