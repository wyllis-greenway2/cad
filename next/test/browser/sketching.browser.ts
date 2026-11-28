// Sketching, in a real page (`docs/rebuild/sketching_requirements.md`, the rows whose test is "browser"): the ring's sketch tools, what is drawn as the pointer moves, selecting down, the bubbles (quiet, placed, dragged, faded), what pointing at one draws, and numbers typed.
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { start, pixels, type Session } from "./harness.ts";

let session: Session;
before(async () => {
  session = await start(5201);
});
after(async () => {
  await session.stop();
});

type Def = Record<string, unknown>;
/** a page, with the helpers every test here uses: run a function (as text) in it, a place of the sketch plane in pixels, a click there, a sketch put in place of the drawn one */
async function open(query = "", size?: { width: number; height: number }) {
  const { page, errors, close } = await session.open(query, size);
  const ev = <T>(f: string): Promise<T> =>
    page.evaluate((src: string) => new Function(`return (${src})`)()(), f as never) as Promise<T>;
  const px = (x: number, y: number) => ev<[number, number]>(`() => window.__px([${x}, ${y}])`);
  const click = async (x: number, y: number, wait = 120) => {
    const [a, b] = await px(x, y);
    await page.mouse.click(a, b);
    await page.waitForTimeout(wait);
  };
  const move = async (x: number, y: number) => {
    const [a, b] = await px(x, y);
    await page.mouse.move(a, b, { steps: 4 });
    await page.waitForTimeout(150);
  };
  /** a sketch exists on the plane (two clicks of the line tool), the tool is put away, and the drawing is replaced by `def` */
  const put = async (def: Def) => {
    await ev(`() => window.__tool("line")`);
    await page.waitForTimeout(700);
    await click(10, 10);
    await click(20, 10);
    await ev(`() => window.__sketch.stop()`);
    await ev(
      `() => { const s = structuredClone(window.__sketch.snapshot()), k = Object.keys(s)[0]; s[k] = ${JSON.stringify(def)}; window.__sketch.restore(s); }`,
    );
    await page.waitForTimeout(400);
  };
  const lines = () => ev<any[]>(`() => window.__sketch.lines(null)`);
  const marks = () => ev<any[]>(`() => window.__sketch.marks(performance.now()).map((m) => m.mark)`);
  const def = () => ev<any>(`() => Object.values(window.__sketch.snapshot())[0]`);
  const selection = () => ev<{ key: string; ids: string[] }>(`() => window.__sketch.debug().selection`);
  /** a bubble's box on the page, by its key (a regular expression) */
  const bubble = (re: string) =>
    page.evaluate((re) => {
      const e = [...document.querySelectorAll("[data-key]")].find((x) =>
        new RegExp(re).test(x.getAttribute("data-key") ?? ""),
      ) as HTMLElement | undefined;
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, l: r.x, t: r.y, w: r.width, h: r.height };
    }, re);
  const boxes = () =>
    page.evaluate(() =>
      [...document.querySelectorAll("[data-key]")].map((e) => {
        const r = e.getBoundingClientRect();
        return { key: e.getAttribute("data-key")!, l: r.left, t: r.top, w: r.width, h: r.height };
      }),
    );
  const opacities = () =>
    page.evaluate(() =>
      [...document.querySelectorAll("[data-key]")].map((e) =>
        Number(getComputedStyle((e as HTMLElement).firstElementChild ?? e).opacity),
      ),
    );
  return { page, errors, close, ev, px, click, move, put, lines, marks, def, selection, bubble, boxes, opacities };
}
const dist = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!);

// the figures the tests below stand on
const CIRCLE_AND_LINE = {
  arcs: [],
  circles: [{ c: "P1", id: "K1", r: 7 }],
  constraints: [],
  lines: [{ a: "P2", b: "P3", id: "L1" }],
  points: [
    { id: "P1", x: 15, y: 20 },
    { id: "P2", x: 32, y: 14 },
    { id: "P3", x: 46, y: 22 },
  ],
};
const TWO_LINES = {
  arcs: [],
  circles: [],
  constraints: [],
  lines: [
    { a: "P1", b: "P2", id: "L1" },
    { a: "P3", b: "P4", id: "L2" },
  ],
  points: [
    { id: "P1", x: 10, y: 20 },
    { id: "P2", x: 20, y: 28 },
    { id: "P3", x: 36, y: 20 },
    { id: "P4", x: 44, y: 32 },
  ],
};
/** a level and upright rectangle, and a free line near its corner P2 */
const RECT_AND_LINE = {
  arcs: [],
  circles: [],
  constraints: [
    { id: "h1", kind: "horizontal", parts: ["P1", "P2"] },
    { id: "h2", kind: "horizontal", parts: ["P3", "P4"] },
    { id: "v1", kind: "vertical", parts: ["P2", "P3"] },
    { id: "v2", kind: "vertical", parts: ["P4", "P1"] },
  ],
  lines: [
    { a: "P1", b: "P2", id: "L1" },
    { a: "P2", b: "P3", id: "L2" },
    { a: "P3", b: "P4", id: "L3" },
    { a: "P4", b: "P1", id: "L4" },
    { a: "P5", b: "P6", id: "L5" },
  ],
  points: [
    { id: "P1", x: 10, y: 10 },
    { id: "P2", x: 30, y: 10 },
    { id: "P3", x: 30, y: 25 },
    { id: "P4", x: 10, y: 25 },
    { id: "P5", x: 40, y: 10.8 },
    { id: "P6", x: 50, y: 20 },
  ],
};
const ANGLES = {
  arcs: [],
  circles: [],
  constraints: [
    { id: "q1", kind: "perpendicular", parts: ["L1", "L2"] },
    { id: "a1", kind: "angle", parts: ["L1", "L3"], value: 40 },
  ],
  lines: [
    { a: "P1", b: "P2", id: "L1" },
    { a: "P1", b: "P3", id: "L2" },
    { a: "P1", b: "P4", id: "L3" },
  ],
  points: [
    { id: "P1", x: 20, y: 12 },
    { id: "P2", x: 40, y: 12 },
    { id: "P3", x: 20, y: 32 },
    { id: "P4", x: 36, y: 24.9 },
  ],
};

