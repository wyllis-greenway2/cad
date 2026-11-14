// The helper of a touch screen (`in_160`, `in_283`, `in_286`, `in_287`): a finger has no hover and cannot press, drag and let go on small things, so a round icon with a finger-drag drawing stands by the cursor of a figure being
// drawn, or by the arrow or ring of an operation that was tapped; a finger dragging it does what a mouse's hover or drag would. The icon is joined by a thin line to what it moves: for a figure, a vertex (a ring with a
// dot) stands where the point being placed is, so it is plain what is being dragged. There is no check: a tap elsewhere is what sets the point or applies (a right click does).
// It only draws; the touches go to the page's input as usual (it lets them through).
import { iconSvg } from "./icons.ts";

export function createTouchCursor(host: HTMLElement) {
  const NS = "http://www.w3.org/2000/svg";
  const layer = document.createElementNS(NS, "svg");
  layer.setAttribute("style", "position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:5;display:none;overflow:visible");
  const line = document.createElementNS(NS, "line");
  line.setAttribute("stroke", "#1ab8b3");
  line.setAttribute("stroke-width", "2.5");
  line.setAttribute("stroke-dasharray", "2 5");
  line.setAttribute("stroke-linecap", "round");
  const ring = document.createElementNS(NS, "circle");
  ring.setAttribute("r", "11");
  ring.setAttribute("fill", "rgba(255,255,255,.85)");
  ring.setAttribute("stroke", "#1ab8b3");
  ring.setAttribute("stroke-width", "3");
  const dot = document.createElementNS(NS, "circle");
  dot.setAttribute("r", "4");
  dot.setAttribute("fill", "#1ab8b3");
  layer.append(line, ring, dot);
  const drag = document.createElement("div");
  drag.innerHTML = iconSvg("fingerdrag");
  drag.style.cssText = "position:fixed;left:0;top:0;display:none;width:48px;height:48px;box-sizing:border-box;border-radius:24px;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(0,0,0,.25);z-index:6;background:#fff;color:#1a8f8b;border:2px solid #1ab8b3;pointer-events:none";
  (drag.firstElementChild as SVGElement).setAttribute("width", "26");
  (drag.firstElementChild as SVGElement).setAttribute("height", "26");
  host.append(layer, drag);
  return {
    /** `at`: the page position of the centre of the drag icon (null: hide it); `target`: the page position of what it moves, joined to it by a line; `vertex`: a point being placed stands there as a ring and a dot. */
    update(at: [number, number] | null, target: [number, number] | null = null, vertex = false) {
      if (!at) { drag.style.display = "none"; layer.style.display = "none"; return; }
      drag.style.display = "flex";
      drag.style.transform = `translate(${Math.round(at[0] - 24)}px, ${Math.round(at[1] - 24)}px)`;
      layer.style.display = target ? "block" : "none";
      if (!target) return;
      const [dx, dy] = [at[0] - target[0], at[1] - target[1]];
      const len = Math.hypot(dx, dy) || 1;
      const from = vertex ? 11 : 0; // (the line starts at the edge of the ring)
      line.setAttribute("x1", String(target[0] + (dx / len) * from));
      line.setAttribute("y1", String(target[1] + (dy / len) * from));
      line.setAttribute("x2", String(at[0] - (dx / len) * 24));
      line.setAttribute("y2", String(at[1] - (dy / len) * 24));
      for (const c of [ring, dot]) { c.setAttribute("cx", String(target[0])); c.setAttribute("cy", String(target[1])); c.style.display = vertex ? "" : "none"; }
    },
  };
}
