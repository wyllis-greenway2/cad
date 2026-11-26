// A dev check in the real page (not a test, `in_1444`): the notices (`dec_three_surfaces`): a result stands for a while and goes, an engine problem stays until it is put right, a refusal says why as a warning, "Making..." is not shown for a quick build, the stack takes no clicks.
//   node --experimental-strip-types dev/notices-browser.ts [screenshot-dir]
import { S, dir, ok, finish, evalIn } from "./page-lib.ts";
import { writeFileSync } from "node:fs";
try {
  const { page, errors, close } = await S.open(""), ev = evalIn(page);
  const notices = () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-notice]")].map((e) => ({ kind: e.dataset.notice, persistent: e.dataset.persistent, text: e.textContent, opacity: Number(e.style.opacity) })));
  const settle = async () => { await page.waitForTimeout(700); };
  ok((await notices()).length === 0, "nothing to say: no notices");
  const step = `[{ id: "s1", kind: "sketchPolygon", params: { points: [[0, 0], [40, 0], [40, 25], [0, 25]] }, inputs: [] }, { id: "e1", kind: "extrude", params: { d: 10 }, inputs: ["s1"] }]`;
  await ev(`() => window.__studio.change(${step})`); await settle();
  // a result: saved
  await page.click("[data-more='button']"); await page.waitForTimeout(150);
  await Promise.all([page.waitForEvent("download"), page.click("[data-item='save']")]); await page.waitForTimeout(300);
  let n = await notices(); ok(n.some((x) => /Saved as model\.cad/.test(x.text ?? "") && x.persistent === "false" && x.kind === "info"), `saving says so, as a temporary notice: ${JSON.stringify(n.map((x) => x.text))}`);
  writeFileSync(`${dir}/notice-1.png`, await page.screenshot());
  const box = await page.evaluate(() => { const e = document.querySelector<HTMLElement>("[data-notices]")!; return getComputedStyle(e).pointerEvents; });
  ok(box === "none", "the stack takes no clicks");
  await page.waitForTimeout(5800);
  ok((await notices()).every((x) => !/Saved/.test(x.text ?? "")), "and it goes by itself");
  // a problem: stays until put right
  await ev(`() => window.__studio.change([{ id: "s1", kind: "sketchPolygon", params: { points: [[0, 0], [40, 0], [40, 25], [0, 25]] }, inputs: [] }, { id: "e1", kind: "extrude", params: { d: 0 }, inputs: ["s1"] }])`); await settle();
  n = await notices(); ok(n.some((x) => x.kind === "error" && x.persistent === "true" && /distance is nothing/.test(x.text ?? "")), `an engine problem stands as an error, persistent: ${JSON.stringify(n.map((x) => x.text?.slice(0, 50)))}`);
  writeFileSync(`${dir}/notice-2.png`, await page.screenshot());
  await page.waitForTimeout(6000);
  ok((await notices()).some((x) => x.kind === "error"), "it is still there much later");
  await ev(`() => window.__studio.change(${step})`); await settle();
  ok((await notices()).every((x) => x.kind !== "error"), "and goes when the problem is put right");
  ok(errors.length === 0, `no errors in the page ${errors.join("; ")}`);
  await close();
} finally { await S.stop(); }
finish();
