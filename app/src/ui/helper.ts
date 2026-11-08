// A little bubble of help that stands on an arrow (`in_236`): "pull to copy", "pull to separate". It only draws; the pointer passes through it to the arrow under it.
export function createHelper(host: HTMLElement) {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;left:0;top:0;display:none;padding:4px 10px;border-radius:13px;background:#1a2b2b;color:#fff;font:12.5px system-ui,sans-serif;white-space:nowrap;pointer-events:none;z-index:9;box-shadow:0 1px 6px rgba(0,0,0,.25)";
  host.appendChild(el);
  let shown = "";
  return {
    /** `text` and the page position of the arrow's tip (null: hide). */
    update(text: string | null, at: [number, number] | null) {
      if (!text || !at) { el.style.display = "none"; return; }
      if (shown !== text) { shown = text; el.textContent = text; }
      el.style.display = "block";
      el.style.transform = `translate(${Math.round(at[0] + 12)}px, ${Math.round(at[1] - 34)}px)`;
    },
  };
}
