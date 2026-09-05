
// TavernStage shared core. Getters retain this browser host's live state.
import { createCore as createTavernStageCore } from '../../tavernstage/scripts-macros-definitions-time-macros.js';
var tavernStageCore;
function getTavernStageCore() {
 return tavernStageCore ??= createTavernStageCore({
  get MacroCategory() { return MacroCategory; },
  get MacroRegistry() { return MacroRegistry; },
  get MacroValueType() { return MacroValueType; },
  get chat() { return chat; },
  get moment() { return moment; },
  get timestampToMoment() { return timestampToMoment; },
 });
}
import { moment } from '../../../lib.js';
import { chat } from '../../../script.js';
import { timestampToMoment } from '../../utils.js';
import { MacroRegistry, MacroCategory, MacroValueType } from '../engine/MacroRegistry.js';

/**
 * Registers time/date related macros and utilities.
 */
export function registerTimeMacros(...args) { return getTavernStageCore().registerTimeMacros.apply(this, args); }

function getTimeSinceLastMessage(...args) { return getTavernStageCore().getTimeSinceLastMessage.apply(this, args); }
