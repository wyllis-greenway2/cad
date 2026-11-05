// The small controls on the page: the ⋯ menu button (for a phone, where there is no right click), and beside the corner compass its X Y Z buttons and its click area
// (a click on the compass sends the axes back to the origin and again to return, `in_068`, `in_070`). They report what was pressed; the interaction layer decides what it means.
export interface ControlHandlers { menu(x: number, y: number): void; compass(): void; look(plane: "X" | "Y" | "Z"): void }

export function createControls(host: HTMLElement, h: ControlHandlers) {
  const css = "position:fixed;z-index:7;user-select:none;-webkit-user-select:none;touch-action:manipulation;";
  const menu = document.createElement("div");
  menu.textContent = "⋯";
  menu.title = "Menu (the same as a right click)";
  menu.style.cssText = css + "top:12px;right:12px;width:40px;height:40px;border-radius:20px;background:#34363b;color:#fff;font:700 22px/38px system-ui,sans-serif;text-align:center;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.25)";
  menu.addEventListener("click", (e) => { e.stopPropagation(); const r = menu.getBoundingClientRect(); h.menu(r.left, r.bottom + 6); });
  host.appendChild(menu);

  const compass = document.createElement("div");
  compass.title = "Axes: click to send them to the origin, and again to bring them back";
  compass.style.cssText = css + "cursor:pointer;display:none";
  compass.addEventListener("click", (e) => { e.stopPropagation(); h.compass(); });
  host.appendChild(compass);

  const buttons = (["X", "Y", "Z"] as const).map((name) => {
    const b = document.createElement("div");
    b.textContent = name;
    b.title = `Look along ${name} (press again for the back)`;
    b.style.cssText = css + "display:none;width:34px;height:34px;border-radius:17px;background:#fff;border:1px solid #cfd0d4;color:#2b2b2d;font:700 13px/32px system-ui,sans-serif;text-align:center;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.10)";
    b.addEventListener("click", (e) => { e.stopPropagation(); h.look(name); });
    host.appendChild(b);
    return b;
  });

  return {
    /** Place the compass area and the buttons (corner mode only). `rect`: where the compass is drawn, in page pixels from the left, and its size and margin. */
    update(corner: boolean, pageW: number, pageH: number, rect: { x: number; size: number; margin: number }) {
      compass.style.display = corner ? "block" : "none";
      compass.style.left = `${rect.x}px`;
      compass.style.top = `${pageH - rect.margin - rect.size}px`;
      compass.style.width = compass.style.height = `${rect.size}px`;
      buttons.forEach((b, i) => {
        b.style.display = corner ? "block" : "none";
        b.style.left = `${rect.x - 44}px`;
        b.style.top = `${pageH - rect.margin - 3 * 38 + i * 38}px`;
      });
      void pageW;
    },
  };
}
