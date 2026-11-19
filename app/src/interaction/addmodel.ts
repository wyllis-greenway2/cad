// The gear assemblies that come as models (`dec_gear_models`; Shape, Fabricate, Models): a dialog for the numbers of each, and the model made in one step (the gears with the gear tool, the rest plain bodies). The geometry of each is in
// `operation/model*.ts`; this file asks, checks and runs it.
import type { Session } from "./session.ts";
import { run, scene } from "./session.ts";
import type { Dialog, Field } from "./transfer.ts";
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import type { PartSteps } from "../operation/fasteners.ts";
import { asCommand } from "../operation/modelparts.ts";
import { gearboxSteps, gearboxProblem, gearboxRatio, GEARBOX_START } from "../operation/modelgearbox.ts";
import type { GearboxSpec } from "../operation/modelgearbox.ts";
import { bearingSteps, bearingProblem, BEARING_START } from "../operation/modelbearing.ts";
import type { BearingSpec } from "../operation/modelbearing.ts";
import { differentialSteps, differentialProblem, DIFFERENTIAL_START } from "../operation/modeldifferential.ts";
import type { DifferentialSpec } from "../operation/modeldifferential.ts";
import { cycloidalSteps, cycloidalProblem, cycloidalRatio, CYCLOIDAL_START } from "../operation/modelcycloidal.ts";
import type { CycloidalSpec } from "../operation/modelcycloidal.ts";

export type ModelKind = "gearbox" | "bearing" | "differential" | "cycloidal";
/** what the dialog holds: the numbers as typed */
export type ModelValues = Record<string, string | number | boolean>;
const num = (v: ModelValues[string] | undefined, d: number): number => (v === undefined || String(v).trim() === "" ? d : Number(String(v).trim()));
const f = (id: string, label: string, value: number, note?: string): Field => ({ id, label, type: "number", value, ...(note ? { note } : {}) });

interface ModelDef { id: ModelKind; title: string; ok: string; start: () => ModelValues; fields: (v: ModelValues) => Field[]; steps: (v: ModelValues) => Result<PartSteps> }

const gearboxOf = (v: ModelValues): GearboxSpec => ({
  stages: num(v.stages, GEARBOX_START.stages), pinion: num(v.pinion, GEARBOX_START.pinion), gear: num(v.gear, GEARBOX_START.gear), module: num(v.module, GEARBOX_START.module), width: num(v.width, GEARBOX_START.width),
  rod: num(v.rod, GEARBOX_START.rod), fit: num(v.fit, GEARBOX_START.fit), bearing: num(v.bearing, GEARBOX_START.bearing), plate: num(v.plate, GEARBOX_START.plate), gap: num(v.gap, GEARBOX_START.gap),
});

const bearingOf = (v: ModelValues): BearingSpec => ({ bore: num(v.bore, BEARING_START.bore), outer: num(v.outer, BEARING_START.outer), width: num(v.width, BEARING_START.width), balls: num(v.balls, BEARING_START.balls), ball: num(v.ball, BEARING_START.ball), gap: num(v.gap, BEARING_START.gap) });

const differentialOf = (v: ModelValues): DifferentialSpec => {
  const d = DIFFERENTIAL_START;
  return { side: num(v.side, d.side), spider: num(v.spider, d.spider), module: num(v.module, d.module), axle: num(v.axle, d.axle), pin: num(v.pin, d.pin), fit: num(v.fit, d.fit), room: num(v.room, d.room), wall: num(v.wall, d.wall), cap: num(v.cap, d.cap), drive: num(v.drive, d.drive), driveModule: num(v.driveModule, d.driveModule), driveWidth: num(v.driveWidth, d.driveWidth) };
};

const cycloidalOf = (v: ModelValues): CycloidalSpec => {
  const d = CYCLOIDAL_START;
  return { pins: num(v.pins, d.pins), circle: num(v.circle, d.circle), pin: num(v.pin, d.pin), ecc: num(v.ecc, d.ecc), play: num(v.play, d.play), disc: num(v.disc, d.disc), outPins: num(v.outPins, d.outPins), outCircle: num(v.outCircle, d.outCircle), outPin: num(v.outPin, d.outPin), shaft: num(v.shaft, d.shaft), cam: num(v.cam, d.cam), plate: num(v.plate, d.plate), gap: num(v.gap, d.gap), room: num(v.room, d.room) };
};

