// The sketch model: entities per plane, with undo and redo as a command history. Pure (no DOM, no three.js).
// A command is { type: "add" | "remove", plane, entity }. The history list in the UI (later) reads `past`.
export class SketchStore {
  constructor() {
    this.sketches = { XY: [], XZ: [], YZ: [] };
    this.past = [];
    this.future = [];
    this.nextId = 1;
    this.version = 0; // bumped on every change so views know to redraw
  }

  entities(plane) {
    return this.sketches[plane];
  }

  #apply(cmd, forward) {
    const list = this.sketches[cmd.plane];
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
