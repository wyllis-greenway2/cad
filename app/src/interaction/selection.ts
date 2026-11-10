// The one ordered selection (`dec_clean_engine_design` section 4, `dec_interaction_spec`): a list of refs, the first selected moves to meet the one selected after it (`in_229`, which reversed `in_196`).
// Pure functions; nothing else holds selection state.
import type { Ref } from "../shared/ref.ts";
import type { Lookup } from "../operation/part.ts";

export type Selection = readonly Ref[];

export const select = (_sel: Selection, r: Ref): Selection => [r];
/** Shift + click: add (a part already in the selection stays where it is). */
export const extend = (sel: Selection, r: Ref): Selection => (sel.includes(r) ? sel : [...sel, r]);
/** Shift + click on a selected part takes it out; on another, adds it. */
export const toggle = (sel: Selection, r: Ref): Selection => (sel.includes(r) ? sel.filter((x) => x !== r) : [...sel, r]);
export const clear = (): Selection => [];

/** The next candidate after `current` in the list (wrapping); the first if `current` is not in it. */
export function cycle(candidates: readonly Ref[], current: Ref | undefined): Ref | undefined {
  if (!candidates.length) return undefined;
  const i = current === undefined ? -1 : candidates.indexOf(current);
  return candidates[(i + 1) % candidates.length];
}

/** What the last click left behind, so a click at the same spot with the same candidates cycles instead of selecting the first again (`in_088`). */
export interface ClickState {
  selection: Selection;
  /** the candidate list of the previous click, as a signature ("" for none) */
  spot: string;
  /** the order the first click at this spot found them in, which the clicks after it keep going through (the order by distance can change with a pixel of movement) */
  order?: readonly Ref[];
}
export const initialClick = (): ClickState => ({ selection: [], spot: "" });
/** The same set of candidates is the same spot, whatever order the pointer's exact distances put them in. */
const signature = (c: readonly Ref[]) => [...c].sort().join("|");

/**
 * One click. `candidates` is the ordered list at the pointer (corners, then lines, then faces and planes). Returns the new state and, when the click
 * cycled through several things at one spot, `{ index, of }` for a short message ("2 of 3 here").
 */
export function click(state: ClickState, candidates: readonly Ref[], opts: { shift?: boolean } = {}): { state: ClickState; cycled?: { index: number; of: number } } {
  if (!candidates.length) return { state: { selection: clear(), spot: "" } }; // a click on nothing lets go of everything
  const sig = signature(candidates);
  const repeated = sig === state.spot && candidates.length > 1;
  const order = repeated && state.order ? state.order : candidates;
  const sel = state.selection;
  if (!opts.shift) {
    const pick = repeated ? cycle(order, sel[0]) : candidates[0]!;
    return { state: { selection: select(sel, pick!), spot: sig, order }, ...(repeated ? { cycled: { index: order.indexOf(pick!) + 1, of: order.length } } : {}) };
  }
  // Shift or Ctrl (Cmd): add what is under the pointer, or take it out if it is selected (`in_257`), every time, also on the same spot again (it used to be swapped for the next one under the pointer: a plain
  // click cycles through those now). What lies under the first thing is taken out by moving the pointer to where the first thing is another one, or by a Ctrl + drag rectangle.
  return { state: { selection: toggle(sel, candidates[0]!), spot: sig, order } };
}

/**
 * The selection in the order that matters for relations: the part that moves comes first and the ones that stay come after it. The FIRST selected part moves to meet the one selected after it (`in_229`,
 * which reversed `in_196`, which reversed `in_090`); with more than two, the first moves and all the later ones stay. A part that cannot move (the body, an earlier step) always stays.
 */
export function ordered(sel: Selection, get: Lookup): Selection {
  const movable = sel.filter((r) => get(r)?.movable); // (the first selected moves, the ones after it stay)
  const fixed = sel.filter((r) => !get(r)?.movable);
  return [...movable, ...fixed];
}
/** The part that moves: the first selected part that can. Undefined if nothing selected can move. */
export const mover = (sel: Selection, get: Lookup): Ref | undefined => sel.find((r) => get(r)?.movable);
export const reference = (sel: Selection, get: Lookup): Ref | undefined => ordered(sel, get)[1];
