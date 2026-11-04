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
  themeName: "world", // "world" (dark world, lit plane) | "paper" (the earlier light world) - press D to toggle
  themes: {
    // world = the background (and therefore the fog); sheet = the plane's fill color; gridLine = grid lines.
    // Only paper-gray and charcoal tones plus the world axis colors. states: what each plane looks like when hovered
    // (3D view) or selected (sketch view); unselected, unhovered planes are not drawn.
    world: {
      // Values tuned by the human with the temporary tuning panel (in_025).
      background: 0x121212, text: "#aeb2b7",
      axisX: [0.92, 0.32, 0.3], axisY: [0.25, 0.72, 0.38], axisZ: [0.32, 0.52, 1.0],
      sheet: [0.9176470588235294, 0.8901960784313725, 0.8627450980392157], gridLine: [0.17, 0.18, 0.2],
      states: { base: { line: 0, fill: 0, fine: 0 }, hover: { line: 0.65, fill: 0.75, fine: 0.83 }, selected: { line: 0.49, fill: 1, fine: 1 } },
    },
    paper: {
      background: 0xeeece6, text: "#625f58",
      axisX: [0.84, 0.25, 0.22], axisY: [0.16, 0.6, 0.3], axisZ: [0.22, 0.42, 0.9],
      sheet: [0.2, 0.21, 0.23], gridLine: [0.2, 0.21, 0.23],
      states: { base: { line: 0, fill: 0, fine: 0 }, hover: { line: 0.7, fill: 0.08, fine: 0.55 }, selected: { line: 0.85, fill: 0.05, fine: 1 } },
    },
  },
};
