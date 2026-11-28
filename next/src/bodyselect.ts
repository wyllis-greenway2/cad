// What is picked on the bodies (`in_1568`): a face, or edges (Shift adds), by the names the steps use. A click on a body picks; a click on nothing puts the pick away; the pointer over a body marks what a click would pick (fainter). The marks go to the
// world as the Marked look (teal over the body); the helper bar (`bodybar.ts`) stands beside the pick, up and to the right, and its buttons are the operations (the host does them).
import { project, type Cam } from "./camera.ts";
import type { InfoHandlers } from "./infobardraw.ts";
import { barForBody } from "./interaction/bodybar.ts";
import type { Info } from "./interaction/infobar.ts";
import { edgesAround, ownerOf, pickAll, pickAt, type Hit } from "./interaction/pick.ts";
import type { BodyPick, Selection as Store } from "./selection.ts";
import type { BodyMesh, FaceInfo } from "./studio.ts";
import type { V3 } from "./vec.ts";

export interface Mark {
  body: string;
  faces: { start: number; count: number }[];
  edges: { start: number; count: number }[];
  /** corners, drawn as balls */ corners: V3[];
  strength: "pick" | "hover" | "tie";
  /** the fill of a body picked whole: not shown while the orb has it moved */ whole?: true;
}
export interface BodySelectHost {
  view(): { cam: Cam; w: number; h: number };
  meshes(): readonly BodyMesh[];
  /** a button of the bar was pressed: `body:sketch`, `body:pull`, `body:round`, `body:chamfer` */
  press(id: string, sel: BodyPick): void;
  /** the page's one selection (`selection.ts`) */
  selection: Store;
  /** the view is to turn square to a face (a third click on it): it looks along this way, into the body */
  square(normal: V3): void;
  /** a sentence for the person, through the page's one notice ("2 of 4 here") */
  say(text: string): void;
}
export type Selection = BodyPick;

