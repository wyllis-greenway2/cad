// Recipes for the curved step kinds, as a person's actions would make them. Ids are made by the same function the engine uses.
import { edgeRef, mint } from "../src/engine/id.ts";
import type { Step } from "../src/engine/steps.ts";

export interface C {
  r1: number;
  h1: number;
  r2: number;
  H: number;
  deg: number;
  w1: number;
  d1: number;
  w2: number;
  d2: number;
  dx: number;
  LH: number;
  ruled: boolean;
  w: number;
  h: number;
  d: number;
  t: number;
  r: number;
  l1: number;
  l2: number;
  R: number;
  rf: number;
}
export const C0: C = {
  r1: 10,
  h1: 6,
  r2: 6,
  H: 12,
  deg: 360,
  w1: 20,
  d1: 10,
  w2: 12,
  d2: 6,
  dx: 0,
  LH: 15,
  ruled: false,
  w: 40,
  h: 30,
  d: 20,
  t: 3,
  r: 3,
  l1: 30,
  l2: 25,
  R: 30,
  rf: 1,
};
const rect = (w: number, d: number, dx = 0): [number, number][] => [
  [-w / 2 + dx, -d / 2],
  [w / 2 + dx, -d / 2],
  [w / 2 + dx, d / 2],
  [-w / 2 + dx, d / 2],
];

/** a stepped shaft turned about Z */
export const revolveRecipe = (c: C): Step[] => [
  {
    id: "sk",
    kind: "sketchPolygon",
    params: {
      plane: "XZ",
      points: [
        [0, 0],
        [c.r1, 0],
        [c.r1, c.h1],
        [c.r2, c.h1],
        [c.r2, c.H],
        [0, c.H],
      ],
    },
    inputs: [],
  },
  { id: "R", kind: "revolve", params: { deg: c.deg }, inputs: ["sk"] },
];
/** two rectangles lofted */
export const loftRecipe = (c: C): Step[] => [
  { id: "a", kind: "sketchPolygon", params: { points: rect(c.w1, c.d1) }, inputs: [] },
  { id: "b", kind: "sketchPolygon", params: { offset: c.LH, points: rect(c.w2, c.d2, c.dx) }, inputs: [] },
  { id: "L", kind: "loft", params: { ruled: c.ruled }, inputs: ["a", "b"] },
];
/** a box with its top taken off */
export const shellRecipe = (c: C): Step[] => [
  {
    id: "sk",
    kind: "sketchPolygon",
    params: {
      points: [
        [0, 0],
        [c.w, 0],
        [c.w, c.h],
        [0, c.h],
      ],
    },
    inputs: [],
  },
  { id: "A", kind: "extrude", params: { d: c.d }, inputs: ["sk"] },
  { id: "S", kind: "shell", params: { face: mint("A", "end"), t: c.t }, inputs: ["A"] },
];
/** a circle swept along an L-shaped path, and along a quarter turn... (the L here) */
export const sweepRecipe = (c: C): Step[] => [
  { id: "pr", kind: "sketchCircle", params: { plane: "YZ", r: c.r }, inputs: [] },
  {
    id: "pa",
    kind: "sketchPolygon",
    params: {
      plane: "XZ",
      open: true,
      points: [
        [0, 0],
        [c.l1, 0],
        [c.l1, c.l2],
      ],
    },
    inputs: [],
  },
  { id: "P", kind: "sweep", params: {}, inputs: ["pr", "pa"] },
];
/** a revolved shaft, hollowed from the top, then its base rim rounded: curved faces through three steps */
export const chainRecipe = (c: C): Step[] => {
  const line = (i: number) => mint("sk", "line", i),
    side = (i: number) => mint("R", "side", line(i));
  return [
    {
      id: "sk",
      kind: "sketchPolygon",
      params: {
        plane: "XZ",
        points: [
          [0, 0],
          [c.r1, 0],
          [c.r1, c.h1],
          [c.r2, c.h1],
          [c.r2, c.H + 12],
          [0, c.H + 12],
        ],
      },
      inputs: [],
    },
    { id: "R", kind: "revolve", params: { deg: 360 }, inputs: ["sk"] },
    { id: "S", kind: "shell", params: { face: side(4), t: Math.min(c.t, 1.5) }, inputs: ["R"] },
    { id: "F", kind: "round", params: { edges: [edgeRef(side(0), side(1))], size: c.rf }, inputs: ["S"] },
  ];
};
export const families: Record<string, (c: C) => Step[]> = {
  revolve: revolveRecipe,
  loft: loftRecipe,
  shell: shellRecipe,
  sweep: sweepRecipe,
  chain: chainRecipe,
};
