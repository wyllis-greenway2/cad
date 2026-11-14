// Every behavioural and look value lives here (`prin_variable_over_hardcoded`). The tuned values are the human's: copied from the prototype's settings, not changed.
export const settings = {
  view: {
    fovDeg: 35,
    homeAzimuth: Math.PI / 4, // radians around Z (0 = looking from +X); PI/4 = from the +X +Y corner (`in_069`)
    homeElevation: 0.5, // radians above the XY plane
    homeDistance: 120, // mm from the target
    orbitRadPerPx: 0.006,
    zoomPerWheel: 0.003,
    minDistance: 0.3, // (a very small part can be zoomed on: `in_153`)
    minSurfaceMm: 0.3, // zooming in toward a surface under the cursor stops when it is this close to the camera (it must not go through it: `in_151`)
    maxDistance: 5000,
    transitionMs: 450, // camera move to a plane's normal view
    leaveStraightPx: 60, // how far you have to drag to leave a straight (orthographic) view: a little hard, so it is not left by accident (`in_193`)
    perspectiveMs: 350, // and how long the perspective takes to come in then
    normalToleranceRad: 0.02,
    clickMovePx: 4, // pointer movement below this is a click, not a drag
    drawClickMovePx: 14, // and while a drawing tool is armed: a click that wanders this little is still a click (so the first point of a shape is not lost to turning the view)
    nearFactor: 0.02,
    farFactor: 120,
  },
  input: {
    boxHoldMs: 400, // the left button held still this long (mouse): the cursor changes and a drag from there draws a selection rectangle (`in_235`)
    longPressMs: 450, touchSlopPx: 10, drawTouchSlopPx: 22, // touch: a press this long without moving is a right click; a finger must move this far to drag
    multiTapPx: 28, multiTapMs: 550, // taps this close in space and time count as a double or triple tap (`in_078`)
    multiClickPx: 6, multiClickMs: 400, // clicks this close count as a double or triple click (`in_070`)
    flyEaseSec: 0.15, // game mode: how long the keys take to bring the view up to speed and to rest (`in_302`)
    flyLookSec: 0.06, // and how long the pointer's movement is let out over, so the turning is smooth
    flyLookScale: 0.5, // game mode: how much of the mouse's movement turns the view (`in_304`: less sensitive)
    gameIdleMs: 1200, // game mode ends this long after the last of W A S D is let go (`in_304`)
    flySpeed: 0.45, // game mode: view distances per second at full speed
    trackpadPanScale: 0.3, // how much of a trackpad's two-finger scroll the view pans by: less than 1 is less sensitive (`in_300`)
    scrollMode: "auto" as "auto" | "pan" | "zoom", // what a scroll does: auto = a trackpad's two-finger scroll pans and a wheel zooms (a pinch always zooms) (`in_079`)
    zoomToCursor: true, // zoom IN toward the point under the cursor; zoom OUT is about the view centre (no runaway)
    zoomAnchorMaxFactor: 1.5, // zoom toward surface points within this many view-distances of the target
    maxZoomFactorPerSecond: 5, // one gesture can never zoom faster than this
    pinchZoomPerWheel: 0.01, // a trackpad pinch (a wheel event with ctrl held) is more sensitive than a wheel notch
    scrollNotchMs: 160, // a scroll gesture keeps its kind while its events keep arriving within this
    keys: {
      // only the standard ones for now: the letter keys for the tools, the operations and the views are to be chosen later (`in_131`)
      undo: ["mod+z"], redo: ["mod+shift+z", "mod+y"],
      cancel: ["escape"], save: ["mod+s"], open: ["mod+o"], delete: ["delete", "backspace"], group: ["mod+g"], ungroup: ["mod+shift+g"],
    } as Record<string, string[]>,
  },
  sketch: { snapPx: 12, alignPx: 6, roundMm: 0.01, hintDeg: 4, nearFrac: 0.08 }, // (nearFrac: a corner within this fraction of a circle's radius (or of a line's length) of it, but not on it, is offered "coincident" / "on line" when the circle or line is selected, `in_244`) // (hintDeg: a line being drawn within this many degrees of level, upright, parallel, square or tangent takes it and offers the constraint) // drawing: a point within this many pixels of a corner snaps to it; free points are rounded to this so sizes read 40.00; within alignPx of the line through a corner, level or upright, a point lines up with it
  op: { sizeStep: 0.1, distanceStep: 0.1 }, // the arrow keys change a fillet or chamfer size by sizeStep, other distances by distanceStep
  gizmo: { steadyPxPerMmFactor: 0.5, sizeOfView: 0.11, hitPx: 12, angleStep: 0.5, opacity: 0.6, widthPx: 2.2, headScale: 0.7 }, // the helper handles: their length as a fraction of the view distance, how see-through they are, their line width, the size of their heads and balls (1 = the old size), how near the pointer must be, rotation snaps to this many degrees
  pick: { cornerBonusPx: 7, pointPx: 10, linePx: 8, edgeWidthPx: 2.4, edgeHoverWidthPx: 1.8, vertexScale: 0.0042, vertexSelectScale: 1.25 }, // a picked line is this wide; a picked corner is a ball this big (in view distances), as in the prototype // pointing within this many pixels of a corner / a line picks it (the prototype used 10 and 6 to 8)
  orb: {
    radius: 0.025, // the hover ring's radius, in view-distances (`in_075`)
    ringPx: 1.6,
    ringOpacity: 0.88,
    hoverOpacity: 0.14, // the disc under the pointer: more see-through than the selection fill (`in_300`)
    selectOpacity: 0.25, // (the teal fill; a touch more see-through: `in_157`)
    color: [0.1, 0.72, 0.7] as [number, number, number], // THE teal: kept for use elsewhere (`in_075`)
    fillMs: 520,
    reachFactor: 1.04,
    softFactor: 2.2,
  },
  theme: {
    background: 0xffffff,
    axis: [0.17, 0.17, 0.19] as [number, number, number], // charcoal, like a pencil
    bodyFadeOpacity: 0.22, // the body while a plane is sketched on behind it (`in_194`)
    sketchFillOpacity: 0.06, // a closed sketch's see-through tint (`in_194`)
    sketchHoverOpacity: 0.28, // and its teal when the pointer is over it
    sheet: [0.5, 0.51, 0.54] as [number, number, number], // a pane's fill
    pane: [0.55, 0.58, 0.64] as [number, number, number], // the little pane of a world plane that is off
    bodyColor: 0xc9c9cd,
    bodyEdge: 0x2a2a2d,
  },
  grid: { show: true, divisions: 30, minorAlpha: 0.35, majorAlpha: 0.7, color: [0.62, 0.63, 0.67] as [number, number, number] },
  flash: { ms: 1100, shakeMs: 450 }, // a refused change: the broken constraints flash red and fade over this long; the one that tried shakes for the first part of it
  world: { axisLengthMm: 24, axisWidthPx: 1.6, axisOpacity: 1, paneGapMm: 3, paneMm: 8, paneRound: 0.18, paneOpacity: 0.18, paneActiveOpacity: 0.4 }, // (the three little panes of the world planes: how far from the origin, how big, how see-through) // the small charcoal axes at the origin: their real length in mm (so they zoom with the model: was 8.4), line width, opacity
  buttons: { marginPx: 18, sizePx: 34 }, // the X Y Z buttons at the right edge, lower right
  light: { key: 1.7, fill: 0.12, ambient: 0.42, roughness: 0.4, sheen: 0.55, sheenRoughness: 0.25, reflect: 0.5 }, // lights ride with the camera; the body has a slight clear-coat sheen and a soft studio reflected in it
  // while a size is dragged: the kernel's result stretched on the graphics card (`dec_drag_preview_without_kernel`), or the kernel's own result for every size, the newest request winning, rough and with no faces or edges
  // (`in_326`, `in_327`). `exactRounding`: the second for a fillet or a chamfer (new, or one that is there already pulled in or out), the first for the rest (`in_328`); `stretch` off: the second for all (an experiment)
  preview: { stretch: true, exactRounding: true },
  extrude: { edgeAngleDeg: 30 }, // outline edges are drawn where faces meet at more than this angle
};
