// Small icons (inline SVG, 16 x 16, drawn with the current text colour), ported from the prototype (`app/src/ui/icons.ts`). Only the ones this build uses.
const svg = (inner: string): string => `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const ICONS: Record<string, string> = {
  line: svg('<path d="M3 13L13 3"/><circle cx="3" cy="13" r="1" /><circle cx="13" cy="3" r="1"/>'),
  rect: svg('<rect x="2.5" y="4" width="11" height="8" rx="0.6"/>'),
  circle: svg('<circle cx="8" cy="8" r="5.5"/>'),
  arc: svg('<path d="M3 12.5C3 6 8 2.5 13.5 3.5"/><circle cx="3" cy="12.5" r="1"/><circle cx="13.5" cy="3.5" r="1"/>'),
  sheetPlain: svg('<path d="M2.5 11.5l3-7h8l-3 7z"/>'),
  check: svg('<path d="M3 8.5l3.2 3.2L13 4.8"/>'),
  sketch: svg('<path d="M2.5 13.5l.8-3L11 2.8a1.4 1.4 0 012 2L5.5 12.7z"/><path d="M9.8 4l2.2 2.2"/>'),
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
  concentric: svg('<circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="2.6"/>'),
  onCircle: svg('<circle cx="8" cy="8" r="5.5"/><circle cx="12.4" cy="4.6" r="1.6"/>'),
  onLine: svg('<path d="M2 12.5L14 3.5"/><circle cx="8" cy="8" r="1.7"/>'),
  tangent: svg('<circle cx="8" cy="10" r="4"/><path d="M1.5 6h13"/>'),
  lock: svg('<rect x="3.5" y="7.2" width="9" height="6.3" rx="1.3" fill="currentColor" fill-opacity=".18"/><path d="M5.5 7.2V5.4a2.5 2.5 0 0 1 5 0v1.8"/><circle cx="8" cy="10.3" r="0.9" fill="currentColor" stroke="none"/>'), // (closed)
  unlock: svg('<rect x="3.5" y="7.2" width="9" height="6.3" rx="1.3"/><path d="M5.5 7.2V5.4a2.5 2.5 0 0 1 4.8-1"/>'), // (open: the shackle is up on one side)
  midpoint: svg('<path d="M2 13L14 3"/><circle cx="8" cy="8" r="1.7"/><path d="M5 5.5l2 2M9 9.5l2 2" stroke-width="1"/>'),
  collinear: svg('<path d="M2 12L14 4"/><circle cx="4" cy="10.7" r="1"/><circle cx="12" cy="5.3" r="1"/>'),
  symmetric: svg('<path d="M8 2v12" stroke-dasharray="2 2"/><circle cx="4" cy="6" r="1.3"/><circle cx="12" cy="6" r="1.3"/><path d="M4 11h8"/>'),
  scissors: svg('<circle cx="4.2" cy="11.6" r="2"/><circle cx="4.2" cy="4.4" r="2"/><path d="M5.9 5.5L14 12M5.9 10.5L14 4"/>'),
  trash: svg('<path d="M3 4.5h10"/><path d="M6.2 4.5V3h3.6v1.5"/><path d="M4.3 4.5l.7 8.5h6l.7-8.5"/><path d="M6.8 7v3.8M9.2 7v3.8"/>'),
  pushpull: svg('<path d="M2.5 11.5L8 8.7l5.5 2.8L8 14.3z"/><path d="M8 7V2"/><path d="M5.6 4.4L8 2l2.4 2.4"/>'),
  undo: svg('<path d="M3.5 6.5h5.8a3.2 3.2 0 010 6.4H5.5"/><path d="M6 3.5L3 6.5l3 3"/>'),
  redo: svg('<path d="M12.5 6.5H6.7a3.2 3.2 0 000 6.4h3.8"/><path d="M10 3.5l3 3-3 3"/>'),
  add: svg('<circle cx="6" cy="8" r="4.2"/><circle cx="10" cy="8" r="4.2"/>'),
  round: svg('<path d="M3 13V8a5 5 0 015-5h5"/><path d="M3 13h2M13 3v2" opacity=".5"/>'),
  chamfer: svg('<path d="M3 13V7l4-4h6"/><path d="M3 13h2M13 3v2" opacity=".5"/>'),
  cross: svg('<path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/>'),
};
export const iconSvg = (key: string): string => ICONS[key] ?? "";
