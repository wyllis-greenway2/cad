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
  input: {
    longPressMs: 450, touchSlopPx: 10, // touch: a press this long without moving is a right click; a finger must move this far to drag
    multiTapPx: 28, multiTapMs: 550, // taps this close in space and time count as a double or triple tap (`in_078`)
    multiClickPx: 6, multiClickMs: 400, // clicks this close count as a double or triple click (`in_070`)
    scrollMode: "auto" as "auto" | "pan" | "zoom", // what a scroll does: auto = a trackpad's two-finger scroll pans and a wheel zooms (a pinch always zooms) (`in_079`)
    zoomToCursor: true, // zoom IN toward the point under the cursor; zoom OUT is about the view centre (no runaway)
    zoomAnchorMaxFactor: 1.5, // zoom toward surface points within this many view-distances of the target
    maxZoomFactorPerSecond: 5, // one gesture can never zoom faster than this
    pinchZoomPerWheel: 0.01, // a trackpad pinch (a wheel event with ctrl held) is more sensitive than a wheel notch
    scrollNotchMs: 160, // a scroll gesture keeps its kind while its events keep arriving within this
    keys: {
      undo: ["mod+z"], redo: ["mod+shift+z", "mod+y"], lookX: ["x"], lookY: ["y"], lookZ: ["z"], lookN: ["n"], home: ["h"],
      cancel: ["escape"], save: ["mod+s"], open: ["mod+o"], delete: ["delete", "backspace"],
      toolRect: ["r"], toolCircle: ["c"], toolLine: ["l"], extrude: ["e"], edge: ["f", "b"], move: ["m"], rotate: ["t"], scale: ["k"], dimension: ["d"],
    } as Record<string, string[]>,
  },
  sketch: { snapPx: 12, roundMm: 0.01 }, // drawing: a point within this many pixels of a corner snaps to it; free points are rounded to this so sizes read 40.00
  op: { sizeStep: 0.1, distanceStep: 0.1 }, // the arrow keys change a fillet or chamfer size by sizeStep, other distances by distanceStep
  gizmo: { sizeOfView: 0.17, hitPx: 12, angleStep: 0.5 }, // the helper handles: their length as a fraction of the view distance, how near the pointer must be, rotation snaps to this many degrees
  pick: { pointPx: 10, linePx: 8, edgeWidthPx: 2.4, edgeHoverWidthPx: 1.8, vertexScale: 0.0042, vertexSelectScale: 1.25 }, // a picked line is this wide; a picked corner is a ball this big (in view distances), as in the prototype // pointing within this many pixels of a corner / a line picks it (the prototype used 10 and 6 to 8)
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
    bodyColor: 0xc9c9cd,
    bodyEdge: 0x2a2a2d,
  },
  grid: { show: false, divisions: 30, minorAlpha: 0.35, majorAlpha: 0.7, color: [0.62, 0.63, 0.67] as [number, number, number] },
  flash: { ms: 1100, shakeMs: 450 }, // a refused change: the broken constraints flash red and fade over this long; the one that tried shakes for the first part of it
  world: { sizeOfView: 0.07, axisWidthPx: 1.6, axisOpacity: 0.55 }, // the small semi-transparent axes at the origin: their length as a fraction of the view distance (so they stay small on the screen), line width, opacity
  buttons: { marginPx: 18, sizePx: 34 }, // the X Y Z buttons at the right edge, lower right
  light: { key: 1.7, fill: 0.12, ambient: 0.42, roughness: 0.5, sheen: 0.3, sheenRoughness: 0.45, reflect: 0.35 }, // lights ride with the camera; the body has a slight clear-coat sheen and a soft studio reflected in it
  extrude: { edgeAngleDeg: 30 }, // outline edges are drawn where faces meet at more than this angle
};
