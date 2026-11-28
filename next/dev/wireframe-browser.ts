// A dev check in the real page (not a test, `in_1444`): the View section of the circle menu turns every body to a wireframe and back (`dec_body_look_and_feel`).
//   node --experimental-strip-types dev/wireframe-browser.ts [screenshot-dir]
import { S, dir, ok, finish, evalIn } from "./page-lib.ts";
import { writeFileSync } from "node:fs";
import { pixels } from "../test/browser/harness.ts";
try {
  const { page, errors, close } = await S.open("");
  const ev = evalIn(page);
  await ev(
    `() => { window.__studio.change([{ id: "s1", kind: "sketchPolygon", params: { points: [[0, 0], [40, 0], [40, 25], [0, 25]] }, inputs: [] }, { id: "e1", kind: "extrude", params: { d: 10 }, inputs: ["s1"] }]); return 1; }`,
  );
  await ev(`() => window.__studio.settled()`);
  await page.waitForTimeout(500);
  const [fx, fy] = await ev<[number, number]>(`() => window.__proj3([20, 12.5, 10])`); // the middle of the top face
  const grey = async () => {
    const px = await pixels(page, await page.screenshot());
    const [r, g, b] = px.at(Math.round(fx), Math.round(fy));
    return (r + g + b) / 3;
  };
  const solid = await grey();
  ok(solid < 200, `solid: the top face is grey (${solid.toFixed(0)})`);
  writeFileSync(`${dir}/wire-0-solid.png`, await page.screenshot());
  const choose = async (title: string) => {
    await page.waitForSelector(`[title="${title}"]`, { timeout: 3000 });
    await page.click(`[title="${title}"]`);
    await page.waitForTimeout(450);
  };
  await page.mouse.click(900, 150, { button: "right" }); // the ring opens on empty space
  await page.waitForTimeout(500);
  await choose("View");
  await choose("Wireframe");
  await page.waitForTimeout(400);
  const wire = await grey();
  ok(
    wire > solid + 6,
    `wireframe: the top face is seen through, lighter than solid (${wire.toFixed(0)} against ${solid.toFixed(0)}; the faces behind it show through)`,
  );
  writeFileSync(`${dir}/wire-1-wireframe.png`, await page.screenshot());
  await page.mouse.click(900, 150, { button: "right" });
  await page.waitForTimeout(500);
  await choose("View");
  await choose("Solid");
  await page.waitForTimeout(400);
  const back = await grey();
  ok(Math.abs(back - solid) < 6, `and the menu's Solid puts it back (${back.toFixed(0)} against ${solid.toFixed(0)})`);
  ok(errors.length === 0, `no errors in the page ${errors.join(" | ").slice(0, 300)}`);
  await close();
} finally {
  await S.stop();
}
finish();
