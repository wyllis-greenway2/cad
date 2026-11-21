// Small icons (inline SVG, 16 x 16, drawn with the current text colour), ported from the prototype (`app/src/ui/icons.ts`). Only the ones this build uses.
const svg = (inner: string): string => `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const ICONS: Record<string, string> = {
  line: svg('<path d="M3 13L13 3"/><circle cx="3" cy="13" r="1" /><circle cx="13" cy="3" r="1"/>'),
  rect: svg('<rect x="2.5" y="4" width="11" height="8" rx="0.6"/>'),
  circle: svg('<circle cx="8" cy="8" r="5.5"/>'),
  arc: svg('<path d="M3 12.5C3 6 8 2.5 13.5 3.5"/><circle cx="3" cy="12.5" r="1"/><circle cx="13.5" cy="3.5" r="1"/>'),
  sketch: svg('<path d="M2.5 13.5l.8-3L11 2.8a1.4 1.4 0 012 2L5.5 12.7z"/><path d="M9.8 4l2.2 2.2"/>'),
  section: svg('<path d="M2.5 8L8 5.3l5.5 2.7L8 10.7z" fill="currentColor" fill-opacity=".28" stroke="none"/><path d="M2.5 5.2L8 2.5l5.5 2.7v5.6L8 13.5l-5.5-2.7z"/><path d="M2.5 8L8 10.7 13.5 8"/><path d="M2.5 8L8 5.3 13.5 8" stroke-dasharray="1.4 1.4"/>'),
  sheetPlain: svg('<path d="M2.5 11.5l3-7h8l-3 7z"/>'),
  sheetCutUp: svg('<path d="M2 10h12"/><path d="M3 6h10M3 3.5h10" stroke-dasharray="1.6 1.4" opacity=".7"/><path d="M8 8.4V7.6" />'),
  eye: svg('<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>'),
  eyeOff: svg('<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/><path d="M2.5 13.5l11-11"/>'),
  trash: svg('<path d="M3 4.5h10"/><path d="M6 4.5V3h4v1.5"/><path d="M4.5 4.5l.6 8.5h5.8l.6-8.5"/><path d="M7 7v4M9 7v4"/>'),
  orient: svg('<circle cx="8" cy="8" r="2.1" fill="currentColor"/><path d="M8 5.5V1.8M9.9 9.1l3.3 1.9M6.1 9.1l-3.3 1.9"/><path d="M7 2.8L8 1.7l1 1.1M12.4 10.2l.2 1.5-1.4-.4M3.6 10.2l-.2 1.5 1.4-.4"/>'),
  look: svg('<rect x="3" y="3" width="10" height="10" rx="1" stroke-dasharray="2 1.6"/><path d="M8 5.5V10.5M5.5 8H10.5"/><path d="M1.5 5V2.5H4M12 2.5h2.5V5M14.5 11v2.5H12M4 13.5H1.5V11"/>'),
  move: svg('<path d="M8 2v12M2 8h12"/><path d="M6 4l2-2 2 2M6 12l2 2 2-2M4 6L2 8l2 2M12 6l2 2-2 2"/>'),
  rotate: svg('<path d="M13 8a5 5 0 11-1.6-3.7"/><path d="M13.2 2.4v3h-3"/>'),
  pencil: svg('<path d="M2.5 13.5l.8-3.2 7.6-7.6 2.4 2.4-7.6 7.6z"/><path d="M9.2 4.4l2.4 2.4"/>'),
  lock: svg('<rect x="3.5" y="7.2" width="9" height="6.3" rx="1.3" fill="currentColor" fill-opacity=".18"/><path d="M5.5 7.2V5.4a2.5 2.5 0 0 1 5 0v1.8"/><circle cx="8" cy="10.3" r="0.9" fill="currentColor" stroke="none"/>'),
  unlock: svg('<rect x="3.5" y="7.2" width="9" height="6.3" rx="1.3"/><path d="M5.5 7.2V5.4a2.5 2.5 0 0 1 4.8-1"/>'),
  cross: svg('<path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/>'),
};
export const iconSvg = (key: string): string => ICONS[key] ?? "";
