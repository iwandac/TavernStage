// TavernStage shared core. Browser imports retain original singleton initialization.
import { createCore as createTavernStageCore } from '../../tavernstage/scripts-macros-engine-MacroEnvBuilder.js';
var tavernStageCore;
function getTavernStageCore() {
    return tavernStageCore ??= createTavernStageCore({
        get characters() { return characters; },
        get getCharacterCardFieldsLazy() { return getCharacterCardFieldsLazy; },
        get getGeneratingModel() { return getGeneratingModel; },
        get getStringHash() { return getStringHash; },
        get groups() { return groups; },
        get logMacroGeneralError() { return logMacroGeneralError; },
        get name1() { return name1; },
        get name2() { return name2; },
        get selected_group() { return selected_group; },
    });
}
import { name1, name2, characters, getCharacterCardFieldsLazy, getGeneratingModel } from '../../../script.js';
import { groups, selected_group } from '../../../scripts/group-chats.js';
import { logMacroGeneralError } from './MacroDiagnostics.js';
import { getStringHash } from '/scripts/utils.js';
/**
 * MacroEnvBuilder is responsible for constructing the MacroEnv object
 * that is passed to macro handlers.
 *
 * It does **not** depend on the legacy regex macro system. Instead, it
 * works from the same raw inputs that substituteParams receives plus a
 * small bundle of global helpers, so it can eventually replace the
 * environment-building block in substituteParams.
 */

/** @typedef {import('./MacroEnv.types.js').MacroEnv} MacroEnv */

/**
 * @typedef {Object} MacroEnvRawContext
 * @property {string} content
 * @property {string|null} [name1Override]
 * @property {string|null} [name2Override]
 * @property {string|null} [original]
 * @property {string|null} [groupOverride]
 * @property {boolean} [replaceCharacterCard]
 * @property {Record<string, import('./MacroEnv.types.js').DynamicMacroValue>|null} [dynamicMacros]
 * @property {(value: string) => string} [postProcessFn]
 */

/**
 * @typedef {(env: MacroEnv, ctx: MacroEnvRawContext) => void} MacroEnvProvider
 */

/**
 * @enum {number} Exposed ordering buckets for providers. Callers can use envBuilder.providerOrder.* when registering providers.
 */
export const env_provider_order = getTavernStageCore().env_provider_order;

/** @type {MacroEnvBuilder} */
let instance;
export { instance as MacroEnvBuilder };

const MacroEnvBuilder = getTavernStageCore().MacroEnvBuilder;

instance = MacroEnvBuilder.instance;

/**
 * @param {MacroEnvRawContext} ctx
 * @param {Object} options
 * @param {string} [options.currentChar=null]
 * @param {boolean} [options.includeMuted=false]
 * @param {boolean} [options.filterOutChar=false]
 * @param {string|null} [options.includeUser=null]
 * @returns {string}
 */
function getGroupValue(...args) { return getTavernStageCore().getGroupValue.apply(this, args); }
