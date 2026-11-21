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
  cross: svg('<path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/>'),
};
export const iconSvg = (key: string): string => ICONS[key] ?? "";
