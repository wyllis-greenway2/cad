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

  entities(plane) {
    return this.sketches[plane];
  }

  #apply(cmd, forward) {
    if (cmd.type.startsWith("feature-")) {
      const at = this.features.findIndex((f) => f.id === cmd.feature.id);
      const adding = (cmd.type === "feature-add") === forward;
      if (cmd.type === "feature-update") {
        if (at >= 0) this.features[at] = forward ? cmd.feature : cmd.before;
      } else if (adding) {
        if (at < 0) this.features.splice(Math.min(cmd.index, this.features.length), 0, cmd.feature);
      } else if (at >= 0) this.features.splice(at, 1);
      this.version++;
      return;
    }
    const list = this.sketches[cmd.plane];
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
    const e = { id: `e_${String(this.nextId++).padStart(3, "0")}`, ...entity };
    const cmd = { type: "add", plane, entity: e };
    this.#apply(cmd, true);
    this.past.push(cmd);
    this.future = [];
    return e;
  }

  remove(plane, id) {
    const entity = this.sketches[plane].find((e) => e.id === id);
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
  addFeature(plane, shape, distance) {
    const feature = { id: `f_${String(this.nextFeature++).padStart(3, "0")}`, plane, shape: JSON.parse(JSON.stringify(shape)), distance };
    this.#pushFeatureCmd({ type: "feature-add", feature, index: this.features.length });
    return feature;
  }
  updateFeature(id, distance) {
    const before = this.features.find((f) => f.id === id);
    if (!before) return false;
    this.#pushFeatureCmd({ type: "feature-update", feature: { ...before, distance }, before });
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
    const before = this.sketches[plane].find((e) => e.id === after.id);
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
