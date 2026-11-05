// Small icons (inline SVG, 16 x 16, drawn with the current text colour), ported from the prototype. Pure data.
const svg = (inner: string): string => `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const ICONS: Record<string, string> = {
  horizontal: svg('<path d="M2 8h12"/><path d="M2 5v6M14 5v6"/>'),
  vertical: svg('<path d="M8 2v12"/><path d="M5 2h6M5 14h6"/>'),
  perpendicular: svg('<path d="M3 13V3"/><path d="M3 13h10"/><path d="M3 9h4v4"/>'),
  parallel: svg('<path d="M5 14L8.5 2"/><path d="M10 14L13.5 2"/>'),
  equal: svg('<path d="M3 6h10"/><path d="M3 10h10"/>'),
  coincident: svg('<circle cx="8" cy="8" r="4.6"/><circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none"/>'),
  fixed: svg('<path d="M8 2.5v7.5"/><path d="M5 7.5L8 10.5 11 7.5"/><path d="M3.5 13.5h9"/>'),
  dimension: svg('<path d="M2 11.5L11.5 2 14 4.5 4.5 14z"/><path d="M5 8.5l1.6 1.6M7.4 6l1.6 1.6M9.8 3.6l1.2 1.2"/>'),
  angle: svg('<path d="M2.5 13.5h11"/><path d="M2.5 13.5L11 4.5"/><path d="M7.5 13.5a5 5 0 0 0-1.4-3.4"/>'),
  radius: svg('<circle cx="8" cy="8" r="5.5"/><path d="M8 8l3.9-3.9"/>'),
  lock: svg('<rect x="3.5" y="7.2" width="9" height="6.3" rx="1.3"/><path d="M5.5 7.2V5.4a2.5 2.5 0 0 1 5 0v1.8"/>'),
};

Object.assign(ICONS, {
  select: svg('<path d="M3.5 2.5l8.5 5-3.8 1.1L6.6 12.5z"/>'),
  line: svg('<circle cx="3.6" cy="12.4" r="1.4"/><circle cx="12.4" cy="3.6" r="1.4"/><path d="M4.7 11.3l6.6-6.6"/>'),
  rect: svg('<rect x="2.5" y="4" width="11" height="8" rx="0.9"/>'),
  circle: svg('<circle cx="8" cy="8" r="5.6"/>'),
  dimTool: svg('<path d="M2 8h12"/><path d="M2 8l2.2-2.2M2 8l2.2 2.2M14 8l-2.2-2.2M14 8l-2.2 2.2"/><path d="M2 4.5v7M14 4.5v7"/>'),
  extrude: svg('<path d="M3 13.5h10"/><path d="M4 13.5V9.5h8v4"/><path d="M8 7.5v-6"/><path d="M5.9 3.6L8 1.5l2.1 2.1"/>'),
  moveFace: svg('<rect x="3" y="6.4" width="10" height="3.2" rx="0.6"/><path d="M8 4.6V1.6M6.4 3.1L8 1.5l1.6 1.6"/><path d="M8 11.4v3M6.4 12.9L8 14.5l1.6-1.6"/>'),
  tilt: svg('<path d="M2.5 12.5h11"/><path d="M2.5 12.5l11-4"/><path d="M7 12.5a4.5 4.5 0 0 0-.8-2.2"/>'),
  taper: svg('<path d="M5.2 3h5.6l2.7 10H2.5z"/>'),
  fillet: svg('<path d="M3 2.5V8a5 5 0 0 0 5 5h5.5"/>'),
  chamfer: svg('<path d="M3 2.5v5.8l4.7 4.7h5.8"/>'),
  move: svg('<path d="M8 1.5v13M1.5 8h13"/><path d="M6.2 3.3L8 1.5l1.8 1.8M6.2 12.7L8 14.5l1.8-1.8M3.3 6.2L1.5 8l1.8 1.8M12.7 6.2L14.5 8l-1.8 1.8"/>'),
  rotate: svg('<path d="M13 8a5 5 0 1 1-1.9-3.9"/><path d="M13 2.3v3.2h-3.2"/>'),
  scale: svg('<path d="M3 13L13 3"/><path d="M8.5 3H13v4.5"/><path d="M3 8.5V13h4.5"/>'),
  trash: svg('<path d="M2.8 4.4h10.4"/><path d="M6.2 4.4V2.8h3.6v1.6"/><path d="M4.4 4.4l.6 9h6l.6-9"/><path d="M6.8 7v4M9.2 7v4"/>'),
  home: svg('<path d="M2.2 8L8 2.6 13.8 8"/><path d="M3.8 7v6.6h8.4V7"/>'),
  origin: svg('<circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v3.2M8 11.3v3.2M1.5 8h3.2M11.3 8h3.2"/>'),
  undo: svg('<path d="M3 6.5h6.2a3.6 3.6 0 0 1 0 7.2H5"/><path d="M5.6 3.8L3 6.5l2.6 2.7"/>'),
  redo: svg('<path d="M13 6.5H6.8a3.6 3.6 0 0 0 0 7.2H11"/><path d="M10.4 3.8L13 6.5l-2.6 2.7"/>'),
  check: svg('<path d="M3 8.6l3.3 3.3L13 5"/>'),
  pan: svg('<path d="M8 1.8v12.4M1.8 8h12.4M8 1.8l-1.9 1.9M8 1.8l1.9 1.9M8 14.2l-1.9-1.9M8 14.2l1.9-1.9M1.8 8l1.9-1.9M1.8 8l1.9 1.9M14.2 8l-1.9-1.9M14.2 8l-1.9 1.9"/>'),
  cross: svg('<path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/>'),
  view3d: svg('<path d="M8 1.8l5.6 3.1v6.2L8 14.2 2.4 11.1V4.9z"/><path d="M8 8v6.2M2.4 4.9L8 8l5.6-3.1"/>'),
  viewNormal: svg('<rect x="2.5" y="2.5" width="11" height="11" rx="1"/><path d="M8 5.2v5.6M5.2 8h5.6"/>'),
  sameHeight: svg('<circle cx="3.6" cy="8" r="1.5"/><circle cx="12.4" cy="8" r="1.5"/><path d="M5.5 8h5" stroke-dasharray="1.4 1.6"/>'),
  sameAcross: svg('<circle cx="8" cy="3.6" r="1.5"/><circle cx="8" cy="12.4" r="1.5"/><path d="M8 5.5v5" stroke-dasharray="1.4 1.6"/>'),
});

/** Which icon a relation uses: the table's kinds share icons (equal length and equal radius are both "equal"; every number is a "dimension" or an "angle"). */
export const iconKey = (kind: string): string => ({ equalLength: "equal", equalRadius: "equal", distance: "dimension" }[kind as "equalLength"] ?? kind);
export const iconSvg = (key: string): string => ICONS[key] ?? ICONS.dimension!;
