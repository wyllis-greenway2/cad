// Every tunable number in one place. The look's numbers are the prototype's, which the human tuned by hand (in_024, in_025, in_031); they are
// carried over verbatim.
export const settings = {
  view: {
    fovDeg: 35,
    homeAzimuth: Math.PI / 4,
    homeElevation: 0.5,
    homeDistance: 120, // home: from the +X +Y corner, a little above
    orbitRadPerPx: 0.006,
    minSurfaceMm: 0.3, // zooming toward a surface by the wheel's exact steps goes on until it is this near, and the next step goes through it
    maxDistanceMm: 5000, // the eye does not go farther from the origin than this
    minFlightMm: 20, // a step of flight or of the wheel is never less than this, however near the eye is to the middle of a thing
    transitionMs: 450, // the move to a straight view
    perspectiveMs: 350, // the perspective coming back after a straight view is left
    leaveStraightPx: 60, // how far a drag must go to leave a straight view
    clickMovePx: 4,
    morphLens: 0.01, // while the view changes between perspective and orthographic the lens goes to this and the picture is handed over to the orthographic camera (they look the same here to within a fraction of a percent)
    minOrthoMm: 0.05, // an orthographic view is not made smaller than this tall
    normalToleranceRad: 0.02,
    minChangeMs: 60, // a change of view that the hands interrupt takes at least this long to bring the perspective back
    facingFrom: 0.6, // how much along an axis the view must be (as a share) before that axis's button starts to take on the teal
    nearShare: 0.02,
    farShare: 120, // the picture's near and far planes, as shares of the scale of what the eye is among
    gazeWindow: 0.3,
    gazeFloor: 0.001, // what is looked at: things count by how big they look, fading with their distance from the middle of the screen over this share of the view's height; the floor keeps a lone thing at the edge from counting for nothing
    visiblePx: 6, // a thing smaller than this on the screen is not in view
  },
  input: {
    zoomPerWheel: 0.0015,
    pinchZoomPerWheel: 0.005, // (a trackpad's pinch comes as a wheel with the control key: the zoom is this much of its delta)
    trackpadPanScale: 0.3,
    trackpadLookScale: 1, // how far a trackpad's two-finger scroll pans, as a share of the scroll (set by hand, `in_303`)
    trackpadNatural: true, // a scroll goes the way the fingers do (natural scrolling) unless the system says otherwise
    scrollStreamMs: 160, // wheel events within this long of each other are one gesture, whose kind (scroll or notch) the first decides
    fineGain: 0.6,
    fineFadePx: 6, // the smallest mouse movements turn the view by this much of what they would, rising to all of it over about this many pixels (in_420)
    multiClickPx: 6,
    multiClickMs: 400,
    zoomStepClamp: [0.2, 5] as [number, number], // one wheel event never zooms by more than this share either way
    touchSlopPx: 12, // a touch must move this far to be a drag
    wheelLinePx: 33,
    wheelNotchMin: 50, // a wheel event counted in lines is this many pixels each; a whole step of at least this many pixels is a wheel's notch (not a trackpad's scroll)
    flySpeed: 0.45,
    flyEaseSec: 0.15,
    flyLookSec: 0.06,
    flyLookScale: 0.25,
  },
  world: {
    axisLengthMm: 24,
    arrowRadiusMm: 0.4,
    arrowLengthMm: 1.5,
    letterGapMm: 6,
    letterFacing: 0.98, // (the letter of an axis the view looks along (within this share of it) is not drawn)
    paneGapMm: 3,
    paneMm: 8,
    paneRound: 0.18,
    paneOpacity: 0.18,
    paneActiveOpacity: 0.4,
    paneHoverBoost: 0.3,
    paneHoverMax: 0.75,
    paneLineHot: 0.9,
    paneLineCool: 0.5,
    paneFadeLens: 0.5,
    paneUsableLevel: 0.5, // the panes fade out as the lens goes from 1 to this, and cannot be clicked below this much of them
    gizmoEaseRate: 6, // the axes' scale eases over to scale free at this rate (per second)
    gridCells: 6, // the grid's spacing is the power of ten that gives about this many cells between the eye and the plane
    fogNear: 0.6,
    fogFar: 4,
    fogMinSteps: 12,
    gridSpanFog: 5,
    orthoSpan: 4, // the fog's reach, as shares of the distance; the grid is drawn out to a multiple of it (of the picture's height, orthographic)
    arrowSegments: 12,
    discSegments: 48,
    paneCurveSteps: 6,
  },
  // the old app's light (`app/src/shared/settings.ts`): it rides with the camera, to one side and above it, and the body has a slight clear coat; ambient is multiplied by pi where it is used
  light: { ambient: 0.42, key: 1.7, fill: 0.12, roughness: 0.4, sheen: 0.55, sheenRoughness: 0.25 },
  orb: { radius: 0.025, hoverOpacity: 0.14, color: [0.1, 0.72, 0.7] as [number, number, number] }, // the hover disc: its radius in depths of the surface it is on
  // the cut of a sketch plane: the face where it cuts a body is solid with hatching
  cut: {
    face: [0.72, 0.74, 0.79] as [number, number, number],
    hatch: [0.5, 0.52, 0.58] as [number, number, number],
    hatchMm: 2.5,
    hatchWidth: 0.05,
    capMm: 10000,
  },
  // sketching: how near the pointer must be to stick to a place, the cursor's cross, the lines' width, a circle's segments
  sketch: {
    snapPx: 10,
    crossPx: 7,
    widthPx: 2,
    circleSegments: 64,
    ballPx: 4.5 /* (a picked point's ball: its radius) */,
    arrowGapPx: 5 /* (every arrow's tip stops this far short of what it points at, `in_1672`) */,
    arrowHeadPx: 8 /* (the length of an arrow's open tip) */,
  },
  // the helpers of drawing (`dec_helpers_one_rule`): how near a relation must be to hold to be offered or helped, `reachPx` for one that says a point (and for every offer, `dec_offer_rank`), `linePx` for one that says a line (px), how far past its ends a guide runs and the steps it is traced in (px), the guide's dash (the old app's: this much of the view's distance; the gap is this much of the dash)
  helpers: { reachPx: 12, linePx: 6, overPx: 12, stepPx: 6, dash: 0.012, dashGap: 0.7 },
  // a sketch plane placed anywhere, and the right-click ring
  planes: { snapAxisRad: 0.14, ringButtonPx: 36 }, // (a sketch plane made facing the camera snaps to a world axis within this)
  // the mover orb (`app/src/shared/settings.ts` gizmo): its size as a share of the view distance, how near the pointer must be to take a handle, and how its lines look
  // the marks of a sketch (`dec_marks_on_things`): how long a constraint offered for a part just made or moved stays when nothing is selected, how long it fades (ms), how long a constraint doing work in a drag takes to fade in (ms), how far a press on a mark must move before it is a drag (px), how near on the page marks stand to be one pill, and the gap between a mark and the part it stands on (it stands on it: its lower edge touches the part, so the part can still be pressed)
  marks: { stayMs: 4000, fadeMs: 700, fadeInMs: 180, dragPx: 4 },
  // a pull arrow is dragged by the pointer's movement along the arrow as it looks on the screen; an arrow pointing nearly at the camera looks short, so a movement is counted as no more than this share of the screen's mm to the pixel (else a small movement is a huge pull)
  pull: { minGain: 0.5 },
  mover: {
    sizeOfView: 0.11,
    hitPx: 12,
    opacity: 0.6,
    widthPx: 2.2,
    headScale: 0.7,
    arrowShare: 0.6,
    gapShare: 0.09,
    extraGap: 0.12,
    extraShare: 0.4,
    stemShare: 0.85,
    turnShare: 0.33,
    turnStartDeg: 40,
    turnSpanDeg: 280,
    arcSegments: 48,
  }, // (the orb: its size, how near the pointer must be, the lines; the curved arrow: a stem of this share of the straight arrow, then an open circle of this radius, from this angle and this far round)
  buttons: { marginPx: 18, sizePx: 34 },
  ui: {
    font: "system-ui,sans-serif",
    text: "#2b2b2d",
    textRgb: [43, 43, 45],
    whiteRgb: [255, 255, 255],
    tealRgb: [26, 184, 179],
    buttonBorderRgb: [207, 208, 212],
    ringBorder: "#9a9ea6",
    ringPx: 2,
    borderPx: 1,
    buttonGapPx: 4, // the button of the plane that is on has a border this thick and this gray
    pill: "#34363b",
    pillText: "#fff",
    orbDot: "rgba(60,62,68,.55)",
    orbDotBorder: "rgba(255,255,255,.7)",
    orbHotBorder: "#8a8f98",
    orbPx: 12,
    orbHotPx: 26,
    offscreenMarginPx: 20, // a letter or the dot this far off the screen is still drawn
  },
  // the three looks of a body (`dec_view_looks`, `q_lean_ui`): Solid, See-through, and a mark laid over either; colours as the prototype had them
  looks: {
    solid: { color: 0xc9c9cd, edge: 0x2a2a2d, opacity: 1 },
    seeThrough: { color: 0x14161a, edge: 0x14161a, opacity: 0.14, edgeOpacity: 0.5 },
    marks: {
      pick: { color: 0x1ab8b3, strength: 0.55 },
      clash: { color: 0xe46a6a, strength: 0.7 },
      tie: { color: 0xf2c14e, strength: 0.55 },
    },
  },
  theme: {
    background: 0xffffff,
    axis: [0.17, 0.17, 0.19] as [number, number, number], // charcoal, like a pencil
    pane: [0.55, 0.58, 0.64] as [number, number, number], // the little pane of a world plane that is off
    grid: [0.62, 0.63, 0.67] as [number, number, number],
    minorAlpha: 0.35,
    majorAlpha: 0.7,
  },
};
