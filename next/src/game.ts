// Game-style flying (W A S D): any of the keys turns it on; it ends a moment after the last is let go, or at Esc.
// Pure state: the keys feed it, the loop calls `tick`, and the speeds it returns ease up and down.
import { settings } from "./settings.ts";

export interface Game {
  key(code: string, down: boolean): boolean; // true when the key is one of the game's (the caller then stops it doing anything else)
  tick(dtSec: number): { on: boolean; ahead: number; side: number };
  end(): void;
  readonly on: boolean;
}
const AHEAD: Record<string, number> = { KeyW: 1, KeyS: -1 };
const SIDE: Record<string, number> = { KeyD: 1, KeyA: -1 };

export function createGame(): Game {
  const held = new Set<string>();
  let on = false, idleMs = 0, ahead = 0, side = 0;
  const toward = (v: number, goal: number, dt: number) => { const step = dt / settings.input.flyEaseSec * settings.input.flySpeed; return v < goal ? Math.min(goal, v + step) : Math.max(goal, v - step); };
  return {
    get on() { return on; },
    key(code, down) {
      if (!(code in AHEAD) && !(code in SIDE)) return false;
      if (down) { held.add(code); on = true; idleMs = 0; } else held.delete(code);
      return true;
    },
    tick(dt) {
      if (!on) return { on, ahead: 0, side: 0 };
      const goalA = [...held].reduce((s, k) => s + (AHEAD[k] ?? 0), 0) * settings.input.flySpeed;
      const goalS = [...held].reduce((s, k) => s + (SIDE[k] ?? 0), 0) * settings.input.flySpeed;
      ahead = toward(ahead, goalA, dt); side = toward(side, goalS, dt);
      if (held.size === 0) { idleMs += dt * 1000; if (idleMs >= settings.input.gameIdleMs && ahead === 0 && side === 0) on = false; }
      return { on, ahead, side };
    },
    end() { held.clear(); on = false; ahead = 0; side = 0; idleMs = 0; },
  };
}