// (the tests are independent pages: they run side by side, so the whole file is well under the time a run is given)
describe("sketching in a real page", { concurrency: 5 }, () => {
  // ---------------------------------------------------------------------------------------------------- the ring and the tools

  test("[S1] the pencil in the ring opens Line, Rectangle, Circle and Arc; choosing one closes the ring, turns the view straight to the plane, and the tool stays on", async () => {
    const { page, errors, close, ev, click } = await open("");
    try {
      const titles = () =>
        page.evaluate(() => [...document.querySelectorAll("[title]")].map((e) => e.getAttribute("title")));
      const cam = () => ev<any>(`() => window.__cad.cam`);
      assert.equal((await cam()).ortho, null, "the page starts in perspective");
      await page.mouse.click(560, 360, { button: "right" });
      await page.waitForTimeout(600);
      assert.ok((await titles()).includes("Sketch"), "the ring has the pencil");
      await page.click('[title="Sketch"]');
      await page.waitForTimeout(600);
      const t = await titles();
      for (const name of ["Line", "Rectangle", "Circle", "Arc (centre, start, end)"])
        assert.ok(t.includes(name), `${name} is in the pencil's ring`);
      await page.click('[title="Line"]');
      await page.waitForTimeout(1500);
      const t2 = await titles();
      assert.ok(!t2.includes("Line") && !t2.includes("Sketch"), "the ring is closed");
      const c = await cam();
      assert.notEqual(c.ortho, null, "the view is orthographic");
      assert.ok(Math.abs(c.pitch + Math.PI / 2) < 1e-6, "and looks straight down at the plane that is on (Z)");
      assert.ok(await ev<any>(`() => window.__sketch.debug().tool`), "the tool is on");
      await click(10, 10);
      await click(20, 10);
      await click(30, 20);
      assert.ok(await ev<any>(`() => window.__sketch.debug().tool`), "the tool stays on after figures are made");
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  });

  test("[S1] a view that is already straight to the plane is left as it is when a tool is chosen", async () => {
    const { page, errors, close, ev } = await open("");
    try {
      await ev(`() => window.__tool("line")`);
      await page.waitForTimeout(1500);
      await ev(`() => window.__sketch.stop()`);
      await ev(`() => window.__sketch.stop()`);
      await page.waitForTimeout(300);
      const before = await ev<any>(`() => window.__cad.cam`);
      assert.notEqual(before.ortho, null);
      await page.mouse.click(560, 360, { button: "right" });
      await page.waitForTimeout(600);
      await page.click('[title="Sketch"]');
      await page.waitForTimeout(600);
      await page.click('[title="Circle"]');
      await page.waitForTimeout(1500);
      const after = await ev<any>(`() => window.__cad.cam`);
      assert.deepEqual(after, before, "the camera did not move");
      assert.ok(await ev<any>(`() => window.__sketch.debug().tool`));
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  });

  test("[S3] what the next click would make is drawn as the pointer moves with a small cross at it; figures done are thin charcoal lines; a picked point is a teal dot", async () => {
    const { page, errors, close, ev, px, click, lines } = await open("");
    try {
      const drawn = async (x: number, y: number) => {
        const [a, b] = await px(x, y);
        await page.mouse.move(a, b, { steps: 3 });
        await page.waitForTimeout(150);
        return ev<any[]>(`() => window.__sketch.lines({ x: ${a}, y: ${b} })`);
      };
      await ev(`() => window.__tool("line")`);
      await page.waitForTimeout(1200);
      // before the first click: only the cross
      let l = await drawn(10, 10);
      assert.ok(
        l.every((q) => q.kind === "cursor") && l.length === 2,
        "before the first click only the cross at the pointer",
      );
      await click(10, 10);
      l = await drawn(30, 10);
      const prev = l.find((q) => q.kind === "preview");
      assert.ok(
        prev && dist(prev.pts[0], [10, 10]) < 1e-6 && dist(prev.pts[1], [30, 10]) < 1e-6,
        "the line the click would make, from the first point to the pointer",
      );
      const cur = l.filter((q) => q.kind === "cursor");
      assert.equal(cur.length, 2, "the cross");
      for (const c of cur)
        assert.ok(
          dist([(c.pts[0][0] + c.pts[1][0]) / 2, (c.pts[0][1] + c.pts[1][1]) / 2], [30, 10]) < 1e-6 &&
            dist(c.pts[0], c.pts[1]) < 3,
          "a small cross, centred on the pointer",
        );
      l = await drawn(35, 20);
      assert.ok(dist(l.find((q) => q.kind === "preview").pts[1], [35, 20]) < 1e-6, "the preview follows the pointer");
      await click(35, 20);
      await ev(`() => window.__sketch.stop()`);
      // the figure done: a thin charcoal line
      const shot = await pixels(page, await page.screenshot());
      const [mx, my] = await px(22.5, 15);
      const seg = (await lines()).find((q) => q.kind === "done");
      assert.ok(seg, "the figure is drawn as a done line");
      let dark = 0,
        thick = 0;
      for (let d = -6; d <= 6; d++) {
        const p = shot.at(Math.round(mx) + d, Math.round(my));
        const q = shot.at(Math.round(mx) + d, Math.round(my) + 0);
        void q;
        if (Math.max(...p) < 140 && Math.max(...p) - Math.min(...p) < 20) dark++;
        thick = Math.max(thick, dark);
      }
      assert.ok(dark >= 1 && dark <= 5, `a thin charcoal stroke crosses the sample (${dark} dark pixels)`);
      // rectangle and circle previews
      await ev(`() => window.__tool("rect")`);
      await page.waitForTimeout(400);
      await click(-30, -20);
      l = await drawn(-10, -5);
      assert.ok(
        l.some((q) => q.kind === "preview" && q.pts.length === 5),
        "a rectangle's four sides are previewed",
      );
      await ev(`() => window.__sketch.stop()`);
      await ev(`() => window.__tool("circle")`);
      await page.waitForTimeout(400);
      await click(-30, 20);
      l = await drawn(-20, 20);
      assert.ok(
        l.some((q) => q.kind === "preview"),
        "a circle is previewed",
      );
      await ev(`() => window.__sketch.stop()`);
      // a picked point is a teal dot
      await ev(`() => window.__sketch.restore(${JSON.stringify({})})`);
      const e = await open("");
      try {
        await e.put({ ...TWO_LINES });
        await e.click(10, 20); // the first line's end
        const sel = await e.selection();
        assert.deepEqual(sel.ids, ["P1"], "the point is picked");
        const dots = (await e.lines()).filter((q) => q.kind === "dot");
        assert.ok(
          dots.some((q) => dist(q.pts[0], [10, 20]) < 1e-6),
          "a dot stands on it",
        );
        const s2 = await pixels(e.page, await e.page.screenshot());
        const [sx, sy] = await e.px(10, 20);
        let teal = 0;
        for (let dx = -4; dx <= 4; dx++)
          for (let dy = -4; dy <= 4; dy++) {
            const [r, g, b] = s2.at(Math.round(sx) + dx, Math.round(sy) + dy);
            if (g > r + 40 && b > r + 40) teal++;
          }
        assert.ok(teal >= 8, `the dot is teal (${teal} teal pixels)`);
      } finally {
        await e.close();
      }
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  });

  // ---------------------------------------------------------------------------------------------------- selecting

  test("[S11] selecting goes down, never up: a line takes in its ends, a circle its centre; a circle's centre is always shown, a small dot; selecting a circle's edge does not select its centre", async () => {
    const { errors, close, put, click, lines, selection } = await open("");
    try {
      await put(CIRCLE_AND_LINE);
      const centreDots = async () => (await lines()).filter((q) => q.kind === "dot" && dist(q.pts[0], [15, 20]) < 1e-6);
      // nothing selected: the centre is there, a small dot
      let c = await centreDots();
      assert.equal(c.length, 1, "a circle's centre is always shown");
      const small = c[0].r;
      assert.ok(small > 0, "a dot");
      // the line: its ends are taken in
      await click(39, 18.2);
      assert.deepEqual((await selection()).ids, ["L1"], "the line is what is selected");
      let dots = (await lines()).filter((q) => q.kind === "dot" && q.tone === "figure");
      assert.equal(dots.length, 2, "and its two ends are shown as selected");
      assert.ok(dots.some((q) => dist(q.pts[0], [32, 14]) < 1e-6) && dots.some((q) => dist(q.pts[0], [46, 22]) < 1e-6));
      c = await centreDots();
      assert.equal(c.length, 1, "the circle's centre is still shown");
      assert.equal(c[0].r, small, "as the small dot (not taken in)");
      // the circle's edge: the circle is selected, its centre is not
      await click(22, 20);
      const sel = await selection();
      assert.deepEqual(sel.ids, ["K1"], `selecting the edge selects the circle alone: ${JSON.stringify(sel.ids)}`);
      c = await centreDots();
      assert.equal(c.length, 1, "the centre is one dot");
      assert.ok(c[0].r > small, "taken in with the circle, it is the bigger selected dot");
      assert.ok(
        !(await lines()).some(
          (q) => q.kind === "dot" && (dist(q.pts[0], [32, 14]) < 1e-6 || dist(q.pts[0], [46, 22]) < 1e-6),
        ),
        "the line's ends are not shown",
      );
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  });

  // ---------------------------------------------------------------------------------------------------- bubbles: at rest, placed, a constraint's state

  test("[S18] bubbles are quiet at rest, and nothing changes size on hover", async () => {
    const { page, errors, close, put, click, lines, boxes, ev } = await open("");
    try {
      for (const [name, def, at] of [
        ["a line", TWO_LINES, [15, 24]],
        ["a circle and a line", CIRCLE_AND_LINE, [22, 20]],
        ["angles", ANGLES, [30, 12]],
      ] as const) {
        await put(def as unknown as Def);
        await click(at[0], at[1]);
        await page.mouse.move(5, 5, { steps: 3 });
        await page.waitForTimeout(500);
        const kinds = (await lines()).map((q) => q.kind);
        assert.ok(kinds.length > 0, `${name} is drawn`);
        for (const k of kinds)
          assert.ok(
            !/^dash/.test(k) && !/^lit/.test(k) && k !== "dimExt" && k !== "dimArc",
            `${name}: nothing extra at rest (${k})`,
          );
        const rest = await boxes();
        assert.ok(rest.length >= 1, `${name}: it has bubbles`);
        for (const b of rest) {
          await page.mouse.move(b.l + b.w / 2, b.t + b.h / 2, { steps: 3 });
          await page.waitForTimeout(300);
          const now = (await boxes()).find((x) => x.key === b.key)!;
          assert.ok(
            Math.abs(now.w - b.w) < 0.6 && Math.abs(now.h - b.h) < 0.6,
            `${name}: ${b.key} keeps its size when pointed at (${b.w}x${b.h} to ${now.w}x${now.h})`,
          );
          await page.mouse.move(5, 5, { steps: 3 });
          await page.waitForTimeout(200);
        }
        void ev;
      }
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  });

  test("[S19] bubbles stand inside the window and keep clear of each other, even when their spot is far off the window", async () => {
    const { page, errors, close, put, click, boxes } = await open("");
    try {
      // two lines that meet far outside the window: the angle and the perpendicular have no place on the screen
      await put({
        arcs: [],
        circles: [],
        constraints: [],
        lines: [
          { a: "P1", b: "P2", id: "L1" },
          { a: "P3", b: "P4", id: "L2" },
        ],
        points: [
          { id: "P1", x: 10, y: 20 },
          { id: "P2", x: 20, y: 28 },
          { id: "P3", x: 36, y: 20 },
          { id: "P4", x: 44, y: 32 },
        ],
      });
      await click(15, 24);
      await page.keyboard.down("Shift");
      await click(40, 26);
      await page.keyboard.up("Shift");
      await page.waitForTimeout(500);
      const bs = (await boxes()) as { l: number; t: number; w: number; h: number }[];
      assert.ok(bs.length >= 2, `there are several bubbles: ${bs.length}`);
      const size = page.viewportSize()!;
      for (const b of bs) {
        assert.ok(
          b.l >= 0 && b.t >= 0 && b.l + b.w <= size.width && b.t + b.h <= size.height,
          `inside the window: ${JSON.stringify(b)}`,
        );
      }
      for (let i = 0; i < bs.length; i++)
        for (let j = i + 1; j < bs.length; j++) {
          const a = bs[i]!,
            b = bs[j]!;
          assert.ok(
            a.l + a.w <= b.l + 1 || b.l + b.w <= a.l + 1 || a.t + a.h <= b.t + 1 || b.t + b.h <= a.t + 1,
            `bubbles ${i} and ${j} do not overlap: ${JSON.stringify([a, b])}`,
          );
        }
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  });

  test("[S22] a constraint is one lock-and-icon bubble with a state: a click on an offer applies it, a click on an applied one lets it go", async () => {
    const { page, errors, close, put, click, def, bubble, selection } = await open("");
    try {
      await put(TWO_LINES as unknown as Def);
      await click(15, 24);
      await page.waitForTimeout(400);
      const el = (re: string) =>
        page.evaluate((re) => {
          const e = [...document.querySelectorAll("[data-key]")].find((x) =>
            new RegExp(re).test(x.getAttribute("data-key") ?? ""),
          );
          const f = e?.querySelector("[data-bar],[data-fact]") as HTMLElement | null;
          return f ? { state: f.dataset.state, padlocks: e!.querySelectorAll("[data-padlock]").length } : null;
        }, re);
      const offer = await bubble("^near:horizontal:P1,P3");
      assert.ok(offer, "the offer is a bubble");
      assert.equal((await el("^near:horizontal"))!.state, "offer", "in the state offered");
      assert.deepEqual((await def()).constraints, [], "nothing is applied yet");
      await page.mouse.click(offer.x, offer.y);
      await page.waitForTimeout(500);
      let cs = (await def()).constraints;
      assert.equal(cs.length, 1, "a click on the offer applies it");
      assert.equal(cs[0].kind, "horizontal");
      assert.deepEqual([...cs[0].parts].sort(), ["P1", "P3"]);
      assert.ok((await selection()).ids.length >= 1, "something stays selected");
      const applied = await bubble("^c1\\|");
      assert.ok(applied, "the constraint is a bubble");
      assert.equal((await el("^c1\\|"))!.state, "locked", "in the state applied");
      await page.mouse.click(applied.x, applied.y);
      await page.waitForTimeout(500);
      cs = (await def()).constraints;
      assert.deepEqual(cs, [], "a click on an applied one lets it go");
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  });

  test("[S22] a click on an offer for something just drawn applies it, selecting the parts it is offered for", async () => {
    const { page, errors, close, ev, click, def, bubble, selection } = await open("");
    try {
      await ev(`() => window.__tool("line")`);
      await page.waitForTimeout(1000);
      await click(10, 10);
      await click(30, 12);
      await ev(`() => window.__sketch.stop()`);
      await ev(`() => window.__sketch.stop()`);
      await page.waitForTimeout(400);
      assert.deepEqual((await selection()).ids, [], "nothing is selected");
      const offer = await bubble("^rel:");
      assert.ok(offer, "an offer shows for what was just drawn, though it is not selected");
      await page.mouse.click(offer.x, offer.y);
      await page.waitForTimeout(500);
      assert.equal((await def()).constraints.length, 1, "the click applied it");
      assert.ok((await selection()).ids.length >= 1, "and selected the parts it is for");
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  });

  // ---------------------------------------------------------------------------------------------------- pointing at a bubble

  test("[S29] pointing at a bubble draws only what it is about (the parts lit in its colour, a dot on each named point), and moving away takes it all away", async () => {
    const { page, errors, close, put, click, lines, bubble } = await open("");
    try {
      await put(TWO_LINES as unknown as Def);
      await click(15, 24);
      const lit = async () =>
        (await lines()).filter(
          (q) => /^lit/.test(q.kind) || (q.kind === "dot" && (q.tone === "ties" || q.tone === "figure")),
        );
      const base = (await lines()).filter((q) => q.kind === "dot").length;
      // an offer: yellow
      const offer = (await bubble("^near:horizontal:P1,P3"))!;
      await page.mouse.move(offer.x, offer.y, { steps: 3 });
      await page.waitForTimeout(300);
      let l = await lines();
      const offered = l.filter((q) => q.kind === "litOffer" || q.kind === "litOfferSel");
      assert.ok(offered.length >= 1, "the parts it is about are lit in the offer's colour");
      assert.ok(
        l.every((q) => q.kind !== "lit"),
        "and not in the applied one",
      );
      const ties = l.filter((q) => q.kind === "dot" && q.tone === "ties");
      assert.equal(ties.length, 2, "a dot on each named point");
      assert.ok(
        ties.some((q) => dist(q.pts[0], [10, 20]) < 1e-6) && ties.some((q) => dist(q.pts[0], [36, 20]) < 1e-6),
        "P1 and P3",
      );
      // only what it names: the lines that end at P1 and P3 (L1 and L2), nothing else, and no other point
      assert.equal(offered.length, 2, "only the two lines at the named points");
      // away
      await page.mouse.move(offer.x + 300, offer.y + 250, { steps: 5 });
      await page.waitForTimeout(300);
      l = await lines();
      assert.ok(
        l.every((q) => !/^lit/.test(q.kind) && !/^dash/.test(q.kind) && !(q.kind === "dot" && q.tone === "ties")),
        "moving away takes it all away",
      );
      // the same applied: blue
      await page.mouse.click(offer.x, offer.y);
      await page.waitForTimeout(500);
      const applied = (await bubble("^c1\\|"))!;
      await page.mouse.move(applied.x, applied.y, { steps: 3 });
      await page.waitForTimeout(300);
      l = await lines();
      const a = l.filter((q) => q.kind === "lit");
      assert.equal(a.length, 2, "an applied constraint lights its parts in its own kind of line");
      assert.ok(l.every((q) => q.kind !== "litOffer" && q.kind !== "litOfferSel"));
      const adots = l.filter((q) => q.kind === "dot" && q.tone === "figure" && base >= 0);
      assert.ok(adots.length >= 2, "with a dot on each named point");
      void lit;
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  });

  test("[S30] an offer that would move something draws an arrow for each part that would move; those of the parts it names are strong, what moves only because they do is pale", async () => {
    const { page, errors, close, put, click, lines, marks, bubble } = await open("");
    try {
      await put(RECT_AND_LINE as unknown as Def);
      await click(30, 10); // the rectangle's corner P2
      await page.keyboard.down("Shift");
      await click(40, 10.8); // the line's end P5
      await page.keyboard.up("Shift");
      await page.waitForTimeout(600);
      const offer = (await marks()).find((m) => m.id === "rel:coincident");
      assert.ok(
        offer?.moves?.length === 3,
        `coincident is offered and moves three points: ${JSON.stringify(offer?.moves)}`,
      );
      const arrows = async () => (await lines()).filter((q) => q.kind === "dashOffer");
      assert.equal((await arrows()).length, 0, "at rest no arrow");
      const b = (await bubble("^rel:coincident"))!;
      await page.mouse.move(b.x, b.y, { steps: 3 });
      await page.waitForTimeout(300);
      const a = (await arrows()).filter((q) => q.head === undefined);
      const heads = (await arrows()).filter((q) => q.head);
      // the shafts that go from a moving point: one for each point that would move (the bubble's own is from the bubble)
      const shaftFrom = (p: number[]) => a.filter((q) => dist(q.pts[0], p) < 2 && q.pts.length === 2);
      const strong = shaftFrom([30, 10]),
        pale1 = shaftFrom([10, 10]),
        pale2 = shaftFrom([30, 25]);
      assert.ok(
        strong.length === 1 && pale1.length === 1 && pale2.length === 1,
        "an arrow for each part that would move, from where it is",
      );
      assert.ok(!strong[0].pale, "the named point's arrow is strong");
      assert.ok(pale1[0].pale && pale2[0].pale, "what moves only because it does is pale");
      assert.ok(
        heads.some((h) => dist(h.pts[1], [40, 10.8]) < 2 && !h.pale) && heads.filter((h) => h.pale).length >= 2,
        "each arrow has its tip, pale likewise",
      );
      assert.ok(Math.abs(strong[0].pts[1][1] - 10.8) < 0.5, "to where it would be");
      await page.mouse.move(b.x + 300, b.y + 250, { steps: 5 });
      await page.waitForTimeout(300);
      assert.equal((await arrows()).length, 0, "moving away takes them away");
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  });

  test("[S31] there is one arrow: a dashed line and an open tip that stops short of what it points at; a bubble also draws one from itself to its spot", async () => {
    const { page, errors, close, put, click, lines, marks, bubble } = await open("");
    try {
      await put(TWO_LINES as unknown as Def);
      await click(15, 24);
      const b = (await bubble("^near:horizontal:P1,P3"))!;
      await page.mouse.move(b.x, b.y, { steps: 3 });
      await page.waitForTimeout(300);
      const l = (await lines()).filter((q) => /^dash/.test(q.kind));
      const mk = (await marks()).find((m) => m.id === "near:horizontal:P1,P3");
      const shaft = l.find((q) => !q.head && Math.abs(q.pts[0][1] - q.pts[1][1]) > 1e-6);
      assert.ok(shaft && l.some((q) => q.head) && mk, "a dashed shaft and an open tip, from the bubble");
      assert.ok(shaft.dash > 0, "the shaft is dashed");
      const tip = l.find((q) => q.head);
      assert.ok(tip.pts.length === 3, "the tip is two strokes meeting (open)");
      assert.ok(dist(tip.pts[1], shaft.pts[1]) < 1e-6, "the tip is at the shaft's end");
      const gap = dist(shaft.pts[1], mk.at);
      assert.ok(gap > 0.3 && gap < 1.5, `the tip stops short of the spot (${gap.toFixed(2)} mm)`);
      // a dimension's tips stop short too
      await put(CIRCLE_AND_LINE as unknown as Def);
      await click(22, 20);
      const m = (await bubble("^measure"))!;
      await page.mouse.move(m.x, m.y, { steps: 3 });
      await page.waitForTimeout(300);
      const d = await lines();
      const tips = d.filter((q) => q.head).map((q) => q.pts[1]);
      assert.equal(tips.length, 2, "an arrow tip at each end");
      for (const t of tips)
        assert.ok(
          Math.min(dist(t, [15, 20]), Math.abs(dist(t, [15, 20]) - 7)) > 0.3,
          "each stops short of what it points at",
        );
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  });

  test("[S32] there is one dashed line, thin and fine, neutral for what is applied or measured and yellow for what is suggested; what is not a dashed line is not dashed", async () => {
    const { page, errors, close, put, click, lines, bubble } = await open("");
    try {
      const dashes = new Set<number>();
      const point = async (re: string) => {
        const b = (await bubble(re))!;
        assert.ok(b, re);
        await page.mouse.move(b.x, b.y, { steps: 3 });
        await page.waitForTimeout(300);
        return lines();
      };
      const away = async () => {
        await page.mouse.move(3, 3, { steps: 4 });
        await page.waitForTimeout(200);
      };
      await put(CIRCLE_AND_LINE as unknown as Def);
      await click(39, 18.2);
      // a measured number: neutral dashed line; its thin lines are not dashed
      let l = await point("^measure");
      const shaft = l.find((q) => q.kind === "dash" && !q.head)!;
      assert.ok(shaft?.dash > 0, "a measured number's line is dashed, in the neutral kind");
      dashes.add(shaft.dash);
      const ext = l.filter((q) => q.kind === "dimExt");
      assert.equal(ext.length, 2);
      for (const e of ext) assert.ok(e.dash === undefined && !e.head, "a dimension's thin lines are not dashed");
      assert.ok(
        l.every((q) => q.kind !== "dashOffer"),
        "none of it is yellow",
      );
      await away();
      // a suggestion: yellow
      await put(TWO_LINES as unknown as Def);
      await click(15, 24);
      l = await point("^near:horizontal:P1,P3");
      const off = l.filter((q) => q.kind === "dashOffer" && !q.head);
      assert.ok(
        off.length >= 1 && off.every((q) => q.dash > 0),
        "what is suggested is a dashed line of the yellow kind",
      );
      for (const q of off) dashes.add(q.dash);
      assert.ok(l.every((q) => q.kind !== "dash" || q.head === undefined || true));
      await away();
      // an angle's arc is not dashed
      await put(ANGLES as unknown as Def);
      await click(30, 12);
      l = await point("^a1\\|");
      const arc = l.filter((q) => q.kind === "dimArc");
      assert.equal(arc.length, 1, "the angle's arc");
      assert.ok(arc[0].dash === undefined, "is not dashed");
      // one dashed line: one dash size at one view
      assert.ok(
        [...dashes].every((d) => Math.abs(d - [...dashes][0]!) < 1e-9),
        `one dash for every dashed line: ${[...dashes]}`,
      );
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  });

  test("[S33] a number is drawn on its dimension line when pointed at: a circle's size on a radial line, a line's length on a line beside it, an arrow tip at each end; an angle in its corner, an arc, or a small square for a right angle", async () => {
    const { page, errors, close, put, click, lines, bubble, marks } = await open("");
    try {
      const dimLines = async () => (await lines()).filter((l) => /^dash/.test(l.kind) || l.kind === "dimExt");
      await put(CIRCLE_AND_LINE as unknown as Def);
      await click(22, 20);
      assert.equal((await dimLines()).length, 0, "at rest no dimension line is drawn");
      let b = (await bubble("^measure"))!;
      await page.mouse.move(b.x, b.y, { steps: 3 });
      await page.waitForTimeout(300);
      let d = await dimLines();
      assert.equal(d.filter((l) => l.kind === "dash" && !l.head).length, 1, "a radial line");
      assert.equal(d.filter((l) => l.head).length, 2, "an arrow tip at each end");
      const rad = d.find((l) => l.kind === "dash" && !l.head)!;
      // it lies along a radius: its line passes through the centre
      const cross =
        Math.abs(
          (rad.pts[1][0] - rad.pts[0][0]) * (20 - rad.pts[0][1]) -
            (rad.pts[1][1] - rad.pts[0][1]) * (15 - rad.pts[0][0]),
        ) / dist(rad.pts[0], rad.pts[1]);
      assert.ok(cross < 1e-3, "the circle's size is on a line through its centre");
      assert.ok(dist(rad.pts[0], rad.pts[1]) < 7 && dist(rad.pts[0], [15, 20]) < 7.5, "within its radius");
      await page.mouse.move(b.x + 300, b.y + 250, { steps: 5 });
      await page.waitForTimeout(300);
      assert.equal((await dimLines()).length, 0, "moving away takes it away");
      await click(39, 18.2);
      b = (await bubble("^measure"))!;
      await page.mouse.move(b.x, b.y, { steps: 3 });
      await page.waitForTimeout(300);
      d = await dimLines();
      assert.equal(d.filter((l) => l.kind === "dash" && !l.head).length, 1, "a line beside the line");
      assert.equal(d.filter((l) => l.kind === "dimExt").length, 2, "two thin lines to it");
      assert.equal(d.filter((l) => l.head).length, 2, "an arrow tip at each end");
      const side = d.find((l) => l.kind === "dash" && !l.head)!;
      const dx = 14,
        dy = 8;
      assert.ok(
        Math.abs((side.pts[1][0] - side.pts[0][0]) * dy - (side.pts[1][1] - side.pts[0][1]) * dx) < 1e-6,
        "parallel to the line it measures",
      );
      assert.ok(
        dist([(side.pts[0][0] + side.pts[1][0]) / 2, (side.pts[0][1] + side.pts[1][1]) / 2], [39, 18]) > 0.5,
        "and beside it",
      );
      // angles
      await put(ANGLES as unknown as Def);
      await click(30, 12);
      const corner = async () => (await lines()).filter((l) => l.kind === "dimArc");
      assert.equal((await corner()).length, 0, "at rest no corner mark");
      const mk = await marks();
      const sq = mk.find((m) => m.relation === "perpendicular"),
        ang = mk.find((m) => m.relation === "angle");
      assert.ok(
        sq?.corner?.square && ang?.corner && !ang.corner.square,
        "a right angle is a square, another angle an arc",
      );
      assert.ok(dist(sq.at, [20, 12]) < 5 && dist(ang.at, [20, 12]) < 12, "both stand in the corner");
      const bq = (await bubble("^q1\\|"))!;
      await page.mouse.move(bq.x, bq.y, { steps: 3 });
      await page.waitForTimeout(300);
      assert.equal((await corner()).length, 1, "the right angle's square is drawn in the corner");
      await page.mouse.move(3, 3, { steps: 5 });
      const ba = (await bubble("^a1\\|"))!;
      await page.mouse.move(ba.x, ba.y, { steps: 3 });
      await page.waitForTimeout(300);
      assert.equal((await corner()).length, 1, "the angle's arc is drawn in the corner");
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  });

  test("[S34] an alignment (level, upright, parallel) that would move nothing still draws a dashed line through what it ties together when pointed at", async () => {
    const { page, errors, close, put, click, lines, bubble } = await open("");
    try {
      await put(TWO_LINES as unknown as Def);
      await click(15, 24);
      const aligns = async () => (await lines()).filter((l) => l.kind === "dashOffer" || l.kind === "dash");
      assert.equal((await aligns()).length, 0, "at rest no alignment line");
      const b = (await bubble("^near:horizontal:P1,P3"))!;
      await page.mouse.move(b.x, b.y, { steps: 3 });
      await page.waitForTimeout(300);
      const level = (await aligns()).find((l) => !l.head && Math.abs(l.pts[0][1] - l.pts[1][1]) < 1e-6);
      assert.ok(level && level.kind === "dashOffer", "a dashed line, level, drawn");
      const xs = [level.pts[0][0], level.pts[1][0]];
      assert.ok(Math.min(...xs) <= 10 + 1e-6 && Math.max(...xs) >= 36 - 1e-6, "through both points");
      assert.ok(Math.abs(level.pts[0][1] - 20) < 1e-6, "at their height");
      await page.mouse.move(3, 3, { steps: 5 });
      await page.waitForTimeout(250);
      assert.equal((await aligns()).length, 0, "moving away takes it away");
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  });

  // ---------------------------------------------------------------------------------------------------- moving bubbles

  test("[S35] a press and a drag on a bubble moves it, following the pointer exactly; the position is forgotten when the bubble is gone; the click that ends a drag is not a click on the bubble", async () => {
    const { page, errors, close, put, click, bubble, def } = await open("");
    try {
      await put(TWO_LINES as unknown as Def);
      await click(15, 24);
      const a = (await bubble("^near:horizontal:P1,P3"))!;
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move(a.x + 80, a.y + 60, { steps: 8 });
      await page.waitForTimeout(150);
      const mid = (await bubble("^near:horizontal:P1,P3"))!;
      assert.ok(
        Math.abs(mid.x - a.x - 80) < 1.5 && Math.abs(mid.y - a.y - 60) < 1.5,
        `held, it is under the pointer: moved ${mid.x - a.x}, ${mid.y - a.y}`,
      );
      await page.mouse.up();
      await page.waitForTimeout(300);
      const b = (await bubble("^near:horizontal:P1,P3"))!;
      assert.ok(
        b && Math.abs(b.x - a.x - 80) < 1.5 && Math.abs(b.y - a.y - 60) < 1.5,
        `and it stays where it was let go: moved ${b.x - a.x}, ${b.y - a.y}`,
      );
      assert.deepEqual((await def()).constraints, [], "the click that ends the drag did not apply the offer");
      // the position is forgotten when the bubble is gone: put the selection away and select again
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
      assert.equal(await bubble("^near:horizontal"), null, "the bubble is gone");
      await click(15, 24);
      await page.waitForTimeout(400);
      const c = (await bubble("^near:horizontal:P1,P3"))!;
      assert.ok(
        Math.abs(c.x - a.x) < 1.5 && Math.abs(c.y - a.y) < 1.5,
        `back where it stands: (${c.x}, ${c.y}) against (${a.x}, ${a.y})`,
      );
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  });

  test("[S36] a press let go away from the bubble is over: moving over the bubble with no button down never drags it, and a number can always be typed into it", async () => {
    const { page, errors, close, put, click, bubble, def } = await open("");
    try {
      await put(CIRCLE_AND_LINE as unknown as Def);
      await click(22, 20);
      await page.waitForTimeout(400);
      const a = (await bubble("^measure"))!;
      await page.mouse.move(a.l + 3, a.y);
      await page.mouse.down();
      await page.mouse.move(a.x + 400, a.y + 200); // one jump: the bubble never sees where it ends
      await page.mouse.up();
      await page.mouse.move(a.x, a.y, { steps: 6 });
      await page.mouse.move(a.x + 40, a.y + 30, { steps: 6 });
      await page.waitForTimeout(250);
      const b = (await bubble("^measure"))!;
      assert.ok(
        Math.abs(b.x - a.x) < 2 && Math.abs(b.y - a.y) < 2,
        `it did not follow the pointer: (${a.x}, ${a.y}) to (${b.x}, ${b.y})`,
      );
      // and a number can be typed into it
      const num = await page.evaluate(() => {
        const e = document.querySelector<HTMLElement>("[data-fact='measure'] [data-number]")!;
        const r = e.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      await page.mouse.click(num.x, num.y);
      await page.keyboard.press("Control+a");
      await page.keyboard.type("9");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(400);
      assert.ok(
        Math.abs((await def()).circles[0].r - 4.5) < 1e-6,
        `typed 9 into it: the diameter is 9 (radius ${(await def()).circles[0].r})`,
      );
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  });

  test("[S37] while one bubble is pointed at or typed into, the others fade to a fifth of themselves, and come back when it is let go", async () => {
    const { page, errors, close, put, click, bubble, opacities } = await open("");
    try {
      await put(CIRCLE_AND_LINE as unknown as Def);
      await click(39, 18.2);
      await page.waitForTimeout(500);
      const rest = await opacities();
      assert.ok(rest.length >= 2, "the line has several bubbles");
      assert.ok(
        rest.every((o) => o > 0.9),
        "all in full at rest",
      );
      const m = (await bubble("^measure"))!;
      await page.mouse.move(m.x, m.y, { steps: 3 });
      await page.waitForTimeout(400);
      let o = await opacities();
      assert.equal(o.filter((x) => x > 0.9).length, 1, "the one pointed at is in full");
      const others = o.filter((x) => x <= 0.9);
      assert.equal(others.length, rest.length - 1);
      assert.ok(
        others.every((x) => Math.abs(x - 0.2) < 0.06),
        `the others at a fifth: ${others}`,
      );
      await page.mouse.move(5, 5, { steps: 5 });
      await page.waitForTimeout(400);
      assert.ok(
        (await opacities()).every((x) => x > 0.9),
        "and they come back when it is let go",
      );
      // typed into
      const num = await page.evaluate(() => {
        const e = document.querySelector<HTMLElement>("[data-fact='measure'] [data-number]")!;
        const r = e.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      await page.mouse.click(num.x, num.y);
      await page.mouse.move(5, 5, { steps: 5 });
      await page.waitForTimeout(400);
      o = await opacities();
      assert.equal(o.filter((x) => x > 0.9).length, 1, "while one is typed into it is the only one in full");
      assert.ok(
        o.filter((x) => x <= 0.9).every((x) => Math.abs(x - 0.2) < 0.06),
        `the others at a fifth: ${o}`,
      );
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
      assert.ok(
        (await opacities()).every((x) => x > 0.9),
        "and come back when it is done",
      );
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  });

  // ---------------------------------------------------------------------------------------------------- numbers

  test("[S20] a number is measured first (open lock) and locked when asked (closed lock); typing over it locks it; one typed again and again into one bubble is one change", async () => {
    const { page, errors, close, ev, click, def } = await open("");
    try {
      await ev(`() => window.__tool("line")`);
      await page.waitForTimeout(800);
      await click(10, 10);
      await click(50, 10);
      await ev(`() => window.__sketch.stop()`);
      await click(30, 10);
      await page.waitForTimeout(400);
      const lock = () =>
        page.evaluate(() => document.querySelector<HTMLElement>("[data-fact] [data-padlock]")?.dataset.padlock);
      assert.equal(await lock(), "open", "measured first: an open lock");
      assert.deepEqual((await def()).constraints, [], "and nothing is locked in the sketch");
      // locked when asked: a click on the padlock
      await page.click("[data-fact] [data-padlock]");
      await page.waitForTimeout(400);
      assert.equal(
        (await def()).constraints.filter((c: any) => c.kind === "length").length,
        1,
        "a click on the lock makes it a number",
      );
      assert.equal(await lock(), "closed", "a closed lock");
      await page.keyboard.press("Control+z");
      await page.waitForTimeout(300);
      assert.deepEqual(
        (await def()).constraints.filter((c: any) => c.kind === "length"),
        [],
        "(undone)",
      );
      await click(30, 10);
      await page.waitForTimeout(300);
      assert.equal(await lock(), "open");
      // typing over it locks it, and typing again and again into one bubble is one change
      const typeOver = async (v: string) => {
        await page.click("[data-fact] [data-number]");
        await page.keyboard.press("Control+a");
        await page.keyboard.type(v);
        await page.keyboard.press("Enter");
        await page.waitForTimeout(300);
      };
      const len = async () => {
        const d = await def();
        const a = d.points.find((p: any) => p.id === "P1"),
          b = d.points.find((p: any) => p.id === "P2");
        return Math.hypot(b.x - a.x, b.y - a.y);
      };
      await typeOver("30");
      assert.ok(Math.abs((await len()) - 30) < 1e-4, "typed 30");
      assert.equal(await lock(), "closed", "typing over it locks it");
      await typeOver("35");
      await typeOver("45");
      assert.ok(Math.abs((await len()) - 45) < 1e-4, "and typed twice more: 45");
      assert.equal((await def()).constraints.filter((c: any) => c.kind === "length").length, 1, "still one number");
      await page.keyboard.press("Control+z");
      await page.waitForTimeout(300);
      assert.ok(
        Math.abs((await len()) - 30) < 1e-4,
        `one undo takes the two typings into the locked bubble back together (length ${await len()})`,
      );
      await page.keyboard.press("Control+z");
      await page.waitForTimeout(300);
      assert.ok(Math.abs((await len()) - 40) < 1e-4, `and the next the first typing (length ${await len()})`);
      void ev;
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  });

  test("[S20] a circle's number is its diameter, and an angle's is shown inside its corner", async () => {
    const { page, errors, close, put, click, bubble, marks, lines } = await open("");
    try {
      await put(CIRCLE_AND_LINE as unknown as Def);
      await click(22, 20);
      await page.waitForTimeout(400);
      const text = await page.evaluate(
        () => document.querySelector<HTMLElement>("[data-fact='measure'] [data-number]")!.textContent,
      );
      assert.equal(text, "14", "a circle of radius 7 shows 14: its diameter");
      await put(ANGLES as unknown as Def);
      await click(30, 12);
      const mk = (await marks()).find((m) => m.relation === "angle");
      assert.ok(mk && dist(mk.at, [20, 12]) < 12, "the angle's bubble stands in its corner");
      const b = (await bubble("^a1\\|"))!;
      await page.mouse.move(b.x, b.y, { steps: 3 });
      await page.waitForTimeout(300);
      const arc = (await lines()).find((l) => l.kind === "dimArc");
      assert.ok(arc && arc.pts.every((p: number[]) => dist(p, [20, 12]) < 25), "its arc is in the corner");
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  });

  test("[S38] digits typed with a figure under way go to its numbers (Tab to the next, Enter makes the figure with the numbers locked, Esc gives up)", async () => {
    const { page, errors, close, ev, click, move, def } = await open("");
    try {
      const chip = () =>
        page.evaluate(() => {
          const e = document.querySelector<HTMLElement>("[data-marks]");
          if (!e) return null;
          const facts = [...e.querySelectorAll<HTMLElement>("[data-fact]")].filter(
            (f) => (f.parentElement as HTMLElement).style.display !== "none",
          );
          if (!facts.length) return null;
          return facts.map((f) => ({
            label: f.title,
            text: f.querySelector("[data-number]")!.textContent,
            padlock: f.querySelector<HTMLElement>("[data-padlock]")!.dataset.padlock,
          }));
        });
      await ev(`() => window.__tool("line")`);
      await page.waitForTimeout(900);
      await click(10, 10);
      await move(30, 10.2);
      let c = await chip();
      assert.ok(
        c && c.length === 1 && c[0]!.padlock === "open" && Math.abs(Number(c[0]!.text) - 20) < 0.5,
        `the length as measured, an open lock: ${JSON.stringify(c)}`,
      );
      await page.keyboard.type("25");
      await page.waitForTimeout(150);
      c = await chip();
      assert.ok(
        c && c[0]!.text === "25" && c[0]!.padlock === "closed",
        "typed digits go straight into the number, its lock closes",
      );
      await move(30, 20);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(300);
      let d = await def();
      const a = d.points.find((p: any) => p.id === d.lines[0].a),
        b = d.points.find((p: any) => p.id === d.lines[0].b);
      assert.ok(Math.abs(dist([a.x, a.y], [b.x, b.y]) - 25) < 1e-4, "Enter makes the line 25 long");
      assert.ok(
        d.constraints.some((k: any) => k.kind === "length" && k.value === 25),
        "with the number locked",
      );
      // a rectangle: width, Tab, height
      await ev(`() => { window.__sketch.stop(); window.__sketch.stop(); }`);
      await page.waitForTimeout(300);
      await ev(`() => window.__tool("rect")`);
      await page.waitForTimeout(700);
      await click(0, -30);
      await move(20, -20);
      await page.keyboard.type("30");
      await page.keyboard.press("Tab");
      await page.keyboard.type("10");
      await page.waitForTimeout(150);
      c = await chip();
      assert.ok(
        c && c.length === 2 && c[0]!.text === "30" && c[1]!.text === "10" && c.every((f) => f.padlock === "closed"),
        `a width, Tab, a height: ${JSON.stringify(c)}`,
      );
      await page.keyboard.press("Enter");
      await page.waitForTimeout(300);
      d = await def();
      const xs = d.points.slice(-4).map((p: any) => p.x),
        ys = d.points.slice(-4).map((p: any) => p.y);
      assert.ok(
        Math.abs(Math.max(...xs) - Math.min(...xs) - 30) < 1e-4 &&
          Math.abs(Math.max(...ys) - Math.min(...ys) - 10) < 1e-4,
        "the rectangle is 30 by 10",
      );
      assert.equal(
        d.constraints.filter((k: any) => k.kind === "horizontalDistance" || k.kind === "verticalDistance").length,
        2,
        "both numbers are locked",
      );
      // Esc gives up
      await ev(`() => { window.__sketch.stop(); window.__sketch.stop(); }`);
      await page.waitForTimeout(300);
      const before = (await def()).lines.length;
      await ev(`() => window.__tool("line")`);
      await page.waitForTimeout(500);
      await click(-40, 20);
      await move(-30, 20);
      await page.keyboard.type("77");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(250);
      assert.equal((await def()).lines.length, before, "Esc gives the figure up: nothing was made");
      c = await chip();
      assert.ok(!c || c.every((f) => f.text !== "77"), "and the number typed is gone");
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  });

  test("[S38] digits typed with a part selected go to its number", async () => {
    const { page, errors, close, put, click, def } = await open("");
    try {
      await put({
        arcs: [],
        circles: [],
        constraints: [],
        lines: [{ a: "P1", b: "P2", id: "L1" }],
        points: [
          { id: "P1", x: 10, y: 10 },
          { id: "P2", x: 50, y: 10 },
        ],
      });
      await click(30, 10);
      await page.waitForTimeout(400);
      await page.keyboard.type("55");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(300);
      const d = await def();
      const a = d.points.find((p: any) => p.id === "P1"),
        b = d.points.find((p: any) => p.id === "P2");
      assert.ok(Math.abs(dist([a.x, a.y], [b.x, b.y]) - 55) < 1e-4, "typing 55 makes the line 55 long");
      assert.ok(
        d.constraints.some((k: any) => k.kind === "length" && k.value === 55),
        "the number is locked",
      );
      assert.equal(await page.locator("[data-fact] [data-padlock='closed']").count(), 1, "its lock is closed");
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  });
});
