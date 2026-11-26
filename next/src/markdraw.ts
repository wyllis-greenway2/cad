// The marks on the sketch (`dec_marks_on_things`): each mark of `interaction/marks.ts` drawn standing on its part, with the one lock on its corner (`chipdraw.ts`): closed and green (applied), open and yellow (offered, a click applies it), closed and red (it held a
// change back: it flashes). A constraint is a round chip, a number a pill; the chips that stand at one spot are side by side in one pill (`in_1620`). A press and a drag on a mark moves it out of the way (forgotten once it is gone); a pill that would cover another is moved
// along until it does not. It only draws and says what was pressed.
import { createChips, STATE, type InfoHandlers } from "./chipdraw.ts";
import type { Mark } from "./interaction/marks.ts";
import { settings } from "./settings.ts";

export interface MarkHandlers extends InfoHandlers {
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
/** the marks that stand at one spot (within `settings.marks.pillPx` on the page) are one group; a number, and the numbers of a figure being drawn, stand alone */
function groups(list: PlacedMark[]): PlacedMark[][] {
  const out: PlacedMark[][] = [];
  for (const p of list) {
    const alone = p.mark.kind === "dimension" || p.mark.readonly,
      g = alone
        ? null
        : out.find(
            (q) =>
              q[0]!.mark.kind !== "dimension" &&
              !q[0]!.mark.readonly &&
              Math.hypot(q[0]!.x - p.x, q[0]!.y - p.y) < settings.marks.pillPx,
          );
    if (g) g.push(p);
    else out.push([p]);
  }
  return out;
}

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
    if (g.length > 1)
      box.style.cssText += ";padding:3px;border-radius:19px;background:rgba(255,255,255,.92);border:1px solid #d6d7db";
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
      }
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
          ax = p.x - w / 2,
          ay = p.y - h - settings.marks.gapPx;
        anchored.set(k, { x: ax, y: ay }); // (standing on the part: its lower edge at the part)
        let x = ax + (off?.x ?? 0),
          y = ay + (off?.y ?? 0);
        if (!off)
          for (let tries = 0; tries < 8; tries++) {
            const hit = placed.find(
              (b) => x < b.x + b.w + 4 && b.x < x + w + 4 && y < b.y + b.h + 4 && b.y < y + h + 4,
            );
            if (!hit) break;
            x = hit.x + hit.w + 6;
          } // (a pill that would cover another stands beside it)
        placed.push({ x, y, w, h });
        e.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
      }
      for (const [k, e] of boxes) if (!seen.has(k)) e.style.display = "none";
    },
    startEdit: chips.startEdit,
    editing: chips.editing,
  };
}
