// TEMPORARY tuning panel (open the page with ?tune; press K to hide/show). Every control edits the live `settings`
// object, the view updates immediately, and the box at the bottom shows the exact values to paste back.
// Values persist in localStorage so a reload keeps your tuning; Reset restores the shipped defaults.
const STORE = "cad-ui-tuning-v1";

// ---------------------------------------------------------------- color helpers
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const toHex2 = (v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, "0");
const rgbToHex = (c) => `#${toHex2(c[0])}${toHex2(c[1])}${toHex2(c[2])}`;
const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const intToHex = (n) => `#${n.toString(16).padStart(6, "0")}`;
const hexToInt = (h) => parseInt(h.slice(1), 16);
const round = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

function rgbToHsl([r, g, b]) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function hslToRgb([h, s, l]) {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    t = (t + 1) % 1;
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}

export function initTuning({ S, applyTheme, requestRender, getThemeName, setThemeName, view3D, sketchOn, pinHover, pinStyle, addTestBoxes }) {
  const defaults = JSON.parse(JSON.stringify(S));
  const theme = () => S.themes[getThemeName()];

  // ---- which settings are tunable (everything else is behavior, not look)
  const tunable = () => ({
    themeName: getThemeName(),
    themes: S.themes,
    fog: S.fog,
    sheetArea: S.sheetArea,
    reflect: S.reflect,
    grid: { lodDivisor: S.grid.lodDivisor, fineLineStrength: S.grid.fineLineStrength, minCellPx: S.grid.minCellPx, axisWidthPx: S.grid.axisWidthPx, axisAlpha: S.grid.axisAlpha },
    axisArrow: S.axisArrow,
    view: { fovDeg: S.view.fovDeg, transitionMs: S.view.transitionMs, orbitRadPerPx: S.view.orbitRadPerPx, zoomPerWheel: S.view.zoomPerWheel },
  });
  const merge = (dst, src) => {
    for (const k of Object.keys(src ?? {})) {
      if (src[k] && typeof src[k] === "object" && !Array.isArray(src[k]) && dst[k] && typeof dst[k] === "object") merge(dst[k], src[k]);
      else dst[k] = src[k];
    }
  };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) ?? "null");
    if (saved) {
      const { themeName, ...rest } = saved;
      merge(S, rest);
      if (themeName && S.themes[themeName]) setThemeName(themeName);
    }
  } catch {
    /* no storage: fine */
  }

  // ---- panel shell
  const css = document.createElement("style");
  css.textContent = `
    #tune { position:fixed; top:0; right:0; bottom:0; width:340px; overflow:auto; background:rgba(30,32,35,.96); color:#e4e6e8; font:12px/1.35 system-ui,sans-serif; padding:10px 12px 16px; box-sizing:border-box; border-left:1px solid #444; z-index:10; }
    #tune h3 { margin:14px 0 6px; font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:#9aa0a8; }
    #tune .row { display:grid; grid-template-columns: 112px 1fr 62px; gap:6px; align-items:center; margin:4px 0; }
    #tune .row.color { grid-template-columns: 112px 34px 1fr 62px; }
    #tune input[type=range] { width:100%; }
    #tune input[type=number], #tune input[type=text] { width:100%; box-sizing:border-box; background:#16181a; color:#e4e6e8; border:1px solid #444; border-radius:4px; padding:2px 4px; font:inherit; }
    #tune input[type=color] { width:34px; height:22px; border:1px solid #444; background:none; padding:0; }
    #tune button { background:#33373d; color:#e4e6e8; border:1px solid #555; border-radius:5px; padding:4px 9px; font:inherit; cursor:pointer; }
    #tune button.on { background:#6b7078; }
    #tune .bar { display:flex; gap:6px; flex-wrap:wrap; margin:6px 0; }
    #tune textarea { width:100%; height:190px; box-sizing:border-box; background:#16181a; color:#cfd3d8; border:1px solid #444; border-radius:5px; font:11px/1.3 ui-monospace,Menlo,monospace; }
    #tune small { color:#8d939b; }
  `;
  document.head.appendChild(css);
  const panel = document.createElement("div");
  panel.id = "tune";
  document.body.appendChild(panel);

  const refreshers = [];
  let out;
  const changed = () => {
    out.value = format();
    requestRender();
    try {
      localStorage.setItem(STORE, JSON.stringify(tunable()));
    } catch {
      /* no storage */
    }
  };

  const section = (title) => {
    const h = document.createElement("h3");
    h.textContent = title;
    panel.appendChild(h);
  };
  const number = (label, get, set, min, max, step) => {
    const row = document.createElement("div");
    row.className = "row";
    const l = document.createElement("span");
    l.textContent = label;
    const sl = Object.assign(document.createElement("input"), { type: "range", min, max, step });
    const nb = Object.assign(document.createElement("input"), { type: "number", min, max, step });
    const sync = () => {
      sl.value = nb.value = round(get(), 4);
    };
    sl.addEventListener("input", () => (set(parseFloat(sl.value)), (nb.value = sl.value), changed()));
    nb.addEventListener("input", () => {
      const v = parseFloat(nb.value);
      if (Number.isFinite(v)) (set(v), (sl.value = v), changed());
    });
    row.append(l, sl, nb);
    panel.appendChild(row);
    refreshers.push(sync);
    sync();
  };
  /** A color with a picker, a hex field and a lightness slider (shade of the same hue and saturation). */
  const color = (label, get, set) => {
    const row = document.createElement("div");
    row.className = "row color";
    const l = document.createElement("span");
    l.textContent = label;
    const pick = Object.assign(document.createElement("input"), { type: "color" });
    const hex = Object.assign(document.createElement("input"), { type: "text" });
    const light = Object.assign(document.createElement("input"), { type: "range", min: 0, max: 100, step: 0.5 });
    row.append(l, pick, light, hex);
    panel.appendChild(row);
    const sync = () => {
      const h = get();
      pick.value = hex.value = h;
      light.value = rgbToHsl(hexToRgb(h))[2] * 100;
    };
    pick.addEventListener("input", () => (set(pick.value), sync(), changed()));
    hex.addEventListener("change", () => {
      if (/^#[0-9a-fA-F]{6}$/.test(hex.value)) (set(hex.value.toLowerCase()), sync(), changed());
    });
    light.addEventListener("input", () => {
      const [h, s] = rgbToHsl(hexToRgb(get()));
      set(rgbToHex(hslToRgb([h, s, parseFloat(light.value) / 100])));
      pick.value = hex.value = get();
      changed();
    });
    refreshers.push(sync);
    sync();
  };

  panel.addEventListener("change", (e) => {
    const el = e.target;
    if (el instanceof HTMLInputElement && (el.type === "range" || el.type === "color")) el.blur();
  });
  panel.addEventListener("pointerup", (e) => {
    const el = e.target;
    if (el instanceof HTMLInputElement && el.type === "range") el.blur();
  });

  // ---- header
  const title = document.createElement("div");
  title.innerHTML = "<b>Tuning</b> <small>(temporary &middot; K hides)</small>";
  panel.appendChild(title);
  const bar = document.createElement("div");
  bar.className = "bar";
  const btn = (text, fn) => {
    const b = document.createElement("button");
    b.textContent = text;
    b.addEventListener("click", fn);
    bar.appendChild(b);
    return b;
  };
  const themeBtns = {};
  for (const name of Object.keys(S.themes)) {
    themeBtns[name] = btn(`theme: ${name}`, () => (setThemeName(name), refreshAll()));
  }
  panel.appendChild(bar);

  // ---- view helpers, so the look can be tuned without any navigation
  section("View (no mouse navigation needed)");
  const nav = document.createElement("div");
  nav.className = "bar";
  panel.appendChild(nav);
  const navBtn = (text, fn) => {
    const b = document.createElement("button");
    b.textContent = text;
    b.addEventListener("click", () => (fn(), b.blur()));
    nav.appendChild(b);
    return b;
  };
  navBtn("3D view", () => view3D?.());
  for (const p of ["XY", "XZ", "YZ"]) navBtn(`Sketch ${p}`, () => sketchOn?.(p));
  const pins = [null, "XY", "XZ", "YZ"];
  let pinIdx = 0;
  const pinB = navBtn("Pin hover sheet: off", () => {
    pinIdx = (pinIdx + 1) % pins.length;
    pinB.textContent = `Pin hover sheet: ${pins[pinIdx] ?? "off"}`;
    pinHover?.(pins[pinIdx]);
  });
  let style = "hover";
  const styleB = navBtn("Pinned look: hover", () => {
    style = style === "hover" ? "selected" : "hover";
    styleB.textContent = `Pinned look: ${style}`;
    pinStyle?.(style);
  });
  let boxes = false;
  navBtn("Test boxes", () => {
    if (!boxes) (boxes = true), addTestBoxes?.();
  });
  const hintNav = document.createElement("small");
  hintNav.textContent = "In the 3D view the sheet shows only where the mouse hovers (or pin one here). Boxes show how the sheet looks over objects.";
  panel.appendChild(hintNav);

  // ---- colors (for the theme currently shown; D or the buttons above switch themes)
  section("Colors (current theme)");
  color("World / fog color", () => intToHex(theme().background), (h) => ((theme().background = hexToInt(h)), applyTheme()));
  color("Plane sheet fill", () => rgbToHex(theme().sheet), (h) => (theme().sheet = hexToRgb(h)));
  color("Grid lines", () => rgbToHex(theme().gridLine), (h) => (theme().gridLine = hexToRgb(h)));
  color("X axis", () => rgbToHex(theme().axisX), (h) => ((theme().axisX = hexToRgb(h)), applyTheme()));
  color("Y axis", () => rgbToHex(theme().axisY), (h) => ((theme().axisY = hexToRgb(h)), applyTheme()));
  color("Z axis", () => rgbToHex(theme().axisZ), (h) => ((theme().axisZ = hexToRgb(h)), applyTheme()));
  color("Status text", () => theme().text.length === 7 ? theme().text : "#aeb2b7", (h) => ((theme().text = h), applyTheme()));

  const st = (which) => theme().states[which];
  section("Selected plane (the sketch plane)");
  number("brightness (light it gives)", () => st("selected").bright, (v) => (st("selected").bright = v), 0, 1.2, 0.01);
  number("opacity (hides what is behind)", () => st("selected").opacity, (v) => (st("selected").opacity = v), 0, 1, 0.01);
  number("grid line opacity", () => st("selected").line, (v) => (st("selected").line = v), 0, 1, 0.01);
  number("fine grid level", () => st("selected").fine, (v) => (st("selected").fine = v), 0, 1, 0.01);
  section("Hovered plane (3D view preview)");
  number("brightness (light it gives)", () => st("hover").bright, (v) => (st("hover").bright = v), 0, 1.2, 0.01);
  number("opacity (hides what is behind)", () => st("hover").opacity, (v) => (st("hover").opacity = v), 0, 1, 0.01);
  number("grid line opacity", () => st("hover").line, (v) => (st("hover").line = v), 0, 1, 0.01);
  number("fine grid level", () => st("hover").fine, (v) => (st("hover").fine = v), 0, 1, 0.01);

  section("Backlight area (how far a sheet's light, grid and axes reach)");
  number("starts fading at", () => S.sheetArea.nearFactor, (v) => (S.sheetArea.nearFactor = v), 0, 4, 0.01);
  number("almost gone at", () => S.sheetArea.farFactor, (v) => (S.sheetArea.farFactor = v), 0.3, 10, 0.05);
  number("sharpness", () => S.sheetArea.sharpness, (v) => (S.sheetArea.sharpness = v), 0.2, 12, 0.1);
  number("axis lines reach", () => S.sheetArea.axisFarFactor, (v) => (S.sheetArea.axisFarFactor = v), 0.3, 20, 0.1);

  section("World fog (objects fade into the dark, behind the sheets)");
  number("starts at", () => S.fog.nearFactor, (v) => (S.fog.nearFactor = v), 0, 6, 0.01);
  number("fully fogged at", () => S.fog.farFactor, (v) => (S.fog.farFactor = v), 0.3, 12, 0.05);

  section("Reflection (sheets are slightly glossy)");
  number("sky sheen strength", () => S.reflect.sheen, (v) => (S.reflect.sheen = v), 0, 1, 0.01);
  number("object reflection strength", () => S.reflect.objects, (v) => (S.reflect.objects = v), 0, 1, 0.01);
  number("reflective straight on", () => S.reflect.base, (v) => (S.reflect.base = v), 0, 1, 0.01);
  number("glancing-angle sharpness", () => S.reflect.glancing, (v) => (S.reflect.glancing = v), 0.5, 8, 0.1);
  color("Sky: light (above)", () => rgbToHex(theme().skyHigh), (h) => (theme().skyHigh = hexToRgb(h)));
  color("Sky: dark (below)", () => rgbToHex(theme().skyLow), (h) => (theme().skyLow = hexToRgb(h)));

  section("Grid and axis lines");
  number("axis line width px", () => S.grid.axisWidthPx, (v) => (S.grid.axisWidthPx = v), 0.5, 6, 0.1);
  number("axis line opacity", () => S.grid.axisAlpha, (v) => (S.grid.axisAlpha = v), 0, 1, 0.01);
  number("fine level strength", () => S.grid.fineLineStrength, (v) => (S.grid.fineLineStrength = v), 0, 1, 0.01);
  number("min cell size px", () => S.grid.minCellPx, (v) => (S.grid.minCellPx = v), 1, 30, 0.5);
  number("grid density", () => S.grid.lodDivisor, (v) => (S.grid.lodDivisor = v), 3, 60, 0.5);

  section("Axis arrows and letters");
  number("arrow size px", () => S.axisArrow.sizePx, (v) => (S.axisArrow.sizePx = v), 6, 48, 1);
  number("distance on line", () => S.axisArrow.lengthFactor, (v) => (S.axisArrow.lengthFactor = v), 0.1, 1.6, 0.01);
  number("letter gap px", () => S.axisArrow.labelGapPx, (v) => (S.axisArrow.labelGapPx = v), 0, 40, 1);
  number("letter side px", () => S.axisArrow.labelSidePx, (v) => (S.axisArrow.labelSidePx = v), 0, 40, 1);

  section("View");
  number("field of view deg", () => S.view.fovDeg, (v) => (S.view.fovDeg = v), 10, 90, 1);
  number("glide time ms", () => S.view.transitionMs, (v) => (S.view.transitionMs = v), 0, 2000, 10);
  number("orbit speed", () => S.view.orbitRadPerPx, (v) => (S.view.orbitRadPerPx = v), 0.001, 0.02, 0.0005);
  number("zoom speed", () => S.view.zoomPerWheel, (v) => (S.view.zoomPerWheel = v), 0.0002, 0.006, 0.0001);

  // ---- output
  section("Exact values (copy and send back)");
  const bar2 = document.createElement("div");
  bar2.className = "bar";
  panel.appendChild(bar2);
  const copy = Object.assign(document.createElement("button"), { textContent: "Copy values" });
  const reset = Object.assign(document.createElement("button"), { textContent: "Reset to defaults" });
  bar2.append(copy, reset);
  out = document.createElement("textarea");
  out.readOnly = true;
  panel.appendChild(out);

  const num = (v) => (typeof v === "number" ? round(v, 4) : v);
  const rgbText = (c) => `[${c.map((x) => num(x)).join(", ")}]  // ${rgbToHex(c)}`;
  function format() {
    const lines = [`// cad-ui tuning (theme shown: ${getThemeName()}). Paste this back.`];
    for (const [name, t] of Object.entries(S.themes)) {
      lines.push(`theme "${name}":`);
      lines.push(`  background ${intToHex(t.background)}   text ${t.text}`);
      lines.push(`  sheet ${rgbText(t.sheet)}`);
      lines.push(`  gridLine ${rgbText(t.gridLine)}`);
      lines.push(`  axisX ${rgbText(t.axisX)}`);
      lines.push(`  axisY ${rgbText(t.axisY)}`);
      lines.push(`  axisZ ${rgbText(t.axisZ)}`);
      lines.push(`  skyHigh ${rgbText(t.skyHigh)}`);
      lines.push(`  skyLow ${rgbText(t.skyLow)}`);
      for (const w of ["selected", "hover"]) lines.push(`  ${w}: brightness ${num(t.states[w].bright)}  opacity ${num(t.states[w].opacity)}  gridLine ${num(t.states[w].line)}  fine ${num(t.states[w].fine)}`);
    }
    const sa = S.sheetArea;
    lines.push(`sheetArea (backlight area): near ${num(sa.nearFactor)}  far ${num(sa.farFactor)}  sharpness ${num(sa.sharpness)}  axisFar ${num(sa.axisFarFactor)}`);
    lines.push(`world fog (objects): near ${num(S.fog.nearFactor)}  far ${num(S.fog.farFactor)}`);
    const rf = S.reflect;
    lines.push(`reflection: sheen ${num(rf.sheen)}  objects ${num(rf.objects)}  straightOn ${num(rf.base)}  glancing ${num(rf.glancing)}`);
    const g = S.grid;
    lines.push(`grid: axisWidthPx ${num(g.axisWidthPx)}  axisAlpha ${num(g.axisAlpha)}  fineLineStrength ${num(g.fineLineStrength)}  minCellPx ${num(g.minCellPx)}  lodDivisor ${num(g.lodDivisor)}`);
    const a = S.axisArrow;
    lines.push(`axisArrow: sizePx ${num(a.sizePx)}  lengthFactor ${num(a.lengthFactor)}  labelGapPx ${num(a.labelGapPx)}  labelSidePx ${num(a.labelSidePx)}`);
    const v = S.view;
    lines.push(`view: fovDeg ${num(v.fovDeg)}  transitionMs ${num(v.transitionMs)}  orbitRadPerPx ${num(v.orbitRadPerPx)}  zoomPerWheel ${num(v.zoomPerWheel)}`);
    lines.push("", "// as JSON (for copying into settings.js):", JSON.stringify(tunable(), null, 1));
    return lines.join("\n");
  }

  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(out.value);
      copy.textContent = "Copied";
    } catch {
      out.focus();
      out.select();
      copy.textContent = "Selected: press Ctrl/Cmd+C";
    }
    setTimeout(() => (copy.textContent = "Copy values"), 1800);
  });
  reset.addEventListener("click", () => {
    merge(S, JSON.parse(JSON.stringify(defaults)));
    try {
      localStorage.removeItem(STORE);
    } catch {
      /* no storage */
    }
    setThemeName(defaults.themeName);
    refreshAll();
  });

  function refreshAll() {
    for (const [n, b] of Object.entries(themeBtns)) b.classList.toggle("on", n === getThemeName());
    refreshers.forEach((r) => r());
    applyTheme();
    out.value = format();
    requestRender();
  }
  // the 3D view sits beside the panel (not under it); K hides the panel and the view takes the whole window again
  const layout = () => {
    const shown = panel.style.display !== "none";
    document.getElementById("view").style.right = shown ? "340px" : "0";
    document.getElementById("view").style.width = shown ? "calc(100% - 340px)" : "100%";
    dispatchEvent(new Event("resize"));
  };
  addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key.toLowerCase() === "k") ((panel.style.display = panel.style.display === "none" ? "block" : "none"), layout());
  });
  refreshAll();
  layout();
}
