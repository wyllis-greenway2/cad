// Every behavioral value lives here (prin_variable_over_hardcoded). Nothing below is a magic number elsewhere.
export const settings = {
  snap: {
    enabled: true,
    thresholdPx: 12, // distance in SCREEN pixels, so snapping feels the same at any zoom
    inference: true, // horizontal / vertical alignment with existing points
    gridEnabled: false, // grid is a visual reference by default, not a snap target
    gridStepMm: 1,
    roundMm: 0.01, // free-placed points are rounded to this, so dimensions read 40.00 and not 39.999999
  },
  ui: {
    tiltMs: 300, // camera tilt between face-on sketch view and 3D extrude view
    sketchPhi: 0.001, // looking straight down (radians from +Z)
    extrudePhi: 0.95,
    extrudeTheta: -0.75,
    circleSegments: 64, // only for client-side hit testing and the instant ghost preview
  },
  extrude: {
    dragStepMm: 0.5,
    minPreviewMm: 0.01,
    handleScale: 0.035, // handle size as a fraction of camera distance
  },
  display: { tessTolerance: 0.02, tessAngular: 0.1, previewTessTolerance: 0.08 },
  stats: { window: 30 }, // how many recent round trips the latency readout averages over
  theme: {
    background: 0x15171b,
    grid: 0x3a3f4a,
    entity: 0xe8eaee,
    draft: 0x8fb8ff,
    snap: 0xffc857,
    guide: 0x4f8cff,
    regionFill: 0x4f8cff,
    regionHover: 0x6fa2ff,
    body: 0x6c8fd6,
    ghostAdd: 0x4cd08a,
    ghostCut: 0xff6b5f,
    handle: 0xffc857,
  },
};
