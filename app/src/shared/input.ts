// Raw input and intents (`prin_input_agnostic`, `dec_clean_engine_design` section 5).
// The platform layer turns device events into RawInput records (plain data); the interaction layer turns those into Intents. Nothing downstream mentions a device.

export interface Mods { shift: boolean; ctrl: boolean; alt: boolean }
export type Device = "mouse" | "touch" | "pen";

export type RawInput =
  | { kind: "down" | "move" | "up" | "cancel"; id: number; device: Device; x: number; y: number; /** with the pointer held at the screen's centre (game mode, `in_304`): how far the mouse moved, which the screen's edge cannot stop */ dx?: number; dy?: number; button: number; mods: Mods; t: number }
  | { kind: "wheel"; x: number; y: number; dx: number; dy: number; /** 0 pixels, 1 lines, 2 pages */ unit: 0 | 1 | 2; /** the legacy wheelDeltaY (multiples of 120 for a wheel notch) when the device reports it */ wheelDeltaY: number | null; mods: Mods; t: number }
  | { kind: "gesture"; phase: "start" | "change" | "end"; scale: number; x: number; y: number; t: number } // Safari's pinch
  | { kind: "key"; key: string; down: boolean; mods: Mods; t: number }
  | { kind: "tick"; t: number } // time passing while a finger is down (for the long press)
  | { kind: "leave"; t: number }; // the pointer left the drawing area

