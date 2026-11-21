// Every tunable number in one place. The look's numbers are the prototype's, which the human tuned by hand (in_024, in_025, in_031); they are carried over verbatim.
export const settings = {
  view: {
    fovDeg: 35, homeAzimuth: Math.PI / 4, homeElevation: 0.5, homeDistance: 120, // home: from the +X +Y corner, a little above
    orbitRadPerPx: 0.006,
    minSurfaceMm: 0.3, // zooming toward a surface by the wheel's exact steps goes on until it is this near, and the next step goes through it
    maxDistanceMm: 5000, // the eye does not go farther from the origin than this
    minFlightMm: 20, // a step of flight or of the wheel is never less than this, however near the eye is to the middle of a thing
    transitionMs: 450, // the move to a straight view
    perspectiveMs: 350, // the perspective coming back after a straight view is left
    leaveStraightPx: 60, // how far a drag must go to leave a straight view
    clickMovePx: 4,
    minStraightLens: 0.00005, // a straight view zoomed in shuts the lens down to this, so the eye need not come near
    straightLens: 0.02, // how much perspective a straight view has left: as good as none
    normalToleranceRad: 0.02,
  },
  input: {
    zoomPerWheel: 0.0015, pinchZoomPerWheel: 0.005, trackpadPanScale: 0.3,
    fineGain: 0.6, fineFadePx: 6, // the smallest mouse movements turn the view by this much of what they would, rising to all of it over about this many pixels (in_420)
    multiClickPx: 6, multiClickMs: 400,
    flySpeed: 0.45, flyEaseSec: 0.15, flyLookSec: 0.06, flyLookScale: 0.25,
  },
  world: { axisLengthMm: 24, arrowRadiusMm: 0.4, arrowLengthMm: 1.5, paneGapMm: 3, paneMm: 8, paneRound: 0.18, paneOpacity: 0.18, paneActiveOpacity: 0.4, paneFadeMs: 250 },
  orb: { radius: 0.025, hoverOpacity: 0.14, color: [0.1, 0.72, 0.7] as [number, number, number] }, // the hover disc: its radius in depths of the surface it is on
  buttons: { marginPx: 18, sizePx: 34 },
  theme: {
    background: 0xffffff,
    axis: [0.17, 0.17, 0.19] as [number, number, number], // charcoal, like a pencil
    pane: [0.55, 0.58, 0.64] as [number, number, number], // the little pane of a world plane that is off
    grid: [0.62, 0.63, 0.67] as [number, number, number], minorAlpha: 0.35, majorAlpha: 0.7,
    bodyColor: 0xc9c9cd, bodyEdge: 0x2a2a2d,
  },
};
