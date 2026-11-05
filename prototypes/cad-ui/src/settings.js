// Every behavioral value lives here (prin_variable_over_hardcoded).
export const settings = {
  view: {
    fovDeg: 35,
    homeAzimuth: -Math.PI / 4, // radians around Z (0 = looking from +X, -PI/2 = from -Y)
    homeElevation: 0.6, // radians above the XY plane
    homeDistance: 120, // mm from the target
    orbitRadPerPx: 0.006,
    zoomPerWheel: 0.003,
    minDistance: 3, // mm from the target; closer than this is just a blur
    maxDistance: 5000,
    transitionMs: 450, // camera move to a plane's normal view
    drawMinFacing: 0.3, // choosing a drawing tool on a surface keeps the camera where it is, unless the surface is seen more edge-on than this (0 = edge-on, 1 = square on)
    normalToleranceRad: 0.02, // within this of the plane's normal view counts as "normal"
    clickMovePx: 4, // pointer movement below this is a click, not a drag
    nearFactor: 0.02, // camera near plane as a fraction of distance
    farFactor: 120,
    originLostFog: 0.3, // the origin counts as lost when its axis fog strength falls below this...
    originFarFactor: 1.0, // ...or when it is off screen and the target is this many view-distances away
    extremeNear: 8, // zoomed closer than this (mm) offers a reset, like a lost origin
    extremeFar: 2500, // ...or farther than this
    originMinDistance: 30, // returning to the origin also brings the view distance into [min, max] mm
    originMaxDistance: 600,
  },
  input: {
    // Left button = the tool (draw / select), never navigation. Navigation is a preset (dec_ui_conventions).
    navPreset: "ours",
    navPresets: {
      ours: { orbit: [{ button: 2 }, { button: 0, alt: true }], pan: [{ button: 1 }, { button: 2, shift: true }, { button: 0, alt: true, shift: true }] }, // right-drag (or Alt+left-drag) orbit, middle-drag pan; plain left-drag also orbits when the left button has nothing else to do
      fusion: { orbit: [{ button: 1, shift: true }], pan: [{ button: 1 }] },
      solidworks: { orbit: [{ button: 1 }], pan: [{ button: 1, ctrl: true }] },
      blender: { orbit: [{ button: 1 }], pan: [{ button: 1, shift: true }] },
    },
    zoomToCursor: true, // zoom IN toward the point under the cursor; zoom OUT is about the view center (no runaway)
    zoomAnchorMaxFactor: 1.5, // zoom toward plane points within this many view-distances of the target; farther ones use the camera-facing plane
    maxZoomFactorPerSecond: 5, // one gesture can never zoom faster than this, however hard you flick or spin the wheel
    pinchZoomPerWheel: 0.01, // trackpad pinch (a wheel event with ctrl held) is more sensitive than a wheel notch
    keys: {
      // constraint hotkeys (sketch select tool): Shift + the first letter of the constraint
      select: "v", line: "l", rect: "r", circle: "c", extrude: "e", sketch: "s", move: "m", rotate: "r", scale: "k", faceOn: "n", fillet: "f", chamfer: "b", consH: "shift+h", consV: "shift+v", consE: "shift+e", consL: "shift+l", consP: "shift+p", consF: "shift+f", consC: "shift+c", dimension: "d", home: "h",
      undo: "mod+z", redo: ["mod+shift+z", "mod+y"],
      origin: "o", cancel: "escape", confirm: "enter", nextField: "tab", prevField: "shift+tab", delete: ["delete", "backspace"],
    },
  },
  sketch: {
    // snapping and drawing feel (distances in SCREEN pixels so they feel the same at any zoom)
    enabled: true,
    thresholdPx: 12,
    inference: true, // horizontal / vertical alignment with existing points
    gridEnabled: false,
    gridStepMm: 1,
    roundMm: 0.01, // free-placed points are rounded to this, so dimensions read 40.00 and not 39.999999
    selectTolPx: 8,
    dragFinishPx: 8, // press-and-drag creates a rectangle or circle if you release farther than this
    pickWidthPx: 2.2, // a picked line or circle in the sketch view, in blue
    pickHoverWidthPx: 1.7, // ...and the one under the cursor
    relatedColor: 0xe8962e, // what a clicked constraint relates to (the other line, corner or circle)
    pickPointScale: 1.25, // a picked corner's dot, relative to the normal corner marker
    lineWidthPx: 1.0, // sketch lines: thin and black (`in_037`)
    haloWidthPx: 0, // a light line traced along them (0 = none); used to be 3.2
    markerPx: 5,
    snapSquarePx: 9,
    regionFill: 0.5, // closed sketch shapes that are not extruded are faces with no thickness: bone colored and semi-transparent
    regionSelectBlue: 0.6, // a selected closed shape stays this blue until deselected
    regionHoverBlue: 0.25, // a face under the cursor (extrude tool) leans this much blue
    lineBlue: 0, // sketch lines on a hovered or selected plane lean this much blue (0 = pure black)
    dimOffsetPx: 22, // dimension lines sit this far (screen px) from the shape
    dimLabelHitPx: 20, // a click this close to a dimension number edits it
    dimLineWidthPx: 1.6,
  },
  extrude: {
    // Pull a closed shape along the plane's normal: positive adds, negative cuts (when there is a body to cut).
    dragStepMm: 1, // dragging rounds the distance to this (hold Shift for fine steps)
    fineStepMm: 0.01,
    minMm: 0.01, // a distance smaller than this is "no change"
    handleFactor: 0.14, // arrow size as a fraction of the view distance
    tiltMs: 450, // the view tilts from face-on to a 3D angle when you start pulling
    tessTolerance: 0.05, // mesh quality (mm)
    tessAngular: 0.3,
    edgeAngleDeg: 30, // outline edges are drawn where faces meet at more than this angle
    ghostOpacity: 0.35, // the instant preview prism, shown until the exact result arrives
  },
  axisArrow: {
    // Arrowheads and letters sit ON the world axis lines (positive end); no separate corner gizmo.
    lengthFactor: 0.83, // distance from the origin along the axis, as a fraction of the half-height of the view
    sizePx: 15, // arrowhead length on screen
    labelGapPx: 13, // letter offset beyond the arrowhead
    labelSidePx: 10, // ...and sideways, so the letter does not sit on the line
    faintOpacity: 0.22, // arrow and letter behind an object
    hideCos: 0.96, // an axis pointing (almost) at or away from the camera has no visible length: hide its arrow
  },
  fog: {
    // WORLD fog: objects in the scene (everything that is not a sheet) fade into the dark world with distance from the camera,
    // in multiples of the camera-to-target distance. Because the sheets are see-through, this is the fog "behind" a sheet.
    nearFactor: 0.5,
    farFactor: 2.5,
  },
  sheetArea: {
    // BACKLIGHT AREA: how far a sheet's own light, its grid and the axis lines reach from where you are looking (same
    // distance units). Independent of the world fog above.
    nearFactor: 0.5, // full strength up to here...
    farFactor: 2.5, // ...almost gone by here, with no hard end
    sharpness: 2.5, // how quickly it fades between near and far (higher = faster, still smooth)
    axisFarFactor: 2.5, // how far the axis lines reach (they fade with the same curve)
  },
  transform: {
    // Move, rotate or scale a whole body (select it with a double-click, then M, R or K).
    moveStep: 1, moveFineStep: 0.01, minMoveMm: 0.01,
    rotateStep: 1, rotateFineStep: 0.1, minRotateDeg: 0.01, rotateDegPerPx: 0.5,
    scaleStep: 0.01, scaleFineStep: 0.001, scalePerPx: 0.004,
    sizeStep: 0.1, sizeFineStep: 0.01, // fillet, chamfer and radius sizes (mm)
  },
  pick: {
    edgeWidthPx: 2.4, // a selected line in the 3D view
    edgeHoverWidthPx: 1.8,
    vertexPx: 10, // pointing within this many pixels of a corner selects the corner
    edgePx: 6, // ...or of a line selects the line
    vertexScale: 0.0042, // size of the corner dot, in view distances
  },
  light: {
    // Lights ride with the camera (to one side and above, never in view); the body has a slight clear-coat sheen, not real reflection.
    key: 1.7, fill: 0.12, ambient: 0.42,
    keyRight: -0.7, keyUp: 0.9, // key light position in view distances: right (negative = left) and up of the camera
    roughness: 0.6, // the surface itself (lower = shinier)
    sheen: 0.22, // clear-coat strength: the sheen (0 = matt)
    sheenRoughness: 0.55, // lower = a tighter, shinier highlight; higher = a broad, soft one
    reflect: 0.3, // how strongly a soft studio environment is reflected in the surface (0 = none)
    faceHoverOpacity: 0.3, // blue shade on a face under the cursor
    faceSelectOpacity: 0.6, // ...and on the selected face
  },
  backdrop: {
    // World view option: the plane itself is almost see-through, and the cream sheet is a SEPARATE sheet a little behind it (away from
    // the camera). That sheet is drawn first and the scene is drawn over it, so it can never cover an object. enabled: false = the
    // older look (one sheet with brightness and opacity, drawn over objects).
    enabled: true,
    offsetFactor: 0.15, // how far behind the plane, in view distances
    alpha: 1.0, // how solid the cream sheet is
    planeOpacity: 0.06, // how much of a veil the plane itself has
    fogScale: 0.35, // the cream sheet fades into the dark world this much as fast as the grid does (lower = stays cream farther out)
  },
  grid: {
    lodDivisor: 8, // grid spacing is chosen so about this many major cells span the view
    minCellPx: 4, // a grid level fades out when its cells get smaller than this on screen (prevents moire)
    fineLineStrength: 0.65, // the finest grid level is this fraction as strong as the main one
    grazeMinCos: 0.03, // a plane seen this nearly edge-on cannot be picked (the ray is almost parallel to it)
    axisWidthPx: 2.2, // world axis lines stay the heaviest lines in the scene
    axisAlpha: 0.85,
    axisGhost: 0.22, // axis lines behind an object show through at this strength
    extentFactor: 60, // size of the quad that carries a plane, in view-distances (fog hides its edge)
  },
  themeName: "world", // dark world, backlit plane (the paper theme was dropped: D now means dimension)
  themes: {
    // world = the background (and therefore the fog); sheet = the plane's fill color; gridLine = grid lines.
    // Only paper-gray and charcoal tones plus the world axis colors. states: what each plane looks like when hovered
    // (3D view) or selected (sketch view); unselected, unhovered planes are not drawn. "bright" is how much light the sheet gives off (screen-blended: it brightens what is behind
    // without clipping to white, 0..1); "opacity" is how much it hides what is behind it with the sheet color (0 = fully
    // see-through). The two are independent.
    world: {
      // Values tuned by the human with the temporary tuning panel (in_025, in_031).
      background: 0x242424, text: "#aeb2b7",
      axisX: [0.92, 0.32, 0.3], axisY: [0.25, 0.72, 0.38], axisZ: [0.32, 0.52, 1.0],
      sheet: [0.8, 0.7765, 0.7176], gridLine: [0.17, 0.18, 0.2], // sheet and bone-colored faces and bodies #e3dccb (`in_036`: slightly darker than the earlier cream #f3f0e7), grid #2b2e33
      blueSurface: [0.5, 0.66, 1.0], blueLine: [0.1, 0.22, 0.55], blueInk: [0.05, 0.12, 0.32], blueHalo: [0.82, 0.9, 1.0], // the slight blue shade on a hovered or selected plane
      bodyColor: 0xf9f6ee, bodyEdge: 0x3a352c, addColor: 0x5fbf7a, cutColor: 0xe0645c, handleColor: 0xf2c14e, // body color: objects and cream faces, lighter than the sheet (`in_037`)
      sketchInk: [0.0, 0.0, 0.0], sketchHalo: [0.95, 0.93, 0.9], // sketch lines: near-black with a light halo so they read on the lit sheet and on the dark world
      states: {
        // blue = how much the hovered / selected plane's surface and lines lean blue (0 = none)
        base: { line: 0, bright: 0, opacity: 0, fine: 0, blue: 0 },
        hover: { line: 0.5, bright: 1.2, opacity: 0.5, fine: 0.5, blue: 0.08 },
        selected: { line: 0.5, bright: 1.2, opacity: 0.5, fine: 0.5, blue: 0.08 },
      },
    },
  },
};

