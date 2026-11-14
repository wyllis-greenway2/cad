// The mark at the middle of the view while game mode holds the pointer there (`in_304`): the real pointer is hidden, so a small ring shows where hovering and clicking happen.
export function createCrosshair(host: HTMLElement) {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;z-index:6;display:none;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;border:2px solid rgba(43,43,45,.75);box-shadow:0 0 0 1.5px rgba(255,255,255,.85);pointer-events:none";
  host.appendChild(el);
  return { update(on: boolean, centre: { x: number; y: number }) { el.style.display = on ? "block" : "none"; if (on) { el.style.left = `${centre.x}px`; el.style.top = `${centre.y}px`; } } };
}
