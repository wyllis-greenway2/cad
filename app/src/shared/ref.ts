// A Ref is the stable name of one part (`dec_clean_engine_design` section 2): the only way anything refers to a part.
//   d/<id>[.<sub>]   drawn parts            d/e_001.p1 (a corner), d/e_001.s0 (a line), d/e_002.c (a circle)
//   b/<step>/<name>  parts of the body       (derived from the kernel result; always a reference)
//   w/<name>         world parts             w/X, w/XY
declare const refBrand: unique symbol;
export type Ref = string & { readonly [refBrand]: true };

export type RefOrigin = "drawn" | "body" | "world";

export const ref = (s: string): Ref => {
  if (!/^(d|b|w)\/\S+$/.test(s)) throw new Error(`not a part name: ${s}`);
  return s as Ref;
};
export const drawnRef = (id: string): Ref => ref(`d/${id}`);
export const worldRef = (name: string): Ref => ref(`w/${name}`);
export const bodyRef = (step: string, name: string): Ref => ref(`b/${step}/${name}`);

export const originOf = (r: Ref): RefOrigin => (r.startsWith("d/") ? "drawn" : r.startsWith("b/") ? "body" : "world");

/** Counter-based ids ("e_001"): the scene keeps the counter, so ids are never reused (undo and redo stay consistent). */
export const formatId = (prefix: string, n: number): string => `${prefix}_${String(n).padStart(3, "0")}`;
