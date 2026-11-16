// The roller chains the sprockets are made for (`dec_gear_tool`): the ANSI numbers, and the ISO 606 B series (and the A series, which is the ANSI chains of those pitches, the numbers 40 to 120).
import type { GearSpec } from "./gear.ts";

export const IN = 25.4;
/** the ANSI roller chains: pitch, roller diameter and the tooth width of a single strand sprocket, in inches (Martin Sprocket's catalogue, "Chain Data For All Sprockets") */
export const CHAINS: Record<number, { pitch: number; roller: number; tooth: number }> = {
  25: { pitch: 0.25, roller: 0.13, tooth: 0.11 }, 35: { pitch: 0.375, roller: 0.2, tooth: 0.168 }, 41: { pitch: 0.5, roller: 0.306, tooth: 0.227 }, 40: { pitch: 0.5, roller: 0.312, tooth: 0.284 },
  50: { pitch: 0.625, roller: 0.4, tooth: 0.343 }, 60: { pitch: 0.75, roller: 0.469, tooth: 0.459 }, 80: { pitch: 1, roller: 0.625, tooth: 0.575 }, 100: { pitch: 1.25, roller: 0.75, tooth: 0.692 },
  120: { pitch: 1.5, roller: 0.875, tooth: 0.924 },
};
/** the ISO 606 B series: pitch, roller diameter and inner width, mm (the roller diameters as the sources agree: planichapa, chainsprocketchina and Merley's chart; the number is the pitch in sixteenths of an inch) */
export const ISO_B: Record<number, { pitch: number; roller: number; inner: number }> = {
  6: { pitch: 9.525, roller: 6.35, inner: 5.72 }, 8: { pitch: 12.7, roller: 8.51, inner: 7.75 }, 10: { pitch: 15.875, roller: 10.16, inner: 9.65 }, 12: { pitch: 19.05, roller: 12.07, inner: 11.68 },
  16: { pitch: 25.4, roller: 15.88, inner: 17.02 }, 20: { pitch: 31.75, roller: 19.05, inner: 19.56 }, 24: { pitch: 38.1, roller: 25.4, inner: 25.4 },
};

/** the pitch and roller diameter (mm) a sprocket's chain has: its numbers if given, else its number's (ANSI 40, or an ISO sprocket's B series 8, if none) */
export function chainOf(s: NonNullable<GearSpec["sprocket"]>): { pitch: number; roller: number } | null {
  const b = s.iso ? ISO_B[s.chain ?? 8] : undefined; // (an ISO sprocket's chain number is the B series' 6 to 24, or an ANSI number for the A series)
  if (b && s.pitch === undefined && s.roller === undefined) return { pitch: b.pitch, roller: b.roller };
  const c = CHAINS[s.chain ?? (s.iso ? 80 : 40)];
  const [pitch, roller] = [s.pitch ?? (c ? c.pitch * IN : NaN), s.roller ?? (c ? c.roller * IN : NaN)];
  return Number.isFinite(pitch) && Number.isFinite(roller) && pitch > 0 && roller > 0 ? { pitch, roller } : null;
}

