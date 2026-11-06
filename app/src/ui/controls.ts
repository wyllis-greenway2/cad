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

  // the eye, under the Z button: look straight at the selected plane or face. It fades away while you are already looking straight at it (or nothing is selected to look at) and comes back when you can be again.
  const eye = document.createElement("div");
  eye.innerHTML = iconSvg("eye");
  eye.title = "Look straight at it (press again for the back)";
  eye.style.cssText = css + "display:none;width:34px;height:34px;box-sizing:border-box;border-radius:17px;align-items:center;justify-content:center;background:#fff;border:1px solid #cfd0d4;color:#2b2b2d;box-shadow:0 2px 8px rgba(0,0,0,.10);cursor:pointer;opacity:0;pointer-events:none;transition:opacity .25s";
  eye.addEventListener("click", (e) => { e.stopPropagation(); h.look("N"); });
  host.appendChild(eye);

  // the icon of the mode you are in follows the pointer, a little to the lower right of it
  const mode = document.createElement("div");
  mode.style.cssText = css + "display:none;z-index:6;pointer-events:none;width:26px;height:26px;border-radius:13px;background:#fff;border:1px solid #1ab8b3;color:#2b2b2d;align-items:center;justify-content:center;box-shadow:0 1px 6px rgba(0,0,0,.18)";
  host.appendChild(mode);
  let shownMode: string | null = null;
  let at = [-100, -100];
  addEventListener("pointermove", (e) => { at = [e.clientX, e.clientY]; mode.style.left = `${at[0]! + 14}px`; mode.style.top = `${at[1]! + 14}px`; });

  return {
    /** Show the icon of the mode (null: none) beside the pointer. */
    mode(icon: string | null) {
      if (icon === shownMode) return;
      shownMode = icon;
      mode.style.display = icon ? "flex" : "none";
      if (icon) { mode.innerHTML = iconSvg(icon); mode.style.left = `${at[0]! + 14}px`; mode.style.top = `${at[1]! + 14}px`; }
    },
    /** Light the button of the axis the selected plane lies across (+ or −); fade the eye in or out. */
    hint(hint: { axis: "X" | "Y" | "Z"; sign: 1 | -1 } | null, showEye: boolean) {
      buttons.forEach((b, i) => {
        const on = hint?.axis === "XYZ"[i];
        b.textContent = on ? `${hint!.sign > 0 ? "+" : "−"}${"XYZ"[i]}` : "XYZ"[i]!;
        b.style.background = on ? "#1ab8b3" : "#fff";
        b.style.color = on ? "#fff" : "#2b2b2d";
        b.style.borderColor = on ? "#1ab8b3" : "#cfd0d4";
      });
      eye.style.opacity = showEye ? "1" : "0";
      eye.style.pointerEvents = showEye ? "auto" : "none";
    },
    /** Place the buttons at the right edge, lower right, one above the other (X on top). */
    update(pageW: number, pageH: number, margin: number, button: number) {
      [...buttons, eye].forEach((b, i) => {
        b.style.display = i < 3 ? "block" : "flex";
        b.style.left = `${pageW - margin - button}px`;
        b.style.top = `${pageH - margin - 4 * 38 + 4 + i * 38}px`;
      });
    },
  };
}