export function createBodySelect(host: BodySelectHost) {
  let over: Hit | null = null,
    cycle: { x: number; y: number; i: number } | null = null, // (where the last click was and which of what was under it it took: a click again on the same place takes the next, `MD-3`)
    pickedAt = 0; // (when a face was picked, ms: its teal spreads from the click over the time after)
  const store = host.selection,
    sel = (): BodyPick | null => store.body();
  const same = (a: { key?: string; id?: string }, b: { key?: string; id?: string }) =>
    (a.key ?? a.id) === (b.key ?? b.id);
  return {
    selection: (): Selection | null => sel(),
    /** a face or an edge of a body is under the pointer */
    under: (): boolean => over !== null,
    /** every face, edge or corner of the body picked (or of the one body there is): the Select section's All (`MD-40`); says why when there is none */
    selectAll(part: "faces" | "edges" | "vertices"): void {
      const m = host.meshes().find((x) => x.id === sel()?.body) ?? host.meshes()[0];
      if (!m) return host.say("There is no body to select from");
      const list = part === "faces" ? m.faces : part === "edges" ? m.edgeInfo : m.vertexInfo;
      if (!list.length) return host.say(`The body has no ${part === "vertices" ? "corners" : part} to select`);
      const lo = [Infinity, Infinity, Infinity],
        hi = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < m.positions.length; i++) {
        lo[i % 3] = Math.min(lo[i % 3]!, m.positions[i]!);
        hi[i % 3] = Math.max(hi[i % 3]!, m.positions[i]!);
      }
      store.setBody({
        body: m.id,
        faces: [],
        edges: [],
        vertices: [],
        whole: [],
        ...{ [part]: [...list] },
        at: [0, 1, 2].map((k) => (lo[k]! + hi[k]!) / 2) as V3,
      });
      host.say(`${list.length} ${part === "vertices" ? "corners" : part} selected`);
    },
    /** the face in front under the pointer (null: none): for a sketch tool that is armed with nothing placed, a click on it begins the sketch on that face */
    faceAt(x: number, y: number): { body: string; face: FaceInfo; point: V3 } | null {
      const { cam, w, h } = host.view(),
        hit = pickAll(host.meshes(), cam, w, h, x, y).find((k) => k.kind === "face");
      return hit && hit.kind === "face" ? { body: hit.body, face: hit.face, point: hit.point } : null;
    },
    /** the pointer is over one of the bodies picked whole (a press there takes them, as the old app's grab) */
    wholeAt(x: number, y: number): boolean {
      const { cam, w, h } = host.view(),
        hit = pickAt(host.meshes(), cam, w, h, x, y),
        cur = sel();
      return !!hit && !!cur && cur.body === hit.body && cur.whole.includes(ownerOf(hit));
    },
    /** A click: a body is picked (a face, or an edge; Shift adds edges; a double click the whole body), a click on nothing puts the pick away. Returns whether the click was used. */
    click(x: number, y: number, shift: boolean, count = 1): boolean {
      const { cam, w, h } = host.view(),
        all = pickAll(host.meshes(), cam, w, h, x, y),
        cur = sel();
      if (!all.length) {
        cycle = null;
        return store.clear();
      }
      // a click again on the same place (a double click is not one) goes to the next of what is under the pointer
      if (count === 1) {
        const again = cycle && Math.hypot(x - cycle.x, y - cycle.y) < 4 && all.length > 1;
        cycle = { x, y, i: again ? (cycle!.i + 1) % all.length : 0 };
        if (all.length > 1) host.say(`${cycle.i + 1} of ${all.length} here`);
      }
      const hit = all[Math.min(cycle?.i ?? 0, all.length - 1)]!;
      if (count >= 3) {
        // three clicks take that face alone and turn the view square to it (as the old app's)
        const f = all.find((x) => x.kind === "face");
        if (!f || f.kind !== "face") return false;
        store.setBody({ body: f.body, faces: [f.face], edges: [], vertices: [], whole: [], at: f.point });
        pickedAt = performance.now();
        host.square(f.normal);
        return true;
      }
      // whole bodies: two clicks take the body, from whatever part of it (as the old app's): its orb shows, `autohandles.ts`; a third goes back to the part. Shift, with bodies picked whole, adds the body under the pointer or takes it out (`MD-36`)
      const wholes = !!cur && cur.body === hit.body && cur.whole.length > 0;
      if (count === 2 || (shift && wholes)) {
        const own = ownerOf(hit),
          have = wholes ? cur!.whole : [],
          whole = shift && wholes ? (have.includes(own) ? have.filter((k) => k !== own) : [...have, own]) : [own];
        if (!whole.length) return store.clear();
        store.setBody({ body: hit.body, faces: [], edges: [], vertices: [], whole, at: hit.point });
        return true;
      }
      // what is picked on the body, as lists; Shift adds a part of the same kind on the same body, or takes it out if it is one of them (the old app's rule, `MD-35`)
      const part = hit.kind === "face" ? "faces" : hit.kind === "edge" ? "edges" : "vertices",
        one = hit.kind === "face" ? hit.face : hit.kind === "edge" ? hit.edge : hit.vertex,
        sameKind =
          !!cur &&
          cur.body === hit.body &&
          cur[part].length > 0 &&
          (["faces", "edges", "vertices"] as const).every((k) => k === part || !cur[k].length),
        have = sameKind ? (cur![part] as { key?: string; id?: string }[]) : [],
        list =
          shift && sameKind
            ? have.some((x) => same(x, one))
              ? have.filter((x) => !same(x, one))
              : [...have, one]
            : [one];
      store.setBody({
        body: hit.body,
        faces: [],
        edges: [],
        vertices: [],
        whole: [],
        ...{ [part]: list },
        at: hit.point,
      });
      if (hit.kind === "face") pickedAt = performance.now();
      return true;
    },
    hover(x: number, y: number): void {
      const { cam, w, h } = host.view();
      over = pickAt(host.meshes(), cam, w, h, x, y);
    },
    leave(): void {
      over = null;
    },
    /** Where the orb is on a face (`orbfill.ts`): the disc under the pointer, on a face that is not the one picked; and the click the picked face's teal spreads from. */
    orbs(): { hover: V3 | null; spread: { point: V3; since: number } | null } {
      const pick = sel();
      return {
        hover:
          over?.kind === "face" && !(pick && pick.faces.some((f) => same(f, over!.kind === "face" ? over!.face : f)))
            ? over.point
            : null,
        spread: pick && pick.faces.length === 1 && pick.edges.length === 0 ? { point: pick.at, since: pickedAt } : null,
      };
    },
    /** What is marked: the pick, and what the pointer is over. */
    marks(): Mark[] {
      const out: Mark[] = [];
      const pick = sel();
      if (pick) {
        // a face picked has its own edges marked too (the old app drew them bold teal round the lit face)
        const mesh = host.meshes().find((m) => m.id === pick.body),
          around = mesh ? edgesAround(mesh, pick.faces) : [];
        if (pick.whole.length && mesh)
          out.push({
            body: pick.body,
            faces: mesh.faces
              .filter((f) => pick.whole.includes(f.body ?? ""))
              .map((f) => ({ start: f.start, count: f.count })),
            edges: [],
            corners: [],
            strength: "pick",
            whole: true,
          });
        out.push({
          body: pick.body,
          faces: pick.faces.map((f) => ({ start: f.start, count: f.count })),
          edges: [...pick.edges, ...around].map((e) => ({ start: e.start, count: e.count })),
          corners: pick.vertices.map((v) => v.at),
          strength: "pick",
        });
      }
      if (
        over &&
        !(
          pick &&
          ((over.kind === "face" && pick.faces.some((f) => same(f, over!.kind === "face" ? over!.face : f))) ||
            (over.kind === "edge" && pick.edges.some((e) => same(e, over!.kind === "edge" ? over!.edge : e))) ||
            (over.kind === "vertex" && pick.vertices.some((v) => same(v, over!.kind === "vertex" ? over!.vertex : v))))
        )
      )
        out.push({
          body: over.body,
          faces: over.kind === "face" ? [{ start: over.face.start, count: over.face.count }] : [],
          edges: over.kind === "edge" ? [{ start: over.edge.start, count: over.edge.count }] : [],
          corners: over.kind === "vertex" ? [over.vertex.at] : [],
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
        sel: k && {
          body: k.body,
          faces: k.faces.map((f) => f.id),
          edges: k.edges.map((e) => e.key),
          whole: k.whole,
          vertices: k.vertices.map((v) => v.key),
        },
        over: over?.kind ?? null,
      };
    },
  };
}