export type LookPlane = "X" | "Y" | "Z" | "N";
export type Intent =
  | { type: "hover"; x: number; y: number }
  | { type: "hoverEnd" }
  /**
   * A tap while a sketch tool is on, for a device with no hover (`in_286`): the point the cursor is held at is set (a click there), and the tap's own place becomes where the cursor is held next, to be moved with the drag
   * icon and its hints; with no cursor held yet, the tap only holds it there. When the figure is complete nothing is held after it: a tap after the last point is what applies it.
   */
  | { type: "tapAim"; x: number; y: number }
  /** a cut of bodies being set up (`in_294`): keep or toss the part `mask`, or join / separate what is kept */
  | { type: "cut"; act: "toggle"; mask: number }
  | { type: "cut"; act: "join" }
  /** A finger drags a point of the figure being drawn that is already placed (`in_288`): the point `index` (0 the first) goes where the finger's icon is, with the hints a hover would give it. */
  | { type: "movePoint"; index: number; x: number; y: number }
  | { type: "click"; x: number; y: number; count: number; shift: boolean }
  | { type: "menu"; x: number; y: number; /** from the menu button: act on the selection, ignore what is under the point */ button?: boolean; /** opened by a finger (a long press): it gets the options only a finger needs, like adding to the selection (`in_663`) */ touch?: boolean }
  /** a drag that orbits (or drags a handle): the movement since the last event and where the pointer is now; the drag began at (x - total dx, y - total dy) */
  | { type: "orbit"; dx: number; dy: number; x: number; y: number; /** made with the right button: it only turns the view, it never drags a handle or a corner (`in_146`) */ view?: boolean }
  /** the left button has been held down on one spot for a while (`in_235`): what follows, still without letting up, draws a selection rectangle; let go, it selects. `shift`: it adds to the selection */
  | { type: "hold"; x: number; y: number; shift: boolean; /** Ctrl (Cmd): what is in the rectangle is taken out of the selection (`in_257`) */ remove?: boolean }
  /** the pointer went up after a drag */
  | { type: "dragEnd" }
  | { type: "pan"; dx: number; dy: number }
  /** W A S D held (`in_300`): the view moves forward / back and left / right by `forward` and `right` (each -1, 0 or 1) for `dt` seconds */
  /** the Reset camera button: back to the last thing that was in view (`in_303`) */
  | { type: "resetView" }
  | { type: "walk"; forward: number; right: number; dt: number }
  /** the pointer moved while W A S D is held: the view turns about where the eye is, up / down / left / right */
  | { type: "swivel"; dx: number; dy: number }
  | { type: "zoom"; factor: number; x: number; y: number }
  | { type: "look"; plane: LookPlane }
  | { type: "home" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "delete" }
  | { type: "escape" }
  | { type: "exitSketch" }
  | { type: "sketchCut" }
  | { type: "save" }
  | { type: "open" }
  | { type: "buildNext" } // (a model that is made a part at a time: the kernel has answered, make the next part, `dec_gear_models`)
  | { type: "runAction"; id: string; /** the part an item of a gear's icon was clicked for: it is selected first when what is selected is not that gear (`in_864`) */ part?: string }
  /** the button on a refused change: delete the constraints that stopped it and do it (`in_366`) */
  | { type: "overrideRefusal" }
  /** what pushing or pulling a flat face does: move it with the step that made it, extrude a prism from it, or extend it with its neighbours (`in_405`) */
  | { type: "faceKind"; kind: "move" | "extrude" | "extend" }
  /** a fillet of one edge: the same size all along, or a size at each end (`in_406`) */
  | { type: "loftKind"; id: string }
  | { type: "sweepPlace"; id: string }
  /** game mode (`in_467`): the mouse turning while the menu is open (its selection goes round the ring) */
  | { type: "menuTurn"; dx: number; dy: number }
  | { type: "sizeKind"; kind: "constant" | "variable" | "twoDistances" | "swap" }
  /** the pointer is over that button: the flash waits (`in_366`) */
  | { type: "holdFlash" }
  /** start a drawing tool or an operation (a key or the menu) */
  /** a box of the select similar chip: that rule on or off (`in_257`) */
  /** Ctrl + G and Ctrl + Shift + G (`in_257`) */
  | { type: "group" }
  | { type: "ungroup" }
  | { type: "similarRule"; rule: "kind" | "size" | "angle" | "direction" }
  | { type: "begin"; name: "pushpull" | "rect" | "circle" | "polygon" | "line" | "arc" | "spline" | "cam" | "trim" | "gear" | "extrude" | "edge" | "move" | "rotate" | "scale" | "dimension" | "revolve" | "loft" | "sweep" | "mirror" }
  /** a constraint shown on a selected part: open or close it (its other parts show amber), delete it, lock or unlock its number, give it a new number (`set`), or lock the measure of the selection at a number (`measure`) */
  | { type: "relation"; act: "focus" | "remove" | "lock" | "set" | "measure"; id: string | null; value?: number }
  /** a key for the number being typed (digits, ".", "-", Backspace, Tab, Enter, the arrows) */
  | { type: "typed"; key: string; shift: boolean }
  /** move the head of the toolpath preview (0 to 1), or end the preview (`in_570`) */
  | { type: "previewAt"; at: number }
  | { type: "motionAt"; amount: number }
  | { type: "motionPlay" }
  | { type: "motionKind"; kind: "turn" | "slide" }
  | { type: "motionReverse" }
  /** take the view to the collision that stopped the motion (`in_1191`) */
  | { type: "motionShowClash" }
  /** the speed of the play as a multiple of what it began at (`in_1169`) */
  | { type: "motionSpeed"; k: number }
  | { type: "motionLink"; id: string; ratio?: number; kind?: "turn" | "slide"; remove?: true }
  | { type: "motionRest"; ref: string; rest: number | null }
  | { type: "motionKeep" }
  /** the walk that replaces what the push does with joints (`in_1122`): open it (the fit is made), make the joint offered, leave it, or stop */
  | { type: "motionFix"; act: "open" | "apply" | "skip" | "close" }
  | { type: "motionClose" }
  | { type: "previewClose" }
  /** open or close a list from the ⋯ menu (the bodies, the history) */
  | { type: "panel"; name: "bodies" | "history" | "groups" | "sketches" | "parameters" | "constraints" | "measure" }
  /** a row of the open list: select it (a body) or take it out (a step) */
  | { type: "panelRow"; id: string; act: "select" | "remove" | "sketch" | "edit" | "hide" | "pick" }
  | { type: "panelAction"; id: string }
  /** the History (`dec_history_navigation`): go to a step, open or close the numbers of a step, set one of them */
  | { type: "stepGo"; id: string }
  | { type: "stepEdit"; id: string | null }
  | { type: "stepInsert" }
  | { type: "stepSet"; id: string; key: string; value: number }
  | { type: "stepLink"; id: string; key: string; expr: string }
  | { type: "paramSet"; name: string; expr: string }
  | { type: "paramRemove"; name: string }
  /** the text of a field of the value box changed (a tool's field, or the operation's one number) */
  | { type: "entry"; field: number; text: string }
  /** the Apply and Cancel buttons of a repeat being set up (`in_141`) */
  | { type: "repeatApply" }
  | { type: "repeatCancel" };
