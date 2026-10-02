// All exercise pictures by exercise id (src/catalog.ts). An exercise without its own picture (the trainer's own)
// gets one of its muscle group: pictureFor in figure/index.tsx.
import type { Move } from './kit';
import * as chest from './chest';
import * as back from './back';
import * as legs from './legs';
import * as arms from './arms';

export type { Move };

export const MOVES: Record<string, Move> = {
  // chest
  'bench-press': chest.benchPress,
  'incline-dumbbell-press': chest.inclineDumbbellPress,
  'smith-incline-press': chest.smithInclinePress,
  'machine-chest-press': chest.machineChestPress,
  'stack-chest-press': chest.machineChestPress,
  'plate-chest-press': chest.plateChestPress,
  'plate-incline-press': chest.plateInclinePress,
  'cable-fly': chest.cableFly,
  'pec-deck': chest.pecDeckMove,
  'stack-pec-fly': chest.pecDeckMove,
  dips: chest.dipsMove,
  'stack-assisted-dip': chest.assistedDips,
  // back
  'lat-pulldown': back.latPulldown,
  'stack-lat-pulldown': back.stackPulldown,
  'plate-lat-pulldown': back.platePulldown,
  'pull-up': back.pullUpMove,
  'assisted-pull-up': back.assistedPullUp,
  'seated-row': back.seatedRow,
  'stack-seated-row': back.stackSeatedRow,
  'plate-seated-row': back.plateSeatedRow,
  'plate-low-row': back.plateLowRow,
  'barbell-row': back.barbellRow,
  'one-arm-row': back.oneArmRow,
  'back-extension': back.backExtensionMove,
  'stack-back-extension': back.machineBackExtension,
  'cable-pullover': back.cablePullover,
  'chest-supported-row': back.chestSupportedRow,
  't-bar-row': back.chestSupportedRow,
  'plate-dorian-row': back.dorianRow,
  'plate-shrug': back.plateShrug,
  deadlift: back.deadliftMove,
  'plate-deadlift': back.plateDeadlift,
  // legs
  'back-squat': legs.backSquat,
  'leg-press': legs.legPress,
  rdl: legs.romanianDeadlift,
  // arms
  'dumbbell-curl': arms.dumbbellCurl,
};
