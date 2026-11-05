// Raw input and intents (`prin_input_agnostic`, `dec_clean_engine_design` section 5).
// The platform layer turns device events into RawInput records (plain data); the interaction layer turns those into Intents. Nothing downstream mentions a device.

export interface Mods { shift: boolean; ctrl: boolean; alt: boolean }
export type Device = "mouse" | "touch" | "pen";

export type RawInput =
  | { kind: "down" | "move" | "up" | "cancel"; id: number; device: Device; x: number; y: number; button: number; mods: Mods; t: number }
  | { kind: "wheel"; x: number; y: number; dx: number; dy: number; /** 0 pixels, 1 lines, 2 pages */ unit: 0 | 1 | 2; /** the legacy wheelDeltaY (multiples of 120 for a wheel notch) when the device reports it */ wheelDeltaY: number | null; mods: Mods; t: number }
  | { kind: "gesture"; phase: "start" | "change" | "end"; scale: number; x: number; y: number; t: number } // Safari's pinch
  | { kind: "key"; key: string; down: boolean; mods: Mods; t: number }
  | { kind: "tick"; t: number } // time passing while a finger is down (for the long press)
  | { kind: "leave"; t: number }; // the pointer left the drawing area

export type LookPlane = "X" | "Y" | "Z" | "N";
export type Intent =
  | { type: "hover"; x: number; y: number }
  | { type: "hoverEnd" }
  | { type: "click"; x: number; y: number; count: number; shift: boolean }
  | { type: "menu"; x: number; y: number }
  | { type: "orbit"; dx: number; dy: number }
  | { type: "pan"; dx: number; dy: number }
  | { type: "zoom"; factor: number; x: number; y: number }
  | { type: "look"; plane: LookPlane }
  | { type: "home" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "delete" }
  | { type: "escape" }
  | { type: "runAction"; id: string }
  /** start a drawing tool or an operation (a key or the menu) */
  | { type: "begin"; name: "rect" | "circle" | "line" | "extrude" | "round" | "bevel" | "move" | "rotate" | "scale" | "dimension" }
  /** a badge on the selection: focus it (its other parts show in amber), remove it, lock or unlock its number, edit its number */
  | { type: "relation"; act: "focus" | "remove" | "lock" | "edit"; id: string | null }
  /** a key for the number being typed (digits, ".", "-", Backspace, Tab, Enter, the arrows) */
  | { type: "typed"; key: string; shift: boolean };