const MODELS: Record<ModelKind, ModelDef> = {
  cycloidal: {
    id: "cycloidal", title: "Cycloidal drive", ok: "Make",
    start: () => ({ ...CYCLOIDAL_START }),
    fields: (v) => {
      const s = cycloidalOf(v), bad = cycloidalProblem(s);
      return [
        { id: "about", label: "Ratio", type: "text", readonly: true, value: bad ?? `${cycloidalRatio(s)} : 1, output reversed; ${s.pins - 1} lobes`, note: "A base plate with the ring pins, a lobed disc on an eccentric on the input shaft, and an output plate whose pins go through the disc." },
        f("pins", "Ring pins", s.pins, "the disc has one lobe fewer: the ratio is that number"),
        f("circle", "Pin circle radius (mm)", s.circle),
        f("pin", "Ring pin diameter (mm)", s.pin),
        f("ecc", "Eccentricity (mm)", s.ecc, "how far the disc's middle stands off the shaft's"),
        f("play", "Disc room (mm)", s.play, "the disc is taken in by this much all round, so it runs free"),
        f("disc", "Disc thickness (mm)", s.disc),
        f("outPins", "Output pins", s.outPins),
        f("outCircle", "Output pin circle radius (mm)", s.outCircle),
        f("outPin", "Output pin diameter (mm)", s.outPin),
        f("shaft", "Input shaft diameter (mm)", s.shaft),
        f("cam", "Eccentric radius (mm)", s.cam),
        f("plate", "Plate thickness (mm)", s.plate),
        f("gap", "Layer gap (mm)", s.gap),
        f("room", "Shaft room in the plates (mm)", s.room),
      ];
    },
    steps: (v) => cycloidalSteps(cycloidalOf(v)),
  },
  differential: {
    id: "differential", title: "Differential", ok: "Make",
    start: () => ({ ...DIFFERENTIAL_START }),
    fields: (v) => {
      const s = differentialOf(v), bad = differentialProblem(s);
      return [
        { id: "about", label: "Check", type: "text", readonly: true, value: bad ?? "two side gears, two spider gears on a cross pin, a cage with two caps, two axles and a drive gear round the cage", note: "The side gears turn together with the cage's turn and differ by what the axles are given; a spur gear round the cage drives it. The caps stand 0.2 mm off the cage: screw or glue them." },
        f("side", "Side gear teeth", s.side, "even"),
        f("spider", "Spider gear teeth", s.spider),
        f("module", "Module (mm)", s.module),
        f("axle", "Axle diameter (mm)", s.axle),
        f("pin", "Cross pin diameter (mm)", s.pin),
        f("fit", "Bore room (mm)", s.fit, "between a gear's bore and what is through it"),
        f("room", "Cage hole room (mm)", s.room, "between a hole in the cage and what is through it"),
        f("wall", "Cage wall (mm)", s.wall),
        f("cap", "Cap thickness (mm)", s.cap),
        f("drive", "Drive gear teeth", s.drive, "0 for none"),
        f("driveModule", "Drive gear module (mm)", s.driveModule),
        f("driveWidth", "Drive gear thickness (mm)", s.driveWidth),
      ];
    },
    steps: (v) => differentialSteps(differentialOf(v)),
  },
  bearing: {
    id: "bearing", title: "Ball bearing", ok: "Make",
    start: () => ({ ...BEARING_START }),
    fields: (v) => {
      const s = bearingOf(v), bad = bearingProblem(s);
      return [
        { id: "about", label: "Check", type: "text", readonly: true, value: bad ?? `an inner race, an outer race and ${Number.isFinite(s.balls) ? s.balls : "?"} balls, each a body of its own`, note: "The balls are free in their grooves: the room round each is the number below. A 608 skate bearing is 8 by 22 by 7 mm." },
        f("bore", "Bore (mm)", s.bore),
        f("outer", "Outside diameter (mm)", s.outer),
        f("width", "Width (mm)", s.width),
        f("balls", "Balls", s.balls, "3 or more"),
        f("ball", "Ball diameter (mm)", s.ball),
        f("gap", "Room round a ball (mm)", s.gap, "all round it, in its groove; the balls and races print apart"),
      ];
    },
    steps: (v) => bearingSteps(bearingOf(v)),
  },
  gearbox: {
    id: "gearbox", title: "Reduction gearbox", ok: "Make",
    start: () => ({ ...GEARBOX_START }),
    fields: (v) => {
      const s = gearboxOf(v), bad = gearboxProblem(s);
      const a = (s.module * (s.pinion + s.gear)) / 2;
      return [
        { id: "about", label: "Ratio", type: "text", readonly: true, value: bad ? bad : `${gearboxRatio(s).toFixed(2)} : 1 (${(s.gear / s.pinion).toFixed(2)} a stage), rods ${a.toFixed(1)} mm apart`, note: "Each stage is a pinion and a gear in a layer of its own; the gear of one stage and the pinion of the next share a rod." },
        f("stages", "Stages", s.stages, "1 to 4"),
        f("pinion", "Pinion teeth", s.pinion, "10 or more"),
        f("gear", "Gear teeth", s.gear),
        f("module", "Module (mm)", s.module),
        f("width", "Gear thickness (mm)", s.width),
        f("rod", "Rod diameter (mm)", s.rod, "a metal or printed rod, or a filament, that the gears sit on"),
        f("fit", "Bore room (mm)", s.fit, "the room between a gear's bore and its rod; 0 for a press fit"),
        f("bearing", "Plate room (mm)", s.bearing, "the room between a plate's hole and a rod: the rods turn in them"),
        f("plate", "Plate thickness (mm)", s.plate),
        f("gap", "Layer gap (mm)", s.gap, "between the layers, and between the end layers and the plates"),
      ];
    },
    steps: (v) => gearboxSteps(gearboxOf(v)),
  },
};

export const modelStart = (kind: ModelKind): ModelValues => MODELS[kind].start();
export const modelDialog = (kind: ModelKind, v: ModelValues): Dialog => ({ title: MODELS[kind].title, ok: MODELS[kind].ok, fields: MODELS[kind].fields(v) });
export const modelKinds = (): ModelKind[] => Object.keys(MODELS) as ModelKind[];

/** Make the model in the session, in one step (or say why not) */
export function addModel(session: Session, kind: ModelKind, v: ModelValues): Result<Session> {
  const steps = MODELS[kind].steps(v);
  if (!steps.ok) return steps;
  const c = asCommand(scene(session), steps.value);
  if (!c.ok) return c;
  const s = run(session, c.value);
  return s.message ? err(s.message) : ok(s);
}
