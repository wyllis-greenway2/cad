import { settings } from "./settings.ts";

/**
 * How much of a mouse movement of `mag` pixels turns the view (`in_420`): a little less than all of it for the smallest movements, so a fine edge or an arrow can be taken without the view
 * slipping, rising to all of it as the movement grows (a fast movement is as it always was).
 */
export const fineGain = (mag: number): number => 1 - (1 - settings.input.fineGain) * Math.exp(-Math.max(0, mag) / settings.input.fineFadePx);
