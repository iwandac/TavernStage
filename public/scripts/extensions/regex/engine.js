
// TavernStage shared core. Getters retain this browser host's live state.
import { createCore as createTavernStageCore } from '../../tavernstage/scripts-extensions-regex-engine.js';
var tavernStageCore;
function getTavernStageCore() {
 return tavernStageCore ??= createTavernStageCore({
  get characters() { return characters; },
  get console() { return console; },
  get extension_settings() { return extension_settings; },
  get getPresetManager() { return getPresetManager; },
  get regexFromString() { return regexFromString; },
  get substituteParams() { return substituteParams; },
  get substituteParamsExtended() { return substituteParamsExtended; },
  get this_chid() { return this_chid; },
 });
}
import { characters, saveSettingsDebounced, substituteParams, substituteParamsExtended, this_chid } from '../../../script.js';
import { extension_settings, writeExtensionField } from '../../extensions.js';
import { getPresetManager } from '../../preset-manager.js';
import { regexFromString } from '../../utils.js';
import { lodash } from '../../../lib.js';

/**
 * @readonly
 * @enum {number} Regex scripts types
 */
export const SCRIPT_TYPES = getTavernStageCore().SCRIPT_TYPES;

/**
 * Special type for unknown/invalid script types.
 */
export const SCRIPT_TYPE_UNKNOWN = getTavernStageCore().SCRIPT_TYPE_UNKNOWN;

/**
 * @typedef {import('../../char-data.js').RegexScriptData} RegexScript
 */

/**
 * @typedef {object} GetRegexScriptsOptions
 * @property {boolean} allowedOnly Only return allowed scripts
 */

/**
 * @type {Readonly<GetRegexScriptsOptions>}
 */
const DEFAULT_GET_REGEX_SCRIPTS_OPTIONS = getTavernStageCore().DEFAULT_GET_REGEX_SCRIPTS_OPTIONS;

/**
 * Manages the compiled regex cache with LRU eviction.
 */
export const RegexProvider = getTavernStageCore().RegexProvider;

/**
 * Retrieves the list of regex scripts by combining the scripts from the extension settings and the character data
 *
 * @param {GetRegexScriptsOptions} options Options for retrieving the regex scripts
 * @returns {RegexScript[]} An array of regex scripts, where each script is an object containing the necessary information.
 */
export function getRegexScripts(...args) { return getTavernStageCore().getRegexScripts.apply(this, args); }

/**
 * Retrieves the regex scripts for a specific type.
 * @param {SCRIPT_TYPES} scriptType The type of regex scripts to retrieve.
 * @param {GetRegexScriptsOptions} options Options for retrieving the regex scripts
 * @returns {RegexScript[]} An array of regex scripts for the specified type.
 */
export function getScriptsByType(...args) { return getTavernStageCore().getScriptsByType.apply(this, args); }

/**
 * Saves an array of regex scripts for a specific type.
 * @param {RegexScript[]} scripts An array of regex scripts to save.
 * @param {SCRIPT_TYPES} scriptType The type of regex scripts to save.
 * @returns {Promise<void>}
 */
export async function saveScriptsByType(scripts, scriptType) {
    switch (scriptType) {
        case SCRIPT_TYPES.GLOBAL:
            extension_settings.regex = scripts;
            saveSettingsDebounced();
            break;
        case SCRIPT_TYPES.SCOPED:
            await writeExtensionField(this_chid, 'regex_scripts', scripts);
            break;
        case SCRIPT_TYPES.PRESET: {
            const presetManager = getPresetManager();
            await presetManager.writePresetExtensionField({ path: 'regex_scripts', value: scripts });
            break;
        }
        default:
            console.warn(`saveScriptsByType: Invalid script type ${scriptType}`);
            break;
    }
}

/**
 * Check if character's regexes are allowed to be used; if character is undefined, returns false
 * @param {Character|undefined} character
 * @returns {boolean}
 */
export function isScopedScriptsAllowed(character) {
    return !!extension_settings?.character_allowed_regex?.includes(character?.avatar);
}

/**
 * Allow character's regexes to be used; if character is undefined, do nothing
 * @param {Character|undefined} character
 * @returns {void}
 */
export function allowScopedScripts(character) {
    const avatar = character?.avatar;
    if (!avatar) {
        return;
    }
    if (!Array.isArray(extension_settings?.character_allowed_regex)) {
        extension_settings.character_allowed_regex = [];
    }
    if (!extension_settings.character_allowed_regex.includes(avatar)) {
        extension_settings.character_allowed_regex.push(avatar);
        saveSettingsDebounced();
    }
}

