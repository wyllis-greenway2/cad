// The document (E72 to E75): what is saved and opened, and the history of changes to it. Pure data and pure functions: no kernel, no clock, no file system (the platform's file service takes the text).
//  - a document is the recipe, the named parameters (E66) and the names the person gave (to steps, and to bodies by their id: an id is structural, so a name survives the file being opened again)
//  - saving is canonical (the same document is the same bytes; one step a line, so a version-control diff reads); opening checks everything and says in words what is wrong with a file
//  - every change is a function from a document to a document; the history keeps the documents (steps are shared, not copied), so undo and redo are exact and cost no recomputation by themselves
import { MISSING, insertStep, moveStep, removeStep, swapWithInput, validateRecipe } from "./recipe.ts";
import { type Table, canonical, isReserved, namesIn, usedBy, valuesOf } from "./params.ts";
import type { Step } from "./steps.ts";

export const FORMAT = "cad-document", VERSION = 1;
export interface Doc { readonly format: typeof FORMAT; readonly version: number; readonly steps: readonly Step[]; readonly parameters: Table; /** a name for a step, by its id */ readonly labels: Readonly<Record<string, string>>; /** a name for a body, by the body's id (its key) */ readonly names: Readonly<Record<string, string>> }
export class DocError extends Error {}
export const emptyDoc = (): Doc => ({ format: FORMAT, version: VERSION, steps: [], parameters: {}, labels: {}, names: {} });

// ---------------------------------------------------------------- save and open
/** the document as text: keys in order, one step to a line; the same document is always the same text */
export function save(doc: Doc): string {
  const j = canonical;
  return `{"format":${j(doc.format)},"version":${doc.version},\n"parameters":${j(doc.parameters)},\n"labels":${j(doc.labels)},\n"names":${j(doc.names)},\n"steps":[\n${doc.steps.map((s) => j(s)).join(",\n")}\n]}\n`;
}
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const strMap = (v: unknown, what: string): Record<string, string> => { if (v === undefined) return {}; if (!isObj(v) || Object.values(v).some((x) => typeof x !== "string")) throw new DocError(`${what} must be a list of names (text)`); return v as Record<string, string>; };
/** a document from its text; a file that is not one, or is newer than this program, or is broken inside, is refused in words that say where */
export function open(text: string): { doc: Doc; warnings: string[] } {
  let raw: unknown; try { raw = JSON.parse(text); } catch { throw new DocError("this is not a document: it is not readable as JSON"); }
  if (!isObj(raw) || raw.format !== FORMAT) throw new DocError("this is not a document of this program (its format is not ours)");
  if (typeof raw.version !== "number" || !Number.isInteger(raw.version) || raw.version < 1) throw new DocError("this document has no version");
  if (raw.version > VERSION) throw new DocError(`this document was made by a newer version of the program (its version is ${raw.version}, this one reads up to ${VERSION}): nothing was changed`);
  if (!Array.isArray(raw.steps)) throw new DocError("the document has no list of steps");
  const steps: Step[] = raw.steps.map((s, i) => {
    if (!isObj(s) || typeof s.id !== "string" || !s.id || typeof s.kind !== "string" || !isObj(s.params) || !Array.isArray(s.inputs) || s.inputs.some((x) => typeof x !== "string")) throw new DocError(`step number ${i + 1} is not a step (it needs an id, a kind, numbers and the steps it works on)`);
    return { id: s.id, kind: s.kind, params: s.params, inputs: s.inputs as string[] } as Step;
  });
  try { validateRecipe(steps); } catch (e) { throw new DocError(`the steps do not hold together: ${(e as Error).message}`); }
  const parameters: Table = {}; if (raw.parameters !== undefined) { if (!isObj(raw.parameters)) throw new DocError("the parameters must be a list of names with numbers or expressions"); for (const [k, v] of Object.entries(raw.parameters)) { if (typeof v !== "number" && typeof v !== "string") throw new DocError(`the parameter ${k} is neither a number nor an expression`); parameters[k] = v; } }
  const labels = strMap(raw.labels, "the labels"), names = strMap(raw.names, "the names"), warnings: string[] = [];
  for (const id of Object.keys(labels)) if (!steps.some((s) => s.id === id)) warnings.push(`the name "${labels[id]}" is for a step (${id}) that is not in the document`);
  return { doc: { format: FORMAT, version: raw.version, steps, parameters, labels, names }, warnings };
}

