// TavernStage shared core. Browser imports retain original singleton initialization.
import { createCore as createTavernStageCore } from '../../tavernstage/scripts-macros-engine-MacroRegistry.js';
var tavernStageCore;
function getTavernStageCore() {
    return tavernStageCore ??= createTavernStageCore({
        get MACRO_IDENTIFIER_PATTERN() { return MACRO_IDENTIFIER_PATTERN; },
        get MacroEngine() { return MacroEngine; },
        get Math() { return Math; },
        get createMacroRuntimeError() { return createMacroRuntimeError; },
        get isFalseBoolean() { return isFalseBoolean; },
        get isTrueBoolean() { return isTrueBoolean; },
        get logMacroRegisterError() { return logMacroRegisterError; },
        get logMacroRegisterWarning() { return logMacroRegisterWarning; },
        get logMacroRuntimeWarning() { return logMacroRuntimeWarning; },
    });
}
/** @typedef {import('chevrotain').CstNode} CstNode */
/** @typedef {import('./MacroEnv.types.js').MacroEnv} MacroEnv */
/** @typedef {import('./MacroCstWalker.js').MacroCall} MacroCall */
/** @typedef {import('./MacroFlags.js').MacroFlags} MacroFlags */

import { MACRO_IDENTIFIER_PATTERN } from './MacroLexer.js';

import { isFalseBoolean, isTrueBoolean } from '../../utils.js';
import { MacroEngine } from './MacroEngine.js';
import { createMacroRuntimeError, logMacroRegisterError, logMacroRegisterWarning, logMacroRuntimeWarning } from './MacroDiagnostics.js';

/**
 * Enum of standard macro categories for grouping in documentation and autocomplete.
 * Extensions may use these or define custom category strings.
 *
 * @readonly
 * @enum {string}
 */
export const MacroCategory = getTavernStageCore().MacroCategory;

/**
 * Enum of standard macro value types for type checking and documentation.
 * Used for both argument types and return types.
 *
 * @readonly
 * @enum {string}
 */
export const MacroValueType = getTavernStageCore().MacroValueType;

/**
 * @typedef {Object} MacroDefinitionOptions
 * @property {MacroAliasDef[]} [aliases] - Alternative names for this macro. Each alias creates a lookup entry pointing to the same definition.
 * @property {MacroCategory|string} [category=MacroCategory.UNCATEGORIZED] - Category for grouping in documentation/autocomplete. Use MacroCategory enum values or a custom string.
 * @property {number|MacroUnnamedArgDef[]} [unnamedArgs=0] - Specifies the macro's unnamed positional arguments. Can be a number (all required) or an array of definitions (supports optional args). Optional args must be a suffix.
 * @property {boolean|MacroListSpec} [list] - Whether the macro allows a list of arguments (optional min and max values can be set). These arguments will be added AFTER the unnamed args.
 * @property {boolean} [strictArgs=true] - Whether the macro should be strict about its arguments.
 * @property {string} [description=''] - Add a description of what the macro does.
 * @property {string} [returns] - Add a specific description of what the macro returns, if it is not obvious from the description.
 * @property {MacroValueType|MacroValueType[]} [returnType=MacroValueType.STRING] - The type(s) this macro returns. Defaults to string.
 * @property {string} [displayOverride] - Override the auto-generated macro signature for display (must include curly braces, e.g. "{{macro::arg}}").
 * @property {string|string[]} [exampleUsage] - Example usage(s) shown in documentation (must include curly braces).
 * @property {boolean} [delayArgResolution=false] - If true, nested macros in arguments or scope are NOT resolved before calling the handler. The handler receives raw argument text and must call resolve() manually. Use sparingly - only for control-flow macros like {{if}}.
 * @property {MacroHandler} handler - The handler function for the macro.
 */

/**
 * @typedef {Object} MacroAliasDef
 * @property {string} alias - The alias name.
 * @property {boolean} [visible=true] - Whether this alias appears in documentation/autocomplete. Defaults to true.
 */

/**
 * @typedef {Object} MacroUnnamedArgDef
 * @property {string} name
 * @property {boolean} [optional=false] - Whether this argument is optional. Optional args must form a contiguous suffix (no required args after an optional).
 * @property {string} [defaultValue] - Default value for optional args. ONLY meaningful when optional is true. Shown in docs/autocomplete.
 * @property {MacroValueType|MacroValueType[]} [type=MacroValueType.STRING] - Single type or array of accepted types.
 * @property {string} [sampleValue]
 * @property {string} [description]
 */

/**
 * @typedef {Object} MacroListSpec
 * @property {number} [min]
 * @property {number} [max]
 */

/**
 * @typedef {(context: MacroExecutionContext) => string} MacroHandler
 */

