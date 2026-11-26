// Ids of faces and edges (E6): minted by the step that made a thing, from its role and its inputs' ids; never from position, order of discovery or a count.
// An id is a structured value; its text form quotes every string, so no id can be mistaken for another by how it is joined.
export type Part = string | number | Id;
export interface Id {
  readonly step: string;
  readonly role: string;
  readonly of: readonly Part[];
  readonly pieces: readonly number[];
}

export const mint = (step: string, role: string, ...of: Part[]): Id => ({ step, role, of, pieces: [] });
/** the n-th piece of a face that split (E8): an id with a path of pieces */
export const piece = (id: Id, n: number): Id => ({ ...id, pieces: [...id.pieces, n] });

const partKey = (p: Part): string =>
  typeof p === "object" ? `{${idKey(p)}}` : typeof p === "number" ? `#${p}` : JSON.stringify(p);
/** the whole id as text, unambiguous (strings are quoted, nested ids braced): the key of maps */
export function idKey(id: Id): string {
  return `${baseKey(id)}${id.pieces.length ? "/" + id.pieces.join(".") : ""}`;
}
/** the id without its pieces: the face as it was before it split */
export function baseKey(id: Id): string {
  return `${JSON.stringify(id.step)}.${JSON.stringify(id.role)}(${id.of.map(partKey).join(",")})`;
}
/** is `child` the face `parent`, or one of the pieces it split into (E8) */
export function isPieceOf(child: Id, parent: Id): boolean {
  return (
    baseKey(child) === baseKey(parent) &&
    parent.pieces.length <= child.pieces.length &&
    parent.pieces.every((n, i) => child.pieces[i] === n)
  );
}
/** a short readable form for people and logs (not a key) */
export function show(id: Id): string {
  return `${id.step}.${id.role}${id.of.length ? "(" + id.of.map((p) => (typeof p === "object" ? show(p) : String(p))).join(",") + ")" : ""}${id.pieces.length ? "/" + id.pieces.join(".") : ""}`;
}

/** an edge is named by the two faces beside it (a pair, ordered by key so it is the same whichever is named first) */
export interface EdgeRef {
  readonly a: Id;
  readonly b: Id;
}
export const edgeRef = (x: Id, y: Id): EdgeRef => (idKey(x) <= idKey(y) ? { a: x, b: y } : { a: y, b: x });
export const edgeKey = (e: EdgeRef): string => JSON.stringify([idKey(e.a), idKey(e.b)]);

/** a vertex is named by the faces that meet at it (three or more, ordered by key: the same whichever is named first); a vertex on fewer faces (the seam of a cylinder) has no name */
export interface VertexRef {
  readonly faces: readonly Id[];
}
export const vertexRef = (faces: readonly Id[]): VertexRef => ({
  faces: [...faces].sort((x, y) => (idKey(x) < idKey(y) ? -1 : idKey(x) > idKey(y) ? 1 : 0)),
});
export const vertexKey = (v: VertexRef): string => JSON.stringify(v.faces.map(idKey));