// ---------------------------------------------------------------- changes: each is a function from a document to a document
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const with_ = (d: Doc, p: Partial<Doc>): Doc => ({ ...d, ...p });
export function editStep(d: Doc, id: string, params: Record<string, unknown>): Doc { if (!d.steps.some((s) => s.id === id)) throw new DocError(`no step ${id}`); return with_(d, { steps: d.steps.map((s) => (s.id === id ? { ...s, params } : s)) }); }
export function insert(d: Doc, step: Step, opts: { after?: string; splice?: boolean } = {}): Doc { try { return with_(d, { steps: insertStep(d.steps, step, opts) }); } catch (e) { throw new DocError((e as Error).message); } }
export function remove(d: Doc, id: string): Doc { try { const { [id]: _g, ...labels } = d.labels as Record<string, string>; void _g; return with_(d, { steps: removeStep(d.steps, id), labels }); } catch (e) { throw new DocError((e as Error).message); } }
export function move(d: Doc, id: string, after: string | null): Doc { try { return with_(d, { steps: moveStep(d.steps, id, after) }); } catch (e) { throw new DocError((e as Error).message); } }
export function swap(d: Doc, id: string): Doc { try { return with_(d, { steps: swapWithInput(d.steps, id) }); } catch (e) { throw new DocError((e as Error).message); } }
/** an id no step has: `prefix`, then the first number free */
export function freshId(d: Doc, prefix: string): string { const have = new Set(d.steps.map((s) => s.id)); for (let n = 1; ; n++) if (!have.has(`${prefix}${n}`)) return `${prefix}${n}`; }

/** a name given a number or an expression; a name that is not allowed, an expression that does not parse, one that goes round on itself, is refused in words and nothing changes */
export function setParameter(d: Doc, name: string, value: number | string): Doc {
  if (!NAME.test(name)) throw new DocError(`${JSON.stringify(name)} is not a name a parameter can have (letters, digits and _, not starting with a digit)`);
  if (isReserved(name)) throw new DocError(`${name} is a constant or a function, not a name a parameter can have`);
  const next = { ...d.parameters, [name]: value }, bad = valuesOf(next).errors[name];
  if (bad !== undefined && /depends on itself|position|expected|not expected|no function|takes \d/.test(bad)) throw new DocError(bad);
  return with_(d, { parameters: next });
}
/** which steps and which other parameters use a parameter */
export function usersOf(d: Doc, name: string): { steps: string[]; parameters: string[] } {
  return { steps: d.steps.filter((s) => usedBy(s.params).has(name)).map((s) => s.id), parameters: Object.entries(d.parameters).filter(([k, v]) => k !== name && typeof v === "string" && (() => { try { return namesIn(v).includes(name); } catch { return false; } })()).map(([k]) => k) };
}
export function deleteParameter(d: Doc, name: string): Doc {
  if (!(name in d.parameters)) throw new DocError(`there is no parameter ${name}`);
  const u = usersOf(d, name); if (u.steps.length || u.parameters.length) throw new DocError(`${name} is used by ${[...u.steps.map((s) => `step ${s}`), ...u.parameters.map((p) => `parameter ${p}`)].join(", ")}: change those first`);
  const { [name]: _v, ...rest } = d.parameters; void _v; return with_(d, { parameters: rest });
}
const rewrite = (expr: string, from: string, to: string): string => expr.replace(/[A-Za-z_][A-Za-z0-9_]*(?!\w)(\s*\()?/g, (m, call) => (call || m !== from ? m : to));
const rewriteAll = (v: unknown, from: string, to: string): unknown => (typeof v === "string" ? (v.startsWith("=") ? rewrite(v, from, to) : v) : Array.isArray(v) ? v.map((x) => rewriteAll(x, from, to)) : isObj(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rewriteAll(x, from, to)])) : v);
/** a parameter under another name, and every expression that used it follows (a function of the same name is left alone) */
export function renameParameter(d: Doc, from: string, to: string): Doc {
  if (!(from in d.parameters)) throw new DocError(`there is no parameter ${from}`);
  if (to in d.parameters) throw new DocError(`there is already a parameter ${to}`);
  if (!NAME.test(to) || isReserved(to)) throw new DocError(`${JSON.stringify(to)} is not a name a parameter can have`);
  const parameters: Table = {}; for (const [k, v] of Object.entries(d.parameters)) parameters[k === from ? to : k] = typeof v === "string" ? rewrite(v, from, to) : v;
  return with_(d, { parameters, steps: d.steps.map((s) => ({ ...s, params: rewriteAll(s.params, from, to) as Record<string, unknown> })) });
}
/** a name for a step ("" takes it away) */
export function labelStep(d: Doc, id: string, name: string): Doc { if (!d.steps.some((s) => s.id === id)) throw new DocError(`no step ${id}`); const { [id]: _o, ...rest } = d.labels as Record<string, string>; void _o; return with_(d, { labels: name ? { ...rest, [id]: name } : rest }); }
/** a name for a body, by the body's id key ("" takes it away); two bodies cannot have one name */
export function nameBody(d: Doc, key: string, name: string): Doc {
  const { [key]: _o, ...rest } = d.names as Record<string, string>; void _o;
  if (!name) return with_(d, { names: rest });
  const clash = Object.entries(rest).find(([, v]) => v === name); if (clash) throw new DocError(`another body is already called ${name}`);
  return with_(d, { names: { ...rest, [key]: name } });
}
/** the name a body goes by: the one the person gave it (by its id or an id it answers to), else null */
export const bodyName = (d: Doc, keys: readonly string[]): string | null => { for (const k of keys) { const n = d.names[k]; if (n !== undefined) return n; } return null; };
/** names of bodies that no body in the picture answers to any more (for the screen to offer to clear) */
export const unusedNames = (d: Doc, live: readonly string[]): string[] => Object.keys(d.names).filter((k) => !live.includes(k));
export { MISSING };

