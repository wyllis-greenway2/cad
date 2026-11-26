// Undo and redo of everything the person has made (`in_1567`): the drawings on the planes and the recipe together, as one state. `engine/document.ts` has a history of a document (the recipe alone); a drawing that is not a step yet is not in a
// document, so the screen keeps this one, of whole states (they share what did not change, so a long history costs little). A change given the same `merge` key as the one before it (a number typed again and again) replaces it instead of adding one.
export interface UndoEntry<T> {
  label: string;
  state: T;
  merge?: string;
}
export class Undo<T> {
  private entries: UndoEntry<T>[];
  private at = 0;
  private lastMerge: string | undefined;
  private readonly limit: number;
  constructor(state: T, limit = 500) {
    this.entries = [{ label: "start", state }];
    this.limit = limit;
  }
  get state(): T {
    return this.entries[this.at]!.state;
  }
  get canUndo(): boolean {
    return this.at > 0;
  }
  get canRedo(): boolean {
    return this.at < this.entries.length - 1;
  }
  /** what undo would undo and redo would redo, in the words the change was given */
  get next(): { undo: string | null; redo: string | null } {
    return {
      undo: this.canUndo ? this.entries[this.at]!.label : null,
      redo: this.canRedo ? this.entries[this.at + 1]!.label : null,
    };
  }
  /** a new state after the one now; what was ahead of it (the redo) is gone */
  do(state: T, label: string, merge?: string): void {
    if (merge !== undefined && merge === this.lastMerge && this.at > 0 && this.at === this.entries.length - 1) {
      this.entries[this.at] = { label, state, merge };
      return;
    }
    this.entries = [...this.entries.slice(0, this.at + 1), { label, state, ...(merge !== undefined ? { merge } : {}) }];
    this.at++;
    this.lastMerge = merge;
    if (this.entries.length > this.limit) {
      this.entries.shift();
      this.at--;
    }
  }
  undo(): T | null {
    if (!this.canUndo) return null;
    this.at--;
    this.lastMerge = undefined;
    return this.state;
  }
  redo(): T | null {
    if (!this.canRedo) return null;
    this.at++;
    this.lastMerge = undefined;
    return this.state;
  }
}
