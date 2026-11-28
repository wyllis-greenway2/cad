// A dev check (not a test, `in_1444`) of the one ordered list of what is under the pointer (`src/interaction/candidates.ts`): classes first, points and lines nearest the pointer first, surfaces nearest the eye first with a figure before the face it lies on; a click again takes the next.
//   node --experimental-strip-types dev/candidates-check.ts
import { chooseCandidate, orderCandidates, type Ranked } from "../src/interaction/candidates.ts";
import { check, failureCount } from "./lib.ts";

const c = (name: string, rank: 0 | 1 | 2, px: number, depth: number, figure = false): Ranked<string> => ({
  rank,
  px,
  depth,
  figure,
  item: name,
});
const names = (l: Ranked<string>[]) =>
  orderCandidates(l)
    .map((x) => x.item)
    .join(" ");
check(
  "a corner before an edge before a surface",
  names([c("face", 2, 0, 50), c("edge", 1, 2, 50), c("corner", 0, 5, 50)]) === "corner edge face",
);
check("of two edges, the nearer the pointer first", names([c("far", 1, 6, 50), c("near", 1, 1, 80)]) === "near far");
check(
  "a point of a drawing and a corner of a body are one class: the nearer first",
  names([c("body corner", 0, 4, 50), c("sketch point", 0, 2, 90)]) === "sketch point body corner",
);
check(
  "of two surfaces, the nearer the eye first",
  names([c("far face", 2, 0, 80), c("figure in front", 2, 0, 40, true)]) === "figure in front far face",
);
check(
  "a figure lying on a face is before the face (the same depth)",
  names([c("face", 2, 0, 50), c("figure", 2, 0, 50.004, true)]) === "figure face",
);
check(
  "a face in front of a figure behind it: the face first",
  names([c("figure", 2, 0, 80, true), c("face", 2, 0, 50)]) === "face figure",
);
check(
  "a click takes the first; again, the next; at the end, round to the first",
  chooseCandidate(3, null, false) === 0 && chooseCandidate(3, 0, true) === 1 && chooseCandidate(3, 2, true) === 0,
);
check("with nothing under the pointer the choice is 0", chooseCandidate(0, null, false) === 0);
process.exit(failureCount() ? 1 : 0);
