// Every behavioral value lives here (prin_variable_over_hardcoded).
export const settings = {
  view: {
    fovDeg: 35,
    homeAzimuth: -Math.PI / 4, // radians around Z (0 = looking from +X, -PI/2 = from -Y)
    homeElevation: 0.6, // radians above the XY plane
    homeDistance: 120, // mm from the target
    orbitRadPerPx: 0.006,
    zoomPerWheel: 0.0015,
    minDistance: 3, // mm from the target; closer than this is just a blur
    maxDistance: 5000,
    transitionMs: 450, // camera move to a plane's normal view
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
    maxZoomFactorPerSecond: 2.5, // one gesture can never zoom faster than this, however hard you flick or spin the wheel
    pinchZoomPerWheel: 0.01, // trackpad pinch (a wheel event with ctrl held) is more sensitive than a wheel notch
    keys: {
      select: "v", line: "l", rect: "r", circle: "c", extrude: "e", dimension: "d", home: "h",
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
    lineWidthPx: 1.3, // sketch lines: a thin dark line traced with a thin light one, so they stay readable on any background
    haloWidthPx: 3.2,
    markerPx: 5,
    snapSquarePx: 9,
    regionFill: 0.92, // closed sketch shapes are faces with no thickness: light cream
    regionHoverBlue: 0.25, // a face under the cursor (extrude tool) leans this much blue
    lineBlue: 0.6, // sketch lines on a hovered or selected plane lean this much blue
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
      sheet: [0.9529411764705882, 0.9411764705882353, 0.9058823529411765], gridLine: [0.17, 0.18, 0.2], // sheet #f3f0e7, grid #2b2e33
      blueSurface: [0.5, 0.66, 1.0], blueLine: [0.1, 0.22, 0.55], blueInk: [0.05, 0.12, 0.32], blueHalo: [0.82, 0.9, 1.0], // the slight blue shade on a hovered or selected plane
      bodyColor: 0x8fa3b8, bodyEdge: 0x1c2733, addColor: 0x5fbf7a, cutColor: 0xe0645c, handleColor: 0xf2c14e,
      sketchInk: [0.09, 0.095, 0.105], sketchHalo: [0.95, 0.93, 0.9], // sketch lines: near-black with a light halo so they read on the lit sheet and on the dark world
      states: {
        // blue = how much the hovered / selected plane's surface and lines lean blue (0 = none)
        base: { line: 0, bright: 0, opacity: 0, fine: 0, blue: 0 },
        hover: { line: 0.5, bright: 1.2, opacity: 0.5, fine: 0.5, blue: 0.08 },
        selected: { line: 0.5, bright: 1.2, opacity: 0.5, fine: 0.5, blue: 0.08 },
      },
    },
  },
};
