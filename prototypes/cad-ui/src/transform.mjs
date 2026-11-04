// The move / rotate / scale step for a whole body: an axis and a value, set by dragging or typing. Pure (no DOM, no three.js).
import { evalExpr } from "./expr.mjs";

const TYPE_START = /^[0-9.\-]$/;
const TYPE_ANY = /^[0-9.+\-*/() ]$/;
export const AXIS_NAMES = ["X", "Y", "Z"];
export const UNITS = { move: "mm", rotate: "°", scale: "×" };

export class TransformSession {
  constructor(settings, { mode, axis = 0, value = null, featureId = null }) {
    this.s = settings;
    this.mode = mode;
    this.axis = axis;
    this.featureId = featureId;
    this.value = value ?? this.neutral(mode);
    this.text = "";
  }
  neutral(mode = this.mode) {
    return mode === "scale" ? 1 : 0;
  }
  setMode(mode) {
    this.mode = mode;
    this.value = this.neutral(mode);
    this.text = "";
  }
  setAxis(axis) {
    this.axis = axis;
  }
  /** Set the dragged value, rounded to a step (finer with Shift). */
  drag(raw, fine = false) {
    const T = this.s.transform;
    const step = { move: fine ? T.moveFineStep : T.moveStep, rotate: fine ? T.rotateFineStep : T.rotateStep, scale: fine ? T.scaleFineStep : T.scaleStep }[this.mode];
    this.value = Number((Math.round(raw / step) * step).toFixed(6));
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
  current() {
    if (!this.text.trim()) return this.value;
    const v = evalExpr(this.text);
    return Number.isFinite(v) ? v : NaN;
  }
  invalid() {
    return !!this.text.trim() && !Number.isFinite(evalExpr(this.text));
  }
  /** No change yet (or, for scale, not a usable factor)? */
  isEmpty() {
    const v = this.current();
    if (this.mode === "scale") return !(v > 0) || Math.abs(v - 1) < 1e-6;
    return !(Math.abs(v) >= (this.mode === "move" ? this.s.transform.minMoveMm : this.s.transform.minRotateDeg));
  }
  label() {
    return `${this.mode === "move" ? "move" : this.mode === "rotate" ? "rotate" : "scale"} ${this.mode === "scale" ? "" : AXIS_NAMES[this.axis]}`.trim();
  }
  prompt() {
    const what = { move: "Move", rotate: "Rotate", scale: "Scale" }[this.mode];
    return `${what}${this.mode === "scale" ? "" : ` along ${AXIS_NAMES[this.axis]}`}: drag or type a number. ${this.mode === "scale" ? "" : "X Y Z pick the axis. "}M move  T rotate  K scale. Enter applies, Esc cancels.`;
  }
}
