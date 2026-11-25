// What is picked on the bodies (`in_1568`): a face, or edges (Shift adds), by the names the steps use. A click on a body picks; a click on nothing puts the pick away; the pointer over a body marks what a click would pick (fainter). The marks go to the
// world as the Marked look (teal over the body); the helper bar (`bodybar.ts`) stands beside the pick, up and to the right, and its buttons are the operations (the host does them).
import { project, type Cam } from "./camera.ts";
import { pickAt, type Hit } from "./interaction/pick.ts";
import { barForBody } from "./interaction/bodybar.ts";
import type { Bar } from "./interaction/helperbar.ts";
import type { BodyMesh, EdgeInfo, FaceInfo } from "./studio.ts";
import type { V3 } from "./vec.ts";

export interface Mark { body: string; faces: { start: number; count: number }[]; edges: { start: number; count: number }[]; strength: "pick" | "hover" }
export interface BodySelectHost {
  view(): { cam: Cam; w: number; h: number };
  meshes(): readonly BodyMesh[];
  /** a button of the bar was pressed: `body:sketch`, `body:pull`, `body:round`, `body:chamfer` */
  press(id: string, sel: Selection): void;
}
export interface Selection { body: string; faces: FaceInfo[]; edges: EdgeInfo[]; /** where it was picked (the bar stands beside it) */ at: V3 }

export function createBodySelect(host: BodySelectHost) {
  let sel: Selection | null = null, over: Hit | null = null;
  const same = (a: { key?: string; id?: string }, b: { key?: string; id?: string }) => (a.key ?? a.id) === (b.key ?? b.id);
  return {
    selection: (): Selection | null => sel,
    /** A click: a body is picked (a face, or an edge; Shift adds edges), a click on nothing puts the pick away. Returns whether the click was used. */
    click(x: number, y: number, shift: boolean): boolean {
      const { cam, w, h } = host.view(), hit = pickAt(host.meshes(), cam, w, h, x, y);
      if (!hit) { const had = !!sel; sel = null; return had; }
      if (hit.kind === "face") sel = { body: hit.body, faces: [hit.face], edges: [], at: hit.point };
      else if (shift && sel && sel.body === hit.body && sel.edges.length) sel = { ...sel, edges: sel.edges.some((e) => same(e, hit.edge)) ? sel.edges.filter((e) => !same(e, hit.edge)) : [...sel.edges, hit.edge], at: hit.point };
      else sel = { body: hit.body, faces: [], edges: [hit.edge], at: hit.point };
      if (!sel.faces.length && !sel.edges.length) sel = null;
      return true;
    },
    hover(x: number, y: number): void { const { cam, w, h } = host.view(); over = pickAt(host.meshes(), cam, w, h, x, y); },
    leave(): void { over = null; },
    clear(): boolean { const had = !!sel; sel = null; return had; },
    /** What is marked: the pick, and what the pointer is over. */
    marks(): Mark[] {
      const out: Mark[] = [];
      if (sel) out.push({ body: sel.body, faces: sel.faces.map((f) => ({ start: f.start, count: f.count })), edges: sel.edges.map((e) => ({ start: e.start, count: e.count })), strength: "pick" });
      if (over && !(sel && ((over.kind === "face" && sel.faces.some((f) => same(f, over!.kind === "face" ? over!.face : f))) || (over.kind === "edge" && sel.edges.some((e) => same(e, over!.kind === "edge" ? over!.edge : e))))))
        out.push({ body: over.body, faces: over.kind === "face" ? [{ start: over.face.start, count: over.face.count }] : [], edges: over.kind === "edge" ? [{ start: over.edge.start, count: over.edge.count }] : [], strength: "hover" });
      return out;
    },
    /** What the helper bar says for the pick (null: none, or `hide`: something else is being done): the buttons, the place they stand by, and what a press does. */
    bar(hide: boolean): { items: Bar; at: [number, number]; press: (id: string) => void } | null {
      if (!sel || hide) return null;
      const { cam, w, h } = host.view(), q = project(cam, sel.at, w, h), picked = sel;
      return { items: barForBody({ faces: picked.faces.length, edges: picked.edges.length }), at: [q.x, q.y], press: (id) => host.press(id, picked) };
    },
    /** The pick is dropped when its body is made again (the faces may be other ones now). */
    reset() { sel = null; over = null; },
    debug: () => ({ sel: sel && { body: sel.body, faces: sel.faces.map((f) => f.id), edges: sel.edges.map((e) => e.key) }, over: over?.kind ?? null }),
  };
}
