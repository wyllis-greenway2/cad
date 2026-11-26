// The marks on the sketch (`dec_marks_on_things`): each mark of `interaction/marks.ts` drawn standing on its part, with the one lock on its corner (`chipdraw.ts`): closed and green (applied), open and yellow (offered, a click applies it), closed and red (it held a
// change back: it flashes). A constraint is a round chip, a number a pill; the chips that stand at one spot are side by side in one pill (`in_1620`). A press and a drag on a mark moves it out of the way (forgotten once it is gone); a pill that would cover another is moved
// along until it does not. It only draws and says what was pressed.
import { STATE, createChips, type InfoHandlers } from "./chipdraw.ts";
import type { Mark } from "./interaction/marks.ts";
import { settings } from "./settings.ts";

export interface MarkHandlers extends InfoHandlers {
  /** a mark is pointed at, or none any more (`id` null) */ hover?(id: string | null, over?: string): void;
  /** an offered constraint was clicked: select the parts it is offered for, and apply it */ offer(
    id: string,
    over: string[],
  ): void;
}
export interface PlacedMark {
  mark: Mark;
  x: number;
  y: number;
}

const keyOf = (m: Mark) => `${m.id}|${m.over?.join(",") ?? ""}`;
/** no pills (`in_1650`): every mark is its own bubble */
const groups = (list: PlacedMark[]): PlacedMark[][] => list.map((p) => [p]);
/** the places round a mark's spot, in the order they are tried: up, up-right, up-left, right, left, down-right, down-left, down; at 30, 48 and 66 px (`dec_mark_placement`) */
const SLOTS = [270, 315, 225, 0, 180, 45, 135, 90].map((a) => (a * Math.PI) / 180);

