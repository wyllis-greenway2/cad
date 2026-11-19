// Small icons (inline SVG, 16 x 16, drawn with the current text colour), ported from the prototype. Pure data.
const svg = (inner: string): string => `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const ICONS: Record<string, string> = {
  // Repeat, Path repeat (`in_841`): dots standing along a curved path
  pathrepeat: svg('<path d="M2 12.5C5 12.5 5 4.5 8 4.5S11 11 14 11" stroke-dasharray="1.4 1.6" opacity=".7"/><circle cx="2.6" cy="12.4" r="1.5" fill="currentColor"/><circle cx="8" cy="4.6" r="1.5"/><circle cx="13.4" cy="11" r="1.5"/>'),
  // Shape, Models (`in_812`): a ready-made part, a block with a hexagon on its face; Fasteners: a countersunk screw; Fastener Holes: a block cut across with a hole and a countersink
  hammer: svg('<path d="M9.5 2.2l4.3 4.3-1.6 1.6-1-1L8.6 9.3 7 7.7 9.6 5l-1-1z" fill="currentColor" fill-opacity=".18"/><path d="M7.2 7.9L2.6 12.5a1.1 1.1 0 0 0 1.6 1.6l4.6-4.6"/><path d="M8.2 3.6l4.2 4.2"/>'),
  models: svg('<path d="M8 1.8l5.5 3v6.4l-5.5 3-5.5-3V4.8z"/><path d="M8 5.2l2.4 1.4v2.8L8 10.8 5.6 9.4V6.6z" stroke-width="1.2"/>'),
  fastener: svg('<path d="M3 2.5h10l-3.2 2.2h-3.6z" fill="currentColor" fill-opacity=".18"/><path d="M6.2 4.7v8.8L8 15l1.8-1.5V4.7"/><path d="M6.2 7.2h3.6M6.2 9.6h3.6M6.2 12h3.6" stroke-width="1"/>'),
  fastenerHole: svg('<path d="M1.8 4h3.4L7 6.2v7.3M14.2 4h-3.4L9 6.2v7.3"/><path d="M1.8 4v9.5h5.2M14.2 4v9.5H9" stroke-width="1.2"/>'),
  // change the numbers of a step in the History (`dec_history_navigation`)
  pencil: svg('<path d="M2.5 13.5l.8-3.2 7.6-7.6 2.4 2.4-7.6 7.6z"/><path d="M9.2 4.4l2.4 2.4"/>'),
  // a hard body (`in_473`): two blocks that stop against each other
  hard: svg('<rect x="1.8" y="5" width="5.2" height="6" rx=".8"/><rect x="9" y="5" width="5.2" height="6" rx=".8"/><path d="M7.6 8h.8" stroke-width="2"/>'),
  // the world orb (`in_463`): an eye (a click would show the world), a crossed eye (a click would put it away)
  eye: svg('<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>'),
  eyeOff: svg('<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/><path d="M2.5 13.5l11-11"/>'),
  eyelock: svg('<path d="M8 3.8C4.5 3.8 2.2 6.4 1.4 8c.8 1.6 3.1 4.2 6.6 4.2"/><circle cx="5.2" cy="8" r="1.5"/><rect x="8.8" y="8" width="5.8" height="4.8" rx="1" fill="currentColor" fill-opacity=".18"/><path d="M10.2 8V6.7a1.5 1.5 0 0 1 3 0V8"/>'), // (half an eye, half a lock: show the constraints of this body, `in_1153`)
  // the modes of a sheet's icon (`in_459`): the plane edge on, and the half that is cut away dashed (above, below), no cut, invisible
  sheetCutUp: svg('<path d="M2 10h12"/><path d="M3 6h10M3 3.5h10" stroke-dasharray="1.6 1.4" opacity=".7"/><path d="M8 8.4V7.6" />'),
  sheetCutDown: svg('<path d="M2 6h12"/><path d="M3 10h10M3 12.5h10" stroke-dasharray="1.6 1.4" opacity=".7"/>'),
  sheetPlain: svg('<path d="M2.5 11.5l3-7h8l-3 7z"/>'),
  sheetHidden: svg('<path d="M2.5 11.5l3-7h8l-3 7z" stroke-dasharray="1.6 1.6" opacity=".6"/><path d="M2 2.5l12 11"/>'),
  mirror: svg('<path d="M8 1.5v13" stroke-dasharray="1.8 1.4"/><path d="M6.4 4.5L2.5 11.5h3.9z"/><path d="M9.6 4.5l3.9 7h-3.9z" fill="currentColor" fill-opacity=".35"/>'), // (a shape and its reflection across a dashed line: a mirror copy, `in_433`)
  sweep: svg('<circle cx="3.5" cy="12.5" r="2"/><path d="M5.5 12.5C10 12.5 12.5 10 12.5 3.5"/><path d="M10.5 3.5h4" />'), // (a shape carried along a curved path: a sweep, `in_444`)
  loft: svg('<path d="M3 13h10"/><path d="M5.5 3h5"/><path d="M3 13l2.5-10M13 13L10.5 3"/><path d="M4.4 8h7.2" stroke-dasharray="1.6 1.4"/>'), // (two sketches of different sizes joined: a loft, `in_431`)
  orient: svg('<circle cx="8" cy="8" r="2.1" fill="currentColor"/><path d="M8 5.5V1.8M9.9 9.1l3.3 1.9M6.1 9.1l-3.3 1.9"/><path d="M7 2.8L8 1.7l1 1.1M12.4 10.2l.2 1.5-1.4-.4M3.6 10.2l-.2 1.5 1.4-.4"/>'), // (the mover's sphere with its three axes: orienting the mover, `in_421`)
  // the Select menu's all faces / all edges / all vertices (`in_419`): the same block three ways, so what is chosen is what is picked out of it
  selfaces: svg('<path d="M8 1.6l5.6 3.1v6.6L8 14.4l-5.6-3.1V4.7z" stroke-width="1.1"/><path d="M8 1.6l5.6 3.1L8 7.8 2.4 4.7z" fill="currentColor" fill-opacity=".5"/><path d="M2.4 4.7L8 7.8l5.6-3.1M8 7.8v6.6" stroke-width="1.1"/>'),
  seledges: svg('<path d="M8 1.6l5.6 3.1v6.6L8 14.4l-5.6-3.1V4.7z" stroke-width="1.9"/><path d="M2.4 4.7L8 7.8l5.6-3.1M8 7.8v6.6" stroke-width="1.9"/>'),
  selvertices: svg('<path d="M8 1.6l5.6 3.1v6.6L8 14.4l-5.6-3.1V4.7z" stroke-width=".9"/><path d="M2.4 4.7L8 7.8l5.6-3.1M8 7.8v6.6" stroke-width=".9"/><g fill="currentColor" stroke="none"><circle cx="8" cy="1.6" r="1.5"/><circle cx="13.6" cy="4.7" r="1.5"/><circle cx="13.6" cy="11.3" r="1.5"/><circle cx="8" cy="14.4" r="1.5"/><circle cx="2.4" cy="11.3" r="1.5"/><circle cx="2.4" cy="4.7" r="1.5"/><circle cx="8" cy="7.8" r="1.5"/></g>'),
  mate: svg('<rect x="1.8" y="5" width="7.2" height="6" rx="1.8"/><rect x="7" y="5" width="7.2" height="6" rx="1.8"/>'), // (two links: a mate, `in_316`)
  horizontal: svg('<path d="M2 8h12"/>'),
  vertical: svg('<path d="M8 2v12"/>'),
  perpendicular: svg('<path d="M3 13V3"/><path d="M3 13h10"/><path d="M3 9h4v4"/>'),
  parallel: svg('<path d="M5 14L8.5 2"/><path d="M10 14L13.5 2"/>'),
  equal: svg('<path d="M3 6h10"/><path d="M3 10h10"/>'),
  coincident: svg('<circle cx="8" cy="8" r="4.6"/><circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none"/>'),
  fixed: svg('<rect x="3.5" y="7.2" width="9" height="6.3" rx="1.3" fill="currentColor" fill-opacity=".18"/><path d="M5.5 7.2V5.4a2.5 2.5 0 0 1 5 0v1.8"/><circle cx="8" cy="10.3" r="0.9" fill="currentColor" stroke="none"/>'), // (a padlock, closed: held in place)
  dimension: svg('<path d="M2 11.5L11.5 2 14 4.5 4.5 14z"/><path d="M5 8.5l1.6 1.6M7.4 6l1.6 1.6M9.8 3.6l1.2 1.2"/>'),
  angle: svg('<path d="M2.5 13.5h11"/><path d="M2.5 13.5L11 4.5"/><path d="M7.5 13.5a5 5 0 0 0-1.4-3.4"/>'),
  radius: svg('<circle cx="8" cy="8" r="5.5"/><path d="M8 8l3.9-3.9"/>'),
  scissors: svg('<circle cx="4.2" cy="11.6" r="2"/><circle cx="4.2" cy="4.4" r="2"/><path d="M5.9 5.5L14 12M5.9 10.5L14 4"/>'),
  lock: svg('<rect x="3.5" y="7.2" width="9" height="6.3" rx="1.3" fill="currentColor" fill-opacity=".18"/><path d="M5.5 7.2V5.4a2.5 2.5 0 0 1 5 0v1.8"/><circle cx="8" cy="10.3" r="0.9" fill="currentColor" stroke="none"/>'), // (closed)
  unlock: svg('<rect x="3.5" y="7.2" width="9" height="6.3" rx="1.3"/><path d="M5.5 7.2V5.4a2.5 2.5 0 0 1 4.8-1"/>'), // (open: the shackle is up on one side)
};

Object.assign(ICONS, {
  revolve: svg('<path d="M2.5 2.5v11" stroke-dasharray="1.8 1.4"/><path d="M4 4.5c3.5-1.6 8.5-1.2 9.5 1.2s-3 3.6-6.5 4.2"/><path d="M4 9.5c2.6 1.2 5.7 1.4 8.3.4"/><path d="M10.7 8.6l1.8 1.3-2 1.2"/>'), // (a figure turned round a line, with its path winding on: revolve and spiral, `in_427`)
  wireframe: svg('<path d="M2.5 5.5l5.5-3 5.5 3v6l-5.5 3-5.5-3z"/><path d="M2.5 5.5L8 8.5l5.5-3M8 8.5v6" stroke-dasharray="1.6 1.4"/>'), // (a block seen through, `in_386`)
  hollow: svg('<path d="M2.5 5.5l5.5-3 5.5 3v6l-5.5 3-5.5-3z"/><path d="M5.5 7.2L8 5.8l2.5 1.4v3L8 11.6 5.5 10.2z" fill="currentColor" fill-opacity=".18"/>'), // (a block with a cavity inside, `in_391`)
  invert: svg('<path d="M3 5.5h8.5"/><path d="M9.5 3.2L12 5.5 9.5 7.8"/><path d="M13 10.5H4.5"/><path d="M6.5 8.2L4 10.5 6.5 12.8"/>'), // (swap: the other way round, `in_393`)
  look: svg('<rect x="3" y="3" width="10" height="10" rx="1" stroke-dasharray="2 1.6"/><path d="M8 5.5V10.5M5.5 8H10.5"/><path d="M1.5 5V2.5H4M12 2.5h2.5V5M14.5 11v2.5H12M4 13.5H1.5V11"/>'), // (looking straight at a plane: the square seen square on, `in_393`)
  game: svg('<circle cx="8" cy="8" r="4.2"/><path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3"/><circle cx="8" cy="8" r=".9" fill="currentColor" stroke="none"/>'), // (a crosshair: flying through the model, `in_393`)
  section: svg('<path d="M2.5 8L8 5.3l5.5 2.7L8 10.7z" fill="currentColor" fill-opacity=".28" stroke="none"/><path d="M2.5 5.2L8 2.5l5.5 2.7v5.6L8 13.5l-5.5-2.7z"/><path d="M2.5 8L8 10.7 13.5 8"/><path d="M2.5 8L8 5.3 13.5 8" stroke-dasharray="1.4 1.4"/>'), // (a block cut in half, `in_394`)
  pointer: svg('<path d="M6 9.6V3.3a1.2 1.2 0 0 1 2.4 0V8"/><path d="M8.4 7.4a1.1 1.1 0 0 1 2.2 0v.7a1.1 1.1 0 0 1 2.2.2V11a3.5 3.5 0 0 1-3.5 3.5H8.7a3 3 0 0 1-2.3-1L3.6 10.2a1.1 1.1 0 0 1 1.6-1.5L6 9.6"/>'), // (a pointing hand: the Select menu, `in_386`)
  similar: svg('<rect x="2" y="2.5" width="5" height="5" rx=".8"/><rect x="9" y="2.5" width="5" height="5" rx=".8"/><rect x="2" y="9.5" width="5" height="5" rx=".8"/><path d="M9.5 12l1.6 1.6 3.2-3.4"/>'),
  group: svg('<rect x="2" y="2" width="12" height="12" rx="1.6" stroke-dasharray="2.2 1.8"/><rect x="4.6" y="4.6" width="3" height="3"/><rect x="8.6" y="8.6" width="3" height="3"/>'),
  ungroup: svg('<rect x="2" y="2" width="3.6" height="3.6"/><rect x="10.4" y="10.4" width="3.6" height="3.6"/><path d="M7 7l2 2"/>'),
  unlink: svg('<rect x="2" y="6" width="5" height="4" rx="1"/><rect x="9" y="6" width="5" height="4" rx="1"/><path d="M7.5 3.5l1 2M8.5 12.5l-1-2"/>'),
  add: svg('<circle cx="6" cy="8" r="4.2"/><circle cx="10" cy="8" r="4.2"/>'),
  subtract: svg('<circle cx="6" cy="8" r="4.2"/><path d="M10 3.8a4.2 4.2 0 0 1 0 8.4" stroke-dasharray="2 1.6"/>'),
  intersect: svg('<circle cx="6" cy="8" r="4.2" stroke-dasharray="2 1.6"/><circle cx="10" cy="8" r="4.2" stroke-dasharray="2 1.6"/><path d="M8 4.5a4.2 4.2 0 0 1 0 7"/>'),
  edge: svg('<path d="M3 13V6.5C3 4.6 4.6 3 6.5 3H13"/><path d="M5.5 13.5L13.5 5.5"/>'),
  arc: svg('<path d="M3 12.5C3 6 8 2.5 13.5 3.5"/><circle cx="3" cy="12.5" r="1"/><circle cx="13.5" cy="3.5" r="1"/>'),
  pause: svg('<path d="M5 3.5h2.2v9H5zM8.8 3.5H11v9H8.8z" fill="currentColor"/>'), // (pause a motion that plays)
  play: svg('<path d="M5 3.5v9l7.5-4.5z" fill="currentColor"/>'), // (play a joint, `dec_mechanism_motion`)
  cam: svg('<circle cx="7" cy="8" r="5"/><circle cx="7" cy="8" r="1.2"/><path d="M12 8h2.5"/>'), // (a cam: a disc turned about a point off its middle, `dec_spline_and_cams`)
  spline: svg('<path d="M2.5 11.5C5 3 7 14 9.5 7.5S12 4 13.5 4.5"/><circle cx="2.5" cy="11.5" r="1"/><circle cx="13.5" cy="4.5" r="1"/>'), // (a smooth curve through points, `dec_spline_and_cams`)
  offset: svg('<rect x="1.8" y="3.2" width="12.4" height="9.6" rx="1"/><rect x="4.6" y="5.8" width="6.8" height="4.4" rx=".6"/>'),
  concentric: svg('<circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="2.6"/>'),
  onCircle: svg('<circle cx="8" cy="8" r="5.5"/><circle cx="12.4" cy="4.6" r="1.6"/>'),
  onLine: svg('<path d="M2 12.5L14 3.5"/><circle cx="8" cy="8" r="1.7"/>'),
  tangent: svg('<circle cx="8" cy="10" r="4"/><path d="M1.5 6h13"/>'),
  rect: svg('<rect x="2.5" y="4" width="11" height="8" rx="0.6"/>'),
  circle: svg('<circle cx="8" cy="8" r="5.5"/>'),
  rack: svg('<path d="M1.5 12.5h13M1.5 12.5V8.5M14.5 12.5V8.5M1.5 8.5h1.6l.8-3.5h1.8l.8 3.5h1.2l.8-3.5h1.8l.8 3.5h1.2l.8-3.5h1.8l.8 3.5h.4"/>'), // (a bar with straight-sided teeth: the rack, `in_579`)
  txtGT2: `<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><text x="8" y="11.3" font-size="7" font-weight="800" text-anchor="middle" fill="currentColor" font-family="system-ui,sans-serif">GT2</text></svg>`, // (the pulley's type written in its icon, `in_709`)
  txtGT3: `<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><text x="8" y="11.3" font-size="7" font-weight="800" text-anchor="middle" fill="currentColor" font-family="system-ui,sans-serif">GT3</text></svg>`, // (the pulley's type written in its icon, `in_709`)
  txt5M: `<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><text x="8" y="11.6" font-size="7.8" font-weight="800" text-anchor="middle" fill="currentColor" font-family="system-ui,sans-serif">5M</text></svg>`, // (the pulley's type written in its icon, `in_709`)
  txt8M: `<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><text x="8" y="11.6" font-size="7.8" font-weight="800" text-anchor="middle" fill="currentColor" font-family="system-ui,sans-serif">8M</text></svg>`, // (the pulley's type written in its icon, `in_709`)
  gear: svg('<path d="M12.71 7.06L14.57 7.42L14.57 8.58L12.71 8.94L11.99 10.67L13.06 12.24L12.24 13.06L10.67 11.99L8.94 12.71L8.58 14.57L7.42 14.57L7.06 12.71L5.33 11.99L3.76 13.06L2.94 12.24L4.01 10.67L3.29 8.94L1.43 8.58L1.43 7.42L3.29 7.06L4.01 5.33L2.94 3.76L3.76 2.94L5.33 4.01L7.06 3.29L7.42 1.43L8.58 1.43L8.94 3.29L10.67 4.01L12.24 2.94L13.06 3.76L11.99 5.33z M6 8a2 2 0 1 0 4 0a2 2 0 1 0 -4 0z"/>'), // (a toothed wheel with its bore: the gear tool, `dec_gear_tool`; drawn by a script from a trapezoid tooth, `in_691`)
  helical: svg('<path d="M3 13.5C3 11.6 13 11.6 13 9.6C13 7.6 3 7.6 3 5.6C3 4.2 7 3.2 10.5 3.2 M8.6 1.2L11 3.2L8.6 5.2"/>'),
  bevelgear: svg('<ellipse cx="8" cy="12.2" rx="6" ry="2.1"/><path d="M2 12.2L5.6 4.2M14 12.2L10.4 4.2"/><ellipse cx="8" cy="4.2" rx="2.4" ry="0.9"/><path d="M4 13.9L5.7 6M6.6 14.3L7 5.3M9.4 14.3L9 5.3M12 13.9L10.3 6"/>'),
  spiralbevel: svg('<ellipse cx="8" cy="12.2" rx="6" ry="2.1"/><path d="M2 12.2L5.6 4.2M14 12.2L10.4 4.2"/><ellipse cx="8" cy="4.2" rx="2.4" ry="0.9"/><path d="M3.8 13.5C5.4 11 5.6 8.2 5.8 5.8M6.5 14.2C7.8 11.4 7.8 8.2 7.4 5.3M9.5 14.2C10.2 11.4 9.4 8.2 8.8 5.2M12.3 13.5C12 11 10.8 8.2 10.2 5.7"/>'),
  hypoidbevel: svg('<ellipse cx="8" cy="12.2" rx="6" ry="2.1"/><path d="M2 12.2L5.6 4.2M14 12.2L10.4 4.2"/><ellipse cx="8" cy="4.2" rx="2.4" ry="0.9"/><path d="M3.8 13.5C5.4 11 5.6 8.2 5.8 5.8M6.5 14.2C7.8 11.4 7.8 8.2 7.4 5.3M9.5 14.2C10.2 11.4 9.4 8.2 8.8 5.2M12.3 13.5C12 11 10.8 8.2 10.2 5.7"/><path d="M1 8.6h14" stroke-dasharray="1.2 1.2"/><path d="M13.4 6.6v4M12.2 7.8l1.2-1.2 1.2 1.2" />'),
  facegear: svg('<ellipse cx="8" cy="11" rx="6" ry="2.4"/><path d="M2 11v1.5c0 1.3 2.7 2.4 6 2.4s6-1.1 6-2.4V11"/><path d="M4.5 9.6V8M6.5 9V7.5M8.5 8.9V7.4M10.5 9V7.5M12 9.6V8"/><circle cx="8" cy="3.6" r="2"/><path d="M8 5.6v1.6"/>'),
  crowngear: svg('<ellipse cx="8" cy="10.5" rx="6" ry="2.6"/><path d="M2 10.5v1.7c0 1.4 2.7 2.6 6 2.6s6-1.2 6-2.6v-1.7"/><path d="M4.2 9.4V7.6M6.4 8.9V6.8M8.6 8.8V6.6M10.8 9V7M12.4 9.4V7.8" /><path d="M3.8 7.6h1M6 6.8h1M8.2 6.6h1M10.4 7h1M12 7.8h1"/>'),
  worm: svg('<path d="M1.5 8h1.2M13.3 8h1.2 M2.7 5.2l1.5-1.5 1.5 1.5 1.5-1.5 1.5 1.5 1.5-1.5 1.5 1.5 M2.7 10.8l1.5 1.5 1.5-1.5 1.5 1.5 1.5-1.5 1.5 1.5 1.5-1.5 M2.7 5.2v5.6M13.3 5.2v5.6"/>'),
  wormwheel: svg('<path d="M11.9 5.11L13.37 5.46L13.37 6.54L11.9 6.89L11.13 8.49L11.78 9.86L10.92 10.54L9.74 9.6L8 10L7.34 11.36L6.27 11.12L6.26 9.6L4.87 8.49L3.4 8.82L2.92 7.84L4.1 6.89L4.1 5.11L2.92 4.16L3.4 3.18L4.87 3.51L6.26 2.4L6.27 0.88L7.34 0.64L8 2L9.74 2.4L10.92 1.46L11.78 2.14L11.13 3.51z M6.7 6a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0 -2.6 0z M2 14.2h12 M4.5 12.6v3.2 M8 12.6v3.2 M11.5 12.6v3.2"/>'),
  ringgear: svg('<path d="M1.2 8a6.8 6.8 0 1 0 13.6 0a6.8 6.8 0 1 0 -13.6 0z M11.19 7.15L12.87 7.48L12.87 8.52L11.19 8.85L10.33 10.33L10.89 11.96L9.99 12.48L8.85 11.19L7.15 11.19L6.01 12.48L5.11 11.96L5.67 10.33L4.81 8.85L3.13 8.52L3.13 7.48L4.81 7.15L5.67 5.67L5.11 4.04L6.01 3.52L7.15 4.81L8.85 4.81L9.99 3.52L10.89 4.04L10.33 5.67z"/>'),
  pulley: svg('<path d="M1 8a4.6 4.6 0 1 0 9.2 0a4.6 4.6 0 1 0 -9.2 0z M4.1 8a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0z M6.66 9.06L8.64 11.04M4.54 9.06L2.56 11.04M4.54 6.94L2.56 4.96M6.66 6.94L8.64 4.96 M5.6 3.4H12.8 M5.6 12.6H12.8"/>'),
  sprocket: svg('<path d="M12.76 6.45L14.8 8L12.76 9.55L12.64 9.87L13.21 12.37L10.65 12.24L10.35 12.41L9.18 14.7L7.3 12.95L6.96 12.89L4.6 13.89L4.28 11.35L4.06 11.08L1.61 10.33L3 8.17L3 7.83L1.61 5.67L4.06 4.92L4.28 4.65L4.6 2.11L6.96 3.11L7.3 3.05L9.18 1.3L10.35 3.59L10.65 3.76L13.21 3.63L12.64 6.13z M6.2 8a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0 -3.6 0z"/>'),
  clockgear: svg('<path d="M13.14 7.19L14.78 7.52L14.78 8.48L13.14 8.81L12.63 10.36L13.77 11.6L13.21 12.38L11.68 11.68L10.36 12.63L10.55 14.3L9.64 14.6L8.81 13.14L7.19 13.14L6.36 14.6L5.45 14.3L5.64 12.63L4.32 11.68L2.79 12.38L2.23 11.6L3.37 10.36L2.86 8.81L1.22 8.48L1.22 7.52L2.86 7.19L3.37 5.64L2.23 4.4L2.79 3.62L4.32 4.32L5.64 3.37L5.45 1.7L6.36 1.4L7.19 2.86L8.81 2.86L9.64 1.4L10.55 1.7L10.36 3.37L11.68 4.32L13.21 3.62L13.77 4.4L12.63 5.64z M8 8V4.8 M8 8l2.4 1.4"/>'),
  clockring: svg('<path d="M1.2 8a6.8 6.8 0 1 0 13.6 0a6.8 6.8 0 1 0 -13.6 0z M12.4 8A1.5 1.5 0 0 1 10.2 11.81A1.5 1.5 0 0 1 5.8 11.81A1.5 1.5 0 0 1 3.6 8A1.5 1.5 0 0 1 5.8 4.19A1.5 1.5 0 0 1 10.2 4.19A1.5 1.5 0 0 1 12.4 8z"/>'),
  meshgear: svg('<path d="M7.8 9.85L9.07 10.12L9.07 11.08L7.8 11.35L7.05 12.65L7.45 13.89L6.62 14.37L5.75 13.4L4.25 13.4L3.38 14.37L2.55 13.89L2.95 12.65L2.2 11.35L0.93 11.08L0.93 10.12L2.2 9.85L2.95 8.55L2.55 7.31L3.38 6.83L4.25 7.8L5.75 7.8L6.62 6.83L7.45 7.31L7.05 8.55z M14.12 5.88L15.1 6.73L14.64 7.57L13.4 7.2L12.12 7.98L11.88 9.26L10.91 9.28L10.62 8.02L9.3 7.3L8.07 7.73L7.57 6.91L8.52 6.02L8.48 4.52L7.5 3.67L7.96 2.83L9.2 3.2L10.48 2.42L10.72 1.14L11.69 1.12L11.98 2.38L13.3 3.1L14.53 2.67L15.03 3.49L14.08 4.38z"/>'),
  glue: svg('<path d="M1.5 2.5h8v8h-8z M6.5 5.5h8v8h-8z"/>'),
  gearbox: svg('<path d="M1.6 3.2h12.8v9.6H1.6z M7.4 8.2a2 2 0 1 0 -4 0a2 2 0 1 0 4 0z M13.4 8.2a2.9 2.9 0 1 0 -5.8 0a2.9 2.9 0 1 0 5.8 0z"/>'),
  bearing: svg('<path d="M1.2 8a6.8 6.8 0 1 0 13.6 0a6.8 6.8 0 1 0 -13.6 0z M10.4 8a2.4 2.4 0 1 0 -4.8 0a2.4 2.4 0 1 0 4.8 0z M12.70 8.00m-.9 0a.9 .9 0 1 0 1.8 0a.9 .9 0 1 0 -1.8 0M11.32 11.32m-.9 0a.9 .9 0 1 0 1.8 0a.9 .9 0 1 0 -1.8 0M8.00 12.70m-.9 0a.9 .9 0 1 0 1.8 0a.9 .9 0 1 0 -1.8 0M4.68 11.32m-.9 0a.9 .9 0 1 0 1.8 0a.9 .9 0 1 0 -1.8 0M3.30 8.00m-.9 0a.9 .9 0 1 0 1.8 0a.9 .9 0 1 0 -1.8 0M4.68 4.68m-.9 0a.9 .9 0 1 0 1.8 0a.9 .9 0 1 0 -1.8 0M8.00 3.30m-.9 0a.9 .9 0 1 0 1.8 0a.9 .9 0 1 0 -1.8 0M11.32 4.68m-.9 0a.9 .9 0 1 0 1.8 0a.9 .9 0 1 0 -1.8 0"/>'),
  differential: svg('<path d="M1.2 8a6.8 6.8 0 1 0 13.6 0a6.8 6.8 0 1 0 -13.6 0z M8 1.4v13.2 M1.4 8h13.2 M9.5 8a1.5 1.5 0 1 0 -3 0a1.5 1.5 0 1 0 3 0z"/>'),
  cycloidal: svg('<path d="M14.50 8.00 L14.45 8.23 L14.31 8.44 L14.10 8.64 L13.82 8.82 L13.51 8.97 L13.21 9.11 L12.92 9.23 L12.68 9.34 L12.51 9.47 L12.42 9.61 L12.40 9.78 L12.45 9.98 L12.56 10.22 L12.70 10.50 L12.85 10.80 L12.98 11.11 L13.08 11.43 L13.12 11.72 L13.09 11.97 L12.98 12.18 L12.80 12.32 L12.55 12.40 L12.26 12.41 L11.93 12.37 L11.60 12.29 L11.28 12.19 L10.98 12.10 L10.72 12.04 L10.51 12.02 L10.35 12.07 L10.23 12.19 L10.14 12.38 L10.06 12.63 L9.99 12.93 L9.92 13.26 L9.82 13.59 L9.69 13.89 L9.53 14.14 L9.34 14.31 L9.13 14.40 L8.90 14.39 L8.66 14.29 L8.43 14.11 L8.21 13.87 L8.00 13.60 L7.81 13.32 L7.65 13.06 L7.49 12.85 L7.34 12.70 L7.18 12.63 L7.01 12.64 L6.82 12.73 L6.60 12.87 L6.36 13.06 L6.08 13.26 L5.80 13.45 L5.51 13.60 L5.23 13.69 L4.97 13.70 L4.75 13.63 L4.58 13.47 L4.46 13.25 L4.40 12.96 L4.38 12.63 L4.40 12.29 L4.44 11.95 L4.48 11.65 L4.50 11.38 L4.47 11.17 L4.40 11.02 L4.26 10.92 L4.06 10.86 L3.80 10.84 L3.49 10.82 L3.15 10.80 L2.81 10.76 L2.49 10.69 L2.22 10.57 L2.01 10.42 L1.89 10.22 L1.86 9.99 L1.92 9.74 L2.05 9.48 L2.25 9.22 L2.49 8.97 L2.73 8.74 L2.96 8.53 L3.14 8.34 L3.26 8.17 L3.30 8.00 L3.26 7.83 L3.14 7.66 L2.96 7.47 L2.73 7.26 L2.49 7.03 L2.25 6.78 L2.05 6.52 L1.92 6.26 L1.86 6.01 L1.89 5.78 L2.01 5.58 L2.22 5.43 L2.49 5.31 L2.81 5.24 L3.15 5.20 L3.49 5.18 L3.80 5.16 L4.06 5.14 L4.26 5.08 L4.40 4.98 L4.47 4.83 L4.50 4.62 L4.48 4.35 L4.44 4.05 L4.40 3.71 L4.38 3.37 L4.40 3.04 L4.46 2.75 L4.58 2.53 L4.75 2.37 L4.97 2.30 L5.23 2.31 L5.51 2.40 L5.80 2.55 L6.08 2.74 L6.36 2.94 L6.60 3.13 L6.82 3.27 L7.01 3.36 L7.18 3.37 L7.34 3.30 L7.49 3.15 L7.65 2.94 L7.81 2.68 L8.00 2.40 L8.21 2.13 L8.43 1.89 L8.66 1.71 L8.90 1.61 L9.13 1.60 L9.34 1.69 L9.53 1.86 L9.69 2.11 L9.82 2.41 L9.92 2.74 L9.99 3.07 L10.06 3.37 L10.14 3.62 L10.23 3.81 L10.35 3.93 L10.51 3.98 L10.72 3.96 L10.98 3.90 L11.28 3.81 L11.60 3.71 L11.93 3.63 L12.26 3.59 L12.55 3.60 L12.80 3.68 L12.98 3.82 L13.09 4.03 L13.12 4.28 L13.08 4.57 L12.98 4.89 L12.85 5.20 L12.70 5.50 L12.56 5.78 L12.45 6.02 L12.40 6.22 L12.42 6.39 L12.51 6.53 L12.68 6.66 L12.92 6.77 L13.21 6.89 L13.51 7.03 L13.82 7.18 L14.10 7.36 L14.31 7.56 L14.45 7.77 L14.50 8.00z M9.1 8a1.1 1.1 0 1 0 -2.2 0a1.1 1.1 0 1 0 2.2 0z"/>'),
  planetary: svg('<path d="M1.1 8a6.9 6.9 0 1 0 13.8 0a6.9 6.9 0 1 0 -13.8 0z M9.4 8a1.4 1.4 0 1 0 -2.8 0a1.4 1.4 0 1 0 2.8 0z M5.3 4.6a1.1 1.1 0 1 0 -2.2 0a1.1 1.1 0 1 0 2.2 0z M12.9 4.6a1.1 1.1 0 1 0 -2.2 0a1.1 1.1 0 1 0 2.2 0z M9.1 12.2a1.1 1.1 0 1 0 -2.2 0a1.1 1.1 0 1 0 2.2 0z"/>'),
  meshring: svg('<path d="M1.1 8a6.9 6.9 0 1 0 13.8 0a6.9 6.9 0 1 0 -13.8 0z M8.53 8.63L9.68 8.81L9.68 9.59L8.53 9.77L7.96 10.76L8.37 11.84L7.7 12.23L6.97 11.33L5.83 11.33L5.1 12.23L4.43 11.84L4.84 10.76L4.27 9.77L3.12 9.59L3.12 8.81L4.27 8.63L4.84 7.64L4.43 6.56L5.1 6.17L5.83 7.07L6.97 7.07L7.7 6.17L8.37 6.56L7.96 7.64z"/>'),
  meshrack: svg('<path d="M10.92 4.53L12.18 4.78L12.18 5.62L10.92 5.87L10.35 7.07L10.94 8.2L10.27 8.73L9.3 7.9L8 8.2L7.48 9.37L6.66 9.18L6.7 7.9L5.65 7.07L4.42 7.39L4.05 6.63L5.08 5.87L5.08 4.53L4.05 3.77L4.42 3.01L5.65 3.33L6.7 2.5L6.66 1.22L7.48 1.03L8 2.2L9.3 2.5L10.27 1.67L10.94 2.2L10.35 3.33z M1.5 14.8h13 M1.5 14.8l.9-3h2.2l.9 3 M6.5 14.8l.9-3h2.2l.9 3 M11.5 14.8l.9-3h1.6"/>'),
  line: svg('<path d="M3 13L13 3"/><circle cx="3" cy="13" r="1" /><circle cx="13" cy="3" r="1"/>'),
  pushpull: svg('<path d="M2.5 11.5L8 8.7l5.5 2.8L8 14.3z"/><path d="M8 7V2"/><path d="M5.6 4.4L8 2l2.4 2.4"/>'), // (a face and one arrow up from it: simple, `in_538`)
  move: svg('<path d="M8 2v12M2 8h12"/><path d="M6 4l2-2 2 2M6 12l2 2 2-2M4 6L2 8l2 2M12 6l2 2-2 2"/>'),
  rotate: svg('<path d="M13 8a5 5 0 11-1.6-3.7"/><path d="M13.2 2.4v3h-3"/>'),
  scale: svg('<rect x="2.5" y="7.5" width="6" height="6" rx="0.6"/><path d="M8 8l5.5-5.5"/><path d="M9.5 2.5h4v4"/>'),
  paste: svg('<rect x="3" y="3.2" width="10" height="11" rx="1.2"/><path d="M6 3.2V2.4a.9.9 0 01.9-.9h2.2a.9.9 0 01.9.9v.8"/><path d="M5.6 8h4.8M5.6 10.6h4.8"/>'), // (a clipboard, `in_538`)
  selbodies: svg('<rect x="2" y="6" width="7" height="7" rx=".8"/><rect x="8" y="2.5" width="6" height="6" rx=".8"/>'), // (blocks: all the bodies, `in_538`)
  seladd: svg('<rect x="2" y="6" width="7" height="7" rx=".8"/><path d="M11.5 2.5v5M9 5h5"/>'), // (a thing and a plus: add to the selection, `in_539`)
  copy: svg('<rect x="5.5" y="5.5" width="8" height="8" rx="1"/><path d="M10.5 3.5v-.5a1 1 0 00-1-1h-6a1 1 0 00-1 1v6a1 1 0 001 1h.5"/>'),
  linear: svg('<rect x="1.5" y="5.5" width="3.6" height="5" rx="0.5"/><rect x="6.2" y="5.5" width="3.6" height="5" rx="0.5"/><rect x="10.9" y="5.5" width="3.6" height="5" rx="0.5"/>'),
  circular: svg('<circle cx="8" cy="2.8" r="1.6"/><circle cx="13.2" cy="8" r="1.6"/><circle cx="8" cy="13.2" r="1.6"/><circle cx="2.8" cy="8" r="1.6"/>'),
  trash: svg('<path d="M3 4.5h10"/><path d="M6 4.5V3h4v1.5"/><path d="M4.5 4.5l.6 8.5h5.8l.6-8.5"/><path d="M7 7v4M9 7v4"/>'),
  sketch: svg('<path d="M2.5 13.5l.8-3L11 2.8a1.4 1.4 0 012 2L5.5 12.7z"/><path d="M9.8 4l2.2 2.2"/>'),
  constraint: svg('<rect x="3.5" y="7.2" width="9" height="6.3" rx="1.3" fill="currentColor" fill-opacity=".18"/><path d="M5.5 7.2V5.4a2.5 2.5 0 0 1 5 0v1.8"/><circle cx="8" cy="10.3" r="0.9" fill="currentColor" stroke="none"/>'), // (just a lock, `in_386`)
  body: svg('<path d="M8 1.8l5.5 3v6.4l-5.5 3-5.5-3V4.8z"/><path d="M2.5 4.8L8 8l5.5-3.2"/><path d="M8 8v6.2"/>'),
  undo: svg('<path d="M3.5 6.5h5.8a3.2 3.2 0 010 6.4H5.5"/><path d="M6 3.5L3 6.5l3 3"/>'),
  redo: svg('<path d="M12.5 6.5H6.7a3.2 3.2 0 000 6.4h3.8"/><path d="M10 3.5l3 3-3 3"/>'),
  fingerdrag: svg('<path d="M6.4 8.6V3.3a1.1 1.1 0 012.2 0v4.1"/><path d="M8.6 7.4V6.6a1.1 1.1 0 012.2 0v1.2"/><path d="M10.8 7.8a1.1 1.1 0 012.2 0v2.4a4 4 0 01-4 4H8a3.2 3.2 0 01-2.6-1.3L3.2 9.9a1.1 1.1 0 011.8-1.2l1.4 1.5"/><path d="M1.6 3.3l1.3-1.2M1.6 3.3l1.3 1.2M1.6 3.3h3.2M14.4 3.3l-1.3-1.2M14.4 3.3l-1.3 1.2M14.4 3.3h-3.2"/>'),
  check: svg('<path d="M3 8.5l3.2 3.2L13 4.5"/>'),
  cross: svg('<path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/>'),
  // the mates between faces and axes of two bodies (`in_338`): what each one does, drawn as the faces or axes it joins; not the measure stick
  "mate:flush": svg('<rect x="3" y="2.2" width="10" height="5.3" rx=".8"/><rect x="3" y="8.5" width="10" height="5.3" rx=".8"/><path d="M1.4 8h13.2" stroke-width="1.9"/>'),
  "mate:coaxial": svg('<circle cx="8" cy="8" r="5"/><circle cx="8" cy="8" r="2"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2"/>'),
  "mate:parallel": svg('<path d="M2.5 6.2l3.2-3h8l-3.2 3z"/><path d="M2.5 12.7l3.2-3h8l-3.2 3z"/>'),
  "mate:perpendicular": svg('<path d="M2.5 13.5h11l-2.4-3h-11z"/><path d="M2.5 13.5V2.5h3.2v8.2"/>'),
  "mate:angle": svg('<path d="M2 13.5h12"/><path d="M2 13.5L11.8 4.6"/><path d="M12.4 3.8l1.6 1.8"/><path d="M7.4 13.5a5.2 5.2 0 0 0-1.6-3.6"/>'),
  "mate:parallelAxes": svg('<path d="M5 14.5L7.6 1.5" stroke-dasharray="2.4 1.6"/><path d="M10.4 14.5L13 1.5" stroke-dasharray="2.4 1.6"/>'),
  "mate:perpendicularAxes": svg('<path d="M3 2v11.5" stroke-dasharray="2.4 1.6"/><path d="M3 13.5h11" stroke-dasharray="2.4 1.6"/><path d="M3 10h3.5v3.5"/>'),
  "mate:angleAxes": svg('<path d="M2.5 13.5h11" stroke-dasharray="2.4 1.6"/><path d="M2.5 13.5L11.5 4.5" stroke-dasharray="2.4 1.6"/><path d="M7.5 13.5a5 5 0 0 0-1.4-3.4"/>'),
  "mate:tangent": svg('<circle cx="8" cy="10" r="4"/><path d="M1.5 6h13"/>'),
  "mate:axisToFace": svg('<path d="M1.8 12.8l3.2-3.2h9.2l-3.2 3.2z"/><path d="M8 9.6V1.8" stroke-dasharray="2.4 1.6"/><path d="M8 9.6h2.6"/><path d="M10.6 9.6V7"/>'),
  sameHeight: svg('<circle cx="3.6" cy="8" r="1.5"/><circle cx="12.4" cy="8" r="1.5"/><path d="M5.5 8h5" stroke-dasharray="1.4 1.6"/>'),
  sameAcross: svg('<circle cx="8" cy="3.6" r="1.5"/><circle cx="8" cy="12.4" r="1.5"/><path d="M8 5.5v5" stroke-dasharray="1.4 1.6"/>'),
});

/** Which icon a relation uses: the table's kinds share icons (equal length and equal radius are both "equal"; every number is a "dimension" or an "angle"). */
export const iconKey = (kind: string): string => ({ equalLength: "equal", equalRadius: "equal", distance: "dimension", length: "dimension", diameter: "radius", "select:similar": "similar", "select:ungroup": "ungroup", "select:group": "group" }[kind as "equalLength"] ?? kind);
export const iconSvg = (key: string): string => ICONS[key] ?? ICONS.dimension!;
