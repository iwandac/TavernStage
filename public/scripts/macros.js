
// TavernStage shared core. Getters retain this browser host's live state.
import { createCore as createTavernStageCore } from './tavernstage/scripts-macros.js';
const generationHost = { readInput: () => String($('#send_textarea').val()), writeInput: value => { $('#send_textarea').val(value)[0].dispatchEvent(new Event('input', { bubbles: true })); }, firstDisplayedMessageId: () => Number(document.querySelector('#chat .mes')?.getAttribute('mesid')), readAuthorNote: () => $('#extension_floating_prompt').val(), presentAuthorNoteCounter: value => $('#extension_floating_counter').text(value) };
var tavernStageCore;
function getTavernStageCore() {
 return tavernStageCore ??= createTavernStageCore({
  get Date() { return Date; },
  get Math() { return Math; },
  get chat() { return chat; },
  get chat_metadata() { return chat_metadata; },
  get console() { return console; },
  get droll() { return droll; },
  get escapeRegex() { return escapeRegex; },
  get eventSource() { return eventSource; },
  get event_types() { return event_types; },
  get extension_prompts() { return extension_prompts; },
  get generationHost() { return generationHost; },
  get getCurrentChatId() { return getCurrentChatId; },
  get getInstructMacros() { return getInstructMacros; },
  get getMaxContextTokens() { return getMaxContextTokens; },
  get getMaxPromptTokens() { return getMaxPromptTokens; },
  get getMaxResponseTokens() { return getMaxResponseTokens; },
  get getStringHash() { return getStringHash; },
  get getVariableMacros() { return getVariableMacros; },
  get initRegisterMacros() { return initRegisterMacros; },
  get inject_ids() { return inject_ids; },
  get isDigitsOnly() { return isDigitsOnly; },
  get isMobile() { return isMobile; },
  get macroSystem() { return macroSystem; },
  get main_api() { return main_api; },
  get moment() { return moment; },
  get power_user() { return power_user; },
  get seedrandom() { return seedrandom; },
  get textgenerationwebui_banned_in_macros() { return textgenerationwebui_banned_in_macros; },
  get timestampToMoment() { return timestampToMoment; },
  get uuidv4() { return uuidv4; },
 });
}
import { Handlebars, moment, seedrandom, droll } from '../lib.js';
import { chat, chat_metadata, main_api, getMaxPromptTokens, getMaxContextTokens, getMaxResponseTokens, getCurrentChatId, substituteParams, eventSource, event_types, extension_prompts } from '../script.js';
import { timestampToMoment, isDigitsOnly, getStringHash, escapeRegex, uuidv4 } from './utils.js';
import { textgenerationwebui_banned_in_macros } from './textgen-settings.js';
import { getInstructMacros } from './instruct-mode.js';
import { getVariableMacros } from './variables.js';
import { isMobile } from './RossAscends-mods.js';
import { inject_ids } from './constants.js';
import { initRegisterMacros, macros as macroSystem } from './macros/macro-system.js';
import { power_user } from './power-user.js';

/**
 * @typedef Macro
 * @property {RegExp} regex - Regular expression to match the macro
 * @property {(substring: string, ...args: any[]) => string} replace - Function to replace the macro
 */

// Register any macro that you want to leave in the compiled story string
Handlebars.registerHelper('trim', () => '{{trim}}');
// Catch-all helper for any macro that is not defined for story strings
Handlebars.registerHelper('helperMissing', function () {
    const options = arguments[arguments.length - 1];
    const macroName = options.name;
    return substituteParams(`{{${macroName}}}`);
});

/**
 * @typedef {Object<string, *>} EnvObject
 * @typedef {(nonce: string) => string} MacroFunction
 */

/**
 * @typedef {Object} CustomMacro
 * @property {string} key - Macro name (key)
 * @property {string} description - Optional description of the macro
 */

/**
 * @deprecated Use macros.registry.registerMacro (from scripts/macros/macro-system.js)
 * or substituteParams({ dynamicMacros }) with the new macro engine.
 */
export const MacrosParser = getTavernStageCore().MacrosParser;

/**
 * Gets a hashed id of the current chat from the metadata.
 * If no metadata exists, creates a new hash and saves it.
 * @returns {number} The hashed chat id
 */
function getChatIdHash(...args) { return getTavernStageCore().getChatIdHash.apply(this, args); }

