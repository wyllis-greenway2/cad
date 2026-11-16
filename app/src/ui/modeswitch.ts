// The little switch by the handles of a move or a turn (`in_206`): the move arrows come with a rotate icon next to them, the turning rings with a move icon; a click changes which one is on.
import { iconSvg } from "./icons.ts";
import { roundButton } from "./look.ts";

export function createModeSwitch(host: HTMLElement, go: (to: "move" | "rotate" | "linear" | "circular" | "invert") => void) {
  const el = roundButton({ size: 30 });
  el.style.cssText += ";position:fixed;left:0;top:0;display:none;z-index:8";
  let to: "move" | "rotate" | "linear" | "circular" | "invert" = "rotate";
  let shown = "";
  el.addEventListener("click", (e) => { e.stopPropagation(); go(to); });
  host.appendChild(el);
  return {
    /**
     * What the switch goes to (null: hide), and the page position of the upper left corner of the handles. `avoid`: what is on the page where the switch must not stand (the number bubbles): it
     * goes to the nearest of a few other places round the corner when its first one is covered (`in_231`: it slid under a bubble when the handles were turned).
     */
    update(what: { to: "move" | "rotate" | "linear" | "circular" | "invert"; label: string } | null, at: [number, number] | null, avoid: DOMRect[] = []) {
      if (!what || !at) { el.style.display = "none"; return; }
      to = what.to;
      if (shown !== what.to + what.label) { shown = what.to + what.label; el.innerHTML = iconSvg(what.to); el.title = what.label; }
      el.style.display = "flex";
      const SIZE = 30;
      const spots: [number, number][] = [[-38, -38], [-38, 8], [8, -38], [-76, -38], [-38, -76], [-76, 8], [8, -76], [-76, -76], [-114, -38], [-38, -114]];
      const free = (o: [number, number]) => { const [x, y] = [at[0] + o[0], at[1] + o[1]]; return avoid.every((r) => x + SIZE + 4 <= r.left || x >= r.right + 4 || y + SIZE + 4 <= r.top || y >= r.bottom + 4); };
      const o = spots.find(free) ?? spots[0]!;
      el.style.transform = `translate(${Math.round(at[0] + o[0])}px, ${Math.round(at[1] + o[1])}px)`;
    },
  };
}
