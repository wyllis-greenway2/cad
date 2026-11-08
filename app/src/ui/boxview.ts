// The rectangle of a drag select (`in_230`): a thin blue outline with a light fill; dashed when it also picks what it only touches (dragged from the right). It only draws; the pointer goes to the page as usual.
export function createBoxView(host: HTMLElement) {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;left:0;top:0;display:none;box-sizing:border-box;pointer-events:none;z-index:7;background:rgba(26,184,179,.12);border:1.5px solid #1ab8b3";
  host.appendChild(el);
  return {
    /** `box`: page pixels (null: hide). */
    update(box: { x0: number; y0: number; x: number; y: number; touching: boolean } | null, left = 0, top = 0) {
      if (!box) { el.style.display = "none"; return; }
      el.style.display = "block";
      el.style.borderStyle = box.touching ? "dashed" : "solid";
      el.style.transform = `translate(${Math.round(Math.min(box.x0, box.x) + left)}px, ${Math.round(Math.min(box.y0, box.y) + top)}px)`;
      el.style.width = `${Math.abs(box.x - box.x0)}px`;
      el.style.height = `${Math.abs(box.y - box.y0)}px`;
    },
  };
}
