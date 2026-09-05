
// TavernStage shared core. Getters retain this browser host's live state.
import { createCore as createTavernStageCore } from './tavernstage/scripts-PromptManager.js';
var tavernStageCore;
function getTavernStageCore() {
 return tavernStageCore ??= createTavernStageCore({
  get $() { return $; },
  get Blob() { return Blob; },
  get DOMPurify() { return DOMPurify; },
  get Date() { return Date; },
  get Event() { return Event; },
  get FileReader() { return FileReader; },
  get HTMLInputElement() { return HTMLInputElement; },
  get HTMLSelectElement() { return HTMLSelectElement; },
  get Math() { return Math; },
  get Message() { return Message; },
  get Popup() { return Popup; },
  get TokenHandler() { return TokenHandler; },
  get console() { return console; },
  get debounce() { return debounce; },
  get debouncePromise() { return debouncePromise; },
  get debounce_timeout() { return debounce_timeout; },
  get document() { return document; },
  get escapeHtml() { return escapeHtml; },
  get eventSource() { return eventSource; },
  get event_types() { return event_types; },
  get isMobile() { return isMobile; },
  get is_group_generating() { return is_group_generating; },
  get is_send_press() { return is_send_press; },
  get main_api() { return main_api; },
  get power_user() { return power_user; },
  get renderTemplateAsync() { return renderTemplateAsync; },
  get structuredClone() { return structuredClone; },
  get substituteParams() { return substituteParams; },
  get t() { return t; },
  get toastr() { return toastr; },
  get uuidv4() { return uuidv4; },
  get waitUntilCondition() { return waitUntilCondition; },
 });
}
'use strict';

import { DOMPurify } from '../lib.js';

import { event_types, eventSource, is_send_press, main_api, substituteParams } from '../script.js';
import { is_group_generating } from './group-chats.js';
import { Message, MessageCollection, TokenHandler } from './openai.js';
import { power_user } from './power-user.js';
import { debounce, waitUntilCondition, escapeHtml, uuidv4 } from './utils.js';
import { debounce_timeout } from './constants.js';
import { renderTemplateAsync } from './templates.js';
import { Popup } from './popup.js';
import { t } from './i18n.js';
import { isMobile } from './RossAscends-mods.js';

function debouncePromise(func, delay) {
    let timeoutId;

    return (...args) => {
        clearTimeout(timeoutId);

        return new Promise((resolve) => {
            timeoutId = setTimeout(() => {
                const result = func(...args);
                resolve(result);
            }, delay);
        });
    };
}

const DEFAULT_DEPTH = getTavernStageCore().DEFAULT_DEPTH;
const DEFAULT_ORDER = getTavernStageCore().DEFAULT_ORDER;

/**
 * @enum {number}
 */
export const INJECTION_POSITION = getTavernStageCore().INJECTION_POSITION;

/**
 * Register migrations for the prompt manager when settings are loaded or an Open AI preset is loaded.
 */
const registerPromptManagerMigration = () => {
    const migrate = (settings, savePreset = null, presetName = null) => {
        if ('Default' === presetName) return;

        if (settings.main_prompt || settings.nsfw_prompt || settings.jailbreak_prompt) {
            console.log('Running prompt manager configuration migration');
            if (settings.prompts === undefined || settings.prompts.length === 0) settings.prompts = structuredClone(chatCompletionDefaultPrompts.prompts);

            const findPrompt = (identifier) => settings.prompts.find(prompt => identifier === prompt.identifier);
            if (settings.main_prompt) {
                findPrompt('main').content = settings.main_prompt;
                delete settings.main_prompt;
            }

            if (settings.nsfw_prompt) {
                findPrompt('nsfw').content = settings.nsfw_prompt;
                delete settings.nsfw_prompt;
            }

            if (settings.jailbreak_prompt) {
                findPrompt('jailbreak').content = settings.jailbreak_prompt;
                delete settings.jailbreak_prompt;
            }

            if (savePreset && presetName) savePreset(presetName, settings, false);
        }
    };

    eventSource.on(event_types.SETTINGS_LOADED_BEFORE, settings => migrate(settings));
    eventSource.on(event_types.OAI_PRESET_CHANGED_BEFORE, event => migrate(event.preset, event.savePreset, event.presetName));
};

/**
 * Represents a prompt.
 */
const Prompt = getTavernStageCore().Prompt;

/**
 * Representing a collection of prompts.
 */
export const PromptCollection = getTavernStageCore().PromptCollection;

const PromptManager = getTavernStageCore().PromptManager;

const chatCompletionDefaultPrompts = getTavernStageCore().chatCompletionDefaultPrompts;

const promptManagerDefaultPromptOrders = getTavernStageCore().promptManagerDefaultPromptOrders;

const promptManagerDefaultPromptOrder = getTavernStageCore().promptManagerDefaultPromptOrder;

export {
    PromptManager,
    registerPromptManagerMigration,
    chatCompletionDefaultPrompts,
    promptManagerDefaultPromptOrders,
    Prompt,
};
