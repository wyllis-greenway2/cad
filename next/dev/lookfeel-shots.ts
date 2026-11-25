// Screenshots of the rebuild in the states of `docs/rebuild/prototype_look_and_feel.md`, to set beside the prototype's: node --experimental-strip-types dev/lookfeel-shots.ts <directory>
import { start } from "../test/browser/harness.ts";
import { writeFileSync } from "node:fs";
const dir = process.argv[2] ?? "/tmp", S = await start(5199);
try {
  const { page, close } = await S.open("");
  const pg = page as any, ev = <T,>(f: string): Promise<T> => page.evaluate((src: string) => new Function(`return (${src})`)()(), f) as Promise<T>;
  const px = (x: number, y: number) => ev<[number, number]>(`() => window.__px([${x}, ${y}])`);
  const shot = async (n: string) => { await page.waitForTimeout(450); writeFileSync(`${dir}/${n}.png`, await page.screenshot()); };
  const click = async (x: number, y: number) => { const [a, b] = await px(x, y); await page.mouse.click(a, b); await page.waitForTimeout(120); };
  await page.mouse.click(550, 410, { button: "right" }); await shot("02-ring");
  await page.keyboard.press("Escape");
  await ev(`() => window.__tool("rect")`); await page.waitForTimeout(900);
  await click(10, 8); const [mx, my] = await px(30, 20); await page.mouse.move(mx, my, { steps: 5 }); await shot("05-rect-preview");
  await page.mouse.click(mx, my); await ev(`() => window.__sketch.stop()`);
  await click(20, 8); await shot("07-line-selected");
  await page.keyboard.press("Escape"); await click(30, 14); await page.keyboard.down("Shift"); await click(20, 8); await page.keyboard.up("Shift"); await shot("15-two-lines-selected");
  await page.keyboard.press("Escape");
  await ev(`() => window.__tool("line")`); await click(12, -6); const [lx, ly] = await px(22, -6); await page.mouse.move(lx, ly, { steps: 5 }); await shot("11-line-preview-level");
  await page.mouse.click(lx, ly); await ev(`() => { window.__sketch.stop(); window.__sketch.stop(); }`);
  await ev(`() => window.__tool("circle")`); await click(36, -6); await click(41, -6); await ev(`() => window.__sketch.stop()`);
  await click(36, -1); await shot("17-circle-selected");
  await close();
} finally { await S.stop(); }
