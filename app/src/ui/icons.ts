// Small icons (inline SVG, 16 x 16, drawn with the current text colour), ported from the prototype. Pure data.
const svg = (inner: string): string => `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const ICONS: Record<string, string> = {
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
  line: svg('<path d="M3 13L13 3"/><circle cx="3" cy="13" r="1" /><circle cx="13" cy="3" r="1"/>'),
  pushpull: svg('<path d="M2.5 11.5L5.5 6h8l-3 5.5z"/><path d="M8 14V2.5"/><path d="M5.8 4.7L8 2.5l2.2 2.2"/>'),
  move: svg('<path d="M8 2v12M2 8h12"/><path d="M6 4l2-2 2 2M6 12l2 2 2-2M4 6L2 8l2 2M12 6l2 2-2 2"/>'),
  rotate: svg('<path d="M13 8a5 5 0 11-1.6-3.7"/><path d="M13.2 2.4v3h-3"/>'),
  scale: svg('<rect x="2.5" y="7.5" width="6" height="6" rx="0.6"/><path d="M8 8l5.5-5.5"/><path d="M9.5 2.5h4v4"/>'),
  copy: svg('<rect x="5.5" y="5.5" width="8" height="8" rx="1"/><path d="M10.5 3.5v-.5a1 1 0 00-1-1h-6a1 1 0 00-1 1v6a1 1 0 001 1h.5"/>'),
  linear: svg('<rect x="1.5" y="5.5" width="3.6" height="5" rx="0.5"/><rect x="6.2" y="5.5" width="3.6" height="5" rx="0.5"/><rect x="10.9" y="5.5" width="3.6" height="5" rx="0.5"/>'),
  circular: svg('<circle cx="8" cy="2.8" r="1.6"/><circle cx="13.2" cy="8" r="1.6"/><circle cx="8" cy="13.2" r="1.6"/><circle cx="2.8" cy="8" r="1.6"/>'),
  trash: svg('<path d="M3 4.5h10"/><path d="M6 4.5V3h4v1.5"/><path d="M4.5 4.5l.6 8.5h5.8l.6-8.5"/><path d="M7 7v4M9 7v4"/>'),
  eye: svg('<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>'),
  sketch: svg('<path d="M2.5 13.5l.8-3L11 2.8a1.4 1.4 0 012 2L5.5 12.7z"/><path d="M9.8 4l2.2 2.2"/>'),
  constraint: svg('<path d="M2.5 13.5h11"/><path d="M4 13.5V6"/><path d="M12 13.5V6"/><path d="M4 8h8"/><path d="M5.8 6.4L4 8l1.8 1.6M10.2 6.4L12 8l-1.8 1.6"/>'),
  body: svg('<path d="M8 1.8l5.5 3v6.4l-5.5 3-5.5-3V4.8z"/><path d="M2.5 4.8L8 8l5.5-3.2"/><path d="M8 8v6.2"/>'),
  undo: svg('<path d="M3.5 6.5h5.8a3.2 3.2 0 010 6.4H5.5"/><path d="M6 3.5L3 6.5l3 3"/>'),
  redo: svg('<path d="M12.5 6.5H6.7a3.2 3.2 0 000 6.4h3.8"/><path d="M10 3.5l3 3-3 3"/>'),
  fingerdrag: svg('<path d="M6.4 8.6V3.3a1.1 1.1 0 012.2 0v4.1"/><path d="M8.6 7.4V6.6a1.1 1.1 0 012.2 0v1.2"/><path d="M10.8 7.8a1.1 1.1 0 012.2 0v2.4a4 4 0 01-4 4H8a3.2 3.2 0 01-2.6-1.3L3.2 9.9a1.1 1.1 0 011.8-1.2l1.4 1.5"/><path d="M1.6 3.3l1.3-1.2M1.6 3.3l1.3 1.2M1.6 3.3h3.2M14.4 3.3l-1.3-1.2M14.4 3.3l-1.3 1.2M14.4 3.3h-3.2"/>'),
  check: svg('<path d="M3 8.5l3.2 3.2L13 4.5"/>'),
  cross: svg('<path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/>'),
  // the mates between faces and axes of two bodies (`in_338`): what each one does, drawn as the faces or axes it joins; not the measure stick
  "mate:flush": svg('<rect x="3" y="2.2" width="10" height="5.3" rx=".8"/><rect x="3" y="8.5" width="10" height="5.3" rx=".8"/><path d="M1.4 8h13.2" stroke-width="2.2"/>'),
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
export const iconKey = (kind: string): string => ({ equalLength: "equal", equalRadius: "equal", distance: "dimension", length: "dimension", diameter: "radius", "select:similar": "similar", "select:ungroup": "ungroup" }[kind as "equalLength"] ?? kind);
export const iconSvg = (key: string): string => ICONS[key] ?? ICONS.dimension!;
