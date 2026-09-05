
// TavernStage shared core. Getters retain this browser host's live state.
import { createCore as createTavernStageCore } from '../../tavernstage/scripts-macros-definitions-instruct-macros.js';
var tavernStageCore;
function getTavernStageCore() {
 return tavernStageCore ??= createTavernStageCore({
  get MacroCategory() { return MacroCategory; },
  get MacroRegistry() { return MacroRegistry; },
  get power_user() { return power_user; },
 });
}
import { MacroRegistry, MacroCategory } from '../engine/MacroRegistry.js';
import { power_user } from '../../power-user.js';

/**
 * Registers instruct-mode related {{...}} macros (instruct* and system
 * prompt/context macros) in the MacroRegistry.
 */
export function registerInstructMacros(...args) { return getTavernStageCore().registerInstructMacros.apply(this, args); }
