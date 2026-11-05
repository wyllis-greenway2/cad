// Every behavioural and look value lives here (`prin_variable_over_hardcoded`). The tuned values are the human's: copied from the prototype's settings, not changed.
export const settings = {
  view: {
    fovDeg: 35,
    homeAzimuth: Math.PI / 4, // radians around Z (0 = looking from +X); PI/4 = from the +X +Y corner (`in_069`)
    homeElevation: 0.5, // radians above the XY plane
    homeDistance: 120, // mm from the target
    orbitRadPerPx: 0.006,
    zoomPerWheel: 0.003,
    minDistance: 3,
    maxDistance: 5000,
    transitionMs: 450, // camera move to a plane's normal view
    normalToleranceRad: 0.02,
    clickMovePx: 4, // pointer movement below this is a click, not a drag
    nearFactor: 0.02,
    farFactor: 120,
  },
  pick: { pointPx: 10, linePx: 8 }, // pointing within this many pixels of a corner / a line picks it (the prototype used 10 and 6 to 8)
  orb: {
    radius: 0.025, // the hover ring's radius, in view-distances (`in_075`)
    ringPx: 1.6,
    ringOpacity: 1,
    selectOpacity: 0.3,
    color: [0.1, 0.72, 0.7] as [number, number, number], // THE teal: kept for use elsewhere (`in_075`)
    fillMs: 520,
    reachFactor: 1.04,
    softFactor: 2.2,
  },
  theme: {
    background: 0xffffff,
    axis: [0.17, 0.17, 0.19] as [number, number, number], // charcoal, like a pencil
    sheet: [0.5, 0.51, 0.54] as [number, number, number], // a pane's fill
    bodyColor: 0xcdcdd0,
    bodyEdge: 0x2a2a2d,
    sketchInk: 0x000000,
  },
  panes: { opacity: 0.16, hoverOpacity: 0.38 },
  light: { key: 1.7, fill: 0.12, ambient: 0.42 },
};
