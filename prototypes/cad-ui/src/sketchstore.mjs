import { refsOf, shapeOfRef, solveSketch } from "./sketchsolve.mjs";
// The sketch model: entities per plane, with undo and redo as a command history. Pure (no DOM, no three.js).
// A command is { type: "add" | "remove" | "update", plane, entity (for update: the new one, with `before` = the old one) }. The history list in the UI (later) reads `past`.
export class SketchStore {
  constructor() {
    this.sketches = { XY: [], XZ: [], YZ: [] };
    this.past = [];
    this.future = [];
    this.features = []; // extrusions: { id, plane, shape (a copy of the shape's data), distance }; they build the body in order
    this.nextId = 1;
    this.nextFeature = 1;
    this.cons = {}; // constraints of the loose sketches: plane -> [{ id, type, ...refs }]
    this.nextCons = 1;
    this.version = 0; // bumped on every change so views know to redraw
  }

  /** The entities of a sketch: a plane's loose sketch, or (key "feat:<id>") the profile of an extrusion step, which is a view of that step's own shape. */
  entities(key) {
    if (typeof key === "string" && key.startsWith("feat:")) {
      const f = this.features.find((x) => x.id === key.slice(5));
      return f && f.shape ? [{ ...f.shape, id: f.consumed?.entity.id ?? f.id }] : [];
    }
    return (this.sketches[key] ??= []); // face planes appear as they are first used
  }
  isFeatureKey = (key) => typeof key === "string" && key.startsWith("feat:");
  /** The constraints of a sketch (a plane's loose sketch, or a step's own). The array is live: change it only through edit(). */
  constraintsOf(key) {
    if (this.isFeatureKey(key)) {
      const f = this.features.find((x) => x.id === key.slice(5));
      return f ? (f.constraints ??= []) : [];
    }
    return (this.cons[key] ??= []);
  }
  newConstraintId() {
    return `c_${String(this.nextCons++).padStart(3, "0")}`;
  }
  #setConstraints(key, list) {
    if (this.isFeatureKey(key)) {
      const f = this.features.find((x) => x.id === key.slice(5));
      if (f) f.constraints = JSON.parse(JSON.stringify(list));
    } else this.cons[key] = JSON.parse(JSON.stringify(list));
  }
  /**
   * One undoable change to a sketch: replace some shapes (same ids) and/or its whole constraint list. Used by dimension edits, constraints and dragging.
   * `entities`: the changed shapes (full objects); `constraints`: the new list (omit to leave it).
   */
  edit(key, { entities = [], constraints = null }) {
    const list = this.entities(key);
    const before = entities.map((e) => list.find((x) => x.id === e.id)).filter(Boolean).map((e) => JSON.parse(JSON.stringify(e)));
    const after = before.map((b) => JSON.parse(JSON.stringify(entities.find((e) => e.id === b.id))));
    const cmd = { type: "sketch-edit", plane: key, before, after, consBefore: JSON.parse(JSON.stringify(this.constraintsOf(key))), consAfter: constraints ? JSON.parse(JSON.stringify(constraints)) : null };
    this.#apply(cmd, true);
    this.past.push(cmd);
    this.future = [];
    return true;
  }

  /** A step that consumed a loose sketch shape: take it off its plane (consume) or put it back (restore). */
  #swapConsumed(feature, consume) {
    const c = feature.consumed;
    if (!c) return;
    const list = this.entities(c.plane);
    const i = list.findIndex((e) => e.id === c.entity.id);
    const loose = this.cons[c.plane] ?? [];
    const mine = new Set([...(c.moved ?? []), ...(c.released ?? [])].map((k) => k.id));
    if (consume) {
      if (i >= 0) list.splice(i, 1);
      this.cons[c.plane] = loose.filter((k) => !mine.has(k.id)); // its constraints go with it (or, if they linked it to other shapes, are released)
    } else {
      if (i < 0) list.splice(Math.min(c.index, list.length), 0, c.entity);
      this.cons[c.plane] = [...loose, ...(c.moved ?? []), ...(c.released ?? [])].map((k) => JSON.parse(JSON.stringify(k)));
    }
  }

  #apply(cmd, forward) {
    if (cmd.type.startsWith("feature-")) {
      const at = this.features.findIndex((f) => f.id === cmd.feature.id);
      const adding = (cmd.type === "feature-add") === forward;
      if (cmd.type === "feature-update") {
        if (at >= 0) this.features[at] = forward ? cmd.feature : cmd.before;
      } else if (adding) {
        if (at < 0) this.features.splice(Math.min(cmd.index, this.features.length), 0, cmd.feature);
        this.#swapConsumed(cmd.feature, true); // a step in the history owns its sketch: it is no longer loose on the plane
      } else if (at >= 0) {
        this.features.splice(at, 1);
        this.#swapConsumed(cmd.feature, false); // without the step the sketch is loose again
      }
      this.version++;
      return;
    }
    if (cmd.type === "sketch-edit") {
      const ents = forward ? cmd.after : cmd.before;
      if (this.isFeatureKey(cmd.plane)) {
        const f = this.features.find((x) => x.id === cmd.plane.slice(5));
        if (f && ents[0]) {
          const { id, ...shape } = ents[0];
          f.shape = JSON.parse(JSON.stringify(shape));
        }
      } else {
        const list = this.entities(cmd.plane);
        for (const e of ents) {
          const i = list.findIndex((x) => x.id === e.id);
          if (i >= 0) list[i] = JSON.parse(JSON.stringify(e));
        }
      }
      if (cmd.consAfter) this.#setConstraints(cmd.plane, forward ? cmd.consAfter : cmd.consBefore);
      this.version++;
      return;
    }
    if (this.isFeatureKey(cmd.plane)) {
      // editing the sketch of a step: the entity is the step's own shape
      const f = this.features.find((x) => x.id === cmd.plane.slice(5));
      if (f && cmd.type === "update") {
        const { id, ...shape } = forward ? cmd.entity : cmd.before;
        f.shape = shape;
      }
      this.version++;
      return;
    }
    const list = this.entities(cmd.plane);
    if (cmd.type === "update") {
      const i = list.findIndex((e) => e.id === cmd.entity.id);
      if (i >= 0) list[i] = forward ? cmd.entity : cmd.before;
      this.version++;
      return;
    }
    const adding = (cmd.type === "add") === forward;
    if (adding) {
      if (!list.some((e) => e.id === cmd.entity.id)) list.push(cmd.entity);
    } else {
      const i = list.findIndex((e) => e.id === cmd.entity.id);
      if (i >= 0) list.splice(i, 1);
    }
    if (cmd.type === "remove" && cmd.consRemoved?.length) {
      const ids = new Set(cmd.consRemoved.map((c) => c.id));
      const cur = (this.cons[cmd.plane] ??= []).filter((c) => !ids.has(c.id));
      this.cons[cmd.plane] = adding ? [...cur, ...cmd.consRemoved.map((c) => ({ ...c }))] : cur; // undoing the removal puts the constraints back
    }
    if (cmd.type === "add" && cmd.consAdd?.length) {
      const ids = new Set(cmd.consAdd.map((c) => c.id));
      const cur = (this.cons[cmd.plane] ??= []).filter((c) => !ids.has(c.id));
      this.cons[cmd.plane] = forward ? [...cur, ...cmd.consAdd.map((c) => ({ ...c }))] : cur;
    }
    this.version++;
  }

  /** Add a shape. `constraintsFor(shape)` may return constraints (without ids) to add with it in the same undo step. */
  add(plane, entity, constraintsFor = null) {
    if (this.isFeatureKey(plane)) return null; // a step's sketch cannot be extended
    const e = { id: `e_${String(this.nextId++).padStart(3, "0")}`, ...entity };
    const consAdd = (constraintsFor ? constraintsFor(e) : []).map((c) => ({ id: this.newConstraintId(), ...c }));
    const cmd = { type: "add", plane, entity: e, consAdd };
    this.#apply(cmd, true);
    this.past.push(cmd);
    this.future = [];
    return e;
  }

  /**
   * Keep pins to body corners and directions from body lines true when the body changes (`dec_no_sketch_isolation`, stage 2). `resolve(key, constraint)` finds the body part again (the nearest one)
   * and returns { ext, at } (a corner) or { ext, dir } (a line), or null if it is gone. A constraint whose part is gone is marked lost and stops acting. Only loose sketches follow the body: a sketch that has become a step
   * keeps the place it was pinned to (following would make the step depend on the body it builds). Not an edit: it is derived state, so it is not in the undo history.
   */
  refreshAnchors(resolve) {
    let changed = false;
    for (const key of Object.keys(this.cons)) {
      const list = this.cons[key];
      let touched = false;
      for (const c of list) {
        if (c.type !== "anchor" && c.type !== "extDir") continue;
        const r = resolve(key, c); // { ext, at } for a pin to a corner, { ext, dir } for a direction from a line; null if the part is gone
        if (!r) {
          if (!c.ext.lost) (c.ext = { ...c.ext, lost: true }), (touched = true);
          continue;
        }
        const next = { ...c, ...(r.at ? { at: r.at } : {}), ...(r.dir ? { dir: r.dir } : {}), ext: { ...r.ext, lost: false } };
        if (JSON.stringify([next.at, next.dir, next.ext]) !== JSON.stringify([c.at, c.dir, c.ext])) (Object.assign(c, next), (touched = true));
      }
      if (touched) {
        const ents = this.entities(key);
        const res = solveSketch(ents, list);
        if (res.status === "ok") res.entities.forEach((e, k) => (ents[k] = e));
        changed = true;
      }
    }
    if (changed) this.version++;
    return changed;
  }
  /** The constraints of a sketch that use any part of this shape (what deleting it would take with it). */
  dependentsOf(key, shapeId) {
    return this.constraintsOf(key).filter((c) => refsOf(c).some((r) => shapeOfRef(r) === shapeId));
  }
  remove(plane, id) {
    if (this.isFeatureKey(plane)) return false;
    const entity = this.entities(plane).find((e) => e.id === id);
    if (!entity) return false;
    const cmd = { type: "remove", plane, entity, consRemoved: this.dependentsOf(plane, id).map((c) => ({ ...c })) }; // the constraints that used it go with it (and come back on undo)
    this.#apply(cmd, true);
    this.past.push(cmd);
    this.future = [];
    return true;
  }

  #pushFeatureCmd(cmd) {
    this.#apply(cmd, true);
    this.past.push(cmd);
    this.future = [];
  }
  /** frame = { origin, xDir, normal } of the plane the shape was drawn on (a copy, so the feature does not move with the face). */
  addFeature(plane, shape, distance, frame = null, consumed = null) {
    // `consumed` = the loose sketch entity (with its id) this step takes over: it leaves the plane and is restored by undo
    // the constraints entirely inside the consumed shape move with it; ones that linked it to other shapes are released (kept so undo can put them back)
    const loose = consumed ? this.constraintsOf(plane) : [];
    const moved = loose.filter((k) => refsOf(k).length && refsOf(k).every((r) => shapeOfRef(r) === consumed.id));
    const released = loose.filter((k) => !moved.includes(k) && refsOf(k).some((r) => shapeOfRef(r) === consumed.id));
    const feature = { id: `f_${String(this.nextFeature++).padStart(3, "0")}`, plane, shape: JSON.parse(JSON.stringify(shape)), distance, ...(frame ? { frame: JSON.parse(JSON.stringify(frame)) } : {}), ...(consumed ? { constraints: JSON.parse(JSON.stringify(moved)), consumed: { plane, entity: JSON.parse(JSON.stringify(consumed)), index: this.entities(plane).findIndex((e) => e.id === consumed.id), moved: JSON.parse(JSON.stringify(moved)), released: JSON.parse(JSON.stringify(released)) } } : {}) };
    this.#pushFeatureCmd({ type: "feature-add", feature, index: this.features.length });
    return feature;
  }
  /** Push or pull a flat face of the body. ref = { axis, sign, offset, point } finds the face again when the model is rebuilt. */
  addFaceFeature(ref, distance) {
    const feature = { id: `f_${String(this.nextFeature++).padStart(3, "0")}`, kind: "face", plane: null, ref: JSON.parse(JSON.stringify(ref)), distance };
    this.#pushFeatureCmd({ type: "feature-add", feature, index: this.features.length });
    return feature;
  }
  /** Move, rotate or scale the whole body: mode "move" | "rotate" | "scale", axis 0..2, value in mm, degrees or a factor (kept in `distance` so editing is the same as for extrusions). */
  addTransformFeature(mode, axis, value) {
    const feature = { id: `f_${String(this.nextFeature++).padStart(3, "0")}`, kind: "transform", plane: null, mode, axis, distance: value };
    this.#pushFeatureCmd({ type: "feature-add", feature, index: this.features.length });
    return feature;
  }
  /** Tilt a flat face about a world axis lying in it; value in degrees (kept in `distance`). */
  addFaceTiltFeature(ref, axis, value) {
    const feature = { id: `f_${String(this.nextFeature++).padStart(3, "0")}`, kind: "faceTilt", plane: null, ref: JSON.parse(JSON.stringify(ref)), axis, distance: value };
    this.#pushFeatureCmd({ type: "feature-add", feature, index: this.features.length });
    return feature;
  }
  /** A whole-model step on one selected thing: kind "edge" (mode fillet or chamfer, value in mm), "cylRadius" (new radius) or "cylDraft" (degrees). */
  addRefFeature(kind, ref, value, extra = {}) {
    const feature = { id: `f_${String(this.nextFeature++).padStart(3, "0")}`, kind, plane: null, ref: JSON.parse(JSON.stringify(ref)), ...extra, distance: value };
    this.#pushFeatureCmd({ type: "feature-add", feature, index: this.features.length });
    return feature;
  }
  /** Delete the whole body (a step in the history, so it can be undone). */
  addClearFeature() {
    const feature = { id: `f_${String(this.nextFeature++).padStart(3, "0")}`, kind: "clear", plane: null, distance: 0 };
    this.#pushFeatureCmd({ type: "feature-add", feature, index: this.features.length });
    return feature;
  }
  updateFeature(id, distance, extra = {}) {
    const before = this.features.find((f) => f.id === id);
    if (!before) return false;
    this.#pushFeatureCmd({ type: "feature-update", feature: { ...before, ...extra, distance }, before });
    return true;
  }
  removeFeature(id) {
    const index = this.features.findIndex((f) => f.id === id);
    if (index < 0) return false;
    this.#pushFeatureCmd({ type: "feature-remove", feature: this.features[index], index });
    return true;
  }

  /** Replace an entity by `after` (same id). One undo step. */
  update(plane, after) {
    const before = this.entities(plane).find((e) => e.id === after.id);
    if (!before) return false;
    const cmd = { type: "update", plane, entity: after, before };
    this.#apply(cmd, true);
    this.past.push(cmd);
    this.future = [];
    return true;
  }

  canUndo() {
    return this.past.length > 0;
  }
  canRedo() {
    return this.future.length > 0;
  }

  /** Returns the command that was undone, or null. */
  undo() {
    const cmd = this.past.pop();
    if (!cmd) return null;
    this.#apply(cmd, false);
    this.future.push(cmd);
    return cmd;
  }

  redo() {
    const cmd = this.future.pop();
    if (!cmd) return null;
    this.#apply(cmd, true);
    this.past.push(cmd);
    return cmd;
  }
}
