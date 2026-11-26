// A dev check in the real page (not a test, `in_1444`): the face tools run the one way (`dec_three_surfaces`): with nothing picked a tool asks for what it needs; a face already picked is used at once; a pull with no size is thrown away by the right click, one with a size is made; Esc throws it away.
//   node --experimental-strip-types dev/tools-face-browser.ts [screenshot-dir]
import { S, ok, finish, evalIn } from "./page-lib.ts";
try {
  const { page, errors, close } = await S.open(""), ev = evalIn(page);
  const notices = () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-notice]")].map((e) => `${e.dataset.persistent === "true" ? "*" : ""}${e.textContent}`));
  const badge = () => page.evaluate(() => { const e = document.querySelector<HTMLElement>("[data-badge]"); return e && getComputedStyle(e).display !== "none" ? e.dataset.badge : null; });
  const right = async (x: number, y: number) => { await page.mouse.click(x, y, { button: "right" }); await page.waitForTimeout(450); };
  const choose = async (path: string[]) => { await right(560, 360); for (const t of path) { await page.waitForTimeout(450); await page.click(`[title="${t}"]`); } await page.waitForTimeout(650); await page.mouse.move(700, 450); await page.waitForTimeout(150); };
  await ev(`() => window.__studio.change([{ id: "s1", kind: "sketchPolygon", params: { points: [[0, 0], [40, 0], [40, 25], [0, 25]] }, inputs: [] }, { id: "e1", kind: "extrude", params: { d: 10 }, inputs: ["s1"] }])`); await ev(`() => window.__studio.settled()`); await page.waitForTimeout(700);
  const topZ = async () => ev<number>(`() => { const m = window.__studio.state().meshes[0]; let z = -1e9; for (let i = 2; i < m.positions.length; i += 3) z = Math.max(z, m.positions[i]); return z; }`);
  const face = async () => { const [x, y] = await ev<[number, number]>(`() => window.__proj3([20, 12.5, 10])`); await page.mouse.click(x, y); await page.waitForTimeout(500); };
  await choose(["Model", "Push / pull a face"]);
  ok((await badge()) === "pushpull" && (await notices()).includes("*Select the face to push or pull"), `a face tool with nothing selected asks for the face: ${JSON.stringify(await notices())}`);
  await face(); await page.waitForTimeout(900);
  ok((await notices()).some((n) => /^\*Push \/ pull\. Drag the arrow/.test(n)), `a face picked runs it: its arrow is open and the notice says what to do: ${JSON.stringify(await notices())}`);
  await right(700, 520);
  ok((await topZ()) === 10 && (await badge()) === null, "a right click with no size: the pull is thrown away and the tool put away");
  await choose(["Model", "Push / pull a face"]); await face(); await page.waitForTimeout(900);
  await page.click("[data-fact='d'] [data-number]"); await page.keyboard.type("3"); await page.keyboard.press("Enter"); await page.waitForTimeout(300);
  await right(700, 520); await ev(`() => window.__studio.settled()`); await page.waitForTimeout(800);
  ok(Math.abs((await topZ()) - 13) < 1e-6 && (await badge()) === null, `a right click with a size of 3: it is made (the top is at ${await topZ()}) and the tool is put away`);
  // what is already selected is used first: a face picked, then the tool chosen: it runs at once
  await face(); await choose(["Model", "Push / pull a face"]); await page.waitForTimeout(500);
  ok((await notices()).some((n) => /^\*Push \/ pull\./.test(n)), "a face already selected: choosing the tool runs it at once");
  await page.keyboard.press("Escape"); await page.waitForTimeout(300);
  ok((await badge()) === null, "and Esc throws the pull away and puts the tool away");
  ok(errors.length === 0, `no errors in the page ${errors.join("; ").slice(0, 400)}`);
  await close();
} finally { await S.stop(); }
finish();
