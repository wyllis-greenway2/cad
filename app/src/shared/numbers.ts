// Small number helpers that more than one layer needs (one copy each, `in_282`).

/** The number typed into a field, or null while it is not one yet (empty, a lone minus or a lone point). */
export const typedNumber = (s: string): number | null => {
  const v = Number(s);
  return s !== "" && s !== "-" && s !== "." && Number.isFinite(v) ? v : null;
};
/** A number as shown to the person: rounded to two places, no trailing zeros. */
export const roundedText = (v: number): string => String(Math.round(v * 100) / 100);