// ---- TEMPORARY visual styles to try (`in_064`): the style switcher at the top right picks one. "sheets" = the world as it was; "panes" = a blank world with only
// the axis lines, three small translucent panes at the origin to pick a plane, and a faint grid that fades in on the plane you sketch on.
settings.styles = {
  current: { label: "Current (sheets)", theme: "world", mode: "sheets" },
  panesDark: { label: "Panes, dark", theme: "panesDark", mode: "panes" },
  panesLight: { label: "Panes, light", theme: "panesLight", mode: "panes" },
  blueprint: { label: "Panes, blueprint", theme: "blueprint", mode: "panes" },
};
settings.styleName = "current";
settings.panes = {
  size: 0.2, // a pane is a square this many view-distances wide, in the corner of the + axes
  opacity: 0.16, hoverOpacity: 0.38, // the pane fill
  edgeAlpha: 0.55, hoverEdgeAlpha: 1, // its outline
  hoverBlue: 0.45, // how much a hovered pane leans blue
  sketchGrid: 0.42, fine: 0.5, // the faint grid on the plane being sketched on, and its finest level
  fadeRadius: 1.15, fadeEase: 0.22, // the grid fades out this many view-distances from the view centre; it fades in over a few frames
};
const base = settings.themes.world;
settings.themes.panesDark = { ...base, background: 0x1b1c1e, gridLine: [0.55, 0.58, 0.64], sheet: [0.8, 0.84, 0.92] };
settings.themes.panesLight = {
  ...base, background: 0xe8e6e1, text: "#3a3d42",
  axisX: [0.82, 0.22, 0.2], axisY: [0.2, 0.58, 0.28], axisZ: [0.22, 0.4, 0.88],
  sheet: [0.38, 0.5, 0.72], gridLine: [0.45, 0.48, 0.54], blueSurface: [0.2, 0.4, 0.9], blueLine: [0.1, 0.25, 0.7],
  bodyColor: 0xfbfaf6, bodyEdge: 0x2f2b24,
};
settings.themes.blueprint = {
  ...base, background: 0x10243b, text: "#9fb6d4",
  axisX: [1.0, 0.45, 0.4], axisY: [0.4, 0.9, 0.55], axisZ: [0.45, 0.65, 1.0],
  sheet: [0.45, 0.7, 1.0], gridLine: [0.5, 0.7, 1.0], blueSurface: [0.7, 0.85, 1.0], blueLine: [0.6, 0.8, 1.0],
  bodyColor: 0xdfeaf7, bodyEdge: 0x10243b,
};
