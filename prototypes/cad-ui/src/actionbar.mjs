// The context action bar: what can be done right now, from what is selected, with the hotkey for each. Pure (no DOM, no three.js).
//
// barItems(ctx) returns groups of buttons: [{ id: "tools", items: [{ id, label, key, enabled, reason, active }] }, ...].
// An item's `id` says what it does (the view maps it to a function): "tool:<name>", "cons:<offer index>", "act:<action name>", "apply", "cancel".
// `key` is the hotkey as written on the button ("M", "Ctrl+Z", "Shift+H"); it comes from the same keymap that handles the key press, so they cannot disagree.

/** How a key spec from the keymap reads on a button. */
export function keyLabel(spec) {
  if (!spec) return "";
  const first = [].concat(spec)[0];
  const names = { mod: "Ctrl", shift: "Shift", alt: "Alt", escape: "Esc", delete: "Del", backspace: "Backspace", enter: "Enter", tab: "Tab" };
  return first.split("+").map((p) => names[p] ?? (p.length === 1 ? p.toUpperCase() : p)).join("+");
}

// which keymap action a constraint button uses (the first of the keys is shown)
const CONS_KEY = {
  Horizontal: "consH", Vertical: "consV", "Equal length": "consE", "Equal radius": "consE", Parallel: "consL", Perpendicular: "consP", "Fix in place": "consF", Coincident: "consC",
};

// the icon (see icons.mjs) and the help line (for the tooltip) of each action, by its label
const ICON = {
  Select: "select", Line: "line", Rectangle: "rect", Circle: "circle", Dimension: "dimTool", Extrude: "extrude",
  Horizontal: "horizontal", Vertical: "vertical", "Equal length": "equal", "Equal radius": "equal", Parallel: "parallel", Perpendicular: "perpendicular", "Fix in place": "fixed",
  Coincident: "coincident", "Same height": "sameHeight", "Same position across": "sameAcross",
  "Move face": "moveFace", "Tilt face": "tilt", "Sketch on surface": "sketchOn", "Sketch on it": "sketchOn", "Change radius": "radius", Taper: "taper", Fillet: "fillet", Chamfer: "chamfer",
  Move: "move", Rotate: "rotate", Scale: "scale", Delete: "trash", "Delete step": "trash", "Home view": "home", "Return to origin": "origin", Undo: "undo", Redo: "redo",
  Apply: "check", Cancel: "cross", "Exit sketch": "view3d", "Look straight at the sketch": "viewNormal",
};
const HELP = {
  Select: "Pick lines, corners, circles or whole shapes. Shift-click adds. Drag to move.", Line: "Draw connected lines. Click the first point again to close the shape.",
  Rectangle: "Draw a rectangle: four lines with horizontal and vertical constraints you can turn off.", Circle: "Draw a circle from its centre.",
  Dimension: "Click a shape and type exact sizes. Each becomes a locked constraint.", Extrude: "Pull the closed shape into a solid (out adds, in cuts).",
  Horizontal: "Make the line level and keep it level.", Vertical: "Make the line upright and keep it upright.", "Equal length": "Make the two lines the same length.", "Equal radius": "Make the two circles the same size.",
  Parallel: "Keep the two lines parallel.", Perpendicular: "Keep the two lines at a right angle.", "Fix in place": "Pin this corner where it is.", Coincident: "Put the two corners on the same spot.",
  "Same height": "Keep the two corners level with each other.", "Same position across": "Keep the two corners one above the other.",
  "Move face": "Push or pull the face along its normal (out adds material, in cuts it).", "Tilt face": "Turn the face about an axis in it.", "Sketch on surface": "Start a sketch on this face.",
  "Sketch on it": "Start a sketch on this shape's plane.", "Change radius": "Change the radius of this round face.", Taper: "Give this round face a taper angle.", Fillet: "Round this edge.", Chamfer: "Bevel this edge.",
  Move: "Move the whole body along X, Y or Z.", Rotate: "Rotate the whole body about X, Y or Z.", Scale: "Scale the whole body.", Delete: "Delete the selection.", "Delete step": "Delete this step from the history.",
  "Home view": "Return to the standard 3D view.", "Return to origin": "Bring the world origin back into view.", Undo: "Undo the last change.", Redo: "Redo what was undone.",
  Apply: "Apply this change.", Cancel: "Cancel this change.", "Exit sketch": "Leave the sketch (you can sketch from any camera angle, so orbiting does not leave it).", "Look straight at the sketch": "Turn the view to face the sketch plane squarely.",
};

