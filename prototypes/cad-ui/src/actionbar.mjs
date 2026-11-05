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

export function barItems(ctx) {
  const k = (action) => keyLabel(ctx.keys[action]);
  const item = (id, label, action, extra = {}) => ({ id, label, key: action ? k(action) : "", enabled: true, reason: null, active: false, ...extra });
  const groups = [];
  const edit = { id: "edit", items: [item("act:undo", "Undo", "undo", { enabled: ctx.canUndo }), item("act:redo", "Redo", "redo", { enabled: ctx.canRedo })] };

  if (ctx.mode === "op") {
    // a pull, move, rotate, fillet... is in progress
    groups.push({ id: "op", items: [item("apply", "Apply", "confirm"), item("cancel", "Cancel", "cancel"), ...(ctx.op?.editing ? [item("act:delete", "Delete step", "delete")] : [])] });
    return groups;
  }

  if (ctx.mode === "sketch") {
    const tools = [["select", "Select"], ["line", "Line"], ["rect", "Rectangle"], ["circle", "Circle"], ["dimension", "Dimension"], ["extrude", "Extrude"]];
    groups.push({ id: "tools", items: tools.map(([t, label]) => item(`tool:${t}`, label, t, { active: ctx.tool === t, enabled: !(ctx.editingStepSketch && ["line", "rect", "circle", "extrude"].includes(t)), reason: ctx.editingStepSketch ? "this sketch belongs to its step: resize it with Dimension" : null })) });
    if (ctx.tool === "select" && ctx.offers.length) {
      groups.push({ id: "constraints", items: ctx.offers.map((o, i) => item(`cons:${i}`, o.label, CONS_KEY[o.label], { enabled: o.enabled, reason: o.reason, active: !!o.active })) });
    }
    const del = ctx.sketchHasSelection ? [item("act:delete", "Delete", "delete")] : [];
    groups.push({ id: "edit", items: [...del, ...edit.items, item("act:cancel", "3D view", "cancel")] });
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
