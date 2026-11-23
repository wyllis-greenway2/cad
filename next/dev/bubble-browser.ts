// A dev check in the real page (not a test, `in_1444`): `?bubbles=1`. Pick a line: its bubbles show; type a number: the sketch is solved again; type an impossible one: the bubbles that hold it flash red and the number goes back.
//   node --experimental-strip-types dev/bubble-browser.ts [screenshot-dir]
import { start } from "../test/browser/harness.ts";
import { writeFileSync } from "node:fs";
const dir = process.argv[2] ?? "/tmp", S = await start(5199);
let bad = 0; const ok = (c: boolean, what: string) => { console.log(`${c ? "ok  " : "FAIL"} ${what}`); if (!c) bad++; };
try {
  const { page, errors, close } = await S.open("?bubbles=1&boxes=3");
  await page.evaluate(() => { (document.querySelector("[data-look='2']") as HTMLElement | null)?.click(); });
  const get = <T,>(f: string) => page.evaluate((src: string) => new Function("d", `return (${src})(d)`)((window as any).__demo), f) as Promise<T>;
  await page.waitForTimeout(800);
  const at = (id: string) => get<[number, number]>(`(d) => d.at("${id}")`);
  writeFileSync(`${dir}/bubbles-0.png`, await page.screenshot());
  ok((await get<any[]>("(d) => d.bubbles()")).length === 0, "nothing selected: no bubbles");
  const [x, y] = await at("L0"); await page.mouse.click(x, y); await page.waitForTimeout(300);
  let b = await get<any[]>("(d) => d.bubbles()");
  ok(b.some((q) => q.id === "c1") && b.some((q) => q.id === "c5" && q.text === "40"), `the bottom line shows its horizontal and its length: ${JSON.stringify(b.map((q) => q.text))}`);
  writeFileSync(`${dir}/bubbles-1.png`, await page.screenshot());
  // type a new length
  const num = await page.evaluate(() => { const e = [...document.querySelectorAll<HTMLElement>("[data-bubble='c5'] span")].find((s) => s.textContent === "40")!; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await page.mouse.click(num[0]!, num[1]!); await page.keyboard.type("55"); await page.keyboard.press("Enter"); await page.waitForTimeout(300);
  b = await get<any[]>("(d) => d.bubbles()"); ok(b.some((q) => q.id === "c5" && q.text === "55"), "the length typed as 55 is 55");
  const p1 = await get<number[]>("(d) => { const P = d.debug().S.points.find((p) => p.id === 'P1'); return [P.x, P.y]; }"); ok(Math.abs(p1[0]! - 55) < 1e-4, `and the line is 55 long: P1 at ${p1[0]}`);
  // an impossible one: a length of 25 for the line, with the upright side 25 and the ends fixed by the horizontal ones: fine; so a diagonal that cannot be: a negative number
  const num2 = await page.evaluate(() => { const e = [...document.querySelectorAll<HTMLElement>("[data-bubble='c5'] span")].find((s) => s.textContent === "55")!; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await page.mouse.click(num2[0]!, num2[1]!); await page.keyboard.type("-3"); await page.keyboard.press("Enter"); await page.waitForTimeout(300);
  b = await get<any[]>("(d) => d.bubbles()"); ok(b.some((q) => q.id === "c5" && q.text === "55" && /e46a6a|228, 106, 106/.test(q.border)), `a number that cannot be: it goes back to 55 and its bubble is red (${b.find((q) => q.id === "c5")?.border})`);
  writeFileSync(`${dir}/bubbles-2.png`, await page.screenshot());
  await page.keyboard.press("Escape"); await page.waitForTimeout(200);
  ok((await get<any[]>("(d) => d.bubbles()")).length === 0, "Escape puts the selection away, and the bubbles");
  ok(errors.length === 0, `no errors in the page ${errors.join(" | ").slice(0, 200)}`);
  await close();
} finally { await S.stop(); }
process.exit(bad ? 1 : 0);
