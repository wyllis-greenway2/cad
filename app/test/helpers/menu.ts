import type { MenuItem } from "../../src/interaction/control/state.ts";
/** The leaves of the right-click ring's tree (the categories opened out), without the "nothing to constrain" placeholder. */
export const flat = (items: MenuItem[]): MenuItem[] => items.flatMap((i) => (i.children ? flat(i.children) : i.id === "none" ? [] : [i]));
