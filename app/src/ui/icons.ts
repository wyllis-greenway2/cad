// Small icons (inline SVG, 16 x 16, drawn with the current text colour), ported from the prototype. Pure data.
const svg = (inner: string): string => `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const ICONS: Record<string, string> = {
  // change the numbers of a step in the History (`dec_history_navigation`)
  pencil: svg('<path d="M2.5 13.5l.8-3.2 7.6-7.6 2.4 2.4-7.6 7.6z"/><path d="M9.2 4.4l2.4 2.4"/>'),
  // a hard body (`in_473`): two blocks that stop against each other
  hard: svg('<rect x="1.8" y="5" width="5.2" height="6" rx=".8"/><rect x="9" y="5" width="5.2" height="6" rx=".8"/><path d="M7.6 8h.8" stroke-width="2"/>'),
  // the world orb (`in_463`): an eye (a click would show the world), a crossed eye (a click would put it away)
  eye: svg('<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>'),
  eyeOff: svg('<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/><path d="M2.5 13.5l11-11"/>'),
  // the modes of a sheet's icon (`in_459`): the plane edge on, and the half that is cut away dashed (above, below), no cut, invisible
  sheetCutUp: svg('<path d="M2 10h12"/><path d="M3 6h10M3 3.5h10" stroke-dasharray="1.6 1.4" opacity=".7"/><path d="M8 8.4V7.6" />'),
  sheetCutDown: svg('<path d="M2 6h12"/><path d="M3 10h10M3 12.5h10" stroke-dasharray="1.6 1.4" opacity=".7"/>'),
  sheetPlain: svg('<path d="M2.5 11.5l3-7h8l-3 7z"/>'),
  sheetHidden: svg('<path d="M2.5 11.5l3-7h8l-3 7z" stroke-dasharray="1.6 1.6" opacity=".6"/><path d="M2 2.5l12 11"/>'),
  sheetArrow: svg('<path d="M8 2v12"/><path d="M5.5 4.5L8 2l2.5 2.5M5.5 11.5L8 14l2.5-2.5"/>'),
  sheetFree: svg('<circle cx="8" cy="8" r="1.8"/><path d="M8 1.5v3.2M8 11.3v3.2M1.5 8h3.2M11.3 8h3.2"/>'),
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
  offset: svg('<rect x="1.8" y="3.2" width="12.4" height="9.6" rx="1"/><rect x="4.6" y="5.8" width="6.8" height="4.4" rx=".6"/>'),
  concentric: svg('<circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="2.6"/>'),
  onCircle: svg('<circle cx="8" cy="8" r="5.5"/><circle cx="12.4" cy="4.6" r="1.6"/>'),
  onLine: svg('<path d="M2 12.5L14 3.5"/><circle cx="8" cy="8" r="1.7"/>'),
  tangent: svg('<circle cx="8" cy="10" r="4"/><path d="M1.5 6h13"/>'),
  rect: svg('<rect x="2.5" y="4" width="11" height="8" rx="0.6"/>'),
  circle: svg('<circle cx="8" cy="8" r="5.5"/>'),
  gear: svg('<path d="M6.9 1.8h2.2l.4 1.9 1.3.6 1.6-1.1 1.5 1.5-1.1 1.6.6 1.3 1.9.4v2.2l-1.9.4-.6 1.3 1.1 1.6-1.5 1.5-1.6-1.1-1.3.6-.4 1.9H6.9l-.4-1.9-1.3-.6-1.6 1.1-1.5-1.5 1.1-1.6-.6-1.3-1.9-.4V6.9l1.9-.4.6-1.3-1.1-1.6 1.5-1.5 1.6 1.1 1.3-.6z"/><circle cx="8" cy="8" r="2.2"/>'), // (a toothed wheel with its bore: the gear tool, `dec_gear_tool`)
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
  "mate:axisToFace": svg('<path d="M1.8 12.8l3.2-3.2h9.2l-3.2 3.2z"/><path d="M8 9.6V1.8" stroke-dasharray="2.4 1.6"/><path d="M8 9.6h2.6"/><path d="M10.6 9.6V7"/>'),
  sameHeight: svg('<circle cx="3.6" cy="8" r="1.5"/><circle cx="12.4" cy="8" r="1.5"/><path d="M5.5 8h5" stroke-dasharray="1.4 1.6"/>'),
  sameAcross: svg('<circle cx="8" cy="3.6" r="1.5"/><circle cx="8" cy="12.4" r="1.5"/><path d="M8 5.5v5" stroke-dasharray="1.4 1.6"/>'),
});

/** Which icon a relation uses: the table's kinds share icons (equal length and equal radius are both "equal"; every number is a "dimension" or an "angle"). */
export const iconKey = (kind: string): string => ({ equalLength: "equal", equalRadius: "equal", distance: "dimension", length: "dimension", diameter: "radius", "select:similar": "similar", "select:ungroup": "ungroup", "select:group": "group" }[kind as "equalLength"] ?? kind);
export const iconSvg = (key: string): string => ICONS[key] ?? ICONS.dimension!;
