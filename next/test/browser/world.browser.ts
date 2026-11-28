import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { start, pixels, isWhite, type Session } from "./harness.ts";

let session: Session;
before(async () => { session = await start(); });
after(async () => { await session.stop(); });

test("[W1] the world is white, with the three axis letters, and the page raises no errors", async () => {
  const { page, errors, close } = await session.open("?boxes=0");
  const px = await pixels(page, await page.screenshot());
  assert.ok(isWhite(px.at(5, 5)) && isWhite(px.at(px.w - 5, 5)) && isWhite(px.at(5, px.h - 5)), "white background");
  const letters = await page.evaluate(() => [...document.querySelectorAll(".cadletter")].filter((e) => (e as HTMLElement).style.display !== "none").map((e) => e.textContent));
  assert.deepEqual([...letters].sort(), ["X", "Y", "Z"]);
  assert.deepEqual(errors, []);
  await close();
});

test("[W8] the grid is drawn in a straight view too", async () => {
  const { page, close } = await session.open("?boxes=0");
  const z = await page.evaluate(() => { const b = [...document.querySelectorAll(".cadbtn")].find((e) => e.textContent?.trim().endsWith("Z"))!.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
  await page.mouse.click(z.x, z.y); // Z: the top view
  await page.waitForTimeout(900);
  const state = await page.evaluate(() => (window as any).__cad.cam.ortho);
  assert.notEqual(state, null, "it is a straight view");
  const px = await pixels(page, await page.screenshot());
  let grey = 0;
  for (let y = 0; y < px.h; y += 3) for (let x = 0; x < px.w; x += 3) { const [r, g, b] = px.at(x, y); if (r < 245 && Math.abs(r - g) < 12 && Math.abs(g - b) < 14) grey++; }
  assert.ok(grey > 400, `grid lines are drawn (${grey} grey samples)`);
  await close();
});

test("[W9] the grid is sharp at a deep zoom: its lines are unbroken, not hatched", async () => {
  const { page, close } = await session.open("?boxes=0");
  await page.evaluate(() => (window as any).__cad.set({ eye: [0.4, 0.3, 50], yaw: Math.PI / 2, pitch: -Math.PI / 2, ortho: 0.14 }));
  await page.waitForTimeout(500);
  const px = await pixels(page, await page.screenshot());
  let best = 0;
  for (let x = 0; x < px.w; x++) { let n = 0; for (let y = 0; y < px.h; y++) { const [r] = px.at(x, y); if (r < 248) n++; } best = Math.max(best, n / px.h); }
  assert.ok(best > 0.9, `a grid line runs unbroken across the view (the best column is ${(best * 100).toFixed(0)} % covered)`);
  await close();
});

test("[W11] a pane seen exactly edge-on shows nothing: no band of tint beside the line it makes", async () => {
  const { page, close } = await session.open("?boxes=0");
  // the eye in the plane of the floor pane, looking along it at the origin
  await page.evaluate(() => (window as any).__cad.set({ eye: [80, 80, 0], yaw: -2.356, pitch: 0 }));
  await page.waitForTimeout(500);
  const px = await pixels(page, await page.screenshot());
  const line = Math.round(px.h / 2);
  for (const dy of [-6, -5, -4, 4, 5, 6]) for (let x = Math.round(px.w * 0.35); x < Math.round(px.w * 0.65); x += 4) {
    if (Math.abs(x - px.w / 2) < 12) continue; // (the vertical axis and its arrow)
    assert.ok(isWhite(px.at(x, line + dy), 10), `tint at ${x},${line + dy}: ${px.at(x, line + dy)}`);
  }
  await close();
});

test("[W15] the origin dot grows to an eye on hover, and a click hides and shows the axes and panes", async () => {
  const { page, close } = await session.open("?boxes=0");
  const where = await page.evaluate(() => { const r = document.querySelector(".cadorb")!.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; });
  assert.ok(where.w < 14, "a small dot");
  await page.mouse.move(where.x, where.y);
  await page.waitForTimeout(300);
  const hot = await page.evaluate(() => { const o = document.querySelector(".cadorb")!; const s = o.querySelector("svg")!; return { w: o.getBoundingClientRect().width, svg: getComputedStyle(s).display, shown: [...document.querySelectorAll(".cadletter")].filter((e) => (e as HTMLElement).style.display !== "none").length }; });
  assert.ok(hot.w > 20 && hot.svg !== "none", "an eye");
  assert.equal(hot.shown, 3);
  await page.mouse.click(where.x, where.y);
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => [...document.querySelectorAll(".cadletter")].filter((e) => (e as HTMLElement).style.display !== "none").length), 0, "the letters are put away");
  await page.mouse.click(where.x, where.y);
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => [...document.querySelectorAll(".cadletter")].filter((e) => (e as HTMLElement).style.display !== "none").length), 3, "and shown again");
  await close();
});

test("[B2] the button of the plane that is on has a 2 px light-gray border, and the Z button has it at the first load", async () => {
  const { page, close } = await session.open("?boxes=0");
  const borders = await page.evaluate(() => [...document.querySelectorAll(".cadbtn")].map((b) => { const s = getComputedStyle(b); return { t: b.textContent, w: s.borderTopWidth, c: s.borderTopColor }; }));
  const z = borders.find((b: any) => b.t?.endsWith("Z"))!, x = borders.find((b: any) => b.t?.endsWith("X"))!;
  assert.equal(z.w, "2px"); assert.equal(z.c, "rgb(154, 158, 166)");
  assert.equal(x.w, "1px");
  await close();
});

test("[C15] if the browser will not hold the pointer, game mode is given up and not left on with a mouse that does nothing", async () => {
  for (const how of ["a refused request", "the error event"]) {
    const { page, errors, close } = await session.open("?boxes=3");
    await page.evaluate((h: string) => {
      HTMLCanvasElement.prototype.requestPointerLock =
        h === "a refused request"
          ? () => Promise.reject(new DOMException("no", "SecurityError"))
          : (() => void setTimeout(() => document.dispatchEvent(new Event("pointerlockerror")), 0)) as unknown as typeof HTMLCanvasElement.prototype.requestPointerLock; // (older browsers return nothing and fire the event)
    }, how);
    await page.keyboard.press("Space"); // a tap of the space bar turns game mode on
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => (document.getElementById("ring") as HTMLElement).style.display), "none", `${how}: the ring is put away`);
    assert.deepEqual(errors, [], `${how}: no error is left unhandled`);
    await close();
  }
});
