// The marks on the sketch (`dec_marks_on_things`): each mark of `interaction/marks.ts` drawn standing on its part, with the one lock on its corner (`chipdraw.ts`): closed and green (applied), open and yellow (offered, a click applies it), closed and red (it held a
// change back: it flashes). A constraint is a round chip, a number a pill; the chips that stand at one spot are side by side in one pill (`in_1620`). A press and a drag on a mark moves it out of the way (forgotten once it is gone); a pill that would cover another is moved
// along until it does not. It only draws and says what was pressed.
import { STATE, createChips, keepEvents, type InfoHandlers } from "./chipdraw.ts";
import type { Mark } from "./interaction/marks.ts";
import { settings } from "./settings.ts";

export interface MarkHandlers extends InfoHandlers {
  /** a mark is pointed at, or none any more (`id` null) */ hover?(id: string | null, over?: string): void;
  /** where the pointed-at bubble stands on the page (its middle, px), each picture: the sketch draws the arrow from it to its spot (`in_1671`) */ hoverAt?(
    x: number,
    y: number,
  ): void;
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

/** every mark is its own bubble (`in_1650`), known by this */
const keyOf = (m: Mark) => `${m.id}|${m.over?.join(",") ?? ""}`;
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
    const offer = m.state === "offer",
      chip = chips.round({
        id: m.id,
        icon: m.icon,
        title: `${m.title} (click to ${offer ? "lock" : "unlock"} it)`,
        border: colour,
        attr: offer ? "bar" : "fact",
        lock: offer ? "open" : "closed",
        hover: offer,
        onClick: () => (offer ? on?.offer(m.id, m.over ?? []) : on?.fact(m.id)),
      });
    chip.dataset.state = m.state;
    if (m.state === "refused") chip.style.animation = "mark-flash .5s ease-in-out 3";
    return chip;
  };
  const make = (p: PlacedMark, key: string): HTMLElement => {
    const box = document.createElement("div");
    box.style.cssText =
      "position:absolute;left:0;top:0;pointer-events:auto;will-change:transform;display:flex;align-items:center;gap:3px";
    box.dataset.mark = p.mark.state;
    box.dataset.key = key;
    const c = chipFor(p.mark);
    chipOf.set(key, c);
    box.append(c);
    keepEvents(box);
    if (p.mark.readonly) {
      box.style.pointerEvents = "none";
      return box;
    } // (the numbers of a figure being drawn are not in the way of the click that finishes it)
    // a press and a drag moves it out of the way; the click that ends a drag is not a click on a chip
    let press: { x: number; y: number; ox: number; oy: number; drag: boolean } | null = null,
      swallow = false;
    box.style.touchAction = "none";
    const endPress = () => {
      if (press?.drag) {
        swallow = true;
        setTimeout(() => {
          swallow = false;
        }, 0); // (the click that ends a drag is not a click on a chip)
      }
      press = null;
    };
    box.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || (e.target as HTMLElement).tagName === "INPUT") return;
      const r = box.getBoundingClientRect(),
        a = anchored.get(key);
      press = { x: e.clientX, y: e.clientY, ox: a ? r.x - a.x : 0, oy: a ? r.y - a.y : 0, drag: false };
    }); // (the drag goes on from where it stands, beside another or not)
    box.addEventListener("pointermove", (e) => {
      if (!press) return;
      // a press whose release was not seen here (let go off the bubble) is over: with no button down it is not a drag (`in_1674`)
      if (!(e.buttons & 1)) {
        press = null;
        return;
      }
      const dx = e.clientX - press.x,
        dy = e.clientY - press.y;
      if (!press.drag && Math.hypot(dx, dy) < settings.marks.dragPx) return;
      if (!press.drag) box.setPointerCapture(e.pointerId);
      press.drag = true;
      moved.set(key, { x: press.ox + dx, y: press.oy + dy });
    });
    for (const t of ["pointercancel", "lostpointercapture"])
      box.addEventListener(t, () => {
        endPress();
      });
    box.addEventListener("pointerup", endPress);
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
      const s = JSON.stringify(list.map((p) => ({ ...p.mark, alpha: 0, at: 0 })));
      if (s !== sig && !chips.editing()) {
        sig = s;
        chips.forget();
        for (const e of boxes.values()) e.remove();
        boxes.clear();
        chipOf.clear();
        for (const p of list) {
          const e = make(p, keyOf(p.mark));
          boxes.set(keyOf(p.mark), e);
          layer.append(e);
        }
        if (last.x >= 0) setHover(keyAt(document.elementFromPoint(last.x, last.y))); // (a rebuilt mark under the pointer is still pointed at)
      }
      let spot: { cx: number; cy: number; sx: number; sy: number; offer: boolean } | null = null;
      const seen = new Set<string>(),
        placed: { x: number; y: number; w: number; h: number }[] = [];
      const shown = list.filter((p) => boxes.has(keyOf(p.mark)));
      for (const p of shown) seen.add(keyOf(p.mark));
      for (const k of [...moved.keys()]) if (!seen.has(k)) moved.delete(k);
      for (const k of [...anchored.keys()]) if (!seen.has(k)) anchored.delete(k); // (a mark that is gone forgets where it was put)
      // the ones the person has put somewhere keep it; the others stand on their part and keep away from all of those and from each other
      for (const p of [
        ...shown.filter((q) => moved.has(keyOf(q.mark))),
        ...shown.filter((q) => !moved.has(keyOf(q.mark))),
      ]) {
        const k = keyOf(p.mark),
          e = boxes.get(k)!,
          off = moved.get(k);
        e.style.display = "flex";
        const c = chipOf.get(k);
        if (c) {
          // while one is pointed at, or a number is being typed, the others fade (`in_1674`)
          const here =
            hoverKey ??
            (document.activeElement as HTMLElement | null)?.closest?.("[data-key]")?.getAttribute("data-key") ??
            null;
          c.style.transition = "opacity .12s";
          c.style.opacity = String(here && here !== k ? p.mark.alpha * 0.2 : p.mark.alpha);
        }
        const w = e.offsetWidth || 28,
          h = e.offsetHeight || 28,
          free = (x0: number, y0: number) =>
            !placed.some((b) => x0 < b.x + b.w + 4 && b.x < x0 + w + 4 && y0 < b.y + b.h + 4 && b.y < y0 + h + 4);
        // the first free place round its spot; one the person moved keeps its first place (its offset is from it)
        const was = anchored.get(k);
        let ax = was && off ? was.x : p.x - w / 2,
          ay = was && off ? was.y : p.y - h / 2 - 30;
        // (every place tried is on the screen: a spot off the window puts its bubbles at the edge, side by side, not on top of each other)
        const onX = (v: number) => Math.max(4, Math.min(window.innerWidth - w - 4, v)),
          onY = (v: number) => Math.max(4, Math.min(window.innerHeight - h - 4, v));
        if (!off) {
          let found = false;
          slot: for (const r of p.mark.onSpot ? [0, 30, 48, 66] : [30, 48, 66])
            for (const t of SLOTS) {
              const cx = onX(p.x + Math.cos(t) * r - w / 2),
                cy = onY(p.y + Math.sin(t) * r - h / 2);
              if (free(cx, cy)) {
                ax = cx;
                ay = cy;
                found = true;
                break slot;
              }
            }
          if (!found) {
            // all taken (a crowd, or a spot off the window): the nearest free place on a grid round the first
            const x0 = onX(p.x - w / 2),
              y0 = onY(p.y - h / 2);
            grid: for (let d = 1; d <= 12; d++)
              for (let i = -d; i <= d; i++)
                for (let j = -d; j <= d; j++) {
                  if (Math.max(Math.abs(i), Math.abs(j)) !== d) continue;
                  const cx = onX(x0 + i * (w + 4)),
                    cy = onY(y0 + j * (h + 4));
                  if (free(cx, cy)) {
                    ax = cx;
                    ay = cy;
                    break grid;
                  }
                }
          }
        }
        anchored.set(k, { x: ax, y: ay });
        const x = Math.max(4, Math.min(window.innerWidth - w - 4, ax + (off?.x ?? 0))), // (a bubble stays on the screen, whatever it was dragged to)
          y = Math.max(4, Math.min(window.innerHeight - h - 4, ay + (off?.y ?? 0)));
        if (k === hoverKey && !p.mark.onSpot)
          spot = { cx: x + w / 2, cy: y + h / 2, sx: p.x, sy: p.y, offer: p.mark.state === "offer" };
        placed.push({ x, y, w, h });
        e.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
      }
      for (const [k, e] of boxes) if (!seen.has(k)) e.style.display = "none";
      if (spot) on?.hoverAt?.(spot.cx, spot.cy); // (the arrow from it to its spot is drawn with the sketch's lines)
    },
    startEdit: chips.startEdit,
    editing: chips.editing,
  };
}
