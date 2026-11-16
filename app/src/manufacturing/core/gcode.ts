// The shared Emit stage (`in_566`, `in_567`, `dec_manufacturing_contract` points 4 and 8): a neutral toolpath and a machine's dialect become a G-code file. Every route gets this; none writes its own. Pure: data in, bytes out.
// The dialect says how the controller wants things; this code knows nothing of lasers, routers or printers. A move the dialect has no word for is skipped and said (a warning, never a stop).
import type { Toolpath, Move, DialectDefinition, EmitResult, Point3 } from "../contract/index.ts";

const fmt = (v: number, d: number): string => {
  const t = (Math.round(v * 10 ** d) / 10 ** d + 0).toFixed(d); // (+ 0: no "-0")
  return d ? t.replace(/\.?0+$/, "") || "0" : t;
};
const fill = (template: string, values: Record<string, string>): string => template.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? `{${k}}`);

export function writeGcode(toolpath: Toolpath, dialect: DialectDefinition, name = "toolpath"): EmitResult {
  const warnings: string[] = [];
  const lines: string[] = [];
  const d = dialect.decimals;
  let n = 0;
  const out = (text: string): void => { n += 10; lines.push(dialect.lineNumbers ? `N${n} ${text}` : text); };
  const comment = (text: string): string => `${dialect.comment.open}${text.replace(/[()\r\n;]/g, " ").trim()}${dialect.comment.close ?? ""}`;
  const pos: [number, number, number] = [NaN, NaN, NaN]; // (where the machine is, as far as the file has said; unknown until the first move)
  let feed = NaN;
  let power: number | null = null; // the controller number the beam is on at, or null when it is off
  let extruded = 0;

  const powerOff = (): void => { if (power !== null && dialect.power) { out(dialect.power.off); power = null; } };
  const word = (axis: string, v: number): string => `${axis}${fmt(v, d)}`;
  /** the axes that changed (all of them on the first move), as words */
  const axes = (to: Point3): string[] => ["X", "Y", "Z"].flatMap((a, i) => (Number.isNaN(pos[i]!) || Math.abs(pos[i]! - to[i]!) > 0.5 / 10 ** d ? [word(a, to[i]!)] : []));
  const moveTo = (to: Point3): void => { pos[0] = to[0]; pos[1] = to[1]; pos[2] = to[2]; };
  const feedWord = (f: number | undefined): string[] => (f !== undefined && f !== feed ? ((feed = f), [`F${fmt(f, d)}`]) : []);

  out(comment(name));
  for (const l of dialect.start) out(l);
  for (const op of toolpath.operations) {
    out(comment(op.label));
    for (const m of op.moves) emitMove(m);
  }
  powerOff();
  for (const l of dialect.end) out(l);

  function emitMove(m: Move): void {
    switch (m.op) {
      case "travel": {
        if (dialect.power?.offOnTravel) powerOff();
        const a = axes(m.to);
        if (a.length) out([dialect.words.rapid, ...a].join(" ")); // (a rapid move has no feed word)
        moveTo(m.to);
        return;
      }
      case "cut": {
        if (m.power !== undefined && dialect.power) {
          const s = Math.round(m.power * dialect.power.max);
          if (power !== s) { out(fill(dialect.power.on, { s: String(s) })); power = s; }
        }
        const a = axes(m.to);
        if (a.length) out([dialect.words.linear, ...a, ...feedWord(m.feed)].join(" "));
        moveTo(m.to);
        return;
      }
      case "arc": {
        if (m.power !== undefined && dialect.power) {
          const s = Math.round(m.power * dialect.power.max);
          if (power !== s) { out(fill(dialect.power.on, { s: String(s) })); power = s; }
        }
        const [i, j] = [m.center[0] - pos[0]!, m.center[1] - pos[1]!]; // (the centre as an offset from where the arc starts: the usual I and J, in the XY plane)
        out([m.clockwise ? dialect.words.arcCw : dialect.words.arcCcw, ...axes(m.to).length ? axes(m.to) : [word("X", m.to[0]), word("Y", m.to[1])], word("I", i), word("J", j), ...feedWord(m.feed)].join(" "));
        moveTo(m.to);
        return;
      }
      case "extrude": {
        if (!dialect.extrude) { warnings.push("an extrude move was left out: this dialect has no extruder axis"); return; }
        extruded += m.amount;
        const e = dialect.extrude;
        out([dialect.words.linear, ...axes(m.to), word(e.axis, e.absolute ? extruded : m.amount), ...feedWord(m.feed)].join(" "));
        moveTo(m.to);
        return;
      }
      case "drill": {
        const a = axes([m.to[0], m.to[1], pos[2]!]).filter((w) => w[0] !== "Z");
        if (a.length) out([dialect.words.rapid, ...a].join(" "));
        out([dialect.words.linear, word("Z", m.to[2] - m.depth), ...feedWord(m.feed)].join(" "));
        out([dialect.words.rapid, word("Z", m.to[2])].join(" ")); // (back up to the surface)
        moveTo([m.to[0], m.to[1], m.to[2]]);
        return;
      }
      case "tool": {
        powerOff();
        out(dialect.toolChange ? fill(dialect.toolChange, { tool: m.tool }) : comment(`tool ${m.tool}`));
        if (!dialect.toolChange) warnings.push(`tool ${m.tool}: this dialect has no tool change line, a comment was written`);
        return;
      }
      case "pause": {
        if (!dialect.dwell) { warnings.push("a pause was left out: this dialect has no pause line"); return; }
        out(fill(dialect.dwell, { sec: fmt(m.seconds, 3), ms: String(Math.round(m.seconds * 1000)) }));
        return;
      }
    }
  }

  const bytes = new TextEncoder().encode(lines.join("\n") + "\n");
  return { files: [{ name: `${name}.${dialect.extension}`, mime: "text/plain", bytes }], warnings };
}
