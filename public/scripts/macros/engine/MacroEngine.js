// TavernStage shared core. Browser imports retain original singleton initialization.
import { createCore as createTavernStageCore } from '../../tavernstage/scripts-macros-engine-MacroEngine.js';
var tavernStageCore;
function getTavernStageCore() {
    return tavernStageCore ??= createTavernStageCore({
        get Date() { return Date; },
        get ELSE_MARKER() { return ELSE_MARKER; },
        get MacroCstWalker() { return MacroCstWalker; },
        get MacroParser() { return MacroParser; },
        get MacroRegistry() { return MacroRegistry; },
        get MacroValueType() { return MacroValueType; },
        get logMacroGeneralError() { return logMacroGeneralError; },
        get logMacroInternalError() { return logMacroInternalError; },
        get logMacroRuntimeWarning() { return logMacroRuntimeWarning; },
        get logMacroSyntaxWarning() { return logMacroSyntaxWarning; },
    });
}
import { MacroParser } from './MacroParser.js';
import { MacroCstWalker } from './MacroCstWalker.js';
import { MacroRegistry, MacroValueType } from './MacroRegistry.js';
import { logMacroGeneralError, logMacroInternalError, logMacroRuntimeWarning, logMacroSyntaxWarning } from './MacroDiagnostics.js';
import { ELSE_MARKER } from '../definitions/core-macros.js';

/** @typedef {import('./MacroCstWalker.js').MacroCall} MacroCall */
/** @typedef {import('./MacroEnv.types.js').MacroEnv} MacroEnv */
/** @typedef {import('./MacroRegistry.js').MacroDefinitionOptions} MacroDefinitionOptions */
/** @typedef {import('./MacroRegistry.js').MacroDefinition} MacroDefinition */

/**
 * A processor function that transforms text before or after macro evaluation.
 *
 * @callback MacroProcessor
 * @param {string} text - The text to process.
 * @param {MacroEnv} env - The macro environment.
 * @returns {string} The processed text.
 */

/**
 * @typedef {Object} RegisteredProcessor
 * @property {MacroProcessor} handler - The processor function.
 * @property {number} priority - Execution priority (lower = earlier).
 * @property {string} source - Identifier for debugging/tracking.
 */

/**
 * The singleton instance of the MacroEngine.
 *
 * @type {MacroEngine}
 */
let instance;
export { instance as MacroEngine };

const MacroEngine = getTavernStageCore().MacroEngine;

instance = MacroEngine.instance;