// ---------------------------------------------------------------- undo and redo
export interface Entry { label: string; doc: Doc; merge?: string; /** an automatic cleanup (E33): what it cleaned, so that undoing it is remembered and it is not done again */ auto?: string }
/**
 * The history of a document: every state, in order, with a pointer. `do` puts a new state after the pointer (what was after it, the redo, is gone); a change given the same `merge` key as the one before it
 * (a number dragged: one change to the person) replaces it instead of adding one. The states share their steps, so a long history costs little.
 */
export class History {
  private entries: Entry[]; private at = 0; private saved = 0; private readonly limit: number; private lastMerge: string | undefined;
  constructor(doc: Doc, limit = 500) { this.entries = [{ label: "open", doc }]; this.limit = limit; }
  get doc(): Doc { return this.entries[this.at]!.doc; }
  get canUndo(): boolean { return this.at > 0; }
  get canRedo(): boolean { return this.at < this.entries.length - 1; }
  /** what undo would undo and redo would redo, in the words the change was given */
  get next(): { undo: string | null; redo: string | null } { return { undo: this.canUndo ? this.entries[this.at]!.label : null, redo: this.canRedo ? this.entries[this.at + 1]!.label : null }; }
  private declinedKeys = new Set<string>();
  /** automatic changes the person undid: not made again (E33) */
  declined(key: string): boolean { return this.declinedKeys.has(key); }
  do(doc: Doc, label: string, opts: { merge?: string; auto?: string } = {}): Doc {
    if (opts.merge !== undefined && opts.merge === this.lastMerge && this.at === this.entries.length - 1 && this.at > 0 && this.saved !== this.at) { this.entries[this.at] = { label, doc, merge: opts.merge }; return doc; }
    this.entries = [...this.entries.slice(0, this.at + 1), { label, doc, merge: opts.merge, ...(opts.auto ? { auto: opts.auto } : {}) }]; this.at++; this.lastMerge = opts.merge;
    if (this.saved > this.at - 1 && this.saved >= this.at) this.saved = -1; // the saved state was in the redo that is gone
    if (this.entries.length > this.limit) { this.entries.shift(); this.at--; if (this.saved >= 0) this.saved--; }
    return doc;
  }
  undo(): Doc | null { if (!this.canUndo) return null; const undone = this.entries[this.at]!; if (undone.auto) this.declinedKeys.add(undone.auto); this.at--; this.lastMerge = undefined; return this.doc; }
  redo(): Doc | null { if (!this.canRedo) return null; this.at++; this.lastMerge = undefined; return this.doc; }
  /** the document as saved: the state now is the saved one */
  markSaved(): void { this.saved = this.at; this.lastMerge = undefined; }
  get modified(): boolean { return this.saved !== this.at; }
}
