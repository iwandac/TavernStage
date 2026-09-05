// TavernStage shared core, extracted from public/scripts/reasoning.js.
// SillyTavern ancestry and AGPL-3.0 license are retained in repository history.
// Free state and host dependencies are explicit per-session bindings.
export function createCore(__stage) {
const ReasoningType = {
    Model: 'model',
    Parsed: 'parsed',
    Manual: 'manual',
    Edited: 'edited',
};

function extractReasoningFromData(data, {
    mainApi = null,
    ignoreShowThoughts = false,
    textGenType = null,
    chatCompletionSource = null,
} = {}) {
    switch (mainApi ?? __stage.main_api) {
        case 'textgenerationwebui':
            switch (textGenType ?? __stage.textgenerationwebui_settings.type) {
                case __stage.textgen_types.OPENROUTER:
                    return data?.choices?.[0]?.reasoning ?? '';
                case __stage.textgen_types.OLLAMA:
                    return data?.thinking ?? '';
            }
            break;

        case 'openai':
            if (!ignoreShowThoughts && !__stage.oai_settings.show_thoughts) break;

            switch (chatCompletionSource ?? __stage.oai_settings.chat_completion_source) {
                case __stage.chat_completion_sources.DEEPSEEK:
                    return data?.choices?.[0]?.message?.reasoning_content ?? '';
                case __stage.chat_completion_sources.XAI:
                    return data?.choices?.[0]?.message?.reasoning_content ?? '';
                case __stage.chat_completion_sources.OPENROUTER:
                    return data?.choices?.[0]?.message?.reasoning
                        ?? data?.choices?.[0]?.message?.reasoning_content
                        ?? '';
                case __stage.chat_completion_sources.MAKERSUITE:
                case __stage.chat_completion_sources.VERTEXAI:
                    return data?.responseContent?.parts?.filter(part => part.thought)?.map(part => part.text)?.join('\n\n') ?? '';
                case __stage.chat_completion_sources.CLAUDE:
                    return data?.content?.filter(part => part.type === 'thinking')?.map(part => part.thinking)?.join('\n\n') ?? '';
                case __stage.chat_completion_sources.MISTRALAI:
                    return data?.choices?.[0]?.message?.content?.[0]?.thinking?.map(part => part.text)?.filter(x => x)?.join('\n\n') ?? '';
                case __stage.chat_completion_sources.AIMLAPI:
                case __stage.chat_completion_sources.POLLINATIONS:
                case __stage.chat_completion_sources.MOONSHOT:
                case __stage.chat_completion_sources.COMETAPI:
                case __stage.chat_completion_sources.CHUTES:
                case __stage.chat_completion_sources.ELECTRONHUB:
                case __stage.chat_completion_sources.NANOGPT:
                case __stage.chat_completion_sources.SILICONFLOW:
                case __stage.chat_completion_sources.ZAI:
                case __stage.chat_completion_sources.WORKERS_AI:
                case __stage.chat_completion_sources.CUSTOM: {
                    return data?.choices?.[0]?.message?.reasoning_content
                        ?? data?.choices?.[0]?.message?.reasoning
                        ?? '';
                }
            }
            break;
    }

    return '';
}

function extractReasoningSignatureFromData(data, {
    mainApi = null,
    chatCompletionSource = null,
} = {}) {
    // Only Gemini models use thought signatures (via MakerSuite/VertexAI or OpenRouter)
    if ((mainApi ?? __stage.main_api) !== 'openai') {
        return null;
    }

    const source = chatCompletionSource ?? __stage.oai_settings.chat_completion_source;
    const isGemini = source === __stage.chat_completion_sources.MAKERSUITE || source === __stage.chat_completion_sources.VERTEXAI;
    const isOpenRouter = source === __stage.chat_completion_sources.OPENROUTER;

    if (!isGemini && !isOpenRouter) {
        return null;
    }

    // OpenRouter format: reasoning_details array with type "reasoning.encrypted" (exclude tool calls)
    if (isOpenRouter && Array.isArray(data?.choices?.[0]?.message?.reasoning_details)) {
        for (const detail of data.choices[0].message.reasoning_details) {
            if (!/^tool_/.test(detail.id) && detail.type === 'reasoning.encrypted' && detail.data) {
                return detail.data;
            }
        }
    }

    // Direct Gemini format: Extract from responseContent.parts if available (only text parts)
    if (isGemini && Array.isArray(data?.responseContent?.parts)) {
        data.responseContent.parts.forEach((part) => {
            if (part.thoughtSignature && typeof part.text === 'string') {
                return part.thoughtSignature;
            }
        });
    }

    return null;
}

class PromptReasoning {
    /**
     * An instance initiated during the latest prompt processing.
     * @type {PromptReasoning}
     * */
    static #LATEST = null;
    /**
     * @readonly Zero-width space character used as a placeholder for reasoning.
     * @type {string}
    */
    static REASONING_PLACEHOLDER = '\u200B';

    /**
     * Returns the latest formatted reasoning prefix if the prefix is incomplete.
     * @returns {string} Formatted reasoning prefix
     */
    static getLatestPrefix() {
        if (!PromptReasoning.#LATEST) {
            return '';
        }

        if (!PromptReasoning.#LATEST.prefixIncomplete) {
            return '';
        }

        return PromptReasoning.#LATEST.prefixReasoningFormatted;
    }

    /**
     * Free the latest reasoning instance.
     * To be called when the generation has ended or stopped.
     */
    static clearLatest() {
        PromptReasoning.#LATEST = null;
    }

    constructor() {
        PromptReasoning.#LATEST = this;

        /** @type {number} */
        this.counter = 0;
        /** @type {number} */
        this.prefixLength = -1;
        /** @type {string} */
        this.prefixReasoning = '';
        /** @type {string} */
        this.prefixReasoningFormatted = '';
        /** @type {number?} */
        this.prefixDuration = null;
        /** @type {boolean} */
        this.prefixIncomplete = false;
    }

    /**
     * Checks if the limit of reasoning additions has been reached.
     * @returns {boolean} True if the limit of reasoning additions has been reached, false otherwise.
     */
    isLimitReached() {
        if (!__stage.power_user.reasoning.add_to_prompts) {
            return true;
        }

        return this.counter >= __stage.power_user.reasoning.max_additions;
    }

    /**
     * Add reasoning to a message according to the power user settings.
     * @param {string} content Message content
     * @param {string} reasoning Message reasoning
     * @param {boolean} isPrefix Whether this is the last message prefix
     * @param {number?} duration Duration of the reasoning
     * @returns {string} Message content with reasoning
     */
    addToMessage(content, reasoning, isPrefix, duration) {
        // Disabled or reached limit of additions
        if (!isPrefix && (!__stage.power_user.reasoning.add_to_prompts || this.counter >= __stage.power_user.reasoning.max_additions)) {
            return content;
        }

        // No reasoning provided or a legacy placeholder
        if (!reasoning || reasoning === PromptReasoning.REASONING_PLACEHOLDER) {
            return content;
        }

        // Increment the counter
        this.counter++;

        // Substitute macros in variable parts
        const prefix = (0, __stage.substituteParams)(__stage.power_user.reasoning.prefix || '');
        const separator = (0, __stage.substituteParams)(__stage.power_user.reasoning.separator || '');
        const suffix = (0, __stage.substituteParams)(__stage.power_user.reasoning.suffix || '');

        // Combine parts with reasoning only
        if (isPrefix && !content) {
            const formattedReasoning = `${prefix}${reasoning}`;
            if (isPrefix) {
                this.prefixReasoning = reasoning;
                this.prefixReasoningFormatted = formattedReasoning;
                this.prefixLength = formattedReasoning.length;
                this.prefixDuration = duration;
                this.prefixIncomplete = true;
            }
            return formattedReasoning;
        }

        // Combine parts with reasoning and content
        const formattedReasoning = `${prefix}${reasoning}${suffix}${separator}`;
        if (isPrefix) {
            this.prefixReasoning = reasoning;
            this.prefixReasoningFormatted = formattedReasoning;
            this.prefixLength = formattedReasoning.length;
            this.prefixDuration = duration;
            this.prefixIncomplete = false;
        }
        return `${formattedReasoning}${content}`;
    }

    /**
     * Removes the reasoning prefix from the content.
     * @param {string} content Content with the reasoning prefix
     * @returns {string} Content without the reasoning prefix
     */
    removePrefix(content) {
        if (this.prefixLength > 0) {
            return content.slice(this.prefixLength);
        }
        return content;
    }
}

function registerReasoningMacros() {
    __stage.macros.register('reasoningPrefix', {
        category: __stage.MacroCategory.PROMPTS,
        description: (0, __stage.t)`The prefix string used before reasoning blocks`,
        handler: () => __stage.power_user.reasoning.prefix,
    });
    __stage.macros.register('reasoningSuffix', {
        category: __stage.MacroCategory.PROMPTS,
        description: (0, __stage.t)`The suffix string used after reasoning blocks`,
        handler: () => __stage.power_user.reasoning.suffix,
    });
    __stage.macros.register('reasoningSeparator', {
        category: __stage.MacroCategory.PROMPTS,
        description: (0, __stage.t)`The separator between thinking content and response`,
        handler: () => __stage.power_user.reasoning.separator,
    });
}

function getReasoningTemplateByName(name) {
    const template = __stage.reasoning_templates.find(p => p.name === name);
    if (!template) throw new Error(`Unknown reasoning template name: "${name}"`);
    return template;
}

function parseReasoningFromString(str, { strict = true } = {}, template = null) {
    template = template ?? __stage.power_user.reasoning;  // if no template given, use the currently selected template

    // Both prefix and suffix must be defined
    if (!template.prefix || !template.suffix) {
        return null;
    }

    try {
        const regex = new RegExp(`${(strict ? '^\\s*?' : '')}${(0, __stage.escapeRegex)(template.prefix)}(.*?)${(0, __stage.escapeRegex)(template.suffix)}`, 's');

        let didReplace = false;
        let reasoning = '';
        let content = String(str).replace(regex, (_match, captureGroup) => {
            didReplace = true;
            reasoning = captureGroup;
            return '';
        });

        if (didReplace) {
            reasoning = (0, __stage.trimSpaces)(reasoning);
            content = (0, __stage.trimSpaces)(content);
        }

        return { reasoning, content };
    } catch (error) {
        __stage.console.error('[Reasoning] Error parsing reasoning block', error);
        return null;
    }
}

function parseReasoningInSwipes(swipes, swipeInfoArray, duration) {
    if (!__stage.power_user.reasoning.auto_parse) {
        return;
    }

    // Something ain't right, don't parse
    if (!Array.isArray(swipes) || !Array.isArray(swipeInfoArray) || swipes.length !== swipeInfoArray.length) {
        return;
    }

    for (let index = 0; index < swipes.length; index++) {
        const parsedReasoning = parseReasoningFromString(swipes[index]);
        if (parsedReasoning) {
            swipes[index] = (0, __stage.getRegexedString)(parsedReasoning.content, __stage.regex_placement.REASONING);
            swipeInfoArray[index].extra.reasoning = parsedReasoning.reasoning;
            swipeInfoArray[index].extra.reasoning_duration = duration;
            swipeInfoArray[index].extra.reasoning_type = ReasoningType.Parsed;
        }
    }
}
return { ReasoningType, extractReasoningFromData, extractReasoningSignatureFromData, PromptReasoning, registerReasoningMacros, getReasoningTemplateByName, parseReasoningFromString, parseReasoningInSwipes };
}