export function createMarkDraw(host: HTMLElement) {
  const layer = document.createElement("div");
  layer.dataset.marks = "";
  layer.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;z-index:7;pointer-events:none";
  const style = document.createElement("style");
  style.textContent = "@keyframes mark-flash{0%,100%{opacity:1}50%{opacity:.25}}";
  layer.append(style);
  host.appendChild(layer);
  let on: MarkHandlers | null = null,
    sig = "";
  // what is pointed at is caught once on the layer, not on each mark: the marks are rebuilt, and a mark replaced under the pointer could miss its 'leave' (`in_1657`)
  let hoverKey: string | null = null,
    last = { x: -1, y: -1 };
  const keyAt = (t: EventTarget | null): string | null =>
    (t as HTMLElement | null)?.closest?.("[data-key]")?.getAttribute("data-key") ?? null;
  const setHover = (k: string | null) => {
    if (k === hoverKey) return;
    hoverKey = k;
    if (k === null) on?.hover?.(null);
    else {
      const i = k.indexOf("|");
      on?.hover?.(k.slice(0, i), k.slice(i + 1));
    }
  };
  for (const t of ["pointerover", "pointermove"] as const)
    layer.addEventListener(t, (e) => {
      last = { x: e.clientX, y: e.clientY };
      setHover(keyAt(e.target));
    });
  layer.addEventListener("pointerout", (e) => {
    if (!keyAt((e as PointerEvent).relatedTarget)) setHover(null);
  });
  // the arrow from a pointed-at bubble to the exact spot it is about
  const NS = "http://www.w3.org/2000/svg",
    leader = document.createElementNS(NS, "svg"),
    shaft = document.createElementNS(NS, "path"),
    head = document.createElementNS(NS, "path");
  leader.style.cssText = "position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;overflow:visible";
  shaft.setAttribute("fill", "none");
  shaft.setAttribute("stroke-width", "1.2");
  shaft.setAttribute("stroke-dasharray", "4 3");
  leader.append(shaft, head);
  leader.style.display = "none";
  layer.append(leader);
  const boxes = new Map<string, HTMLElement>(),
    chipOf = new Map<string, HTMLElement>(),
    anchored = new Map<string, { x: number; y: number }>(),
    moved = new Map<string, { x: number; y: number }>(); // (anchored: where each group would stand on its part; moved: where the person dragged it to)
  const chips = createChips(
    () => on,
    () => {
      sig = "";
    },
  );
  const chipFor = (m: Mark): HTMLElement => {
    const colour = STATE[m.state];
    if (m.kind === "dimension") {
      const n = chips.number(m, colour);
      n.dataset.state = m.state;
      return n;
    }
    const chip =
      m.state === "offer"
        ? chips.suggestion(
            { id: m.id, icon: m.icon, label: m.title, tone: "free" },
            colour,
            () => on?.offer(m.id, m.over ?? []),
            true,
          )
        : chips.relation(m, colour);
    chip.dataset.state = m.state;
    chip.title = m.state === "offer" ? `${m.title} (click to lock it)` : `${m.title} (click to unlock it)`;
    if (m.state === "refused") chip.style.animation = "mark-flash .5s ease-in-out 3";
    return chip;
  };
  const make = (g: PlacedMark[], key: string): HTMLElement => {
    const box = document.createElement("div");
    box.style.cssText =
      "position:absolute;left:0;top:0;pointer-events:auto;will-change:transform;display:flex;align-items:center;gap:3px";
    box.dataset.mark = g[0]!.mark.state;
    box.dataset.key = key;
    for (const p of g) {
      const c = chipFor(p.mark);
      chipOf.set(keyOf(p.mark), c);
      box.append(c);
    }
    for (const t of ["pointerdown", "click", "contextmenu"])
      box.addEventListener(t, (e) => {
        e.stopPropagation();
        if (t === "contextmenu") e.preventDefault();
      });
    if (g[0]!.mark.readonly) {
      box.style.pointerEvents = "none";
      return box;
    } // (the numbers of a figure being drawn are not in the way of the click that finishes it)
    // a press and a drag moves it out of the way; the click that ends a drag is not a click on a chip
    let press: { x: number; y: number; ox: number; oy: number; drag: boolean } | null = null,
      swallow = false;
    box.style.touchAction = "none";
    box.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || (e.target as HTMLElement).tagName === "INPUT") return;
      const r = box.getBoundingClientRect(),
        a = anchored.get(key);
      press = { x: e.clientX, y: e.clientY, ox: a ? r.x - a.x : 0, oy: a ? r.y - a.y : 0, drag: false };
    }); // (the drag goes on from where it stands, beside another or not)
    box.addEventListener("pointermove", (e) => {
      if (!press) return;
      const dx = e.clientX - press.x,
        dy = e.clientY - press.y;
      if (!press.drag && Math.hypot(dx, dy) < settings.marks.dragPx) return;
      if (!press.drag) box.setPointerCapture(e.pointerId);
      press.drag = true;
      moved.set(key, { x: press.ox + dx, y: press.oy + dy });
    });
    box.addEventListener("pointerup", () => {
      if (press?.drag) {
        swallow = true;
        setTimeout(() => {
          swallow = false;
        }, 0);
      }
      press = null;
    });
    box.addEventListener(
      "click",
      (e) => {
        if (swallow) {
          e.stopPropagation();
          e.preventDefault();
          swallow = false;
        }
      },
      true,
    );
    return box;
  };
  return {
    /** Each picture: the marks to show, placed on the page (none: nothing), and what their buttons do. */
    show(list: PlacedMark[], h: MarkHandlers | null): void {
      if (h) on = h;
      const gs = groups(list),
        keyG = (g: PlacedMark[]) => g.map((p) => keyOf(p.mark)).join("+");
      const s = JSON.stringify(gs.map((g) => g.map((p) => ({ ...p.mark, alpha: 0, at: 0 }))));
      if (s !== sig && !chips.editing()) {
        sig = s;
        chips.forget();
        for (const e of boxes.values()) e.remove();
        boxes.clear();
        chipOf.clear();
        for (const g of gs) {
          const e = make(g, keyG(g));
          boxes.set(keyG(g), e);
          layer.append(e);
        }
        if (last.x >= 0) setHover(keyAt(document.elementFromPoint(last.x, last.y))); // (a rebuilt mark under the pointer is still pointed at)
      }
      let spot: { cx: number; cy: number; sx: number; sy: number; offer: boolean } | null = null;
      const seen = new Set<string>(),
        placed: { x: number; y: number; w: number; h: number }[] = [];
      const shown = gs.filter((g) => boxes.has(keyG(g)));
      for (const g of shown) seen.add(keyG(g));
      for (const k of [...moved.keys()]) if (!seen.has(k)) moved.delete(k);
      for (const k of [...anchored.keys()]) if (!seen.has(k)) anchored.delete(k); // (a mark that is gone forgets where it was put)
      // the ones the person has put somewhere keep it; the others stand on their part and keep away from all of those and from each other
      for (const g of [...shown.filter((q) => moved.has(keyG(q))), ...shown.filter((q) => !moved.has(keyG(q)))]) {
        const k = keyG(g),
          e = boxes.get(k)!,
          off = moved.get(k),
          p = g[0]!;
        e.style.display = "flex";
        for (const q of g) {
          const c = chipOf.get(keyOf(q.mark));
          if (c) c.style.opacity = String(q.mark.alpha);
        }
        const w = e.offsetWidth || 28,
          h = e.offsetHeight || 28,
          free = (x0: number, y0: number) =>
            !placed.some((b) => x0 < b.x + b.w + 4 && b.x < x0 + w + 4 && y0 < b.y + b.h + 4 && b.y < y0 + h + 4);
        // the first free place round its spot; one the person moved keeps its first place (its offset is from it)
        let ax = p.x - w / 2,
          ay = p.y - h / 2 - 30;
        if (!off)
          slot: for (const r of [30, 48, 66])
            for (const t of SLOTS) {
              const cx = p.x + Math.cos(t) * r - w / 2,
                cy = p.y + Math.sin(t) * r - h / 2;
              if (free(cx, cy)) {
                ax = cx;
                ay = cy;
                break slot;
              }
            }
        anchored.set(k, { x: ax, y: ay });
        const x = ax + (off?.x ?? 0),
          y = ay + (off?.y ?? 0);
        if (k === hoverKey) spot = { cx: x + w / 2, cy: y + h / 2, sx: p.x, sy: p.y, offer: p.mark.state === "offer" };
        placed.push({ x, y, w, h });
        e.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
      }
      for (const [k, e] of boxes) if (!seen.has(k)) e.style.display = "none";
      const sp = spot as { cx: number; cy: number; sx: number; sy: number; offer: boolean } | null;
      const dx = sp ? sp.sx - sp.cx : 0,
        dy = sp ? sp.sy - sp.cy : 0,
        dist = Math.hypot(dx, dy);
      if (sp && dist > 24) {
        const ux = dx / dist,
          uy = dy / dist,
          x0 = sp.cx + ux * 16,
          y0 = sp.cy + uy * 16,
          colour = sp.offer ? "#f2c14e" : "#8a9097";
        shaft.setAttribute("d", `M${x0} ${y0} L${sp.sx - ux * 6} ${sp.sy - uy * 6}`);
        shaft.setAttribute("stroke", colour);
        head.setAttribute(
          "d",
          `M${sp.sx} ${sp.sy} L${sp.sx - ux * 9 - uy * 4} ${sp.sy - uy * 9 + ux * 4} L${sp.sx - ux * 9 + uy * 4} ${sp.sy - uy * 9 - ux * 4}Z`,
        );
        head.setAttribute("fill", colour);
        leader.style.display = "block";
      } else leader.style.display = "none";
    },
    startEdit: chips.startEdit,
    editing: chips.editing,
  };
}
