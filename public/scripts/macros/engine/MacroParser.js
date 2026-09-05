// TavernStage shared core. Browser imports retain original singleton initialization.
import { createCore as createTavernStageCore } from '../../tavernstage/scripts-macros-engine-MacroParser.js';
var tavernStageCore;
function getTavernStageCore() {
    return tavernStageCore ??= createTavernStageCore({
        get MacroLexer() { return MacroLexer; },
        get chevrotain() { return chevrotain; },
    });
}
import { chevrotain } from '../../../lib.js';
import { MacroLexer } from './MacroLexer.js';

const { CstParser } = getTavernStageCore();

/** @typedef {import('chevrotain').TokenType} TokenType */
/** @typedef {import('chevrotain').CstNode} CstNode */
/** @typedef {import('chevrotain').ILexingError} ILexingError */
/** @typedef {import('chevrotain').IRecognitionException} IRecognitionException */

/**
 * The singleton instance of the MacroParser.
 *
 * @type {MacroParser}
 */
let instance;
export { instance as MacroParser };

const MacroParser = getTavernStageCore().MacroParser;

instance = MacroParser.instance;
