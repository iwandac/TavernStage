// TavernStage shared core. Browser imports retain original singleton initialization.
import { createCore as createTavernStageCore } from '../../tavernstage/scripts-macros-engine-MacroCstWalker.js';
var tavernStageCore;
function getTavernStageCore() {
    return tavernStageCore ??= createTavernStageCore({
        get MacroEngine() { return MacroEngine; },
        get MacroFlagType() { return MacroFlagType; },
        get MacroParser() { return MacroParser; },
        get MacroRegistry() { return MacroRegistry; },
        get Math() { return Math; },
        get SillyTavern() { return SillyTavern; },
        get createEmptyFlags() { return createEmptyFlags; },
        get isFalseBoolean() { return isFalseBoolean; },
        get logMacroInternalError() { return logMacroInternalError; },
        get logMacroRuntimeWarning() { return logMacroRuntimeWarning; },
        get parseFlags() { return parseFlags; },
    });
}
/** @typedef {import('chevrotain').CstNode} CstNode */
/** @typedef {import('chevrotain').IToken} IToken */
/** @typedef {import('./MacroEnv.types.js').MacroEnv} MacroEnv */
/** @typedef {import('./MacroFlags.js').MacroFlags} MacroFlags */

import { logMacroInternalError, logMacroRuntimeWarning } from './MacroDiagnostics.js';
import { MacroEngine } from './MacroEngine.js';
import { parseFlags, createEmptyFlags, MacroFlagType } from './MacroFlags.js';
import { MacroParser } from './MacroParser.js';
import { MacroRegistry } from './MacroRegistry.js';
import { isFalseBoolean } from '/scripts/utils.js';

/**
 * @typedef {Object} MacroCall
 * @property {string} name
 * @property {string[]} args
 * @property {MacroFlags} flags - Parsed macro execution flags.
 * @property {boolean} isScoped - Whether this macro was invoked using scoped syntax (opening + closing tags).
 * @property {boolean} [isVariableShorthand] - Whether this call originated from variable shorthand syntax.
 * @property {MacroEnv} env
 * @property {string} rawInner
 * @property {string} rawWithBraces
 * @property {string[]} rawArgs
 * @property {{ startOffset: number, endOffset: number }} range - Range relative to the current evaluation context's text.
 * @property {number} globalOffset - The offset of this macro in the original top-level document.
 *           This combines the context's base offset with the local range. Use this for deterministic
 *           seeding (e.g., in {{pick}}) to ensure identical macros at different positions produce different results.
 * @property {CstNode} cstNode
 */

/**
 * @typedef {Object} VariableExprInfo
 * @property {'local' | 'global'} scope - Whether this is a local (.) or global ($) variable.
 * @property {string} varName - The variable name.
 * @property {'get' | 'set' | 'inc' | 'dec' | 'add'} operation - The operation to perform.
 * @property {string | null} value - The value for set/add operations, null for get/inc/dec.
 */

/**
 * Context passed through the CST evaluation process.
 *
 * @typedef {Object} EvaluationContext
 * @property {string} text - The text being evaluated at the current level. This is NOT the same as env.content.
 *           At the top level, this is the full document text. When evaluating nested content (arguments or scoped
 *           content), this is the substring being evaluated. CST node positions are always relative to this text.
 *
 *           - Careful, this also means when resolving macros inside macro arguments, this will NOT be the text of
 *           the argument currently being resolved, but the full macro text with identifier and all macros.
 * @property {number} contextOffset - Base offset from the original top-level document. At the top level this is 0.
 *           When re-parsing nested content (arguments/scoped), this is set to the substring's start position in
 *           the original document. Used to calculate globalOffset for macros that need deterministic positioning.
 * @property {MacroEnv} env - The macro environment containing context like user/char names, variables, and the
 *           original full content (env.content). This remains constant throughout the evaluation.
 * @property {(call: MacroCall) => string} resolveMacro - Callback to resolve a macro call to its result string.
 * @property {(content: string, options?: { trimIndent?: boolean }) => string} trimContent - Shared utility function that trims scoped content with optional indentation dedent.
 */

/**
 * @typedef {Object} TokenRange
 * @property {number} startOffset
 * @property {number} endOffset
 */

/**
 * @typedef {Object} MacroNodeInfo
 * @property {string} name - The macro identifier name.
 * @property {boolean} isClosing - Whether this macro has the closing block flag (/).
 * @property {number} startOffset - Start position in the source text.
 * @property {number} endOffset - End position in the source text (inclusive).
 * @property {number} argCount - Number of arguments provided to the macro.
 */

/**
 * The singleton instance of the MacroCstWalker.
 *
 * @type {MacroCstWalker}
 */
let instance;
export { instance as MacroCstWalker };

const MacroCstWalker = getTavernStageCore().MacroCstWalker;

instance = MacroCstWalker.instance;
