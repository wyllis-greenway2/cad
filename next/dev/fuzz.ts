// scaffolding: a storm of random user actions on a small model; reports page errors, a stuck "Making", and engine problems
import { S, evalIn } from "./page-lib.ts";
const seed0 = Number(process.argv[3] ?? 1);
let seed = seed0;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]!;
try {
  const { page, errors, close } = await S.open("");
  const ev = evalIn(page);
  await ev(`() => window.__studio.change([{ id: "s1", kind: "sketchPolygon", params: { points: [[-20, -10], [20, -10], [20, 10], [-20, 10]] }, inputs: [] }, { id: "e1", kind: "extrude", params: { d: 20 }, inputs: ["s1"] }])`);
  await ev(`() => window.__studio.settled()`);
  await page.waitForTimeout(1000);
  const tools = ["rect", "circle", "line", "arc", "pull", "round", "chamfer", "move", "extrude", "sketch-face"];
  const keys = ["Escape", "Escape", "Enter", "Delete", "Control+z", "Control+Shift+z", "Digit3", "Digit5", "Period", "Backspace", "ArrowUp", "ArrowDown"];
  const log: string[] = [];
  let lastErr = 0, busyRun = 0;
  const seen = new Set<string>();
  for (let i = 0; i < 160; i++) {
    const r = rnd();
    let what = "";
    try {
      if (r < 0.35) { const x = 100 + rnd() * 900, y = 80 + rnd() * 560; what = `click ${Math.round(x)},${Math.round(y)}`; await page.mouse.click(x, y); }
      else if (r < 0.45) { const x = 100 + rnd() * 900, y = 80 + rnd() * 560; what = `dblclick ${Math.round(x)},${Math.round(y)}`; await page.mouse.click(x, y); await page.mouse.click(x, y); }
      else if (r < 0.62) { const x = 100 + rnd() * 900, y = 80 + rnd() * 560; const x2 = x + (rnd() - 0.5) * 300, y2 = y + (rnd() - 0.5) * 200; what = `drag ${Math.round(x)},${Math.round(y)} -> ${Math.round(x2)},${Math.round(y2)}`; await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x2, y2, { steps: 5 }); await page.mouse.up(); }
      else if (r < 0.68) { const x = 100 + rnd() * 900, y = 80 + rnd() * 560; what = `rightclick ${Math.round(x)},${Math.round(y)}`; await page.mouse.click(x, y, { button: "right" }); }
      else if (r < 0.80) { const k = pick(keys); what = `key ${k}`; await page.keyboard.press(k); }
      else if (r < 0.92) { const t = pick(tools); what = `tool ${t}`; await ev(`() => window.__tool(${JSON.stringify(t)})`); }
      else { what = "wheel"; await page.mouse.wheel(0, (rnd() - 0.5) * 300); }
    } catch (e) { what += " THREW " + String(e).slice(0, 80); }
    log.push(what);
    await page.waitForTimeout(120);
    if (errors.length > lastErr) { console.log("PAGE ERROR after", i, what, "->", errors.slice(lastErr).join(" | ").slice(0, 300)); lastErr = errors.length; console.log("  sketch at the error:", await ev<string>(`() => JSON.stringify({ snap: window.__sketch.snapshot(), dbg: window.__sketch.debug() })`).then((t) => t.slice(0, 1800))); console.log("  last 12:", log.slice(-12).join(" | ")); }
    {
      const b = await ev<{ busy: boolean; n: number; problem: string }>(`() => { const x = window.__studio.state(); return { busy: x.busy, n: x.steps.length, problem: x.problem }; }`);
      if (b.busy) busyRun++; else busyRun = 0;
      if (busyRun === 1 && i > 60) console.log("BUSY began at", i, "action:", what, "recipe:", await ev<string>(`() => JSON.stringify(window.__studio.state().steps.map((x) => [x.id, x.kind, x.params.d ?? ""]))`));
      if (busyRun === 8) console.log("BUSY for 8 actions at", i, "last:", log.slice(-8).join(" | "));
      if (b.problem && !seen.has(b.problem)) { seen.add(b.problem); console.log("PROBLEM at", i, JSON.stringify(b.problem.slice(0, 100)), "last:", log.slice(-6).join(" | ")); }
    }
    if (i % 20 === 19) {
      let w = 0;
      while ((await ev<boolean>(`() => window.__studio.state().busy`)) && w < 40) { await page.waitForTimeout(500); w++; }
      const s = await ev<any>(`() => { const x = window.__studio.state(); return { steps: x.steps.length, busy: x.busy, problem: x.problem.slice(0, 120), cur: x.current }; }`);
      console.log("after", i + 1, "actions:", JSON.stringify(s), w >= 40 ? "STUCK BUSY" : "");
      if (w >= 10 || s.problem) { console.log("  last actions:", log.slice(-20).join(" | ")); console.log("  recipe:", await ev<string>(`() => JSON.stringify(window.__studio.state().steps)`)); }
    }
  }
  console.log("seed", seed0, "page errors:", errors.length, errors.slice(0, 3));
  await close();
} finally {
  await S.stop();
}
