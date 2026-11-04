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
  fog: {
    // Fog fades things by their distance from the CAMERA, in multiples of the camera-to-target distance.
    nearFactor: 0.9, // fully visible up to here (about the whole screen in a face-on view)...
    farFactor: 2.4, // ...and gone by here
    axisFarFactor: 5.0, // axis lines fade more slowly so orientation survives
  },
  grid: {
    lodDivisor: 14, // grid spacing is chosen so about this many major cells span the view
    fineLineStrength: 0.4, // the finest grid level is this fraction as strong as the main one
    grazeMinCos: 0.03, // planes seen edge-on fade out below this and cannot be picked
    grazeFullCos: 0.3,
    axisWidthPx: 1.6,
    axisAlpha: 0.85,
    extentFactor: 60, // size of the quad that carries a plane, in view-distances (fog hides its edge)
    // Plane states. Only the selected plane is shown (blue, full grid); in 3D mode the hovered plane previews.
    // Unselected planes are hidden (set base.line/fill above 0 to bring them back as faint sheets).
    base: { line: 0, fill: 0, fine: 0 },
    hover: { line: 0.4, fill: 0.09, fine: 0.4 },
    selected: { line: 0.5, fill: 0.06, fine: 1 },
  },
  pick: { maxDistanceFactor: 2.4 }, // same as the fog's far edge: you cannot pick what you cannot see
  gizmo: { sizePx: 96, padPx: 24, labelOffset: 1.2 },
  themeName: "light", // "light" | "dark" (press D in the view to toggle while trying them)
  themes: {
    light: { background: 0xf4f5f7, text: "#5a6270", axisX: [0.86, 0.22, 0.22], axisY: [0.14, 0.62, 0.27], axisZ: [0.2, 0.42, 0.95], blue: [0.16, 0.4, 0.88] },
    dark: { background: 0x15171b, text: "#aab0bb", axisX: [0.92, 0.35, 0.35], axisY: [0.4, 0.8, 0.45], axisZ: [0.4, 0.58, 1.0], blue: [0.36, 0.56, 1.0] },
  },
};
