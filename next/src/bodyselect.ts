// What is picked on the bodies (`in_1568`): a face, or edges (Shift adds), by the names the steps use. A click on a body picks; a click on nothing puts the pick away; the pointer over a body marks what a click would pick (fainter). The marks go to the
// world as the Marked look (teal over the body); the helper bar (`bodybar.ts`) stands beside the pick, up and to the right, and its buttons are the operations (the host does them).
import { project, type Cam } from "./camera.ts";
import type { InfoHandlers } from "./infobardraw.ts";
import { barForBody } from "./interaction/bodybar.ts";
import type { Info } from "./interaction/infobar.ts";
import { pickAt, type Hit } from "./interaction/pick.ts";
import type { BodyPick, Selection as Store } from "./selection.ts";
import type { BodyMesh } from "./studio.ts";

export interface Mark {
  body: string;
  faces: { start: number; count: number }[];
  edges: { start: number; count: number }[];
  strength: "pick" | "hover" | "tie";
}
export interface BodySelectHost {
  view(): { cam: Cam; w: number; h: number };
  meshes(): readonly BodyMesh[];
  /** a button of the bar was pressed: `body:sketch`, `body:pull`, `body:round`, `body:chamfer` */
  press(id: string, sel: BodyPick): void;
  /** the page's one selection (`selection.ts`) */
  selection: Store;
}
export type Selection = BodyPick;

export function createBodySelect(host: BodySelectHost) {
  let over: Hit | null = null;
  const store = host.selection,
    sel = (): BodyPick | null => store.body();
  const same = (a: { key?: string; id?: string }, b: { key?: string; id?: string }) =>
    (a.key ?? a.id) === (b.key ?? b.id);
  return {
    selection: (): Selection | null => sel(),
    /** A click: a body is picked (a face, or an edge; Shift adds edges), a click on nothing puts the pick away. Returns whether the click was used. */
    click(x: number, y: number, shift: boolean): boolean {
      const { cam, w, h } = host.view(),
        hit = pickAt(host.meshes(), cam, w, h, x, y),
        cur = sel();
      if (!hit) return store.clear();
      if (hit.kind === "face") store.setBody({ body: hit.body, faces: [hit.face], edges: [], at: hit.point });
      else if (shift && cur && cur.body === hit.body && cur.edges.length)
        store.setBody({
          ...cur,
          edges: cur.edges.some((e) => same(e, hit.edge))
            ? cur.edges.filter((e) => !same(e, hit.edge))
            : [...cur.edges, hit.edge],
          at: hit.point,
        });
      else store.setBody({ body: hit.body, faces: [], edges: [hit.edge], at: hit.point });
      return true;
    },
    hover(x: number, y: number): void {
      const { cam, w, h } = host.view();
      over = pickAt(host.meshes(), cam, w, h, x, y);
    },
    leave(): void {
      over = null;
    },
    /** What is marked: the pick, and what the pointer is over. */
    marks(): Mark[] {
      const out: Mark[] = [];
      const pick = sel();
      if (pick)
        out.push({
          body: pick.body,
          faces: pick.faces.map((f) => ({ start: f.start, count: f.count })),
          edges: pick.edges.map((e) => ({ start: e.start, count: e.count })),
          strength: "pick",
        });
      if (
        over &&
        !(
          pick &&
          ((over.kind === "face" && pick.faces.some((f) => same(f, over!.kind === "face" ? over!.face : f))) ||
            (over.kind === "edge" && pick.edges.some((e) => same(e, over!.kind === "edge" ? over!.edge : e))))
        )
      )
        out.push({
          body: over.body,
          faces: over.kind === "face" ? [{ start: over.face.start, count: over.face.count }] : [],
          edges: over.kind === "edge" ? [{ start: over.edge.start, count: over.edge.count }] : [],
          strength: "hover",
        });
      return out;
    },
    /** What the info bar says for the pick (null: none, or `hide`: something else is being done): what can be done with it, the place it stands by, and what a press does. */
    subject(hide: boolean): { info: Info; at: [number, number]; on: InfoHandlers } | null {
      const picked = sel();
      if (!picked || hide) return null;
      const { cam, w, h } = host.view(),
        q = project(cam, picked.at, w, h);
      return {
        info: { facts: [], suggestions: barForBody({ faces: picked.faces.length, edges: picked.edges.length }) },
        at: [q.x, q.y],
        on: {
          suggest: (id) => host.press(id, picked),
          fact() {
            /* none */
          },
          set() {
            /* none */
          },
          lock() {
            /* none */
          },
        },
      };
    },
    /** The pick is dropped when its body is made again (the faces may be other ones now). */
    reset() {
      if (store.body()) store.clear();
      over = null;
    },
    debug: () => {
      const k = sel();
      return {
        sel: k && { body: k.body, faces: k.faces.map((f) => f.id), edges: k.edges.map((e) => e.key) },
        over: over?.kind ?? null,
      };
    },
  };
}
