
// TavernStage shared core. Getters retain this browser host's live state.
import { createCore as createTavernStageCore } from '../../tavernstage/scripts-macros-definitions-env-macros.js';
var tavernStageCore;
function getTavernStageCore() {
 return tavernStageCore ??= createTavernStageCore({
  get MacroCategory() { return MacroCategory; },
  get MacroRegistry() { return MacroRegistry; },
  get MacroValueType() { return MacroValueType; },
  get formatInstructModeExamples() { return formatInstructModeExamples; },
  get isMobile() { return isMobile; },
  get main_api() { return main_api; },
  get parseMesExamples() { return parseMesExamples; },
  get power_user() { return power_user; },
 });
}
import { MacroRegistry, MacroCategory, MacroValueType } from '../engine/MacroRegistry.js';
import { isMobile } from '../../RossAscends-mods.js';
import { parseMesExamples, main_api } from '../../../script.js';
import { power_user } from '../../power-user.js';
import { formatInstructModeExamples } from '../../instruct-mode.js';

/** @typedef {import('../engine/MacroEnv.types.js').MacroEnv} MacroEnv */

/**
 * Registers macros that mostly act as simple accessors to MacroEnv fields
 * (names, character card fields, system metadata, extras) or basic
 * environment flags.
 */
export function registerEnvMacros(...args) { return getTavernStageCore().registerEnvMacros.apply(this, args); }
