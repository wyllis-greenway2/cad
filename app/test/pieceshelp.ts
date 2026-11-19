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