/**
 * Disallow character's regexes to be used; if character is undefined, do nothing
 * @param {Character|undefined} character
 * @returns {void}
 */
export function disallowScopedScripts(character) {
    const avatar = character?.avatar;
    if (!avatar) {
        return;
    }
    if (!Array.isArray(extension_settings?.character_allowed_regex)) {
        return;
    }
    const index = extension_settings.character_allowed_regex.indexOf(avatar);
    if (index !== -1) {
        extension_settings.character_allowed_regex.splice(index, 1);
        saveSettingsDebounced();
    }
}

/**
 * Check if preset's regexes are allowed to be used
 * @param {string} apiId API ID
 * @param {string} presetName Preset name
 * @returns {boolean} True if allowed, false if not
 */
export function isPresetScriptsAllowed(apiId, presetName) {
    if (!apiId || !presetName) {
        return false;
    }
    return !!extension_settings?.preset_allowed_regex?.[apiId]?.includes(presetName);
}

/**
 * Allow preset's regexes to be used
 * @param {string} apiId API ID
 * @param {string} presetName Preset name
 * @returns {void}
 */
export function allowPresetScripts(apiId, presetName) {
    if (!apiId || !presetName) {
        return;
    }
    if (!Array.isArray(extension_settings?.preset_allowed_regex?.[apiId])) {
        lodash.set(extension_settings, ['preset_allowed_regex', apiId], []);
    }
    if (!extension_settings.preset_allowed_regex[apiId].includes(presetName)) {
        extension_settings.preset_allowed_regex[apiId].push(presetName);
        saveSettingsDebounced();
    }
}

/**
 * Disallow preset's regexes to be used
 * @param {string} apiId API ID
 * @param {string} presetName Preset name
 * @returns {void}
 */
export function disallowPresetScripts(apiId, presetName) {
    if (!apiId || !presetName) {
        return;
    }
    if (!Array.isArray(extension_settings?.preset_allowed_regex?.[apiId])) {
        return;
    }
    const index = extension_settings.preset_allowed_regex[apiId].indexOf(presetName);
    if (index !== -1) {
        extension_settings.preset_allowed_regex[apiId].splice(index, 1);
        saveSettingsDebounced();
    }
}

/**
 * Gets the current API ID from the preset manager.
 * @returns {string|null} Current API ID, or null if no preset manager
 */
export function getCurrentPresetAPI(...args) { return getTavernStageCore().getCurrentPresetAPI.apply(this, args); }

/**
 * Gets the name of the currently selected preset.
 * @returns {string|null} The name of the currently selected preset, or null if no preset manager
 */
export function getCurrentPresetName(...args) { return getTavernStageCore().getCurrentPresetName.apply(this, args); }

/**
 * @readonly
 * @enum {number} Where the regex script should be applied
 */
export const regex_placement = getTavernStageCore().regex_placement;

/**
 * @readonly
 * @enum {number} How to substitute parameters in the find regex
 */
export const substitute_find_regex = getTavernStageCore().substitute_find_regex;

function sanitizeRegexMacro(...args) { return getTavernStageCore().sanitizeRegexMacro.apply(this, args); }

/**
 * Parent function to fetch a regexed version of a raw string
 * @param {string} rawString The raw string to be regexed
 * @param {regex_placement} placement The placement of the string
 * @param {RegexParams} params The parameters to use for the regex script
 * @returns {string} The regexed string
 * @typedef {{characterOverride?: string, isMarkdown?: boolean, isPrompt?: boolean, isEdit?: boolean, depth?: number }} RegexParams The parameters to use for the regex script
 */
export function getRegexedString(...args) { return getTavernStageCore().getRegexedString.apply(this, args); }

/**
 * Runs the provided regex script on the given string
 * @param {RegexScript} regexScript The regex script to run
 * @param {string} rawString The string to run the regex script on
 * @param {RegexScriptParams} params The parameters to use for the regex script
 * @returns {string} The new string
 * @typedef {{characterOverride?: string}} RegexScriptParams The parameters to use for the regex script
 */
export function runRegexScript(...args) { return getTavernStageCore().runRegexScript.apply(this, args); }

/**
 * Filters anything to trim from the regex match
 * @param {string} rawString The raw string to filter
 * @param {string[]} trimStrings The strings to trim
 * @param {RegexScriptParams} params The parameters to use for the regex filter
 * @returns {string} The filtered string
 */
function filterString(...args) { return getTavernStageCore().filterString.apply(this, args); }
