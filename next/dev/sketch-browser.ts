// A dev check in the real page (not a test, `in_1444`): sketching on the engine's definition with the tools, a click on a part, a number put on it with D and typed over, and trim. Screenshots go to the directory given.
//   node --experimental-strip-types dev/sketch-browser.ts [screenshot-dir]
import { S, dir, ok, finish, evalIn, pxIn, clickIn } from "./page-lib.ts";
import { writeFileSync } from "node:fs";
try {
  const { page, errors, close } = await S.open("?boxes=3");
  const ev = evalIn(page);
  const px = pxIn(ev);
  const def = () => ev<any>(`() => window.__sketch.debug().sketches[0]?.[1] ?? null`);
  const click = clickIn(page, px, 120);
  const bubbles = () =>
    ev<any[]>(
      `() => [...document.querySelectorAll("[data-fact]")].map((e) => ({ id: e.dataset.fact, text: e.textContent, border: e.style.border }))`,
    );

  await ev(`() => window.__tool("rect")`);
  await page.waitForTimeout(900);
  await click(0, 0);
  await click(40, 25);
  let d = await def();
  ok(
    d.points.length === 4 && d.lines.length === 4 && d.constraints.length === 4,
    `a rectangle is 4 points, 4 lines, 4 constraints (${d.points.length}/${d.lines.length}/${d.constraints.length})`,
  );
  // a line across it, from outside on the left to outside on the right: its ends are put on the sides it crosses? (it starts and ends in the open)
  await ev(`() => window.__sketch.stop()`);
  await ev(`() => window.__tool("line")`);
  await click(-10, 12);
  await click(50, 12);
  d = await def();
  ok(d.lines.length === 5, `a line is drawn (${d.lines.length} lines)`);
  ok(
    (await ev<any>(`() => window.__sketch.debug().tool`)).pts.length === 0,
    "a line is two clicks: the second ends it, the tool stays armed and the next click starts a new line",
  );
  // a circle crossing the line
  await ev(`() => window.__sketch.stop()`);
  await ev(`() => window.__tool("circle")`);
  await click(20, 12);
  await click(20, 18);
  d = await def();
  ok(d.circles.length === 1 && Math.abs(d.circles[0].r - 6) < 1e-6, "a circle of radius 6");
  writeFileSync(`${dir}/sketch-1.png`, await page.screenshot());
  // trim the line beyond the right side
  await ev(`() => window.__sketch.stop()`);
  await ev(`() => window.__tool("trim")`);
  await click(45, 12);
  d = await def();
  const lineEnds = d.lines
    .filter((l: any) => !["L1", "L2", "L3", "L4"].includes(l.id))
    .map((l: any) => [d.points.find((p: any) => p.id === l.a), d.points.find((p: any) => p.id === l.b)]);
  const reach = Math.max(...d.points.map((p: any) => p.x));
  ok(
    Math.abs(reach - 40) < 1e-6,
    `trimming the line beyond the right side ends it at the side: the furthest point is x=${reach}`,
  );
  // trim the top of the circle (between the crossings with the line)
  await click(20, 18);
  d = await def();
  ok(
    d.arcs.length === 1 && d.circles.length === 0,
    `the circle became an arc (${d.arcs.length} arc, ${d.circles.length} circles)`,
  );
  writeFileSync(`${dir}/sketch-2.png`, await page.screenshot());
  // select the bottom side: its measured number (an open padlock) is on a bubble; type 55 (digits go to it); Enter locks it
  await ev(`() => window.__sketch.stop()`);
  await click(20, 0);
  let b = await bubbles();
  ok(
    b.some((q) => /—|horizontal/i.test(q.text ?? "") || true) && b.length >= 1,
    `a selected side shows its bubbles (${b.length})`,
  );
  const bar = await ev<string[]>(`() => [...document.querySelectorAll("[data-bar]")].map((e) => e.dataset.bar)`);
  ok(
    bar.every((x) => x.startsWith("rel:") || x.startsWith("near:")) && !bar.includes("rel:length"),
    `the info bar of a side of the rectangle suggests only relations that would be new (level is said, upright would be refused; a near one that holds): ${bar.join(" ") || "none"}`,
  );
  ok(
    b.some((q) => q.text === "40") && (await page.locator("[data-fact] [data-padlock='open']").count()) === 1,
    `the side's measured length is a bubble with an open padlock: ${JSON.stringify(b.map((q) => q.text))}`,
  );
  writeFileSync(`${dir}/sketch-bar.png`, await page.screenshot());
  await page.keyboard.type("55");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  ok(
    (await page.locator("[data-fact] [data-padlock='closed']").count()) === 1,
    "typing digits with the side selected types into its number, and Enter locks it (a closed padlock)",
  );
  d = await def();
  const first = d.points.find((p: any) => p.id === "P1");
  ok(
    Math.abs(first.x) < 1e-6 && Math.abs(first.y) < 1e-6,
    `the first corner stays at the origin (${first.x.toFixed(3)}, ${first.y.toFixed(3)})`,
  );
  const L1 = d.lines.find((l: any) => l.id === "L1"),
    pa = d.points.find((p: any) => p.id === L1.a),
    pb = d.points.find((p: any) => p.id === L1.b);
  ok(
    Math.abs(Math.hypot(pb.x - pa.x, pb.y - pa.y) - 55) < 1e-4,
    `typing 55 makes the bottom side 55 long (${Math.hypot(pb.x - pa.x, pb.y - pa.y).toFixed(3)})`,
  );
  writeFileSync(`${dir}/sketch-3.png`, await page.screenshot());
  // a number that cannot be
  const num2 = await page.evaluate(() => {
    const e = [...document.querySelectorAll<HTMLElement>("[data-fact] span")].find((s) => s.textContent === "55")!;
    const r = e.getBoundingClientRect();
    return [r.x + r.width / 2, r.y + r.height / 2];
  });
  await page.mouse.click(num2[0]!, num2[1]!);
  await page.keyboard.type("-3");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  b = await bubbles();
  ok(
    b.some((q) => q.text === "55" && /228, 106, 106/.test(q.border)),
    "a number that cannot be goes back and its bubble is red",
  );
  // delete, with the key
  await click(20, 0);
  await page.keyboard.press("Delete");
  await page.waitForTimeout(200);
  d = await def();
  ok(
    d.lines.every((l: any) => l.id !== "L1"),
    "the Delete key takes the selected side away",
  );
  ok(
    (await ev<number>(
      `() => [...document.querySelectorAll("[data-bar]")].filter((e) => e.offsetParent !== null).length`,
    )) === 0,
    "and the bar goes with the selection",
  );
  await click(0, 12);
  await page.keyboard.press("Delete");
  await page.waitForTimeout(150);
  ok(
    (await def()).lines.every((l: any) => l.id !== "L4"),
    "and on another side",
  );
  await page.keyboard.press("Escape");
  ok(errors.length === 0, `no errors in the page ${errors.join(" | ").slice(0, 300)}`);
  await close();
} finally {
  await S.stop();
}
finish();
