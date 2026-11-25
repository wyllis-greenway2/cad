// What every check in a real page repeats, written once (`in_1444`; the page checks are `dev/*-browser.ts`, run by `dev/run-checks.ts --all`): the dev server and browser, a line for each check, the evaluate helper, a place of the sketch plane in pixels, and a click there.
//   import { S, dir, ok, finish, evalIn, pxIn, clickIn } from "./page-lib.ts";  const ev = evalIn(page), px = pxIn(ev), click = clickIn(page, px);
import { start } from "../test/browser/harness.ts";

/** where pictures go (the first argument) */
export const dir = process.argv[2] ?? "/tmp";
export const S = await start(5199);
let bad = 0;
export const ok = (c: boolean, what: string): void => { console.log(`${c ? "ok  " : "FAIL"} ${what}`); if (!c) bad++; };
/** the end of a check: the exit code says whether every line was ok */
export const finish = (): never => process.exit(bad ? 1 : 0);
type Page = { evaluate<T>(f: (a: any) => T, a?: unknown): Promise<T>; mouse: { click(x: number, y: number, o?: object): Promise<unknown> }; waitForTimeout(ms: number): Promise<unknown> };
/** run a function (given as text) in the page */
export const evalIn = (page: Page) => <T,>(f: string): Promise<T> => page.evaluate((src: string) => new Function(`return (${src})`)()(), f as never) as Promise<T>;
/** the page's pixels of a place (mm) in the sketch plane */
export const pxIn = (ev: ReturnType<typeof evalIn>) => (x: number, y: number) => ev<[number, number]>(`() => window.__px([${x}, ${y}])`);
/** a click at a place of the sketch plane (`n`: how many in a row, for a double click), then a short wait */
export const clickIn = (page: Page, px: ReturnType<typeof pxIn>, wait = 120) => async (x: number, y: number, n = 1): Promise<void> => { const [a, b] = await px(x, y); await page.mouse.click(a, b, { clickCount: n }); await page.waitForTimeout(wait); };
