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
    nearFactor: 1.05, // fully visible up to here (about the whole screen in a face-on view)...
    farFactor: 3.2, // ...and gone by here
    axisFarFactor: 7.0, // axis lines fade more slowly so orientation survives
  },
  grid: {
    lodDivisor: 14, // grid spacing is chosen so about this many major cells span the view
    fineLineStrength: 0.4, // the finest grid level is this fraction as strong as the main one
    grazeMinCos: 0.03, // planes seen edge-on fade out below this and cannot be picked
    grazeFullCos: 0.3,
    axisWidthPx: 1.6,
    axisAlpha: 0.85,
    extentFactor: 60, // size of the quad that carries a plane, in view-distances (fog hides its edge)
    // Plane states. Everything is gray, or blue when selected; hover previews blue.
    base: { line: 0.09, fill: 0.01, fine: 0 }, // unselected: gray, main grid levels only
    hover: { line: 0.4, fill: 0.09, fine: 0.4 }, // under the cursor: blue preview
    selected: { line: 0.45, fill: 0.06, fine: 1 }, // the sketch plane: blue, full grid
  },
  pick: { maxDistanceFactor: 3.2 }, // same as the fog's far edge: you cannot pick what you cannot see
  gizmo: { sizePx: 96, padPx: 24, labelOffset: 1.2 },
  theme: {
    background: 0x15171b,
    axisX: [0.92, 0.35, 0.35],
    axisY: [0.4, 0.8, 0.45],
    axisZ: [0.4, 0.58, 1.0],
    gray: [0.82, 0.82, 0.82], // very light gray grid on unselected planes
    blue: [0.36, 0.56, 1.0], // selected (and hovered) planes
  },
};
