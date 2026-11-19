// The helpful bar (`in_1160`): every icon that belongs to what is selected (the eye and the play button of a body, the icon of its constraints once it has been double clicked, the gear's list, a sheet's four) is one row of round
// buttons with the suggested constraints (`suggest.ts`): the icons to the left, the suggested constraints to the right. The constraints themselves keep their bubbles on the parts. Pure: the facts in, the row out.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";

/** A round button of the bar: what pressing it runs (`runAction`), its icon and its tooltip; `on` when what it switches is on. */
export interface BarIcon { id: string; icon: string; title: string; on?: true }
/** The gear's own icon and the short list it opens (`gearChip` of the frame). */
export interface BarGear { part: Ref; items: { id: string; label: string; icon: string; enabled: boolean; why: string | null }[] }
export interface Bar { at: Vec3 | null; icons: BarIcon[]; gear: BarGear | null }

/** The facts the bar is made from. */
export interface BarFacts {
  /** the bodies that are selected (or have a face selected), and where the top of the first one is (the row stands there when no part has suggestions) */
  bodies: { ref: Ref; top: Vec3 }[];
  /** a body hooked up to an animation, and whether it plays now */
  play: { body: Ref; playing: boolean } | null;
  /** the body that was double clicked, and the bodies whose constraints are all shown */
  consFor: Ref | null;
  consOn: readonly Ref[];
  /** the one face of a body that is selected: it has the lock for its constraints too (`in_1163`) */
  face: Ref | null;
  /** the sheet that is selected: its mode, whether it is invisible, what its move icon has the handles in, and its first corner */
  sheet: { ref: Ref; mode: 0 | 1 | 2; hidden: boolean; move: 0 | 1; corner: Vec3 } | null;
  gear: { part: Ref; at: Vec3; items: BarGear["items"] } | null;
}

const MODE_ICON = ["sheetCutUp", "sheetCutDown", "sheetPlain"] as const;
const MODE_TITLE = [
  "Cuts away the half the plane faces (tap for the next mode)",
  "Cuts away the other half (tap for the next mode)",
  "Does not cut (tap for the next mode)",
] as const;
const MOVE_TITLE = [
  "Its arrows move it along x, y and z; tap to turn it with the rings instead",
  "Its rings turn it about x, y and z; tap to move it with the arrows instead",
] as const;

/** The row: the icons of what is selected, in a fixed order (the same place for the same icon), where the row is anchored, and the gear. Null when there is nothing to put in it. */
export function barOf(f: BarFacts, suggestAt: Vec3 | null): Bar | null {
  const icons: BarIcon[] = [];
  if (f.sheet) {
    const sh = f.sheet;
    icons.push({ id: `sheet:mode:${sh.ref}`, icon: MODE_ICON[sh.mode], title: MODE_TITLE[sh.mode] });
    icons.push({ id: `sheet:visible:${sh.ref}`, icon: sh.hidden ? "eyeOff" : "eye", title: sh.hidden ? "Invisible: it cannot be pointed at; tap to make it visible" : "Visible; tap to make it invisible" });
    icons.push({ id: "sheet:move", icon: sh.move === 0 ? "move" : "rotate", title: MOVE_TITLE[sh.move] });
    icons.push({ id: `sheet:delete:${sh.ref}`, icon: "trash", title: "Delete this plane" });
  } else if (f.bodies.length === 1) {
    const b = f.bodies[0]!;
    icons.push({ id: `body:eye:${b.ref}`, icon: "eye", title: "Hide this body" });
    if (f.play && f.play.body === b.ref) icons.push({ id: `body:play:${b.ref}`, icon: f.play.playing ? "pause" : "play", title: f.play.playing ? "Pause the animation" : "Play the animation" });
    if (f.consFor === b.ref) {
      const on = f.consOn.includes(b.ref);
      icons.push({ id: `body:constraints:${b.ref}`, icon: on ? "lock" : "unlock", title: on ? "Constraints of this body are shown: hide them" : "Show every constraint that has to do with this body", ...(on ? { on: true as const } : {}) });
    }
    if (f.face) {
      const on = f.consOn.includes(f.face);
      icons.push({ id: `body:constraints:${f.face}`, icon: on ? "lock" : "unlock", title: on ? "Constraints of this face are shown: hide them" : "Show every constraint that has to do with this face", ...(on ? { on: true as const } : {}) });
    }
  } else if (f.bodies.length > 1) icons.push({ id: "view:hide", icon: "eye", title: "Hide these bodies" });
  const gear = f.gear ? { part: f.gear.part, items: f.gear.items } : null;
  if (!icons.length && !gear) return null;
  const at = suggestAt ?? (f.sheet ? f.sheet.corner : f.gear ? f.gear.at : f.bodies[0]?.top ?? null);
  return { at, icons, gear };
}
