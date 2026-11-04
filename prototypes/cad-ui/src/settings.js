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
  grid: {
    lodDivisor: 14, // grid spacing is chosen so about this many major cells span the view
    fadeNearFactor: 0.5, // grid starts fading this many view-distances from the target...
    fadeFarFactor: 2.6, // ...and is gone at this many (a soft edge, so it reads as open space)
    extentFactor: 60, // size of the quad that carries the grid, in view-distances
    grazeMinCos: 0.03, // planes seen edge-on fade out below this and cannot be picked
    grazeFullCos: 0.3,
    lineAlpha: 0.3, // grid lines (sketch plane only)
    fineLineStrength: 0.4, // the finest grid level is this fraction as strong as the main one
    sheetAlpha: 0.22, // the hover sheet in the 3D overview: a finite square around the origin
    sheetBorderAlpha: 0.9,
    sheetHalfFactor: 0.3, // half the sheet side, as a fraction of the camera distance to the origin
    axisAlpha: 0.85,
    axisAlphaOthers: 0.5, // axis lines on planes that are not the sketch plane
    axisWidthPx: 1.6,
  },
  pick: { maxDistanceFactor: 6 }, // only pick where the plane is still visibly drawn
  gizmo: { sizePx: 96, padPx: 24, labelOffset: 1.2 },
  theme: {
    background: 0x15171b,
    axisX: [0.92, 0.35, 0.35],
    axisY: [0.4, 0.8, 0.45],
    axisZ: [0.4, 0.58, 1.0],
    tintXY: [0.4, 0.58, 1.0], // XY plane (normal = Z)
    tintXZ: [0.4, 0.8, 0.45], // XZ plane (normal = Y)
    tintYZ: [0.92, 0.35, 0.35], // YZ plane (normal = X)
  },
};
