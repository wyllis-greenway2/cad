// Game-style flying (W A S D): any of the keys turns it on; it ends a moment after the last is let go, or at Esc. Pure state: the keys feed it, the loop calls `tick`.
// Walking eases up to speed and down again. The mouse's turning is let out over a few ticks, so it is smooth.
import { settings } from "./settings.ts";

const AHEAD: Record<string, number> = { KeyW: 1, KeyS: -1 };
const SIDE: Record<string, number> = { KeyD: 1, KeyA: -1 };

export interface Game {
  /** A key went down or up; true if it is one of the game's. */
  key(code: string, down: boolean): boolean;
  /** The mouse moved by this much (pixels) while the game is on. */
  look(dx: number, dy: number): void;
  /** Time passes: the speeds (in depths ahead per second, ahead and across, signed) and the turning to apply this tick (pixels). */
  tick(dtSec: number): { on: boolean; ahead: number; side: number; dx: number; dy: number };
  end(): void;
  readonly on: boolean;
}

export function createGame(): Game {
  const held = new Set<string>();
  let on = false, idleMs = 0, ahead = 0, side = 0, pdx = 0, pdy = 0;
  const toward = (v: number, goal: number, dt: number) => { const step = (dt / settings.input.flyEaseSec) * settings.input.flySpeed; return v < goal ? Math.min(goal, v + step) : Math.max(goal, v - step); };
  return {
    get on() { return on; },
    key(code, down) {
      if (!(code in AHEAD) && !(code in SIDE)) return false;
      if (down) { held.add(code); on = true; idleMs = 0; } else held.delete(code);
      return true;
    },
    look(dx, dy) { if (on) { pdx += dx; pdy += dy; } },
    tick(dt) {
      if (!on) { pdx = pdy = 0; return { on, ahead: 0, side: 0, dx: 0, dy: 0 }; }
      const sum = (m: Record<string, number>) => [...held].reduce((s, k) => s + (m[k] ?? 0), 0);
      ahead = toward(ahead, sum(AHEAD) * settings.input.flySpeed, dt);
      side = toward(side, sum(SIDE) * settings.input.flySpeed, dt);
      const f = Math.min(1, dt / settings.input.flyLookSec); // (a share of what is waiting, each tick)
      const dx = pdx * f, dy = pdy * f; pdx -= dx; pdy -= dy;
      if (held.size === 0) { idleMs += dt * 1000; if (idleMs >= settings.input.gameIdleMs && ahead === 0 && side === 0 && Math.abs(pdx) + Math.abs(pdy) < 0.01) on = false; }
      return { on, ahead, side, dx, dy };
    },
    end() { held.clear(); on = false; ahead = side = pdx = pdy = 0; idleMs = 0; },
  };
}
