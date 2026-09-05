
// TavernStage shared core. Getters retain this browser host's live state.
import { createCore as createTavernStageCore } from '../../tavernstage/scripts-macros-definitions-chat-macros.js';
const generationHost = { readInput: () => String($('#send_textarea').val()), writeInput: value => { $('#send_textarea').val(value)[0].dispatchEvent(new Event('input', { bubbles: true })); }, firstDisplayedMessageId: () => Number(document.querySelector('#chat .mes')?.getAttribute('mesid')), readAuthorNote: () => $('#extension_floating_prompt').val(), presentAuthorNoteCounter: value => $('#extension_floating_counter').text(value) };
var tavernStageCore;
function getTavernStageCore() {
 return tavernStageCore ??= createTavernStageCore({
  get MacroCategory() { return MacroCategory; },
  get MacroRegistry() { return MacroRegistry; },
  get MacroValueType() { return MacroValueType; },
  get chat() { return chat; },
  get chat_metadata() { return chat_metadata; },
  get generationHost() { return generationHost; },
 });
}
import { MacroRegistry, MacroCategory, MacroValueType } from '../engine/MacroRegistry.js';
import { chat, chat_metadata } from '../../../script.js';

/**
 * Registers macros that inspect the current chat log and swipe state
 * (message texts, indices, swipes, and context boundaries).
 */
export function registerChatMacros(...args) { return getTavernStageCore().registerChatMacros.apply(this, args); }

function getLastMessageId(...args) { return getTavernStageCore().getLastMessageId.apply(this, args); }

function getLastMessage(...args) { return getTavernStageCore().getLastMessage.apply(this, args); }

function getLastUserMessage(...args) { return getTavernStageCore().getLastUserMessage.apply(this, args); }

function getLastCharMessage(...args) { return getTavernStageCore().getLastCharMessage.apply(this, args); }

function getFirstIncludedMessageId(...args) { return getTavernStageCore().getFirstIncludedMessageId.apply(this, args); }

function getFirstDisplayedMessageId(...args) { return getTavernStageCore().getFirstDisplayedMessageId.apply(this, args); }

function getLastSwipeId(...args) { return getTavernStageCore().getLastSwipeId.apply(this, args); }

function getCurrentSwipeId(...args) { return getTavernStageCore().getCurrentSwipeId.apply(this, args); }
