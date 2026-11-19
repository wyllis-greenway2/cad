// The bar of a joint that is played or scrubbed (`dec_mechanism_motion`, stage 1): play and pause, a slider over the joint's range, what it is doing, a switch between turning and sliding, keep and close. It only shows what the
// frame says and sends intents; nothing here knows about joints. Built on the toolpath preview's bar (`previewbar.ts`).
import { PILL } from "./look.ts";
import type { Frame } from "../interaction/frame.ts";

export function createMotionBar(host: HTMLElement, send: (i: { type: "motionAt"; amount: number } | { type: "motionPlay" } | { type: "motionKind"; kind: "turn" | "slide" } | { type: "motionKeep" } | { type: "motionFix"; act: "open" | "apply" | "skip" | "close" } | { type: "motionReverse" } | { type: "motionSpeed"; k: number } | { type: "motionRest"; ref: string; rest: number | null } | { type: "motionLink"; id: string; ratio?: number; kind?: "turn" | "slide"; remove?: true } | { type: "motionClose" }) => void) {
  const bar = document.createElement("div");
  bar.style.cssText = PILL + ";bottom:60px;left:50%;transform:translateX(-50%);pointer-events:auto;gap:10px;display:none";
  bar.setAttribute("data-motion-bar", "");
  const btn = (text: string, title: string): HTMLSpanElement => { const b = document.createElement("span"); b.textContent = text; b.title = title; b.style.cssText = "cursor:pointer;padding:0 4px;user-select:none"; return b; };
  const play = btn("⏸", "Play or pause the motion");
  const slider = document.createElement("input");
  slider.type = "range"; slider.step = "any"; slider.style.cssText = "width:min(30vw,220px);accent-color:#2b8a3e"; slider.title = "Move the joint by hand";
  const rev = btn("⇄", "Play the other way round"); 
  const keep = btn("Keep pose", "Make this pose the joint's value (one step, one undo); until then nothing is written");
  const close = btn("✕", "Stop: the joint goes back to where it was"); close.style.opacity = ".8";
  const links = document.createElement("span"); links.style.cssText = "display:flex;gap:8px;align-items:center";
  let linkKey = "";
  const note = document.createElement("div"); // (what is said about the motion: above the bar and out of its layout, so a long message does not move the bar)
  note.style.cssText = "position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);max-width:min(80vw,640px);padding:4px 12px;border-radius:12px;background:rgba(34,37,41,.92);color:#fff;font-size:12.5px;white-space:normal;text-align:center;opacity:0;transition:opacity .35s ease;pointer-events:none";
  // the offer to put joints in the place of the push (`in_1122`): a card under the bar; while the walk is open it shows the joint offered, with Apply and Skip
  const card = document.createElement("div");
  card.style.cssText = "position:absolute;bottom:calc(100% + 46px);left:50%;transform:translateX(-50%);display:none;gap:10px;align-items:center;padding:6px 12px;border-radius:12px;background:rgba(34,37,41,.95);color:#fff;font-size:12.5px;width:max-content;max-width:min(86vw,720px);white-space:normal";
  card.setAttribute("data-fix-card", "");
  const cardText = document.createElement("span");
  const cardBtn = (text: string, title: string, act: "open" | "apply" | "skip" | "close", strong = false): HTMLSpanElement => { const b = btn(text, title); b.style.cssText += `;border:1px solid rgba(255,255,255,.45);border-radius:6px;padding:1px 8px;${strong ? "background:#2b8a3e;border-color:#2b8a3e" : ""}`; b.addEventListener("pointerup", (e) => { e.stopPropagation(); send({ type: "motionFix", act }); }); return b; };
  const applyB = cardBtn("Apply", "Make this joint; the motion then runs on it", "apply", true);
  const skipB = cardBtn("Skip", "Leave this one to the push", "skip");
  const closeB = cardBtn("✕", "Leave this", "close");
  card.append(cardText, applyB, skipB, closeB);
  // the offer to replace the push by joints: a button in the bar itself, at the right (`in_1169`)
  const fixB = btn("Fix Constraints", "Slow animation: it is worked out by collision. Find which pushed bodies could be joints (they cost nothing) and walk through them one at a time");
  fixB.style.cssText += ";border:1px solid #2b8a3e;background:#2b8a3e;border-radius:6px;padding:1px 8px;display:none";
  fixB.addEventListener("pointerup", (e) => { e.stopPropagation(); send({ type: "motionFix", act: "open" }); });
  // the speed of the play: a clock by the play button; it opens a few speeds to choose from
  const clock = btn("", "Speed of the play");
  clock.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" style="display:block"><circle cx="8" cy="8" r="6.2"/><path d="M8 4.4V8l2.4 1.6"/></svg>';
  const speeds = document.createElement("div");
  speeds.style.cssText = "position:absolute;bottom:calc(100% + 8px);left:0;display:none;gap:4px;align-items:center;padding:4px 6px;border-radius:12px;background:rgba(34,37,41,.95);color:#fff;font-size:12.5px";
  const chips = [0.25, 0.5, 1, 2, 4].map((k) => { const c = btn(`${k}×`, `Play at ${k} times the speed`); c.style.cssText += ";border-radius:6px;padding:1px 6px"; c.addEventListener("pointerup", (e) => { e.stopPropagation(); speeds.style.display = "none"; send({ type: "motionSpeed", k }); }); speeds.appendChild(c); return { k, c }; });
  clock.addEventListener("pointerup", (e) => { e.stopPropagation(); speeds.style.display = speeds.style.display === "none" ? "flex" : "none"; });
  bar.append(note, card, speeds, play, rev, clock, slider, links, keep, fixB, close);
  host.appendChild(bar);
  play.addEventListener("pointerup", (e) => { e.stopPropagation(); send({ type: "motionPlay" }); });
  slider.addEventListener("input", () => send({ type: "motionAt", amount: Number(slider.value) }));
  slider.addEventListener("pointerup", () => slider.blur());
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
      play.textContent = v.playing ? "⏸" : "▶";
      slider.min = String(v.lo); slider.max = String(v.hi);
      if (document.activeElement !== slider) slider.value = String(v.amount);
      rev.style.opacity = v.reversed ? "1" : ".6"; rev.style.textDecoration = v.reversed ? "underline" : "none";
      // the note fades in once it has been there a moment (a heavy push comes and goes from one frame to the next) and fades out a good while after it was last said, so it can be read; a jam is shown at once
      const clock = performance.now();
      if (v.note) { if (!noteSince) noteSince = clock; noteLast = v.note; noteSeen = clock; } else noteSince = 0;
      const show = !!noteLast && (((!!v.note && (v.note.startsWith("stopped") || clock - noteSince >= 600))) || clock - noteSeen < 3000 && noteOn);
      noteOn = show;
      if (noteLast) note.textContent = noteLast;
      note.style.opacity = show ? "1" : "0";
      if (!show && noteLast && clock - noteSeen > 3500) noteLast = "";
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
      const step = v.fix.step;
      card.style.display = step ? "flex" : "none";
      if (step) {
        cardText.textContent = step.of > 1 ? `${step.n}/${step.of}` : "";
        cardText.style.display = cardText.textContent ? "" : "none";
        applyB.textContent = step.how === "mate" ? "Apply coaxial mate" : "Apply pivot";
      }
      fixB.style.display = v.fix.offer && !step ? "" : "none";
      for (const c of chips) c.c.style.background = Math.abs(c.k - v.speedK) < 1e-6 ? "rgba(255,255,255,.25)" : "transparent";
    },
  };
}
