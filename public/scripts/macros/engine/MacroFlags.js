// TavernStage shared core. Browser imports retain original singleton initialization.
import { createCore as createTavernStageCore } from '../../tavernstage/scripts-macros-engine-MacroFlags.js';
var tavernStageCore;
function getTavernStageCore() {
    return tavernStageCore ??= createTavernStageCore({
        get console() { return console; },
    });
}
/**
 * Macro Execution Flags - modifiers that change how macros are resolved at runtime.
 *
 * Flags are special symbols placed between the opening braces `{{` and the macro identifier.
 * Example: `{{!user}}` - the `!` is an "immediate resolve" flag.
 *
 * Multiple flags can be combined: `{{!?myMacro}}` or `{{ ! ? myMacro }}`
 */

/**
 * @typedef {Object} MacroFlags
 * @property {boolean} immediate - Whether the immediate (`!`) flag is set.
 * @property {boolean} delayed - Whether the delayed (`?`) flag is set.
 * @property {boolean} reevaluate - Whether the re-evaluate (`~`) flag is set.
 * @property {boolean} filter - Whether the filter (`>`) flag is set.
 * @property {boolean} closingBlock - Whether the closing block (`/`) flag is set.
 * @property {boolean} preserveWhitespace - Whether the preserve whitespace (`#`) flag is set.
 * @property {string[]} raw - The raw flag symbols in order of appearance.
 */

/**
 * Enum of all recognized macro execution flags.
 *
 * @readonly
 * @enum {string}
 */
export const MacroFlagType = getTavernStageCore().MacroFlagType;

/**
 * @typedef {Object} MacroFlagDefinition
 * @property {MacroFlagType} type - The flag type enum value (also the symbol).
 * @property {string} name - Human-readable name for the flag.
 * @property {string} description - Description of what the flag does.
 * @property {boolean} implemented - Whether this flag's behavior is implemented.
 * @property {boolean} affectsParser - Whether this flag changes parsing behavior (e.g., filter flag).
 */

/**
 * Definitions for all macro flags with metadata.
 *
 * @type {Map<string, MacroFlagDefinition>}
 */
export const MacroFlagDefinitions = getTavernStageCore().MacroFlagDefinitions;

/**
 * Set of all valid flag symbols for quick lookup.
 *
 * @type {Set<string>}
 */
export const ValidFlagSymbols = getTavernStageCore().ValidFlagSymbols;

/**
 * Creates a default MacroFlags object with all flags set to false.
 *
 * @returns {MacroFlags}
 */
export function createEmptyFlags(...args) { return getTavernStageCore().createEmptyFlags.apply(this, args); }

/**
 * Parses an array of flag symbols into a MacroFlags object.
 *
 * @param {string[]} flagSymbols - Array of flag symbol strings (e.g., ['!', '?']).
 * @returns {MacroFlags}
 */
export function parseFlags(...args) { return getTavernStageCore().parseFlags.apply(this, args); }

/**
 * Checks if a MacroFlags object has any flags set.
 *
 * @param {MacroFlags} flags - The flags object to check.
 * @returns {boolean} True if at least one flag is set.
 */
export function hasAnyFlag(...args) { return getTavernStageCore().hasAnyFlag.apply(this, args); }

/**
 * Gets the flag definition for a given symbol.
 *
 * @param {string} symbol - The flag symbol (e.g., '!').
 * @returns {MacroFlagDefinition|undefined}
 */
export function getFlagDefinition(...args) { return getTavernStageCore().getFlagDefinition.apply(this, args); }

/**
 * Checks if a given symbol is a valid macro flag.
 *
 * @param {string} symbol - The symbol to check.
 * @returns {boolean}
 */
export function isValidFlag(...args) { return getTavernStageCore().isValidFlag.apply(this, args); }