export function barItems(ctx) {
  const k = (action) => keyLabel(ctx.keys[action]);
  const item = (id, label, action, extra = {}) => ({ id, label, icon: ICON[label] ?? "dimension", help: HELP[label] ?? "", key: action ? k(action) : "", enabled: true, reason: null, active: false, ...extra });
  const groups = [];
  const edit = { id: "edit", items: [item("act:undo", "Undo", "undo", { enabled: ctx.canUndo }), item("act:redo", "Redo", "redo", { enabled: ctx.canRedo })] };

  if (ctx.mode === "op") {
    // a pull, move, rotate, fillet... is in progress
    groups.push({ id: "op", items: [item("apply", "Apply", "confirm"), item("cancel", "Cancel", "cancel"), ...(ctx.op?.editing ? [item("act:delete", "Delete step", "delete")] : [])] });
    return groups;
  }

  if (ctx.mode === "sketch") {
    // The bar follows what is picked (`in_056`): lines, corners or circles picked -> only what can be done with them; a whole closed shape -> extrude, dimension, delete;
    // nothing picked, or a drawing tool in use -> the sketching tools. Drawing tools never show while something is picked.
    const del = item("act:delete", "Delete", "delete");
    const look = ctx.faceOn ? [] : [item("act:faceOn", "Look straight at the sketch", "faceOn")]; // you can sketch from any angle; this squares the view up
    if (ctx.tool === "select" && ctx.pickParts) {
      groups.push({ id: "constraints", items: ctx.offers.map((o, i) => item(`cons:${i}`, o.label, CONS_KEY[o.label], { enabled: o.enabled, reason: o.reason, active: !!o.active })) });
      groups.push({ id: "edit", items: [del, ...edit.items, ...look] });
      return groups;
    }
    if (ctx.tool === "select" && ctx.pickShape) {
      groups.push({ id: "shape", items: [...(ctx.pickShapeClosed && !ctx.editingStepSketch ? [item("tool:extrude", "Extrude", "extrude")] : []), item("tool:dimension", "Dimension", "dimension"), del] });
      groups.push({ id: "edit", items: [...edit.items, ...look] });
      return groups;
    }
    const tools = [["select", "Select"], ["line", "Line"], ["rect", "Rectangle"], ["circle", "Circle"], ["dimension", "Dimension"]];
    groups.push({ id: "tools", items: tools.map(([t, label]) => item(`tool:${t}`, label, t, { active: ctx.tool === t, enabled: !(ctx.editingStepSketch && ["line", "rect", "circle"].includes(t)), reason: ctx.editingStepSketch ? "this sketch belongs to its step: resize it with Dimension" : null })) });
    groups.push({ id: "edit", items: [...edit.items, ...look, item("act:cancel", "Exit sketch", "cancel")] });
    return groups;
  }

  // the 3D view: actions for the selection
  const sel = ctx.sel;
  const acts = [];
  if (!sel) {
    acts.push(item("act:home", "Home view", "home"), item("act:origin", "Return to origin", "origin"));
  } else if (sel.kind === "sketch") {
    acts.push(item("act:extrude", "Extrude", "extrude"), item("act:sketch", "Sketch on it", "sketch"), item("act:delete", "Delete", "delete"));
  } else if (sel.kind === "face") {
    if (sel.round) acts.push(item("act:move", "Change radius", "move"), item("act:rotate", "Taper", "rotate"));
    else acts.push(item("act:move", "Move face", "move"), item("act:rotate", "Tilt face", "rotate"), item("act:sketch", "Sketch on surface", "sketch"));
  } else if (sel.kind === "edge") {
    acts.push(item("act:fillet", "Fillet", "fillet"), item("act:chamfer", "Chamfer", "chamfer"));
  } else if (sel.kind === "body") {
    acts.push(item("act:move", "Move", "move"), item("act:rotate", "Rotate", "rotate"), item("act:scale", "Scale", "scale"), item("act:delete", "Delete", "delete"));
  }
  if (acts.length) groups.push({ id: "selection", items: acts });
  groups.push({ id: "view", items: [...(sel ? [item("act:home", "Home view", "home")] : []), ...edit.items] });
  return groups;
}

/** A line of text that says what to do when nothing is offered. */
export function barHint(ctx) {
  if (ctx.mode === "op" || ctx.mode === "sketch") return "";
  if (!ctx.sel) return "Click a face, line or corner; double-click the body to select all of it";
  if (ctx.sel.kind === "vertex") return "Corners cannot be modified yet";
  return "";
}
