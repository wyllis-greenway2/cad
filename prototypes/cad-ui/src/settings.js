// Every behavioral value lives here (prin_variable_over_hardcoded).
export const settings = {
  view: {
    fovDeg: 35,
    homeAzimuth: -Math.PI / 4, // radians around Z (0 = looking from +X, -PI/2 = from -Y)
    homeElevation: 0.6, // radians above the XY plane
    homeDistance: 120, // mm from the target
    orbitRadPerPx: 0.006,
    zoomPerWheel: 0.0015,
    minDistance: 0.5,
    maxDistance: 50000,
    transitionMs: 450, // camera move to a plane's normal view
    normalToleranceRad: 0.02, // within this of the plane's normal view counts as "normal"
    clickMovePx: 4, // pointer movement below this is a click, not a drag
    nearFactor: 0.02, // camera near plane as a fraction of distance
    farFactor: 120,
  },
  input: {
    // Left button = the tool (draw / select), never navigation. Navigation is a preset (dec_ui_conventions).
    navPreset: "ours",
    navPresets: {
      ours: { orbit: [{ button: 2 }], pan: [{ button: 1 }, { button: 2, shift: true }] }, // right-drag orbit, middle-drag pan
      fusion: { orbit: [{ button: 1, shift: true }], pan: [{ button: 1 }] },
      solidworks: { orbit: [{ button: 1 }], pan: [{ button: 1, ctrl: true }] },
      blender: { orbit: [{ button: 1 }], pan: [{ button: 1, shift: true }] },
    },
    zoomToCursor: true,
    pinchZoomPerWheel: 0.01, // trackpad pinch (a wheel event with ctrl held) is more sensitive than a wheel notch
    keys: {
      select: "v", line: "l", rect: "r", circle: "c", extrude: "e", dimension: "d", home: "h",
      undo: "mod+z", redo: ["mod+shift+z", "mod+y"],
      cancel: "escape", confirm: "enter", nextField: "tab", prevField: "shift+tab", delete: ["delete", "backspace"],
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
    lineWidthPx: 2.5,
    haloWidthPx: 6,
    markerPx: 5,
    snapSquarePx: 9,
    regionFill: 0.1,
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
    // World fog: planes keep their own color and fade INTO the world (the background) with distance from the CAMERA,
    // in multiples of the camera-to-target distance. The darkness of the "fog" is the world color itself.
    nearFactor: 0.5, // fully visible up to here (a face-on view is a spotlight that dims slightly toward the edges)...
    farFactor: 2.5, // ...and almost gone by here, with no hard end
    sharpness: 2.5, // how quickly it fades between near and far (higher = faster, still smooth)
    axisFarFactor: 2.5, // how far the axis lines reach (they fade with the same curve)
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
    // (3D view) or selected (sketch view); unselected, unhovered planes are not drawn. "fill" is the strength of the
    // backlight the sheet adds (screen-blended, so it is see-through).
    world: {
      // Values tuned by the human with the temporary tuning panel (in_025).
      background: 0x121212, text: "#aeb2b7",
      axisX: [0.92, 0.32, 0.3], axisY: [0.25, 0.72, 0.38], axisZ: [0.32, 0.52, 1.0],
      sheet: [0.9176470588235294, 0.8901960784313725, 0.8627450980392157], gridLine: [0.17, 0.18, 0.2],
      sketchInk: [0.09, 0.095, 0.105], sketchHalo: [0.95, 0.93, 0.9], // sketch lines: near-black with a light halo so they read on the lit sheet and on the dark world
      states: { base: { line: 0, fill: 0, fine: 0 }, hover: { line: 0.65, fill: 0.62, fine: 0.83 }, selected: { line: 0.49, fill: 0.6, fine: 1 } },
    },
  },
};
