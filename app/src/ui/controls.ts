import { iconSvg } from "./icons.ts";
// The small controls on the page: the ⋯ menu button (for a phone, where there is no right click) and the X Y Z buttons at the right edge, lower right (`in_068`).
// They report what was pressed; the interaction layer decides what it means.
export interface ControlHandlers { menu(x: number, y: number): void; look(plane: "X" | "Y" | "Z" | "N"): void }

export function createControls(host: HTMLElement, h: ControlHandlers) {
  const css = "position:fixed;z-index:7;user-select:none;-webkit-user-select:none;touch-action:manipulation;";
  const menu = document.createElement("div");
  menu.textContent = "⋯";
  menu.title = "Settings and options";
  menu.style.cssText = css + "top:12px;right:12px;width:40px;height:40px;border-radius:20px;background:#34363b;color:#fff;font:700 22px/38px system-ui,sans-serif;text-align:center;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.25)";
  menu.addEventListener("click", (e) => { e.stopPropagation(); const r = menu.getBoundingClientRect(); h.menu(r.left, r.bottom + 6); });
  host.appendChild(menu);

  const buttons = (["X", "Y", "Z"] as const).map((name) => {
    const b = document.createElement("div");
    b.textContent = name;
    b.title = `Look along ${name} (press again for the back)`;
    b.style.cssText = css + "display:none;width:34px;height:34px;border-radius:17px;background:#fff;border:1px solid #cfd0d4;color:#2b2b2d;font:700 13px/32px system-ui,sans-serif;text-align:center;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.10)";
    b.addEventListener("click", (e) => { e.stopPropagation(); h.look(name); });
    host.appendChild(b);
    return b;
  });

  // the eye: look straight at the selected plane or face (shown at the top while one is selected or sketched on)
  const eye = document.createElement("div");
  eye.innerHTML = iconSvg("eye");
  eye.title = "Look straight at it (press again for the back)";
  eye.style.cssText = css + "display:none;left:calc(50% - 90px);top:14px;width:40px;height:40px;box-sizing:border-box;border-radius:50%;align-items:center;justify-content:center;background:#fff;border:2px solid #34363b;color:#34363b;box-shadow:0 2px 10px rgba(0,0,0,.16);cursor:pointer";
  eye.addEventListener("click", (e) => { e.stopPropagation(); h.look("N"); });
  host.appendChild(eye);

  return {
    /** Light the button of the axis the selected plane lies across; show the eye while a plane or face is selected. */
    hint(axis: "X" | "Y" | "Z" | null, showEye: boolean) {
      buttons.forEach((b, i) => {
        const on = axis === "XYZ"[i];
        b.style.background = on ? "#1ab8b3" : "#fff";
        b.style.color = on ? "#fff" : "#2b2b2d";
        b.style.borderColor = on ? "#1ab8b3" : "#cfd0d4";
      });
      eye.style.display = showEye ? "flex" : "none";
    },
    /** Place the buttons at the right edge, lower right, one above the other (X on top). */
    update(pageW: number, pageH: number, margin: number, button: number) {
      buttons.forEach((b, i) => {
        b.style.display = "block";
        b.style.left = `${pageW - margin - button}px`;
        b.style.top = `${pageH - margin - 3 * 38 + 4 + i * 38}px`;
      });
    },
  };
}
