// The look of sketching, borrowed from the old project (`app/src/shared/settings.ts` `theme`, `app/src/ui/view/highlight.ts`, `app/src/ui/view.ts`): it looked right, so its colours and line weights are kept, named by what they mean.
// A tone says what a drawn thing is doing; the screen turns a tone into a colour. Nothing here decides anything.
export type Tone =
  | "figure"     // the line or shape being drawn or made: teal
  | "candidate"  // a suggestion: a guide that would hold if taken (dashed teal)
  | "aligned"    // the figure while a hint holds: orange (the old project's preview "orange")
  | "ties"       // what a relation ties the selection to: amber
  | "refused"    // a constraint that holds a change back: red, flashing
  | "applied"    // a constraint that already holds as asked: green, flashing once
  | "temp"       // a temporary thing (a copy being placed): blue
  | "note"       // the line of a dimension or an angle: charcoal grey
  | "axis" | "body" | "bodyEdge" | "ground" | "hidden";

/** the colours, as the old project had them (hex); the source of each is named */
export const COLOUR: Record<Tone, string> = {
  figure: "#1ab8b3",    // settings.orb.color [0.1, 0.72, 0.7]: "THE teal" (selection, hover, guides)
  candidate: "#1ab8b3", // the same teal, drawn dashed
  aligned: "#f59e0b",   // view.ts: `p.orange ? 0xf59e0b`
  ties: "#f2c14e",      // highlight.ts AMBER
  refused: "#e46a6a",   // highlight.ts RED
  applied: "#3fae6a",   // highlight.ts GREEN
  temp: "#4f8cf0",      // highlight.ts TEMP
  note: "#55575c",      // view.ts setNotes
  axis: "#2b2b30",      // theme.axis [0.17, 0.17, 0.19]
  body: "#c9c9cd",      // theme.bodyColor
  bodyEdge: "#2a2a2d",  // theme.bodyEdge
  ground: "#ffffff",    // theme.background
  hidden: "#2a2a2d",    // the edges of a body behind a face, drawn faint (opacity below)
};
/** line weights in pixels, and the dash, as view.ts and settings.pick had them; the dash is a fraction of the view distance (0.012) with a gap 0.7 of it */
export const WEIGHT = { figure: 2, guide: 1.5, mark: 5, edge: 2.4, edgeHover: 1.8, note: 1.5, vertexBall: 0.0042, dash: 0.012, gap: 0.7 };
/** opacities: a closed sketch's tint, its teal under the pointer, the hover disc, the edges of a body behind a face, behind the plane */
export const OPACITY = { sketchFill: 0.06, sketchHover: 0.28, hoverDisc: 0.14, hiddenEdge: 0.22, behindEdge: 0.28 };
/** the flashing of a refused or already-applied constraint: a short pulse, in milliseconds (the old project flashed the bubble and the parts) */

/** How each line of a drawing is drawn, by what it is doing: the tone (colour) and the weight, in one place (`in_1576`). The drawing code says `selected`; the screen turns it into a colour and a width. */
export type StrokeKind = "note" | "ball" | "tieBall" | "done" | "selected" | "preview" | "cursor" | "cut" | "tie" | "guide";
export const STROKE: Record<StrokeKind, { tone: Tone; /** times the figure's width */ weight: number; /** drawn a little see-through */ soft: boolean; /** drawn dashed */ dashed?: boolean }> = {
  note: { tone: "note", weight: 0.75, soft: false }, // the thin grey line of a number (an angle's arc)
  tieBall: { tone: "ties", weight: 1, soft: false }, // a point a helper is about: an orange ball
  ball: { tone: "figure", weight: 1, soft: false }, // a picked point: a teal ball, not a line (its size is WEIGHT.vertexBall of the view's height)
  done: { tone: "axis", weight: 0.75, soft: false }, // thin charcoal
  selected: { tone: "figure", weight: 1.3, soft: false },
  preview: { tone: "candidate", weight: 0.75, soft: true },
  cursor: { tone: "figure", weight: 0.8, soft: true },
  cut: { tone: "refused", weight: 1.4, soft: false },
  tie: { tone: "ties", weight: 1.4, soft: false },
  guide: { tone: "figure", weight: 0.75, soft: false, dashed: true },
};