/**
 * @typedef {Object} MacroExecutionContext
 * @property {string} name
 * @property {string[]} args - All unnamed arguments passed to the macro. If delayArgResolution is true, these contain raw (unresolved) text.
 * @property {string[]} unnamedArgs - Unnamed positional arguments (both required and optional, up to the defined count).
 * @property {string[]|null} list - List arguments (after unnamed args), or null if list is not enabled.
 * @property {{ [key: string]: string }|null} namedArgs - Reserved for future named argument support.
 * @property {MacroFlags} flags - Macro execution flags that were applied to this macro invocation.
 * @property {boolean} isScoped - Whether this macro was invoked using scoped syntax (opening + closing tags).
 * @property {string} raw - The inner macro content with nested macros resolved.
 * @property {string} rawOriginal - The original full macro text including braces, before any resolution.
 * @property {string[]} rawArgs - The original arguments passed to the macro (always unresolved).
 * @property {MacroEnv} env
 * @property {CstNode} cstNode
 * @property {{ startOffset: number, endOffset: number }} range - Range relative to the current evaluation context's text.
 * @property {number} globalOffset - The offset of this macro in the original top-level document.
 *           This combines the context's base offset with the local range. Use this for deterministic
 *           seeding (e.g., in {{pick}}) to ensure identical macros at different positions produce different results.
 * @property {(value: any) => string} normalize - Normalize function to use on unsure macro results to make sure they return strings as expected.
 * @property {(content: string, options?: { trimIndent?: boolean }) => string} trimContent - Trims scoped content with optional indentation dedent. Defaults to trimming indentation.
 * @property {(text: string, options?: { offsetDelta?: number }) => string} resolve - Evaluates macros in the given text using the same environment.
 *           Use when delayArgResolution is true. By default, preserves the caller's globalOffset so nested
 *           macros like {{pick}} maintain deterministic position-based behavior. Pass offsetDelta to add
 *           an additional offset for uniqueness (e.g., to differentiate between multiple resolve calls).
 * @property {(message: string, error?: any) => void} warn - Logs a runtime warning with automatic macro call context.
 *           Use this to report issues in how the macro was invoked (e.g., invalid argument values, edge cases).
 */

/**
 * @typedef {Object} MacroDefinition
 * @property {string} name - Primary macro name.
 * @property {MacroResolvedAlias[]} aliases - Parsed alias definitions for this macro.
 * @property {MacroCategory|string} category
 * @property {number} minArgs - Minimum number of unnamed args required (excludes optional args).
 * @property {number} maxArgs - Maximum number of unnamed args accepted (includes optional args).
 * @property {MacroUnnamedArgDef[]} unnamedArgDefs - Definitions for all unnamed positional arguments (required + optional).
 * @property {{ min: number, max: (number|null) }|null} list
 * @property {boolean} strictArgs
 * @property {string} description
 * @property {string|null} returns
 * @property {MacroValueType|MacroValueType[]} returnType - The type(s) this macro returns.
 * @property {string|null} displayOverride - Override for the auto-generated macro signature display.
 * @property {string[]} exampleUsage - Example usage strings for documentation.
 * @property {boolean} delayArgResolution - If true, nested macros in arguments are NOT resolved before calling the handler. The handler receives raw argument text and must call resolve() manually. Use sparingly - only for control-flow macros like {{if}}.
 * @property {MacroHandler} handler
 * @property {MacroSource} source
 * @property {string|null} aliasOf - If this is an alias, the primary macro name this is an alias of. Can also be used to check if this is an alias macro.
 * @property {boolean|null} aliasVisible - If this is an alias, whether this alias is visible in docs/autocomplete.
 */

/**
 * @typedef {Object} MacroResolvedAlias
 * @property {string} alias - The alias name.
 * @property {boolean} visible - Whether this alias is visible in documentation/autocomplete.
 */

/**
 * @typedef {Object} MacroSource
 * @property {string} name - Source identifier (extension name or script path)
 * @property {boolean} isExtension - True if registered from an extension
 * @property {boolean} isThirdParty - True if registered from a third-party extension
 */

/**
 * The singleton instance of the MacroRegistry.
 *
 * @type {MacroRegistry}
 */
let instance;
export { instance as MacroRegistry };

const MacroRegistry = getTavernStageCore().MacroRegistry;

instance = MacroRegistry.instance;

/**
 * Validates a macro identifier.
 *
 * @param {string} name - The macro identifier to validate.
 * @param {Object} [options] - Validation options.
 * @param {boolean} [options.allowComment = true] - Whether return that the comment identifier '//' is valid.
 * @returns {boolean} True if the identifier is valid, false otherwise.
 */
function isIdentifierValid(...args) { return getTavernStageCore().isIdentifierValid.apply(this, args); }

/**
 * Validates the arguments for a macro definition.
 * Supports required args (minArgs), optional args (up to maxArgs), and list tail.
 *
 * @param {MacroDefinition} def - Macro definition.
 * @param {any[]} args - Arguments to validate.
 * @returns {boolean} True if the arguments are valid, false otherwise.
 */
function isArgsValid(...args) { return getTavernStageCore().isArgsValid.apply(this, args); }

/**
 * Performs type validation for unnamed positional arguments using the metadata
 * defined on the macro definition. When strictArgs is true, invalid argument
 * types cause an error to be thrown. When strictArgs is false, only warnings
 * are logged and execution continues.
 *
 * @param {MacroCall} call
 * @param {MacroDefinition} def
 * @param {string[]} unnamedArgs
 */
function validateArgTypes(...args) { return getTavernStageCore().validateArgTypes.apply(this, args); }

/**
 * Checks whether a string value conforms to the given macro argument type.
 *
 * @param {string} value
 * @param {MacroValueType} type
 * @returns {boolean}
 */
function isValueOfType(...args) { return getTavernStageCore().isValueOfType.apply(this, args); }

/**
 * Detects the source of a macro registration from the call stack.
 * Similar to how SlashCommandParser detects command sources.
 *
 * @returns {{ isExtension: boolean, isThirdParty: boolean, source: string }}
 */
function detectMacroSource(...args) { return getTavernStageCore().detectMacroSource.apply(this, args); }
