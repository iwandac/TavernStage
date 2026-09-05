const toolPresentation = null;

// TavernStage shared core. Getters retain this browser host's live state.
import { createCore as createTavernStageCore } from './tavernstage/scripts-tool-calling.js';
var tavernStageCore;
function getTavernStageCore() {
 return tavernStageCore ??= createTavernStageCore({
  get ARGUMENT_TYPE() { return ARGUMENT_TYPE; },
  get DOMPurify() { return DOMPurify; },
  get Math() { return Math; },
  get Popup() { return Popup; },
  get SlashCommand() { return SlashCommand; },
  get SlashCommandArgument() { return SlashCommandArgument; },
  get SlashCommandClosure() { return SlashCommandClosure; },
  get SlashCommandEnumValue() { return SlashCommandEnumValue; },
  get SlashCommandNamedArgument() { return SlashCommandNamedArgument; },
  get SlashCommandParser() { return SlashCommandParser; },
  get addOneMessage() { return addOneMessage; },
  get assignNestedVariables() { return assignNestedVariables; },
  get chat() { return chat; },
  get chat_completion_sources() { return chat_completion_sources; },
  get console() { return console; },
  get custom_prompt_post_processing_types() { return custom_prompt_post_processing_types; },
  get document() { return document; },
  get enumIcons() { return enumIcons; },
  get enumTypes() { return enumTypes; },
  get eventSource() { return eventSource; },
  get event_types() { return event_types; },
  get getChatCompletionModel() { return getChatCompletionModel; },
  get getGeneratingApi() { return getGeneratingApi; },
  get getGeneratingModel() { return getGeneratingModel; },
  get isTrueBoolean() { return isTrueBoolean; },
  get main_api() { return main_api; },
  get model_list() { return model_list; },
  get oai_settings() { return oai_settings; },
  get saveChatConditional() { return saveChatConditional; },
  get slashCommandReturnHelper() { return slashCommandReturnHelper; },
  get structuredClone() { return structuredClone; },
  get systemUserName() { return systemUserName; },
  get system_avatar() { return system_avatar; },
  get toastr() { return toastr; },
  get toolPresentation() { return toolPresentation; },
 });
}
import { DOMPurify } from '../lib.js';

import { addOneMessage, chat, event_types, eventSource, getGeneratingApi, getGeneratingModel, main_api, saveChatConditional, system_avatar, systemUserName } from '../script.js';
import { chat_completion_sources, custom_prompt_post_processing_types, getChatCompletionModel, model_list, oai_settings } from './openai.js';
import { Popup } from './popup.js';
import { SlashCommand } from './slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandArgument, SlashCommandNamedArgument } from './slash-commands/SlashCommandArgument.js';
import { SlashCommandClosure } from './slash-commands/SlashCommandClosure.js';
import { enumIcons } from './slash-commands/SlashCommandCommonEnumsProvider.js';
import { enumTypes, SlashCommandEnumValue } from './slash-commands/SlashCommandEnumValue.js';
import { SlashCommandParser } from './slash-commands/SlashCommandParser.js';
import { slashCommandReturnHelper } from './slash-commands/SlashCommandReturnHelper.js';
import { isTrueBoolean } from './utils.js';

/**
 * @typedef {object} ToolInvocation
 * @property {string} id - A unique identifier for the tool invocation.
 * @property {string} displayName - The display name of the tool.
 * @property {string} name - The name of the tool.
 * @property {string} parameters - The parameters for the tool invocation.
 * @property {string} result - The result of the tool invocation.
 * @property {string?} signature - The thought signature associated with the tool invocation.
 * @property {string?} reasoning - The plaintext reasoning associated with this tool call turn.
 * @property {boolean} [error] - Whether the tool invocation failed.
 */

/**
 * @typedef {object} ToolInvocationResult
 * @property {ToolInvocation[]} invocations Tool invocations (both successful and failed)
 * @property {Error[]} errors Errors that occurred during tool invocation
 * @property {string[]} stealthCalls Names of stealth tools that were invoked
 */

/**
 * @typedef {object} ToolRegistration
 * @property {string} name - The name of the tool.
 * @property {string} displayName - The display name of the tool.
 * @property {string} description - A description of the tool.
 * @property {object} parameters - The parameters for the tool.
 * @property {function} action - The action to perform when the tool is invoked.
 * @property {function} [formatMessage] - A function to format the tool call message.
 * @property {function} [shouldRegister] - A function to determine if the tool should be registered.
 * @property {boolean} [stealth] - A tool call result will not be shown in the chat. No follow-up generation will be performed.
 */

/**
 * @typedef {object} ToolDefinitionOpenAI
 * @property {string} type - The type of the tool.
 * @property {object} function - The function definition.
 * @property {string} function.name - The name of the function.
 * @property {string} function.description - The description of the function.
 * @property {object} function.parameters - The parameters of the function.
 * @property {function} toString - A function to convert the tool to a string.
 */

/**
 * Assigns nested variables to a scope.
 * @param {import('./slash-commands/SlashCommandScope.js').SlashCommandScope} scope The scope to assign variables to.
 * @param {object} arg Object to assign variables from.
 * @param {string} prefix Prefix for the variable names.
 */
function assignNestedVariables(scope, arg, prefix) {
    Object.entries(arg).forEach(([key, value]) => {
        const newPrefix = `${prefix}.${key}`;
        if (typeof value === 'object' && value !== null) {
            if (Array.isArray(value)) {
                scope.letVariable(newPrefix, JSON.stringify(value));
            }
            assignNestedVariables(scope, value, newPrefix);
        } else {
            scope.letVariable(newPrefix, value);
        }
    });
}

/**
 * Checks if a string is a valid JSON string.
 * @param {string} str The string to check
 * @returns {boolean} If the string is a valid JSON string
 */
function isJson(...args) { return getTavernStageCore().isJson.apply(this, args); }

/**
 * Tries to parse a string as JSON, returning the original string if parsing fails.
 * @param {string} str The string to try to parse
 * @returns {object|string} Parsed JSON or the original string
 */
function tryParse(...args) { return getTavernStageCore().tryParse.apply(this, args); }

/**
 * Stringifies an object if it is not already a string.
 * @param {any} obj The object to stringify
 * @returns {string} A JSON string representation of the object.
 */
function stringify(...args) { return getTavernStageCore().stringify.apply(this, args); }

/**
 * A class that represents a tool definition.
 */
const ToolDefinition = getTavernStageCore().ToolDefinition;

/**
 * A class that manages the registration and invocation of tools.
 */
export const ToolManager = getTavernStageCore().ToolManager;
