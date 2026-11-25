// A picture: a circle drawn, then the line tool before its first click with the pointer level with the circle's centre: node --experimental-strip-types dev/guide-shot.ts <file.png> [x y]
import { start } from "../test/browser/harness.ts";
import { writeFileSync } from "node:fs";
const S = await start(5196);
try {
  const { page, close } = await S.open("");
  const ev = <T,>(f: string): Promise<T> => page.evaluate((src: string) => new Function(`return (${src})`)()(), f) as Promise<T>;
  const px = (x: number, y: number) => ev<[number, number]>(`() => window.__px([${x}, ${y}])`);
  const click = async (x: number, y: number) => { const [a, b] = await px(x, y); await page.mouse.click(a, b); await page.waitForTimeout(120); };
  await ev(`() => window.__tool("circle")`); await page.waitForTimeout(900);
  await click(30, 10); await click(35, 10); await ev(`() => window.__sketch.stop()`);
  await ev(`() => window.__tool("line")`); await page.waitForTimeout(300);
  const x = Number(process.argv[3] ?? 10), y = Number(process.argv[4] ?? 10.3), [mx, my] = await px(x, y);
  await page.mouse.move(mx, my, { steps: 6 }); await page.waitForTimeout(500);
  console.log(JSON.stringify(await ev(`() => window.__sketch.lines({x:${mx},y:${my}}).filter((l) => l.kind !== "done")`)));
  writeFileSync(process.argv[2]!, await page.screenshot());
  await close();
} finally { await S.stop(); }
