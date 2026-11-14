// The helper of a touch screen (`in_160`, `in_283`, `in_286`, `in_287`, `in_288`): a finger has no hover and cannot press, drag and let go on small things, so a round icon with a finger-drag drawing stands by each point of a
// figure being drawn (the ones set and the one held), or by the arrow or ring of an operation that was tapped; a finger dragging one does what a mouse's hover or drag would. Each icon is joined by a dotted line to what it moves:
// for a figure a vertex (a ring with a dot) stands at the point, so it is plain what is being dragged. There is no check: a tap elsewhere is what sets the point or applies (a right click does).
// It only draws; the touches go to the page's input as usual (it lets them through).
import { iconSvg } from "./icons.ts";

interface Mark { icon: [number, number]; target: [number, number]; vertex: boolean }

export function createTouchCursor(host: HTMLElement) {
  const NS = "http://www.w3.org/2000/svg";
  const layer = document.createElementNS(NS, "svg");
  layer.setAttribute("style", "position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:5;display:none;overflow:visible");
  host.appendChild(layer);
  const drags: HTMLElement[] = [];
  const parts: { line: SVGLineElement; ring: SVGCircleElement; dot: SVGCircleElement }[] = [];
  const make = () => {
    const line = document.createElementNS(NS, "line");
    line.setAttribute("stroke", "#1ab8b3"); line.setAttribute("stroke-width", "2.5"); line.setAttribute("stroke-dasharray", "2 5"); line.setAttribute("stroke-linecap", "round");
    const ring = document.createElementNS(NS, "circle");
    ring.setAttribute("r", "11"); ring.setAttribute("fill", "rgba(255,255,255,.85)"); ring.setAttribute("stroke", "#1ab8b3"); ring.setAttribute("stroke-width", "3");
    const dot = document.createElementNS(NS, "circle");
    dot.setAttribute("r", "4"); dot.setAttribute("fill", "#1ab8b3");
    layer.append(line, ring, dot);
    parts.push({ line, ring, dot });
    const drag = document.createElement("div");
    drag.innerHTML = iconSvg("fingerdrag");
    drag.style.cssText = "position:fixed;left:0;top:0;display:none;width:48px;height:48px;box-sizing:border-box;border-radius:24px;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(0,0,0,.25);z-index:6;background:#fff;color:#1a8f8b;border:2px solid #1ab8b3;pointer-events:none";
    (drag.firstElementChild as SVGElement).setAttribute("width", "26");
    (drag.firstElementChild as SVGElement).setAttribute("height", "26");
    host.appendChild(drag);
    drags.push(drag);
  };
  return {
    /** The drag icons (page positions of their centres), each with what it moves joined to it by a dotted line; `vertex`: a point of a figure stands there as a ring and a dot. No marks: all hidden. */
    update(marks: Mark[]) {
      while (drags.length < marks.length) make();
      layer.style.display = marks.length ? "block" : "none";
      drags.forEach((drag, k) => {
        const m = marks[k];
        const p = parts[k]!;
        if (!m) { drag.style.display = "none"; for (const e of [p.line, p.ring, p.dot]) e.style.display = "none"; return; }
        drag.style.display = "flex";
        drag.style.transform = `translate(${Math.round(m.icon[0] - 24)}px, ${Math.round(m.icon[1] - 24)}px)`;
        const [dx, dy] = [m.icon[0] - m.target[0], m.icon[1] - m.target[1]];
        const len = Math.hypot(dx, dy) || 1;
        const from = m.vertex ? 11 : 0; // (the line starts at the edge of the ring)
        p.line.style.display = "";
        p.line.setAttribute("x1", String(m.target[0] + (dx / len) * from));
        p.line.setAttribute("y1", String(m.target[1] + (dy / len) * from));
        p.line.setAttribute("x2", String(m.icon[0] - (dx / len) * 24));
        p.line.setAttribute("y2", String(m.icon[1] - (dy / len) * 24));
        for (const c of [p.ring, p.dot]) { c.setAttribute("cx", String(m.target[0])); c.setAttribute("cy", String(m.target[1])); c.style.display = m.vertex ? "" : "none"; }
      });
    },
  };
}
