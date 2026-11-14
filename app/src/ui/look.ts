// One look for the small controls that sit over the view (`in_300`): a dark pill, and choices in it that are teal when on and pale when off. The Similar chip, the join / separate chip of Combine and the group chip are all made of these.
/** The dark pill that holds a label and its choices. */
export const PILL = "position:fixed;z-index:7;display:none;align-items:center;gap:8px;height:36px;padding:0 12px;border-radius:18px;background:rgba(32,34,38,.92);color:#fff;font:13px system-ui,sans-serif;white-space:nowrap;user-select:none;-webkit-user-select:none;touch-action:manipulation";
/** One choice in a pill: teal when on, pale when off. */
const choiceCss = (on: boolean, live = true): string => `display:inline-flex;align-items:center;gap:3px;cursor:${live ? "pointer" : "default"};padding:3px 8px;border-radius:12px;opacity:${live ? 1 : 0.45};background:${on ? "#1ab8b3" : "rgba(255,255,255,.16)"};color:${on ? "#06312f" : "#fff"}`;
/** A pill that is a row of choices: `onPick` is told which was clicked. Taps and presses on it do not reach the view. */
export function choiceRow(parent: HTMLElement, choices: { id: string; text: string; title: string; on: boolean; live?: boolean }[], onPick: (id: string) => void): void {
  parent.replaceChildren(...choices.map((c) => {
    const b = document.createElement("span");
    b.style.cssText = choiceCss(c.on, c.live !== false);
    b.title = c.title;
    b.textContent = c.text;
    b.addEventListener("pointerdown", (e) => e.stopPropagation());
    b.addEventListener("click", (e) => { e.stopPropagation(); if (c.live !== false) onPick(c.id); });
    return b;
  }));
}
