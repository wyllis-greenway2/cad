// A cylinder's wall pulled by 5 (scaffolding, not a check).
import { S, dir, evalIn } from "./page-lib.ts";
import { writeFileSync } from "node:fs";
try {
  const { page, close } = await S.open("");
  const ev = evalIn(page);
  await ev(`() => { window.__studio.change([{ id: "s1", kind: "sketchCircle", params: { r: 20 }, inputs: [] }, { id: "e1", kind: "extrude", params: { d: 20 }, inputs: ["s1"] }]); return 1; }`);
  await ev(`() => window.__studio.settled()`);
  await page.waitForTimeout(700);
  const [wx, wy] = await ev<[number, number]>(`() => window.__proj3([14.1, 14.1, 10])`);
  await page.mouse.click(wx, wy);
  await page.waitForTimeout(900);
  console.log(JSON.stringify(await ev(`() => window.__ext.debug().pull`)));
  await page.keyboard.type("5");
  await page.waitForTimeout(300);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);
  console.log(JSON.stringify(await ev(`() => ({ steps: window.__studio.state().steps.map(s => [s.id, s.kind, s.params]), problem: window.__studio.state().problem, box: (() => { const m = window.__studio.state().meshes[0]; if (!m) return null; let mx = 0; for (let i = 0; i < m.positions.length; i += 3) mx = Math.max(mx, Math.hypot(m.positions[i], m.positions[i+1])); return mx; })() })`)));
  writeFileSync(`${dir}/wall.png`, await page.screenshot());
  await close();
} finally {
  await S.stop();
}
