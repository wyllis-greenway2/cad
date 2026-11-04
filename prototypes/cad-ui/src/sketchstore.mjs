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

  /** A step that consumed a loose sketch shape: take it off its plane (consume) or put it back (restore). */
  #swapConsumed(feature, consume) {
    const c = feature.consumed;
    if (!c) return;
    const list = this.entities(c.plane);
    const i = list.findIndex((e) => e.id === c.entity.id);
    if (consume) {
      if (i >= 0) list.splice(i, 1);
    } else if (i < 0) list.splice(Math.min(c.index, list.length), 0, c.entity);
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
    this.version++;
  }

  add(plane, entity) {
    if (this.isFeatureKey(plane)) return null; // a step's sketch cannot be extended
    const e = { id: `e_${String(this.nextId++).padStart(3, "0")}`, ...entity };
    const cmd = { type: "add", plane, entity: e };
    this.#apply(cmd, true);
    this.past.push(cmd);
    this.future = [];
    return e;
  }

  remove(plane, id) {
    if (this.isFeatureKey(plane)) return false;
    const entity = this.entities(plane).find((e) => e.id === id);
    if (!entity) return false;
    const cmd = { type: "remove", plane, entity };
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
    const feature = { id: `f_${String(this.nextFeature++).padStart(3, "0")}`, plane, shape: JSON.parse(JSON.stringify(shape)), distance, ...(frame ? { frame: JSON.parse(JSON.stringify(frame)) } : {}), ...(consumed ? { consumed: { plane, entity: JSON.parse(JSON.stringify(consumed)), index: this.entities(plane).findIndex((e) => e.id === consumed.id) } } : {}) };
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
