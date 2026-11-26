// A dev check in the real page (not a test, `in_1444`): the tools run the one way (`dec_three_surfaces`): the ring holds every tool, always chosen; a click arms (a badge follows the pointer, what it needs is asked in a notice, step by step); what is already selected is used first;
// a right click commits what is valid, throws away the rest and disarms (with nothing armed it opens the ring); Esc throws the draft away, then disarms.   node --experimental-strip-types dev/tools-browser.ts [screenshot-dir]
import { S, dir, ok, finish, evalIn, pxIn, clickIn } from "./page-lib.ts";
import { writeFileSync } from "node:fs";
try {
  const { page, errors, close } = await S.open(""), ev = evalIn(page), px = pxIn(ev), click = clickIn(page, px, 150);
  const def = () => ev<any>(`() => Object.values(window.__sketch.snapshot())[0]`);
  const notices = () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-notice]")].map((e) => `${e.dataset.persistent === "true" ? "*" : ""}${e.textContent}`));
  const badge = () => page.evaluate(() => { const e = document.querySelector<HTMLElement>("[data-badge]"); return e && getComputedStyle(e).display !== "none" ? e.dataset.badge : null; });
  const right = async (x: number, y: number) => { await page.mouse.click(x, y, { button: "right" }); await page.waitForTimeout(450); };
  const choose = async (path: string[]) => { await right(560, 360); for (const t of path) { await page.waitForTimeout(450); await page.click(`[title="${t}"]`); } await page.waitForTimeout(650); await page.mouse.move(700, 450); await page.waitForTimeout(150); };
  // the ring: every tool, always
  await right(560, 360); await page.waitForTimeout(500);
  const top = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[title]")].filter((e) => e.style.position === "absolute").map((e) => e.title));
  ok(["Sketch", "Model", "Constraints"].every((g) => top.includes(g)), `the ring has the groups Sketch, Model and Constraints: ${top.join(", ")}`);
  await page.click('[title="Constraints"]'); await page.waitForTimeout(700);
  const rel = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[title]")].filter((e) => e.style.position === "absolute" && e.title !== "Back" && e.style.opacity !== "0").map((e) => ({ t: e.title, o: e.style.opacity })));
  ok(rel.length >= 12 && rel.every((r) => r.o === "1"), `the Constraints group holds every constraint, none faded: ${rel.map((r) => r.t).join(", ")}`);
  writeFileSync(`${dir}/tools-ring.png`, await page.screenshot());
  await page.keyboard.press("Escape"); await page.waitForTimeout(300);
  // a drawing tool: armed from the ring, step by step
  await choose(["Sketch", "Line"]);
  ok((await badge()) === "line", "choosing Line arms it: a badge of its icon follows the pointer");
  ok((await notices()).includes("*Click where the line starts"), `the first thing it needs is asked, in a persistent notice: ${JSON.stringify(await notices())}`);
  await click(10, 10); ok((await notices()).includes("*Click where it ends"), "after the first click it asks for the end");
  await click(30, 12); await page.waitForTimeout(200);
  ok((await def()).lines.length === 1 && (await notices()).includes("*Click where the line starts"), "the end click makes the line at once and it asks for the next");
  await click(10, 25); // a second line with only its start
  await right(700, 500);
  ok((await def()).lines.length === 1, "a right click with a second line only begun: the first line stays, the second is thrown away");
  ok((await badge()) === null && !(await notices()).some((n) => n.startsWith("*")), `and the tool is put away: no badge, no prompt: ${JSON.stringify(await notices())}`);
  // Esc: the draft first, then the tool
  await choose(["Sketch", "Rectangle"]); await click(0, -20);
  await page.keyboard.press("Escape"); await page.waitForTimeout(200);
  ok((await badge()) === "rect" && (await notices()).includes("*Click the first corner"), "Esc with a figure begun throws it away and the tool stays armed");
  await page.keyboard.press("Escape"); await page.waitForTimeout(200);
  ok((await badge()) === null, "Esc again puts the tool away");
  // constraints: what is selected is used first
  await choose(["Sketch", "Line"]); await click(-30, 20); await click(-10, 28); await click(-30, -10); await click(-10, -8);
  await right(700, 500);
  let d = await def(); const n0 = d.constraints.length;
  await click(-20, 24); await page.waitForTimeout(150); // the first of the two new lines is selected
  await choose(["Constraints", "Level"]); await page.waitForTimeout(300);
  d = await def(); ok(d.constraints.length === n0 + 1 && d.constraints.at(-1).kind === "horizontal", `Level with a line already selected is applied at once: ${JSON.stringify(d.constraints.at(-1))}`);
  ok((await badge()) === "horizontal" && (await notices()).some((n) => /^\*Level: select/.test(n)), `the tool stays armed and asks for the next: ${JSON.stringify(await notices())}`);
  // the others: picks one by one, in order
  await page.keyboard.press("Escape"); await page.waitForTimeout(150); await page.keyboard.press("Escape");
  await choose(["Constraints", "Parallel"]);
  ok((await notices()).some((n) => /^\*Parallel: select a line and a line/.test(n)), `with nothing selected it asks for what it takes: ${JSON.stringify(await notices())}`);
  await click(-20, -9); console.log("after first", JSON.stringify(await ev(`() => ({ sel: window.__sketch.debug().selection, armed: window.__tools.armed()?.id, add: window.__tools.additive() })`)));
  ok((await notices()).some((n) => /^\*Parallel: select a line/.test(n)) && !(await notices()).some((n) => /a line and/.test(n)), "after one line it asks for the other");
  writeFileSync(`${dir}/tools-prompt.png`, await page.screenshot());
  await click(-20, 24); await page.waitForTimeout(300);
  d = await def();
  ok(d.constraints.some((k: any) => k.kind === "parallel"), `the second pick completes it: ${JSON.stringify(d.constraints.map((k: any) => k.kind))}`);
  await right(700, 500);
  ok((await badge()) === null, "a right click puts the constraint tool away");
  // Extrude from the ring: a closed shape clicked opens it, a size typed and the right click makes it
  await choose(["Sketch", "Rectangle"]); await click(20, -30); await click(40, -15); await right(700, 500);
  await choose(["Model", "Extrude"]);
  ok((await notices()).includes("*Click a closed shape to extrude") && (await badge()) === "pushpull", `Extrude asks for a closed shape: ${JSON.stringify(await notices())}`);
  await click(30, -22); await page.waitForTimeout(900);
  ok((await notices()).some((n) => /^\*Extrude\. Drag the arrow/.test(n)), "a click inside it opens the extrude and says what to do");
  await page.click("[data-fact='d'] [data-number]"); await page.keyboard.type("5"); await page.keyboard.press("Enter"); await page.waitForTimeout(300);
  await right(700, 500); await ev(`() => window.__studio.settled()`); await page.waitForTimeout(700);
  ok((await ev<string[]>(`() => window.__studio.state().steps.map((s) => s.kind)`)).includes("extrude") && (await badge()) === null, "the right click makes the extrude and puts the tool away");
  // a constraint that cannot be made: the tool says so in words (a warning) and keeps asking
  await choose(["Constraints", "Parallel"]); await click(30, -30); await click(40, -22.5); await page.waitForTimeout(350);
  const warn = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-notice='warn']")].map((e) => e.textContent));
  ok(warn.length >= 1, `parallel on a bottom and a right side cannot be made: a warning says why (${JSON.stringify(warn).slice(0, 120)}), and the tool is still armed`);
  ok((await badge()) === "parallel", "and the tool stays armed to try again");
  await right(700, 500);
  ok((await def()).lines.length === 7, "the lines drawn are all there (the begun one was thrown away)");
  ok(errors.length === 0, `no errors in the page ${errors.join("; ").slice(0, 400)}`);
  await close();
} finally { await S.stop(); }
finish();
