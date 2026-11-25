// A picture: a circle and a line being drawn nearly tangent to it (the circle lit amber), and a dashed guide to a corner: node --experimental-strip-types dev/hint-shot.ts <file.png>
import { start } from "../test/browser/harness.ts";
import { writeFileSync } from "node:fs";
const S = await start(5197);
try {
  const { page, close } = await S.open("");
  const ev = <T,>(f: string): Promise<T> => page.evaluate((src: string) => new Function(`return (${src})`)()(), f) as Promise<T>;
  const px = (x: number, y: number) => ev<[number, number]>(`() => window.__px([${x}, ${y}])`);
  const click = async (x: number, y: number) => { const [a, b] = await px(x, y); await page.mouse.click(a, b); await page.waitForTimeout(120); };
  await ev(`() => window.__tool("circle")`); await page.waitForTimeout(900);
  await click(30, 10); await click(35, 10); await ev(`() => window.__sketch.stop()`);
  await ev(`() => window.__tool("line")`); await page.waitForTimeout(300);
  await click(10, 0);
  const ang = Math.asin(5 / Math.hypot(20, 10)) + Math.atan2(10, 20), [mx, my] = await px(10 + 25 * Math.cos(ang + 0.01), 25 * Math.sin(ang + 0.01));
  await page.mouse.move(mx, my, { steps: 6 }); await page.waitForTimeout(500);
  writeFileSync(process.argv[2]!, await page.screenshot());
  await close();
} finally { await S.stop(); }
