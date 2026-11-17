// The number system lengths are shown and typed in (`dec_settings_page`, `in_661`). The model is always millimetres, exactly: only what the person reads and types is converted, here and nowhere else.
import { roundedText, typedNumber } from "./numbers.ts";

export type NumberSystem = "mm" | "in";
const MM_PER_INCH = 25.4;
/** The system in use (the settings page changes it; the choice is kept). */
export const units: { system: NumberSystem } = { system: "mm" };

/** A length of the model (mm) as the number to show. */
export const lengthOut = (mm: number): number => (units.system === "in" ? mm / MM_PER_INCH : mm);
/** A length the person typed, in the system in use, as the model's millimetres. */
export const lengthIn = (v: number): number => (units.system === "in" ? v * MM_PER_INCH : v);
/** A length of the model as text: two places in mm, four in inches (a hundredth of an inch is a quarter of a millimetre). */
export const lengthText = (mm: number): string => (units.system === "in" ? String(Math.round((mm / MM_PER_INCH) * 1e4) / 1e4) : roundedText(mm));
/** The name of a unit as shown: "mm" is "in" while inches are in use; angles and counts are as they are. */
export const unitName = (unit: string): string => (units.system === "in" ? (unit === "mm" ? "in" : unit === "mm²" ? "in²" : unit) : unit);
/** An area of the model (mm²) as text: square inches are four places in inches, as for a length. */
export const areaText = (mm2: number): string => (units.system === "in" ? String(Math.round((mm2 / (MM_PER_INCH * MM_PER_INCH)) * 1e4) / 1e4) : roundedText(mm2));
/** A number typed for a length, in the system in use, as the model's millimetres; null while it is not a number yet (see `typedNumber`). */
export const typedLength = (s: string): number | null => { const v = typedNumber(s); return v === null ? null : lengthIn(v); };
