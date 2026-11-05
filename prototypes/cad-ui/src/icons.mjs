// Small icons for constraints (inline SVG, 16 x 16, drawn with the current text color). Pure data: no DOM here.
const svg = (inner) => `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const ICONS = {
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

const TITLES = {
  horizontal: "Horizontal", vertical: "Vertical", perpendicular: "Perpendicular", parallel: "Parallel", equal: "Equal", coincident: "Coincident", fixed: "Fixed in place",
  dimension: "Locked size", angle: "Locked angle", radius: "Locked radius", lock: "Locked",
};

/** Which icon a stored constraint uses. */
export const iconKey = (type) => ({ equalLength: "equal", equalRadius: "equal", distance: "dimension", hdist: "dimension", vdist: "dimension" }[type] ?? type);
export const iconSvg = (key) => ICONS[key] ?? ICONS.dimension;
export const iconTitle = (key) => TITLES[key] ?? key;