/**
 * Returns the ID of the last message in the chat
 *
 * Optionally can only choose specific messages, if a filter is provided.
 *
 * @param {object} param0 - Optional arguments
 * @param {boolean} [param0.exclude_swipe_in_propress=true] - Whether a message that is currently being swiped should be ignored
 * @param {function(object):boolean} [param0.filter] - A filter applied to the search, ignoring all messages that don't match the criteria. For example to only find user messages, etc.
 * @returns {number|null} The message id, or null if none was found
 */
export function getLastMessageId(...args) { return getTavernStageCore().getLastMessageId.apply(this, args); }

/**
 * Returns the ID of the first message included in the context
 *
 * @returns {number|null} The ID of the first message in the context
 */
function getFirstIncludedMessageId(...args) { return getTavernStageCore().getFirstIncludedMessageId.apply(this, args); }

/**
 * Returns the ID of the first displayed message in the chat.
 *
 * @returns {number|null} The ID of the first displayed message
 */
function getFirstDisplayedMessageId(...args) { return getTavernStageCore().getFirstDisplayedMessageId.apply(this, args); }

/**
 * Returns the last message in the chat
 *
 * @returns {string} The last message in the chat
 */
function getLastMessage(...args) { return getTavernStageCore().getLastMessage.apply(this, args); }

/**
 * Returns the last message from the user
 *
 * @returns {string} The last message from the user
 */
function getLastUserMessage(...args) { return getTavernStageCore().getLastUserMessage.apply(this, args); }

/**
 * Returns the last message from the bot
 *
 * @returns {string} The last message from the bot
 */
function getLastCharMessage(...args) { return getTavernStageCore().getLastCharMessage.apply(this, args); }

/**
 * Returns the 1-based ID (number) of the last swipe
 *
 * @returns {number|null} The 1-based ID of the last swipe
 */
function getLastSwipeId(...args) { return getTavernStageCore().getLastSwipeId.apply(this, args); }

/**
 * Returns the 1-based ID (number) of the current swipe
 *
 * @returns {number|null} The 1-based ID of the current swipe
 */
function getCurrentSwipeId(...args) { return getTavernStageCore().getCurrentSwipeId.apply(this, args); }

/**
 * Replaces banned words in macros with an empty string.
 * Adds them to textgenerationwebui ban list.
 * @returns {Macro}
 */
function getBannedWordsMacro(...args) { return getTavernStageCore().getBannedWordsMacro.apply(this, args); }

function getTimeSinceLastMessage(...args) { return getTavernStageCore().getTimeSinceLastMessage.apply(this, args); }

/**
 * Returns a macro that picks a random item from a list.
 * @returns {Macro} The random replace macro
 */
function getRandomReplaceMacro(...args) { return getTavernStageCore().getRandomReplaceMacro.apply(this, args); }

/**
 * Returns a macro that picks a random item from a list with a consistent seed.
 * @param {string} rawContent The raw content of the string
 * @returns {Macro} The pick replace macro
 */
function getPickReplaceMacro(...args) { return getTavernStageCore().getPickReplaceMacro.apply(this, args); }

/**
 * @returns {Macro} The dire roll macro
 */
function getDiceRollMacro(...args) { return getTavernStageCore().getDiceRollMacro.apply(this, args); }

/**
 * Returns the difference between two times. Works with any time format acceptable by moment().
 * Can work with {{date}} {{time}} macros
 * @returns {Macro} The time difference macro
 */
function getTimeDiffMacro(...args) { return getTavernStageCore().getTimeDiffMacro.apply(this, args); }

/**
 * Returns the outlet prompt for a given outlet key.
 * @param {string} key - The outlet key
 * @returns {string} The outlet prompt
 */
function getOutletPrompt(...args) { return getTavernStageCore().getOutletPrompt.apply(this, args); }

/**
 * Substitutes {{macro}} parameters in a string.
 * @param {string} content - The string to substitute parameters in.
 * @param {EnvObject} env - Map of macro names to the values they'll be substituted with. If the param
 * values are functions, those functions will be called and their return values are used.
 * @param {function(string): string} postProcessFn - Function to run on the macro value before replacing it.
 * @returns {string} The string with substituted parameters.
 */
export function evaluateMacros(...args) { return getTavernStageCore().evaluateMacros.apply(this, args); }

export function initMacros(...args) { return getTavernStageCore().initMacros.apply(this, args); }
