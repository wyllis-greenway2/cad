// Every tunable number in one place (prin_variable_over_hardcoded). Values carried over from the old app are the ones the human had tuned by hand.
export const settings = {
  view: {
    fovDeg: 35, homeAzimuth: Math.PI / 4, homeElevation: 0.5, homeDistance: 120,
    orbitRadPerPx: 0.006, minDistance: 0.3, maxDistance: 5000,
    transitionMs: 450, // the move to a straight view
    perspectiveMs: 350, // how long perspective takes to come back after leaving a straight view
    leaveStraightPx: 60, // how far a drag must go to leave a straight view (so it is not left by accident)
    clickMovePx: 4, // pointer movement below this is a click, not a drag
    minMix: 0.02, // below this much perspective the view is as good as orthographic
  },
  input: {
    zoomPerWheel: 0.003, pinchZoomPerWheel: 0.01, trackpadPanScale: 0.3, maxZoomFactorPerSecond: 5,
    gameIdleMs: 700, flySpeed: 0.45, flyEaseSec: 0.15, flyLookScale: 0.25,
  },
  world: { axisLengthMm: 24, axisWidthPx: 1.6, paneGapMm: 3, paneMm: 8, paneRound: 0.18, paneOpacity: 0.18, paneActiveOpacity: 0.4, gridMm: 10, gridMajorEvery: 5, gridExtentMm: 2000 },
  theme: { background: 0xffffff, axis: 0x2b2b30, grid: 0x8a8d93, gridMajor: 0x5b5e66, teal: 0x1ab8b3, pane: 0x9aa0a8 },
};
