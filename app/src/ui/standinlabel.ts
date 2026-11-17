// The label on the disc that stands for a gear body the kernel has not made yet (`dec_gear_standin`, `in_804`): a small dark pill on the middle of the disc that says it is being made and for how long, so the grey disc reads as a
// place holder, not as the part. A mark, not a control: it takes no clicks. Pure DOM; the page says where each disc's middle is on the screen and how long the wait has lasted.

import { standInWords } from "../interaction/api.ts";

export function createStandInLabels(host: HTMLElement) {
  const pool: HTMLDivElement[] = [];
  const make = (): HTMLDivElement => {
    const el = document.createElement("div");
    el.style.cssText = "position:fixed;left:0;top:0;display:none;padding:3px 10px;border-radius:12px;background:rgba(32,34,38,.82);color:#fff;font:12px system-ui,sans-serif;white-space:nowrap;z-index:5;pointer-events:none;opacity:.92";
    el.setAttribute("aria-label", "a gear's body is being made");
    host.appendChild(el);
    pool.push(el);
    return el;
  };
  return {
    /** `at`: the page position of the middle of each disc (null where it is off the screen); `seconds`: how long the kernel has been working; `show` false hides all. Returns the whole seconds shown, or null when none is. */
    update(at: ([number, number] | null)[], seconds: number, show: boolean): number | null {
      const places = show ? at.filter((p): p is [number, number] => !!p) : [];
      const words = standInWords(seconds);
      places.forEach((p, i) => {
        const el = pool[i] ?? make();
        if (el.textContent !== words) el.textContent = words;
        el.style.display = "block";
        el.style.transform = `translate(${Math.round(p[0])}px, ${Math.round(p[1])}px) translate(-50%, -50%)`;
      });
      for (let i = places.length; i < pool.length; i++) pool[i]!.style.display = "none";
      return places.length ? seconds : null;
    },
  };
}
