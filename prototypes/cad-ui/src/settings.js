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
    lengthFactor: 0.7, // distance from the origin along the axis, as a fraction of the half-height of the view
    sizePx: 16, // arrowhead length on screen
    labelGapPx: 10, // letter offset beyond the arrowhead
    labelSidePx: 10, // ...and sideways, so the letter does not sit on the line
    hideCos: 0.96, // an axis pointing (almost) at or away from the camera has no visible length: hide its arrow
  },
  fog: {
    // Fog fades things by their distance from the CAMERA, in multiples of the camera-to-target distance.
    nearFactor: 0.9, // fully visible up to here (about the whole screen in a face-on view)...
    farFactor: 2.4, // ...and gone by here
    axisFarFactor: 5.0, // axis lines fade more slowly so orientation survives
    hazeMax: 0.85,
    hazeGrazeCos: 0.06, // the haze keeps its strength almost to edge-on, then drops to nothing (no hard far edge) // the fog also tints toward a dark charcoal with distance (max strength)...
    hazeFadeOutFactor: 12.0, // ...and only dissolves very far out (planes also fade to nothing as they are seen edge-on, so there is no hard edge)
  },
  grid: {
    lodDivisor: 14, // grid spacing is chosen so about this many major cells span the view
    minCellPx: 7, // a grid level fades out when its cells get smaller than this on screen (prevents moire)
    fineLineStrength: 0.65, // the finest grid level is this fraction as strong as the main one
    grazeMinCos: 0.03, // planes seen edge-on fade out below this and cannot be picked
    grazeFullCos: 0.3,
    axisWidthPx: 2.2, // world axis lines stay the heaviest lines in the scene
    axisAlpha: 0.85,
    extentFactor: 60, // size of the quad that carries a plane, in view-distances (fog hides its edge)
    // Plane states. Only the selected plane is shown (full grid); in 3D mode the hovered plane previews.
    // Unselected planes are hidden (set base.line/fill above 0 to bring them back as faint sheets).
    base: { line: 0, fill: 0, fine: 0 },
    hover: { line: 0.7, fill: 0.08, fine: 0.55 },
    selected: { line: 0.85, fill: 0.05, fine: 1 },
  },
  pick: { maxDistanceFactor: 2.4 }, // same as the fog's far edge: you cannot pick what you cannot see
  themeName: "light", // "light" | "dark" (press D in the view to toggle while trying them)
  themes: {
    // Paper gray and charcoal only (no blue). sheet = the plane's faint fill; gridLine = grid lines; fogColor = what far haze darkens
    // toward. The world axis colors (red, green, blue) are the only color in the scene.
    light: { background: 0xeeece6, text: "#625f58", axisX: [0.84, 0.25, 0.22], axisY: [0.16, 0.6, 0.3], axisZ: [0.22, 0.42, 0.9], sheet: [0.2, 0.21, 0.23], gridLine: [0.2, 0.21, 0.23], fogColor: [0.05, 0.05, 0.06] },
    dark: { background: 0x15171b, text: "#aab0bb", axisX: [0.92, 0.35, 0.35], axisY: [0.4, 0.8, 0.45], axisZ: [0.4, 0.58, 1.0], sheet: [0.8, 0.8, 0.8], gridLine: [0.74, 0.74, 0.76], fogColor: [0.0, 0.0, 0.0] },
  },
};
