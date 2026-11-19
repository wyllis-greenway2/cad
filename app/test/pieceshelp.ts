// A project of boxes, each a sketch and a push, as the app saves it (for the tests of a model made in pieces, `dec_progressive_open`).
/** a project of boxes, each a sketch and a push in its own mode, as the app saves it; `at(k)` says where the k-th stands */
export function projectText(n: number, at: (k: number) => [number, number] = (k) => [(k % 8) * 12, Math.floor(k / 8) * 12], extra: object[] = []): string {
  const cmds: object[] = [];
  for (let k = 0; k < n; k++) {
    const e = `e_${String(2 * k + 1).padStart(3, "0")}`, sid = `s_${String(2 * k + 2).padStart(3, "0")}`;
    const [x, y] = at(k);
    const pts = [[x, y], [x + 8, y], [x + 8, y + 8], [x, y + 8]];
    cmds.push({ type: "batch", commands: [...pts.map((p, i) => ({ type: "addPart", part: { origin: "drawn", plane: "w/XY", movable: true, ref: `d/${e}.p${i}`, kind: "corner", at: [p[0], p[1], 0] } })), ...[0, 1, 2, 3].map((i) => ({ type: "addPart", part: { origin: "drawn", plane: "w/XY", movable: true, ref: `d/${e}.s${i}`, kind: "line", a: `d/${e}.p${i}`, b: `d/${e}.p${(i + 1) % 4}` } }))] });
    cmds.push({ type: "addStep", step: { id: sid, type: "extrude", parts: [`d/${e}.s0`, `d/${e}.s3`, `d/${e}.s2`, `d/${e}.s1`], params: { depth: 4 + (k % 7), ...(k > 0 ? { mode: "new" } : {}) } } });
  }
  cmds.push(...extra);
  return JSON.stringify({ format: "cad-project", version: 1, base: { version: 1, counter: 0, parts: [], relations: [], steps: [] }, commands: cmds, cursor: cmds.length });
}

// ---- an assembly made with the app's own operations: parts apart, some rounded, some with a hole, some moved (for the tests of pieces with modifying steps, `in_1058`) ----
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawRectangle, drawCircle } from "../src/operation/build.ts";
import { loopFaceRef } from "../src/operation/loops.ts";
import { startOp, opCommand } from "../src/interaction/operations.ts";
import type { Op } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";
import { worldRef } from "../src/shared/ref.ts";

const push = (s: Session, face: string, depth: number): Session => runOp(s, { ...(startOp(scene(s), [face as never], "extrude") as { op: Op }).op, value: depth })!.session;
export const boxAt = (s: Session, x: number, y: number, w = 8, d = 5): Session => { const r = drawRectangle(scene(s), worldRef("XY"), [x, y, 0], [x + w, y + w, 0], [1, 0, 0], [0, 1, 0]); return push(run(s, r.command), loopFaceRef(r.lines), d); };
const topEdges = (s: Session, x: number, y: number, w: number, d: number) => Object.values(scene(s).parts).filter((p) => p.kind === "line" && p.origin === "body" && !(p as { mid?: unknown }).mid && (() => { const a = scene(s).parts[(p as { a: string }).a], b = scene(s).parts[(p as { b: string }).b]; return a?.kind === "corner" && b?.kind === "corner" && Math.abs(a.at[2] - d) < 1e-6 && Math.abs(b.at[2] - d) < 1e-6 && a.at[0] >= x - 1e-6 && a.at[0] <= x + w + 1e-6 && a.at[1] >= y - 1e-6 && a.at[1] <= y + w + 1e-6; })()).map((p) => p.ref);
export const rounded = (s: Session, x: number, y: number, w = 8, d = 5): Session => { const st = startOp(scene(s), topEdges(s, x, y, w, d) as never, "edge"); if (!st.ok) throw new Error(st.why); return run(s, opCommand(scene(s), { ...(st as { op: Op }).op, value: 1 })!); };
export const holed = (s: Session, id: string, x: number, y: number, w = 8): Session => { const c = drawCircle(scene(s), worldRef("XY"), [x + w / 2, y + w / 2, 0], 1.5); return run(run(s, c.command), { type: "addStep", step: { id, type: "extrude", parts: [c.circle], params: { depth: 20, cut: "1" } } }); };
export const slid = (s: Session, creator: string, by: number): Session => {
  const ref = Object.values(scene(s).parts).find((p) => p.kind === "body" && (p as { id?: string }).id === `x_${creator}`)!.ref;
  const st = startOp(scene(s), [ref] as never, "move");
  if (!st.ok) throw new Error(st.why);
  return run(s, opCommand(scene(s), { ...(st as { op: Op }).op, value: by })!);
};
/** thirty parts apart in a grid of eight: every third rounded, every fifth with a hole, the seventh and fourteenth slid along the row; returns the session */
export function assembly(n = 30): Session {
  let s = createSession(kernel);
  const at = (k: number): [number, number] => [(k % 8) * 20, Math.floor(k / 8) * 20];
  const ids: string[] = [];
  for (let k = 0; k < n; k++) {
    const [x, y] = at(k);
    s = boxAt(s, x, y);
    ids.push(scene(s).steps.filter((st) => st.type === "extrude").at(-1)!.id);
    if (k % 3 === 0) s = rounded(s, x, y);
    if (k % 5 === 0) s = holed(s, `s_${900 + k}`, x, y);
  }
  s = slid(s, ids[6]!, 4);
  s = slid(s, ids[13]!, -4);
  return s;
}
