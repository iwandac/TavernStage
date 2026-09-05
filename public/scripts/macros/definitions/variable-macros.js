
// TavernStage shared core. Getters retain this browser host's live state.
import { createCore as createTavernStageCore } from '../../tavernstage/scripts-macros-definitions-variable-macros.js';
const getVariableContext = () => SillyTavern.getContext();
var tavernStageCore;
function getTavernStageCore() {
 return tavernStageCore ??= createTavernStageCore({
  get MacroCategory() { return MacroCategory; },
  get MacroRegistry() { return MacroRegistry; },
  get MacroValueType() { return MacroValueType; },
  get getVariableContext() { return getVariableContext; },
 });
}
import { MacroRegistry, MacroCategory, MacroValueType } from '../engine/MacroRegistry.js';

/**
 * Registers variable-related {{...}} macros that operate on local and global
 * variables (e.g. {{setvar}}, {{getvar}}, {{incvar}}, etc.).
 */
export function registerVariableMacros(...args) { return getTavernStageCore().registerVariableMacros.apply(this, args); }
