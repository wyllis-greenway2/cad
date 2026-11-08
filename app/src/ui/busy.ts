// A "working" sign for when the kernel is taking a while (`in_236`: a big grid of copies took so long that the app looked broken). It only shows after a short wait, so quick answers do not flash it.
export function createBusy(host: HTMLElement, delayMs = 350) {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;left:50%;top:70px;transform:translateX(-50%);display:none;align-items:center;gap:8px;padding:6px 14px;border-radius:16px;background:#fff;border:1px solid #d6d7db;box-shadow:0 1px 8px rgba(0,0,0,.15);font:13px system-ui,sans-serif;color:#2b2b2d;pointer-events:none;z-index:9";
  const ring = document.createElement("div");
  ring.style.cssText = "width:14px;height:14px;border-radius:50%;border:2px solid #cfd0d4;border-top-color:#1ab8b3";
  el.append(ring, document.createTextNode("Working…"));
  host.appendChild(el);
  let since: number | null = null;
  return {
    /** `busy`: the kernel has not answered yet; `nowMs`: the time. Returns true while the sign wants more frames (it turns). */
    update(busy: boolean, nowMs: number): boolean {
      if (!busy) { since = null; el.style.display = "none"; return false; }
      since ??= nowMs;
      const show = nowMs - since >= delayMs;
      el.style.display = show ? "flex" : "none";
      if (show) ring.style.transform = `rotate(${Math.round(((nowMs - since) / 4) % 360)}deg)`;
      return true;
    },
  };
}
