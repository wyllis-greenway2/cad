// The sketching session on one plane: tools, snapping, typed sizes, selection. Pure (no DOM, no three.js).
// Tools: select | line (polyline) | rect | circle | dimension | extrude (pick a closed shape to pull). Local plane coordinates are (u right, v up) in mm.
import { snap, dist, hitEntity, regionsOf, hitRegion } from "./sketch.mjs";
import { evalExpr } from "./expr.mjs";
import { dimensionsOf } from "./dimensions.mjs";
import { refsOf, shapeOfRef, solveSketch, dimensionConstraint, sameDimension, sameConstraint, anchorsOf, modelOf, tryConstraint, lengthSpec, angleSpec } from "./sketchsolve.mjs";
import { elementAt, offersFor, glyphsFor, valueFor } from "./sketchpick.mjs";
import { iconKey } from "./icons.mjs";

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
    this.editKey = null; // when set, the sketch being worked on is a step's own profile ("feat:<id>"), not the plane's loose sketch
    this.tool = "select";
    this.draft = null; // { pts: [[u,v]...] }
    this.entry = null; // { fields: [{label, name, text}], active }
    this.selectedId = null; // in the dimension tool this is the shape whose dimensions are being edited
    this.hoverId = null; // dimension tool: the shape under the cursor
    this.picks = []; // select tool: the parts picked (corners, lines, circles, whole shapes) as { kind, ref, shape }
    this.pickedConstraint = null; // a constraint mark that was clicked
    this.pickEdit = null; // typing a value for the picked line, circle or pair of lines: { text }
    this.preview = null; // while dragging: the shapes as the solver has them now (committed on release)
    this.drag = null;
    this.solveCache = null;
    this.picked = null; // extrude tool: the closed shape just clicked (the view takes it with takePicked)
    this.dimEdit = null; // dimension tool: { typed: {key: text}, active: key }
    this.cursor = null;
    this.snapInfo = null;
    this.scale = 1; // pixels per mm on the plane (set by the view)
  }

  entities() {
    return this.plane ? this.store.entities(this.key) : [];
  }

  get key() {
    return this.editKey ?? this.plane;
  }

  setPlane(plane) {
    if (plane !== this.plane) this.reset();
    this.plane = plane;
  }

  reset() {
    this.draft = null;
    this.entry = null;
    this.selectedId = null;
    this.hoverId = null;
    this.dimEdit = null;
    this.editKey = null;
    this.picks = [];
    this.pickedConstraint = null;
    this.pickEdit = null;
    this.preview = null;
    this.drag = null;
    this.tool = "select";
    this.cursor = null;
    this.snapInfo = null;
  }

  /** Lines drawn so far stay as an open line when you stop (Esc, another tool, leaving the sketch); only extruding needs a closed shape (`in_062`). */
  keepOpenLine() {
    if (this.tool === "line" && this.draft && this.draft.pts.length >= 2) this.#addPoly(false);
  }
  setTool(tool) {
    this.keepOpenLine();
    this.draft = null;
    this.entry = null;
    this.dimEdit = null;
    this.hoverId = null;
    this.tool = tool;
    if (tool !== "select" && tool !== "dimension") this.selectedId = null;
  }

  // ------------------------------------------------------------ pointer
  move(raw, { shift = false } = {}) {
    if (this.tool === "extrude") {
      this.cursor = raw;
      this.hoverId = hitRegion(raw, regionsOf(this.entities()))?.id ?? null;
      return { point: raw, kind: "free", guides: [] };
    }
    if (this.tool === "dimension") {
      this.cursor = raw;
      this.hoverId = hitEntity(raw, this.entities(), this.s.sketch.selectTolPx / this.scale)?.id ?? null;
      return { point: raw, kind: "free", guides: [] };
    }
    const d = this.draft?.pts;
    const anchor = d?.length ? d[d.length - 1] : null;
    this.snapInfo = snap(raw, { entities: this.entities(), extra: d ?? [], anchor, scale: this.scale, settings: { snap: this.s.sketch }, disabled: shift });
    this.cursor = this.snapInfo.point;
    return this.snapInfo;
  }

  /** Returns a short message when the click was ignored (so the UI can explain), else null. */
  click(raw, mods = {}) {
    if (this.tool === "select") {
      const tol = this.s.sketch.selectTolPx / this.scale;
      const el = elementAt(raw, this.entities(), tol) ?? (() => {
        const inside = hitEntity(raw, this.entities(), tol);
        return inside ? { kind: "entity", ref: inside.id, shape: inside.id } : null;
      })();
      this.pickedConstraint = null;
      this.pickEdit = null;
      if (!el) this.picks = [];
      else if (mods.shift && this.picks.length && this.picks[0].kind !== "entity" && el.kind !== "entity") {
        const at = this.picks.findIndex((k) => k.ref === el.ref);
        if (at >= 0) this.picks.splice(at, 1);
        else this.picks.push(el);
      } else this.picks = [el];
      this.selectedId = this.picks[0]?.shape ?? null;
      return null;
    }
    if (this.tool === "dimension") return this.#clickDimension(raw);
    if (this.tool === "extrude") {
      this.picked = hitRegion(raw, regionsOf(this.entities())) ?? null;
      return this.picked ? null : "Click inside a closed shape to extrude it.";
    }
    const p = this.move(raw, mods).point;
    if (!this.draft) {
      this.draft = { pts: [p] };
      return null;
    }
    const a = this.draft.pts[0];
    if (this.tool === "rect") {
      if (Math.abs(p[0] - a[0]) < 1e-9 || Math.abs(p[1] - a[1]) < 1e-9) return "Move away from the first corner, then click the opposite corner.";
      this.#addRect(a[0], a[1], p[0], p[1]);
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

  takePicked() {
    const r = this.picked;
    this.picked = null;
    return r;
  }

  // ------------------------------------------------------------ constraints, picks and dragging
  /** The shapes to draw: while dragging, as the solver has them now. */
  viewEntities() {
    return this.preview ?? this.entities();
  }

  /** The two-line picks to watch so a constraint cannot fold them onto each other. */
  #watch() {
    const segs = this.picks.filter((k) => k.kind === "seg");
    return segs.length === 2 ? [[segs[0].ref, segs[1].ref]] : [];
  }

  /** A short name for a stored constraint, for messages. */
  #nameOf(id) {
    const c = this.store.constraintsOf(this.key).find((k) => k.id === id);
    const N = { horizontal: "Horizontal", vertical: "Vertical", equalLength: "Equal length", equalRadius: "Equal radius", parallel: "Parallel", perpendicular: "Perpendicular", coincident: "Coincident", fixed: "Fixed", distance: "a length", hdist: "a width", vdist: "a height", radius: "a radius", angle: "an angle" };
    return c ? N[c.type] ?? c.type : id;
  }
  #reason(t) {
    return t.conflicts?.length ? `it conflicts with ${[...new Set(t.conflicts.map((id) => this.#nameOf(id)))].join(", ")}; remove that first` : t.reason;
  }

  /**
   * Constraint buttons that fit the current picks: [{ label, enabled, active, reason, id }]. A constraint that is already on is shown as active (asking again turns it off).
   * One that is merely implied by others (a rectangle's right angle) can still be added, to lock it. A button is disabled (with the reason) when it would contradict the shape or
   * other constraints, or would collapse or fold the geometry.
   */
  offers() {
    if (this.tool !== "select") return [];
    const ents = this.entities();
    const cons = this.store.constraintsOf(this.key);
    const model = modelOf(ents);
    return offersFor(this.picks.filter((k) => k.kind !== "entity")).map((o) => {
      const spec = o.make(model);
      const on = cons.find((c) => sameConstraint(c, spec));
      if (on) return { label: o.label, enabled: true, active: true, reason: null, id: on.id };
      const t = tryConstraint(ents, cons, spec, { newId: "c_try", watch: this.#watch() });
      return { label: o.label, enabled: t.ok, active: false, reason: t.ok ? null : this.#reason(t), redundant: !!t.redundant };
    });
  }

  applyOffer(i) {
    const offer = offersFor(this.picks.filter((k) => k.kind !== "entity"))[i];
    if (!offer) return "Nothing to apply.";
    const ents = this.entities();
    const cons = this.store.constraintsOf(this.key);
    const spec = offer.make(modelOf(ents));
    const on = cons.find((c) => sameConstraint(c, spec));
    if (on) return this.deleteConstraint(on.id) ? null : "Could not remove it."; // asking for what is already set turns it off
    const t = tryConstraint(ents, cons, spec, { newId: this.store.newConstraintId(), watch: this.#watch() });
    if (!t.ok) return `That cannot be set: ${this.#reason(t)}. Nothing changed.`;
    const changed = t.entities.filter((x, i2) => JSON.stringify(x) !== JSON.stringify(ents[i2]));
    this.store.edit(this.key, { entities: changed, constraints: t.constraints });
    return null;
  }

  /** The number that can be typed for the current picks (a line's length, a circle's radius, the angle between two lines at a shared corner), or null. */
  valueChip() {
    if (this.tool !== "select") return null;
    const v = valueFor(this.picks, this.viewEntities());
    if (!v) return null;
    // is the number a stored (locked) dimension?
    const ents = this.entities();
    const cons = this.store.constraintsOf(this.key);
    let locked = false;
    if (v.kind === "length") {
      const spec = lengthSpec(ents, v.segs[0], v.value);
      locked = !!spec && cons.some((c) => sameDimension(c, spec));
    } else if (v.kind === "radius") locked = cons.some((c) => c.type === "radius" && c.r === `${v.circle}.r`);
    else {
      const sp = angleSpec(ents, v.segs[0], v.segs[1], 90);
      locked = !!sp && cons.some((c) => c.type === "angle" && c.a === sp.a && ((c.b === sp.b && c.d === sp.d) || (c.b === sp.d && c.d === sp.b)));
    }
    return { ...v, locked, editing: this.pickEdit ? this.pickEdit.text : null };
  }

  /** Apply the typed value for the picks. Returns a message if it was refused, else null. */
  #applyValue() {
    const chip = this.valueChip();
    if (!chip || !this.pickEdit) return null;
    const v = evalExpr(this.pickEdit.text);
    if (!Number.isFinite(v) || !(v > 0)) return "Check the typed number (it must be positive).";
    const ents = this.entities();
    const cons = this.store.constraintsOf(this.key);
    let spec;
    let replace;
    let soft = [];
    let watch = [];
    if (chip.kind === "length") {
      spec = lengthSpec(ents, chip.segs[0], v);
      if (!spec) return "That length cannot be set.";
      replace = (c) => sameDimension(c, spec);
      const e = ents.find((x) => x.id === chip.segs[0].slice(0, chip.segs[0].lastIndexOf(".")));
      const i = Number(chip.segs[0].slice(chip.segs[0].lastIndexOf(".") + 2));
      soft = anchorsOf(e, e.type === "rect" ? "w" : `s${i}`);
    } else if (chip.kind === "radius") {
      spec = { type: "radius", r: `${chip.circle}.r`, value: v };
      replace = (c) => sameDimension(c, spec);
      soft = anchorsOf(ents.find((x) => x.id === chip.circle), "d");
    } else {
      if (v < 1 || v > 179) return "The angle must be between 1° and 179°.";
      spec = angleSpec(ents, chip.segs[0], chip.segs[1], v);
      if (!spec) return "Those lines do not share a corner.";
      replace = (c) => c.type === "angle" && c.a === spec.a && ((c.b === spec.b && c.d === spec.d) || (c.b === spec.d && c.d === spec.b));
      watch = [[chip.segs[0], chip.segs[1]]];
      const pts = modelOf(ents).points;
      const len = Math.hypot(pts[spec.d][0] - pts[spec.c][0], pts[spec.d][1] - pts[spec.c][1]);
      // the first line stays and the second turns about the shared corner, keeping its length
      soft = [{ p: spec.a, at: pts[spec.a].slice(), w: 0.5 }, { p: spec.b, at: pts[spec.b].slice(), w: 0.5 }, { dist: [spec.c, spec.d], d: len, w: 0.5 }];
    }
    const t = tryConstraint(ents, cons, spec, { newId: this.store.newConstraintId(), soft, replace, watch });
    if (!t.ok) return `That cannot be set: ${this.#reason(t)}. Nothing changed.`;
    const changed = t.entities.filter((x, i) => JSON.stringify(x) !== JSON.stringify(ents[i]));
    this.pickEdit = null;
    this.store.edit(this.key, { entities: changed, constraints: t.constraints });
    return null;
  }

  /** Marks for the stored constraints: [{ id, text, pos, dimension, picked }]. */
  glyphs() {
    // a thing's constraints show only while the thing is selected (`in_054`)
    const wholeShapes = new Set(this.picks.filter((k) => k.kind === "entity").map((k) => k.shape));
    const parts = new Set(); // the picked lines, corners and circles (a line includes its two end corners)
    const seg = modelOf(this.viewEntities()).segments;
    for (const k of this.picks) {
      parts.add(k.ref);
      if (k.kind === "seg" && seg[k.ref]) seg[k.ref].forEach((id) => parts.add(id));
    }
    const mine = this.store.constraintsOf(this.key).filter((c) => c.id === this.pickedConstraint || refsOf(c).some((r) => parts.has(r) || wholeShapes.has(shapeOfRef(r))));
    return glyphsFor(this.viewEntities(), mine).map((g) => ({ ...g, picked: g.id === this.pickedConstraint }));
  }
  /** Pick one of the constraint icons shown with the selection (Delete then removes it). The selection itself stays. */
  pickConstraint(id) {
    this.pickedConstraint = this.pickedConstraint === id ? null : id; // clicking it again lets go of it
    this.pickEdit = null;
  }
  /** What the clicked constraint relates: its corners, lines and circles ("e_001.s0", "e_001.p2", "e_002.r"). Empty when none is clicked. */
  relatedRefs() {
    const c = this.pickedConstraint && this.store.constraintsOf(this.key).find((x) => x.id === this.pickedConstraint);
    return c ? refsOf(c) : [];
  }
  startPickEdit() {
    if (this.valueChip() && !this.pickEdit) this.pickEdit = { text: "" };
  }

  /**
   * What to show next to the selection (`in_057`): the constraints that belong to it as icons, then the number that can be typed (with a lock when it is a stored dimension).
   * Returns { pos, normal, icons: [{ id, key, picked }], value } or null.
   */
  widget() {
    if (this.tool !== "select") return null;
    const live = this.picks;
    if (!live.length) return null;
    const ents = this.viewEntities();
    const model = modelOf(ents);
    const chip = this.valueChip();
    const wholeShapes = new Set(live.filter((k) => k.kind === "entity").map((k) => k.shape));
    const parts = new Set();
    for (const k of live) {
      if (k.kind === "entity") continue;
      parts.add(k.ref);
      if (k.kind === "seg" && model.segments[k.ref]) model.segments[k.ref].forEach((id) => parts.add(id));
    }
    const DIM = new Set(["distance", "hdist", "vdist", "radius", "angle"]);
    const icons = this.store.constraintsOf(this.key)
      .filter((c) => refsOf(c).some((r) => parts.has(r) || wholeShapes.has(shapeOfRef(r))))
      .filter((c) => wholeShapes.size || !DIM.has(c.type)) // a dimension shows as the lock on the number
      .map((c) => ({ id: c.id, key: iconKey(c.type), picked: c.id === this.pickedConstraint }));
    // where: at the number if there is one, else at the picked corner, else the shape's middle
    let pos = chip?.pos;
    let normal = chip?.normal ?? [0, 1];
    if (!pos) {
      const first = live[0];
      if (first.kind === "point" && model.points[first.ref]) pos = model.points[first.ref];
      else if (first.kind === "entity") {
        const e = ents.find((x) => x.id === first.shape);
        const pts = e ? Object.entries(model.points).filter(([id]) => id.startsWith(`${e.id}.`)).map(([, p]) => p) : [];
        if (pts.length) pos = [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
      }
      normal = [0, 0];
    }
    if (!pos || (!icons.length && !chip)) return null;
    return { pos, normal, icons, value: chip };
  }
  deleteConstraint(id) {
    const cons = this.store.constraintsOf(this.key);
    if (!cons.some((c) => c.id === id)) return false;
    this.store.edit(this.key, { constraints: cons.filter((c) => c.id !== id) });
    this.pickedConstraint = null;
    return true;
  }

  /** How constrained the sketch is: { status, dof, redundant, conflicts } (cached until the sketch changes). */
  solveInfo() {
    const key = `${this.key}|${this.store.version}`;
    if (this.solveCache?.key !== key) {
      const ents = this.entities();
      const cons = this.store.constraintsOf(this.key);
      const r = solveSketch(ents, cons);
      this.solveCache = { key, info: { status: r.status, dof: r.dof, redundant: r.redundant, conflicts: r.conflicts, count: cons.length, shapes: ents.length } };
    }
    return this.solveCache.info;
  }

  /** Start dragging a corner, line or circle (el from elementAt). The solver keeps every constraint true while it follows the mouse. */
  dragStart(el, raw) {
    this.drag = { el, start: raw, base: JSON.parse(JSON.stringify(this.entities())) };
    this.preview = null;
  }
  dragMove(raw) {
    if (!this.drag) return;
    const { el, start, base } = this.drag;
    const model = modelOf(base);
    let prefs = [];
    if (el.kind === "point") prefs = [{ p: el.ref, at: raw, w: 0.1 }];
    else if (el.kind === "seg") {
      const dx = raw[0] - start[0];
      const dy = raw[1] - start[1];
      prefs = model.segments[el.ref].map((pid) => ({ p: pid, at: [model.points[pid][0] + dx, model.points[pid][1] + dy], w: 0.1 }));
    } else if (el.kind === "circle") {
      const c = base.find((e) => e.id === el.shape);
      prefs = [{ r: el.ref, value: Math.max(0.01, dist(raw, [c.cx, c.cy])), w: 0.1 }];
    }
    const res = solveSketch(base, this.store.constraintsOf(this.key), prefs);
    if (res.status === "ok") this.preview = res.entities;
  }
  /** Finish the drag: one undoable change. Returns true if something moved. */
  dragEnd() {
    const prev = this.preview;
    const base = this.drag?.base;
    this.drag = null;
    this.preview = null;
    if (!prev || !base) return false;
    const changed = prev.filter((x, i) => JSON.stringify(x) !== JSON.stringify(base[i]));
    if (!changed.length) return false;
    this.store.edit(this.key, { entities: changed });
    return true;
  }

  // ------------------------------------------------------------ dimension tool
  /** The shape whose dimensions are showing: the chosen one, else the one under the cursor. */
  dimTarget() {
    if (this.tool !== "dimension") return null;
    const id = this.selectedId ?? this.hoverId;
    return this.entities().find((e) => e.id === id) ?? null;
  }

  /** Dimensions to draw (with their typed text, if any). `off` is the offset of the dimension line from the shape in mm. */
  dims(off) {
    const e = this.dimTarget();
    if (!e) return [];
    return dimensionsOf(e, off).map((d) => {
      const text = this.dimEdit?.typed[d.key];
      const spec = dimensionConstraint(e, d.key, d.value);
      const locked = this.store.constraintsOf(this.key).some((c) => sameDimension(c, spec)); // a stored dimension: it stays when the sketch changes
      return { ...d, locked, typed: text !== undefined, text: text ?? String(Math.round(d.value * 100) / 100), active: this.dimEdit?.active === d.key };
    });
  }

  #clickDimension(raw) {
    const hitPx = this.s.sketch.dimLabelHitPx / this.scale;
    const chip = this.dims(this.s.sketch.dimOffsetPx / this.scale).find((d) => dist(raw, d.pos) <= hitPx);
    if (chip) {
      this.dimEdit = { typed: this.dimEdit?.typed ?? {}, active: chip.key };
      this.dimEdit.typed[chip.key] ??= "";
      return null;
    }
    const hit = hitEntity(raw, this.entities(), this.s.sketch.selectTolPx / this.scale);
    if (hit?.id !== this.selectedId) this.dimEdit = null;
    this.selectedId = hit?.id ?? null;
    return null;
  }

  #startDimEdit(first) {
    const ds = this.dims(1);
    if (!ds.length) return false;
    this.dimEdit = { typed: { [ds[0].key]: "" }, active: ds[0].key };
    return first;
  }

  /**
   * Apply every typed dimension as one undoable change: each becomes a stored dimension constraint (or updates the one that is there), then the sketch is solved
   * keeping the shape's first corner / centre roughly in place. A conflict changes nothing and says which constraints are involved. Returns a message if refused, else true.
   */
  #commitDimensions() {
    const e = this.dimTarget();
    if (!e || !this.dimEdit) return false;
    const cons = this.store.constraintsOf(this.key).map((c) => ({ ...c }));
    let anchors = [];
    for (const d of dimensionsOf(e, 1)) {
      const text = this.dimEdit.typed[d.key];
      if (text === undefined || !text.trim()) continue;
      const v = evalExpr(text);
      if (!(Number.isFinite(v) && v > 1e-9)) return "Check the typed numbers (they must be positive and valid).";
      const spec = dimensionConstraint(e, d.key, v);
      if (!spec) return "That dimension cannot be set.";
      const at = cons.findIndex((c) => sameDimension(c, spec));
      if (at >= 0) cons[at] = { ...cons[at], ...spec };
      else cons.push({ id: this.store.newConstraintId(), ...spec });
      anchors = anchors.concat(anchorsOf(e, d.key));
    }
    const before = this.entities();
    const res = solveSketch(before, cons, anchors);
    if (res.status !== "ok") return `That conflicts with other constraints (${res.conflicts.join(", ") || "they cannot all hold"}). Nothing changed.`;
    const changed = res.entities.filter((x, i) => JSON.stringify(x) !== JSON.stringify(before[i]));
    this.dimEdit = null;
    this.store.edit(this.key, { entities: changed, constraints: cons });
    return true;
  }

  #add(entity, constraintsFor = null) {
    const e = this.store.add(this.key, entity, constraintsFor);
    this.draft = null;
    this.entry = null;
    if (this.s.sketch.oneShot && this.tool !== "select") this.tool = "select"; // a drawing tool adds one figure, then normal interaction is back (`in_079`)
    return e;
  }
  /** A rectangle is just four lines and four corners with horizontal and vertical constraints: a shortcut for what you could draw yourself (`in_054`). */
  #addRect(x0, y0, x1, y1) {
    this.draft = { pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] };
    this.#addPoly(true);
  }
  #addPoly(closed) {
    const pts = this.draft.pts.map((p) => p.slice());
    // a segment drawn exactly horizontal or vertical is remembered as such (so it stays that way when the sketch is edited)
    const auto = (e) => {
      const out = [];
      const n = pts.length;
      for (let i = 0; i < (closed ? n : n - 1); i++) {
        const a = pts[i];
        const b = pts[(i + 1) % n];
        if (Math.abs(a[1] - b[1]) < 1e-9) out.push({ type: "horizontal", seg: `${e.id}.s${i}` });
        else if (Math.abs(a[0] - b[0]) < 1e-9) out.push({ type: "vertical", seg: `${e.id}.s${i}` });
      }
      return out;
    };
    this.#add({ type: "poly", points: pts, closed }, auto);
  }

  // ------------------------------------------------------------ typed sizes
  /** Offer a typed character. Returns true if the session consumed it. */
  type(ch) {
    if (this.tool === "select") {
      if (!this.valueChip()) return false;
      if (!this.pickEdit) {
        if (!/^[0-9.]$/.test(ch)) return false;
        this.pickEdit = { text: "" };
      } else if (!TYPE_ANY.test(ch)) return false;
      this.pickEdit.text += ch;
      return true;
    }
    if (this.tool === "dimension") {
      if (!this.dimTarget()) return false;
      if (!this.dimEdit) {
        if (!TYPE_START.test(ch)) return false;
        this.#startDimEdit();
      } else if (!TYPE_ANY.test(ch)) return false;
      if (!this.dimEdit) return false;
      this.dimEdit.typed[this.dimEdit.active] = (this.dimEdit.typed[this.dimEdit.active] ?? "") + ch;
      return true;
    }
    if (!this.draft || this.tool === "select") return false;
    if (!this.entry) {
      if (!TYPE_START.test(ch)) return false;
      this.entry = { fields: FIELDS[this.tool].map((f) => ({ ...f, text: "" })), active: 0 };
    } else if (!TYPE_ANY.test(ch)) return false;
    this.entry.fields[this.entry.active].text += ch;
    return true;
  }

  backspace() {
    if (this.tool === "select") {
      if (!this.pickEdit) return false;
      this.pickEdit.text = this.pickEdit.text.slice(0, -1);
      return true;
    }
    if (this.tool === "dimension") {
      if (!this.dimEdit) return false;
      const t = this.dimEdit.typed;
      t[this.dimEdit.active] = (t[this.dimEdit.active] ?? "").slice(0, -1);
      return true;
    }
    if (!this.entry) return false;
    const f = this.entry.fields[this.entry.active];
    f.text = f.text.slice(0, -1);
    if (this.entry.fields.every((x) => !x.text)) this.entry = null;
    return true;
  }

  tab(back = false) {
    if (this.tool === "dimension") {
      const ds = this.dims(1);
      if (!this.dimEdit || ds.length < 2) return false;
      const i = ds.findIndex((d) => d.key === this.dimEdit.active);
      const next = ds[(i + (back ? ds.length - 1 : 1)) % ds.length];
      this.dimEdit.active = next.key;
      this.dimEdit.typed[next.key] ??= "";
      return true;
    }
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
    if (this.tool === "select") {
      if (this.pickEdit && this.pickEdit.text) return this.#applyValue() ?? true;
      if (this.valueChip()) return ((this.pickEdit = { text: "" }), true); // Enter starts typing a value for what is picked
      return false;
    }
    if (this.tool === "dimension") {
      if (this.dimEdit) return this.#commitDimensions();
      return this.dimTarget() ? (this.#startDimEdit(), true) : false;
    }
    if (!this.draft || this.tool === "select") return false;
    const shape = this.resolve();
    if (this.entry) {
      if (!shape.valid) return "Check the typed numbers (they must be positive and valid).";
      if (this.tool === "line") {
        this.draft.pts.push(shape.next);
        this.entry = null;
        return true;
      }
      if (this.tool === "rect") this.#addRect(shape.entity.x0, shape.entity.y0, shape.entity.x1, shape.entity.y1);
      else this.#add(shape.entity);
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
    if (this.pickEdit) {
      this.pickEdit = null;
      return true;
    }
    if (this.entry) {
      this.entry = null;
      return true;
    }
    if (this.draft) {
      this.keepOpenLine();
      this.draft = null;
      return true;
    }
    if (this.dimEdit) {
      this.dimEdit = null;
      return true;
    }
    if (this.tool === "dimension" && this.selectedId) {
      this.selectedId = null;
      return true;
    }
    if (this.tool !== "select") {
      this.tool = "select";
      return true;
    }
    if (this.pickedConstraint || this.picks.length || this.selectedId) {
      this.pickedConstraint = null;
      this.picks = [];
      this.selectedId = null;
      return true;
    }
    return false;
  }

  deleteSelected() {
    if (this.pickedConstraint) return this.deleteConstraint(this.pickedConstraint);
    if (!this.selectedId) return false;
    const ok = this.store.remove(this.key, this.selectedId);
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
  /** Does the session want typed characters, Backspace, Tab and Enter right now? */
  wantsKeys() {
    return !!this.draft || (this.tool === "dimension" && !!this.dimTarget()) || (this.tool === "select" && !!this.valueChip());
  }

  readout() {
    if (this.tool === "dimension") return [];
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
    if (this.tool === "extrude") return "Extrude: click a closed shape, then pull it (drag or type a distance).";
    if (this.tool === "dimension") {
      if (this.dimEdit) return "Type a number. Tab: next dimension   Enter: apply   Esc: cancel";
      return this.dimTarget() ? "Click a number or just type a size, then Enter." : "Dimension: point at a shape, then click it.";
    }
    const n = this.draft?.pts.length ?? 0;
    const typing = this.entry ? "  Tab: next field   Enter: apply   Esc: stop typing" : "  (or just type a size)";
    if (this.tool === "rect") return n ? `Click the opposite corner${typing}` : "Rectangle: click the first corner.";
    if (this.tool === "circle") return n ? `Click to set the size${typing}` : "Circle: click the centre.";
    if (this.tool === "line") return n ? `Click the next point; click the first point to close; Enter to finish${typing}` : "Line: click the first point.";
    return ""; // the select tool shows its actions in the bar and its numbers next to the selection: no sentence here
  }
}
