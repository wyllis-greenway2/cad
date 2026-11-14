// Info bubbles for a finger (`in_300`): a phone has no hover, so the tooltip of a button (its `title`) shows when it is pressed and held; the press that showed it does not click the button.
const HOLD_MS = 450;

/** Install once: a held press on anything that has a title (or sits in something that has) shows the title in a bubble beside it, until the finger is lifted or a moment has passed. */
export function installTouchTips(doc: Document = document): void {
  const bubble = doc.createElement("div");
  bubble.style.cssText = "position:fixed;z-index:30;display:none;max-width:240px;padding:7px 11px;border-radius:10px;background:rgba(32,34,38,.95);color:#fff;font:13px/1.35 system-ui,sans-serif;pointer-events:none;box-shadow:0 2px 10px rgba(0,0,0,.3)";
  doc.body.appendChild(bubble);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let shown = false;
  let start: [number, number] = [0, 0];
  const hide = () => { bubble.style.display = "none"; if (hideTimer) clearTimeout(hideTimer); hideTimer = null; };
  const cancel = () => { if (timer) clearTimeout(timer); timer = null; };
  doc.addEventListener("pointerdown", (e) => {
    cancel();
    shown = false;
    start = [e.clientX, e.clientY];
    if (e.pointerType !== "touch") return;
    const el = (e.target as HTMLElement | null)?.closest<HTMLElement>("[title]");
    const text = el?.getAttribute("title");
    if (!el || !text) { hide(); return; }
    timer = setTimeout(() => {
      shown = true;
      bubble.textContent = text;
      bubble.style.display = "block";
      const r = el.getBoundingClientRect();
      const w = bubble.offsetWidth;
      bubble.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`;
      const above = r.top - bubble.offsetHeight - 8;
      bubble.style.top = `${above > 8 ? above : r.bottom + 8}px`;
      hideTimer = setTimeout(hide, 4000);
    }, HOLD_MS);
  }, true);
  doc.addEventListener("pointerup", cancel, true);
  doc.addEventListener("pointercancel", cancel, true);
  doc.addEventListener("pointermove", (e) => { if (e.pointerType === "touch" && Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 12) cancel(); }, true); // (a finger that moves is not holding)
  // the press that showed a bubble is not a click on the button
  doc.addEventListener("click", (e) => { if (shown) { e.stopPropagation(); e.preventDefault(); shown = false; } }, true);
}
