
// TavernStage shared core. Getters retain this browser host's live state.
import { createCore as createTavernStageCore } from '../../tavernstage/scripts-macros-definitions-core-macros.js';
const generationHost = { readInput: () => String($('#send_textarea').val()), writeInput: value => { $('#send_textarea').val(value)[0].dispatchEvent(new Event('input', { bubbles: true })); }, firstDisplayedMessageId: () => Number(document.querySelector('#chat .mes')?.getAttribute('mesid')), readAuthorNote: () => $('#extension_floating_prompt').val(), presentAuthorNoteCounter: value => $('#extension_floating_counter').text(value) };
var tavernStageCore;
function getTavernStageCore() {
 return tavernStageCore ??= createTavernStageCore({
  get MACRO_VARIABLE_SHORTHAND_PATTERN() { return MACRO_VARIABLE_SHORTHAND_PATTERN; },
  get MacroCategory() { return MacroCategory; },
  get MacroCstWalker() { return MacroCstWalker; },
  get MacroParser() { return MacroParser; },
  get MacroRegistry() { return MacroRegistry; },
  get MacroValueType() { return MacroValueType; },
  get Math() { return Math; },
  get chat_metadata() { return chat_metadata; },
  get console() { return console; },
  get droll() { return droll; },
  get extension_prompts() { return extension_prompts; },
  get generationHost() { return generationHost; },
  get getCurrentChatId() { return getCurrentChatId; },
  get getMaxContextTokens() { return getMaxContextTokens; },
  get getMaxPromptTokens() { return getMaxPromptTokens; },
  get getMaxResponseTokens() { return getMaxResponseTokens; },
  get getStringHash() { return getStringHash; },
  get inject_ids() { return inject_ids; },
  get isFalseBoolean() { return isFalseBoolean; },
  get main_api() { return main_api; },
  get seedrandom() { return seedrandom; },
  get textgenerationwebui_banned_in_macros() { return textgenerationwebui_banned_in_macros; },
 });
}
import { seedrandom, droll } from '../../../lib.js';
import { chat_metadata, main_api, getMaxPromptTokens, getMaxContextTokens, getMaxResponseTokens, extension_prompts, getCurrentChatId } from '../../../script.js';
import { getStringHash, isFalseBoolean } from '../../utils.js';
import { textgenerationwebui_banned_in_macros } from '../../textgen-settings.js';
import { inject_ids } from '../../constants.js';
import { MacroRegistry, MacroCategory, MacroValueType } from '../engine/MacroRegistry.js';
import { MACRO_VARIABLE_SHORTHAND_PATTERN } from '../engine/MacroLexer.js';
import { MacroParser } from '../engine/MacroParser.js';
import { MacroCstWalker } from '../engine/MacroCstWalker.js';

/**
 * Marker used by {{else}} to split content in {{if}} blocks.
 * Uses control characters to minimize collision with real content.
 *
 * This marker is used internally by the macro engine to separate if/else branches.
 * It should never appear in user-generated content.
 *
 * @type {string}
 */
export const ELSE_MARKER = getTavernStageCore().ELSE_MARKER;

/**
 * Registers SillyTavern's core built-in macros in the MacroRegistry.
 *
 * These macros correspond to the main {{...}} macros that are available
 * in prompts (time/date/chat info, utility macros, etc.). They are
 * intended to preserve the behavior of the existing regex-based macros
 * in macros.js while using the new MacroRegistry/MacroEngine pipeline.
 */
export function registerCoreMacros(...args) { return getTavernStageCore().registerCoreMacros.apply(this, args); }

function getChatIdHash(...args) { return getTavernStageCore().getChatIdHash.apply(this, args); }
