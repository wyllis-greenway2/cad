// One picture: a rectangle with a corner picked (the teal ball) and thin charcoal lines: node --experimental-strip-types dev/ball-shot.ts <file.png>
import { start } from "../test/browser/harness.ts";
import { writeFileSync } from "node:fs";
const S = await start(5198);
try {
  const { page, close } = await S.open("");
  const ev = <T,>(f: string): Promise<T> => page.evaluate((src: string) => new Function(`return (${src})`)()(), f) as Promise<T>;
  const px = (x: number, y: number) => ev<[number, number]>(`() => window.__px([${x}, ${y}])`);
  const click = async (x: number, y: number) => { const [a, b] = await px(x, y); await page.mouse.click(a, b); await page.waitForTimeout(150); };
  await ev(`() => window.__tool("rect")`); await page.waitForTimeout(900);
  await click(10, 8); await click(30, 20); await ev(`() => window.__sketch.stop()`);
  await click(10, 8); await page.mouse.move(5, 5); await page.waitForTimeout(500);
  console.log(JSON.stringify(await ev(`() => window.__sketch.lines(null).filter((l) => l.kind === "ball")`)));
  writeFileSync(process.argv[2]!, await page.screenshot({ clip: { x: 300, y: 200, width: 500, height: 400 } }));
  await close();
} finally { await S.stop(); }
