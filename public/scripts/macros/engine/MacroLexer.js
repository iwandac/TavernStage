// TavernStage shared core. Browser imports retain original singleton initialization.
import { createCore as createTavernStageCore } from '../../tavernstage/scripts-macros-engine-MacroLexer.js';
var tavernStageCore;
function getTavernStageCore() {
    return tavernStageCore ??= createTavernStageCore({
        get chevrotain() { return chevrotain; },
    });
}
import { chevrotain } from '../../../lib.js';
const { createToken, Lexer } = getTavernStageCore();

/** @typedef {import('chevrotain').TokenType} TokenType */


/** Regex for lexer token matching (no anchors). */
const IDENTIFIER_LEXER_PATTERN = getTavernStageCore().IDENTIFIER_LEXER_PATTERN;

/**
 * Pattern for valid macro identifiers.
 * Must start with a letter, followed by word chars (letters, digits, underscore) or hyphens.
 * Used by both the lexer token and the validation regex.
 *
 * Regex for full-string validation (with anchors). Exported for macro registration.
 */
export const MACRO_IDENTIFIER_PATTERN = getTavernStageCore().MACRO_IDENTIFIER_PATTERN;

/**
 * Pattern for valid variable shorthand identifiers.
 * Must start with a letter, followed by word chars (letters, digits, underscore) or hyphens,
 * but must end with a word character (not a hyphen).
 *
 * Used for variable shorthand syntax like .varName or $varName.
 */
export const MACRO_VARIABLE_SHORTHAND_PATTERN = getTavernStageCore().MACRO_VARIABLE_SHORTHAND_PATTERN;

/** @enum {string} */
const modes = getTavernStageCore().modes;

/**
 * All lexer tokens used by the macro parser.
 * @readonly
 */
const Tokens = getTavernStageCore().Tokens;

/** @type {Map<string,string>} Saves all token definitions that are marked as entering modes */
const enterModesMap = getTavernStageCore().enterModesMap;

/**
 * Lexer definition object that maps states/modes to their token rules.
 * Each mode defines which tokens are valid in that context and how to transition between modes.
 * @readonly
 */
const Def = getTavernStageCore().Def;

/**
 * The singleton instance of the MacroLexer.
 *
 * @type {MacroLexer}
 */
let instance;
export { instance as MacroLexer };

const MacroLexer = getTavernStageCore().MacroLexer;

instance = MacroLexer.instance;

/**
 * [Utility]
 * Set push mode on the token definition.
 * Can be used inside the token mode definition block.
 *
 * Marks the token to **enter** the following lexer mode.
 *
 * Optionally, you can specify the modes to exit when entering this mode.
 *
 * @param {TokenType} token - The token to modify
 * @param {string} mode - The mode to set
 * @param {object} [options={}] - Additional options
 * @param {string} [options.andExits] - The modes to exit when entering this mode
 * @returns {TokenType} The token again
 */
function enter(...args) { return getTavernStageCore().enter.apply(this, args); }

/**
 * [Utility]
 * Set pop mode on the token definition.
 * Can be used inside the token mode definition block.
 *
 * Marks the token to **exit** the following lexer mode.
 *
 * @param {TokenType} token - The token to modify
 * @param {string} mode - The mode to leave
 * @returns {TokenType} The token again
 */
function exits(...args) { return getTavernStageCore().exits.apply(this, args); }

/**
 * [Utility]
 * Can be used inside the token mode definition block.
 *
 * Marks the token to to just be used/consumed, and not exit or enter a mode.
 *
 * @param {TokenType} token - The token to modify
 * @returns {TokenType} The token again
 */
function using(...args) { return getTavernStageCore().using.apply(this, args); }
