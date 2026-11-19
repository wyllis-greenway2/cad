// The bar of a joint that is played or scrubbed (`dec_mechanism_motion`, stage 1): play and pause, a slider over the joint's range, what it is doing, a switch between turning and sliding, keep and close. It only shows what the
// frame says and sends intents; nothing here knows about joints. Built on the toolpath preview's bar (`previewbar.ts`).
import { PILL } from "./look.ts";
import type { Frame } from "../interaction/frame.ts";

export function createMotionBar(host: HTMLElement, send: (i: { type: "motionAt"; amount: number } | { type: "motionPlay" } | { type: "motionKind"; kind: "turn" | "slide" } | { type: "motionKeep" } | { type: "motionReverse" } | { type: "motionRest"; ref: string; rest: number | null } | { type: "motionLink"; id: string; ratio?: number; kind?: "turn" | "slide"; remove?: true } | { type: "motionClose" }) => void) {
  const bar = document.createElement("div");
  bar.style.cssText = PILL + ";bottom:60px;left:50%;transform:translateX(-50%);pointer-events:auto;gap:10px;display:none";
  bar.setAttribute("data-motion-bar", "");
  const btn = (text: string, title: string): HTMLSpanElement => { const b = document.createElement("span"); b.textContent = text; b.title = title; b.style.cssText = "cursor:pointer;padding:0 4px;user-select:none"; return b; };
  const play = btn("⏸", "Play or pause the motion");
  const slider = document.createElement("input");
  slider.type = "range"; slider.step = "any"; slider.style.cssText = "width:min(30vw,220px);accent-color:#2b8a3e"; slider.title = "Move the joint by hand";
  const label = document.createElement("span"); label.style.cssText = "min-width:104px;text-align:left;white-space:pre;font-variant-numeric:tabular-nums";
  const kind = btn("turn / slide", "Switch between turning and sliding"); kind.style.opacity = ".85"; kind.style.minWidth = "58px"; kind.style.textAlign = "center";
  const rev = btn("⇄", "Play the other way round"); 
  const keep = btn("Keep pose", "Make this pose the joint's value (one step, one undo); until then nothing is written");
  const close = btn("✕", "Stop: the joint goes back to where it was"); close.style.opacity = ".8";
  const links = document.createElement("span"); links.style.cssText = "display:flex;gap:8px;align-items:center";
  let linkKey = "";
  const springs = document.createElement("span"); springs.style.cssText = "display:flex;gap:8px;align-items:center"; // (the bodies that yield by contact, each with where it goes back to)
  let springKey = "";
  const note = document.createElement("div"); // (what is said about the motion: above the bar and out of its layout, so a long message does not move the bar)
  note.style.cssText = "position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);max-width:min(80vw,640px);padding:4px 12px;border-radius:12px;background:rgba(34,37,41,.92);color:#fff;font-size:12.5px;white-space:normal;text-align:center;opacity:0;transition:opacity .35s ease;pointer-events:none";
  bar.append(note, play, rev, slider, label, kind, links, springs, keep, close);
  host.appendChild(bar);
  play.addEventListener("pointerup", (e) => { e.stopPropagation(); send({ type: "motionPlay" }); });
  slider.addEventListener("input", () => send({ type: "motionAt", amount: Number(slider.value) }));
  slider.addEventListener("pointerup", () => slider.blur());
  let now: "turn" | "slide" = "turn";
  kind.addEventListener("pointerup", (e) => { e.stopPropagation(); send({ type: "motionKind", kind: now === "turn" ? "slide" : "turn" }); });
  rev.addEventListener("pointerup", (e) => { e.stopPropagation(); send({ type: "motionReverse" }); });
  keep.addEventListener("pointerup", (e) => { e.stopPropagation(); send({ type: "motionKeep" }); });
  close.addEventListener("pointerup", (e) => { e.stopPropagation(); send({ type: "motionClose" }); });
  for (const ev of ["pointerdown", "pointerup", "pointermove", "wheel"]) bar.addEventListener(ev, (e) => e.stopPropagation()); // (the page behind does not take them)
  let shown = false;
  let noteSince = 0, noteSeen = 0, noteLast = "", noteOn = false; // (the note's own clock: what it said last, when it began, when it was last said, whether it shows)
  return {
    update(v: Frame["motionBar"]) {
      if (!v) { if (shown) { bar.style.display = "none"; shown = false; } return; }
      if (!shown) { bar.style.display = "flex"; shown = true; }
      now = v.kind;
      play.textContent = v.playing ? "⏸" : "▶";
      slider.min = String(v.lo); slider.max = String(v.hi);
      if (document.activeElement !== slider) slider.value = String(v.amount);
      rev.style.opacity = v.reversed ? "1" : ".6"; rev.style.textDecoration = v.reversed ? "underline" : "none";
      label.textContent = v.label;
      // the note fades in once it has been there a moment (a heavy push comes and goes from one frame to the next) and fades out a good while after it was last said, so it can be read; a jam is shown at once
      const clock = performance.now();
      if (v.note) { if (!noteSince) noteSince = clock; noteLast = v.note; noteSeen = clock; } else noteSince = 0;
      const show = !!noteLast && (((!!v.note && (v.note.startsWith("stopped") || clock - noteSince >= 600))) || clock - noteSeen < 3000 && noteOn);
      noteOn = show;
      if (noteLast) note.textContent = noteLast;
      note.style.opacity = show ? "1" : "0";
      if (!show && noteLast && clock - noteSeen > 3500) noteLast = "";
      const sKey = JSON.stringify(v.springs);
      if (sKey !== springKey && !springs.contains(document.activeElement)) { // (made again only when they change, so a number being typed is not lost)
        springKey = sKey; springs.replaceChildren();
        for (const sp of v.springs) {
          const box = document.createElement("span"); box.style.cssText = "display:flex;gap:4px;align-items:center"; box.title = `Where ${sp.name} goes back to when nothing holds it away: degrees from where it is drawn; empty: it stays where it was pushed`;
          const word = document.createElement("span"); word.textContent = `${sp.name} back to`;
          const num = document.createElement("input"); num.type = "number"; num.step = "any"; num.placeholder = "–"; num.value = sp.rest === null ? "" : String(Math.round(sp.rest * 1e6) / 1e6); num.style.cssText = "width:56px;background:transparent;color:inherit;border:1px solid rgba(255,255,255,.3);border-radius:4px;padding:1px 4px";
          num.addEventListener("change", () => { const x = Number(num.value); send({ type: "motionRest", ref: sp.ref, rest: num.value.trim() === "" || !Number.isFinite(x) ? null : x }); });
          for (const ev of ["keydown", "keyup", "keypress"]) num.addEventListener(ev, (e) => e.stopPropagation());
          const unit = document.createElement("span"); unit.textContent = "°";
          box.append(word, num, unit); springs.appendChild(box);
        }
      }
      const key = JSON.stringify(v.links);
      if (key !== linkKey && !links.contains(document.activeElement)) { // (the links of this joint, each with its ratio, what the other end does and a way to take it away; made again only when they change, so a number being typed is not lost)
        linkKey = key; links.replaceChildren();
        for (const l of v.links) {
          const box = document.createElement("span"); box.style.cssText = "display:flex;gap:4px;align-items:center";
          const times = document.createElement("span"); times.textContent = "×"; times.title = "The linked joint moves this much for each degree or mm of this one";
          const num = document.createElement("input"); num.type = "number"; num.step = "any"; num.value = String(Math.round(l.ratio * 1e6) / 1e6); num.style.cssText = "width:70px;background:transparent;color:inherit;border:1px solid rgba(255,255,255,.3);border-radius:4px;padding:1px 4px";
          num.addEventListener("change", () => { const x = Number(num.value); if (Number.isFinite(x) && x !== 0) send({ type: "motionLink", id: l.id, ratio: x }); });
          for (const ev of ["keydown", "keyup", "keypress"]) num.addEventListener(ev, (e) => e.stopPropagation()); // (typing a number is not a command)
          const k = btn(l.kind === "turn" ? "turns" : "slides", "What the linked joint does: turn or slide"); k.addEventListener("pointerup", (e) => { e.stopPropagation(); send({ type: "motionLink", id: l.id, kind: l.kind === "turn" ? "slide" : "turn" }); });
          const x = btn("✕", "Take this link away"); x.addEventListener("pointerup", (e) => { e.stopPropagation(); send({ type: "motionLink", id: l.id, remove: true }); });
          box.append(times, num, k, x); links.appendChild(box);
        }
      }
      kind.textContent = v.kind === "turn" ? "turning" : "sliding";
    },
  };
}
