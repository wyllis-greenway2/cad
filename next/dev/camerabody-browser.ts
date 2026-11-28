// A dev check in the real page (not a test, `in_1444`): the bodies the engine made are what the camera looks at (`in_1710`, `scene.ts` `bodyThings`): the axes go scale-free once there is a body (W2), an orbit turns about the body (C2, C3), and Reset goes to it (C17).
//   node --experimental-strip-types dev/camerabody-browser.ts
import { S, ok, finish, evalIn } from "./page-lib.ts";
try {
  const { page, errors, close } = await S.open("");
  const ev = evalIn(page);
  ok((await ev<number>(`() => window.__cad.free`)) === 0, "before there is a body the axes are the world's size");
  // a body a long way from the origin, where "a point ahead of the eye" is not it
  await ev(
    `() => { window.__studio.change([{ id: "s1", kind: "sketchPolygon", params: { points: [[980, 980], [1020, 980], [1020, 1000], [980, 1000]] }, inputs: [] }, { id: "e1", kind: "extrude", params: { d: 20 }, inputs: ["s1"] }]); return 1; }`,
  );
  await ev(`() => window.__studio.settled()`);
  await page.waitForTimeout(1500);
  ok((await ev<number>(`() => window.__cad.free`)) === 1, "once there is a body the axes are scale free (W2)");
  const proj = (p: number[]) => ev<[number, number]>(`() => window.__proj3([${p}])`);
  const centre = [1000, 990, 10];
  // the camera 150 mm from the body, looking at it from above and the side
  const look = async () => {
    const d = [0.5, 0.6, 0.62],
      n = Math.hypot(...d),
      eye = centre.map((c, i) => c + (d[i]! / n) * 150);
    await ev(
      `() => { window.__cad.set({ eye: [${eye}], yaw: ${Math.atan2(-d[1]!, -d[0]!)}, pitch: ${-Math.asin(d[2]! / n)} }); return 1; }`,
    );
    await page.waitForTimeout(400);
  };
  await look();
  const [x0, y0] = await proj(centre);
  ok(x0 > 0 && x0 < 1100 && y0 > 0 && y0 < 720, `the body is in view (${x0.toFixed(0)}, ${y0.toFixed(0)})`);
  await page.mouse.move(200, 600); // empty space
  await page.mouse.down();
  for (let k = 1; k <= 24; k++) await page.mouse.move(200 + k * 5, 600 + k * 2);
  await page.mouse.up();
  await page.waitForTimeout(500);
  const [x1, y1] = await proj(centre);
  ok(
    Math.hypot(x1 - x0, y1 - y0) < 30,
    `an orbit turns about the body: its middle stays in place (${x0.toFixed(0)},${y0.toFixed(0)} to ${x1.toFixed(0)},${y1.toFixed(0)})`,
  );
  // lost: far away, looking elsewhere; Reset brings the body back
  await ev(`() => { window.__cad.set({ eye: [-3000, -3000, 500], yaw: 3.5, pitch: 0.3 }); return 1; }`);
  await page.waitForTimeout(600);
  const pill = await page.getByText(/Nothing in view/).count();
  ok(pill > 0, "lost: the Nothing in view pill stands");
  await page.click("#reset"); // (the pill's button)
  await page.waitForTimeout(1500);
  const [rx, ry] = await proj(centre);
  const ahead = await ev<number>(
    `() => { const c = window.__cad.cam, f = [Math.cos(c.pitch) * Math.cos(c.yaw), Math.cos(c.pitch) * Math.sin(c.yaw), Math.sin(c.pitch)]; return [${centre}].reduce((s, v, i) => s + (v - c.eye[i]) * f[i], 0); }`,
  );
  ok(
    ahead > 0,
    `and it is in front of the camera, ${ahead.toFixed(0)} mm ahead (a point behind the eye projects to the middle of the screen)`,
  );
  ok(rx > 0 && rx < 1100 && ry > 0 && ry < 720, `Reset brings the body into view (${rx.toFixed(0)}, ${ry.toFixed(0)})`);
  ok(errors.length === 0, `no errors in the page ${errors.join(" | ").slice(0, 300)}`);
  await close();
} finally {
  await S.stop();
}
finish();
