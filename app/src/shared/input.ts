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
  | { type: "menu"; x: number; y: number; /** from the menu button: act on the selection, ignore what is under the point */ button?: boolean }
  /** a drag that orbits (or drags a handle): the movement since the last event and where the pointer is now; the drag began at (x - total dx, y - total dy) */
  | { type: "orbit"; dx: number; dy: number; x: number; y: number; /** made with the right button: it only turns the view, it never drags a handle or a corner (`in_146`) */ view?: boolean }
  /** the pointer went up after a drag */
  | { type: "dragEnd" }
  | { type: "pan"; dx: number; dy: number }
  | { type: "zoom"; factor: number; x: number; y: number }
  | { type: "look"; plane: LookPlane }
  | { type: "home" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "delete" }
  | { type: "escape" }
  | { type: "save" }
  | { type: "open" }
  | { type: "runAction"; id: string }
  /** start a drawing tool or an operation (a key or the menu) */
  | { type: "begin"; name: "pushpull" | "rect" | "circle" | "line" | "arc" | "trim" | "extrude" | "edge" | "move" | "rotate" | "scale" | "dimension" }
  /** a constraint shown on a selected part: open or close it (its other parts show amber), delete it, lock or unlock its number, give it a new number (`set`), or lock the measure of the selection at a number (`measure`) */
  | { type: "relation"; act: "focus" | "remove" | "lock" | "set" | "measure"; id: string | null; value?: number }
  /** a key for the number being typed (digits, ".", "-", Backspace, Tab, Enter, the arrows) */
  | { type: "typed"; key: string; shift: boolean }
  /** open or close a list from the ⋯ menu (the bodies, the history) */
  | { type: "panel"; name: "bodies" | "history" }
  /** a row of the open list: select it (a body) or take it out (a step) */
  | { type: "panelRow"; id: string; act: "select" | "remove" | "sketch" }
  /** the text of a field of the value box changed (a tool's field, or the operation's one number) */
  | { type: "entry"; field: number; text: string }
  /** the Apply and Cancel buttons of a repeat being set up (`in_141`) */
  | { type: "repeatApply" }
  | { type: "repeatCancel" };
