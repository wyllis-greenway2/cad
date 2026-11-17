// A route's settings as a schema, so the settings screen is made from it and a user can fill in a machine we never built a screen for (`dec_manufacturing_definitions` point 4). Plain data.

/** A value a setting can hold. */
export type ParamValue = number | string | boolean;

/** One setting. `unit` is shown and kept with the value (mm, mm/min, W, degC, deg, rpm, %, or none) so nothing mixes millimetres with inches. */
export interface ParamSpec {
  id: string;
  label: string;
  kind: "number" | "boolean" | "choice" | "text";
  unit?: string;
  min?: number;
  max?: number;
  default: ParamValue;
  /** for `choice`: the values it may take */
  choices?: { value: string; label: string }[];
  /** a short line shown under the field */
  help?: string;
  /** settings that belong together are shown together */
  group?: string;
}
