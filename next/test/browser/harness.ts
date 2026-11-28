// A real page for the tests that need one: the dev server on a free port and a headless Chromium (Playwright, found where this machine has it or at PLAYWRIGHT_MODULE).
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const playwright = (() => { for (const p of [process.env.PLAYWRIGHT_MODULE, "playwright", "/opt/node-tools/node_modules/playwright"]) { if (!p) continue; try { return require(p); } catch { /* next */ } } throw new Error("Playwright was not found: set PLAYWRIGHT_MODULE"); })();

export interface Page { goto(url: string): Promise<unknown>; evaluate<T>(f: (a: any) => T, a?: unknown): Promise<T>; screenshot(o?: object): Promise<Buffer>; click(s: string): Promise<void>; mouse: any; keyboard: any; waitForTimeout(ms: number): Promise<void>; on(e: string, f: (x: any) => void): void; $(s: string): Promise<any>; locator(s: string): any; viewportSize(): { width: number; height: number } | null }
export interface Session { url: string; open(query?: string, size?: { width: number; height: number }): Promise<{ page: Page; errors: string[]; close(): Promise<void> }>; stop(): Promise<void> }

export async function start(port = 5197): Promise<Session> {
  const dir = fileURLToPath(new URL("../../", import.meta.url));
  const server: ChildProcess = spawn("node", ["node_modules/vite/bin/vite.js", "--port", String(port), "--strictPort"], { cwd: dir, stdio: ["ignore", "pipe", "pipe"], detached: true });
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("the dev server did not start")), 30000);
    server.stdout!.on("data", (d) => { if (String(d).includes("Local")) { clearTimeout(t); resolve(); } });
    server.on("exit", (c) => reject(new Error(`the dev server stopped (${c})`)));
  });
  const browser = await playwright.chromium.launch();
  const url = `http://localhost:${port}/`;
  return {
    url,
    async open(query = "", size = { width: 1100, height: 720 }) {
      const page: Page = await browser.newPage({ viewport: size });
      const errors: string[] = [];
      page.on("pageerror", (e: unknown) => errors.push(String(e) + (process.env.STACK && (e as Error)?.stack ? " @@ " + (e as Error).stack!.split("\n").slice(1, 5).join(" ; ") : "")));
      page.on("console", (m: any) => { if (m.type() === "error") errors.push(m.text()); });
      await page.goto(url + query);
      await page.waitForTimeout(1200);
      return { page, errors, close: () => (page as any).close() };
    },
    async stop() { await browser.close(); try { process.kill(-server.pid!); } catch { /* gone */ } },
  };
}

/** The pixels of a screenshot: [r, g, b] for each, row by row, decoded in the page itself (canvas). */
export async function pixels(page: Page, png: Buffer): Promise<{ w: number; h: number; at(x: number, y: number): [number, number, number] }> {
  const r = await page.evaluate(async (b64: string) => {
    const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const g = c.getContext("2d")!; g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, img.width, img.height).data; let bin = "";
    for (let i = 0; i < d.length; i += 8192) bin += String.fromCharCode(...d.subarray(i, i + 8192));
    return { w: img.width, h: img.height, d: btoa(bin) };
  }, png.toString("base64"));
  const d = Buffer.from(r.d, "base64");
  return { w: r.w, h: r.h, at: (x, y) => { const i = (y * r.w + x) * 4; return [d[i]!, d[i + 1]!, d[i + 2]!]; } };
}
export const isWhite = (p: [number, number, number], tol = 6) => p.every((v) => v >= 255 - tol);
