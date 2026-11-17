// The part of `facenames.mjs` that tests reach (`test/wheelspeed.test.ts`): the surfaces of a shape, each with its kind and its box; `quickFrom` is the number of freeform faces above which their boxes are the quick ones.
export const QUICK_FROM: number;
export function surfacesOf(shape: unknown, quickFrom?: number): { kind: string; lo: number[]; hi: number[] }[];
