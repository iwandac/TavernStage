// TavernStage shared core, extracted from public/scripts/extensions/regex/engine.js.
// SillyTavern ancestry and AGPL-3.0 license are retained in repository history.
// Free state and host dependencies are explicit per-session bindings.
export function createCore(__stage) {
const SCRIPT_TYPES = {
    // ORDER MATTERS: defines the regex script priority
    GLOBAL: 0,
    PRESET: 2,
    SCOPED: 1,
};

const SCRIPT_TYPE_UNKNOWN = -1;

const DEFAULT_GET_REGEX_SCRIPTS_OPTIONS = Object.freeze({ allowedOnly: false });

class RegexProvider {
    /** @type {Map<string, RegExp>} */
    #cache = new Map();
    /** @type {number} */
    #maxSize = 1000;

    static instance = new RegexProvider();

    /**
     * Gets a regex instance by its string representation.
     * @param {string} regexString The regex string to retrieve
     * @returns {RegExp?} Compiled regex or null if invalid
     */
    get(regexString) {
        const isCached = this.#cache.has(regexString);
        const regex = isCached
            ? this.#cache.get(regexString)
            : (0, __stage.regexFromString)(regexString);

        if (!regex) {
            return null;
        }

        if (isCached) {
            // LRU: Move to end by re-inserting
            this.#cache.delete(regexString);
            this.#cache.set(regexString, regex);
        } else {
            // Evict oldest if at capacity
            if (this.#cache.size >= this.#maxSize) {
                const firstKey = this.#cache.keys().next().value;
                this.#cache.delete(firstKey);
            }
            this.#cache.set(regexString, regex);
        }

        // Reset lastIndex for global/sticky regexes
        if (regex.global || regex.sticky) {
            regex.lastIndex = 0;
        }

        return regex;
    }

    /**
     * Clears the entire cache.
     */
    clear() {
        this.#cache.clear();
    }
}

function getRegexScripts(options = DEFAULT_GET_REGEX_SCRIPTS_OPTIONS) {
    return [...Object.values(SCRIPT_TYPES).flatMap(type => getScriptsByType(type, options))];
}

function getScriptsByType(scriptType, { allowedOnly } = DEFAULT_GET_REGEX_SCRIPTS_OPTIONS) {
    switch (scriptType) {
        case SCRIPT_TYPE_UNKNOWN:
            return [];
        case SCRIPT_TYPES.GLOBAL:
            return __stage.extension_settings.regex ?? [];
        case SCRIPT_TYPES.SCOPED: {
            if (allowedOnly && !__stage.extension_settings?.character_allowed_regex?.includes(__stage.characters?.[__stage.this_chid]?.avatar)) {
                return [];
            }
            const scopedScripts = __stage.characters[__stage.this_chid]?.data?.extensions?.regex_scripts;
            return Array.isArray(scopedScripts) ? scopedScripts : [];
        }
        case SCRIPT_TYPES.PRESET: {
            if (allowedOnly && !__stage.extension_settings?.preset_allowed_regex?.[getCurrentPresetAPI()]?.includes(getCurrentPresetName())) {
                return [];
            }
            const presetManager = (0, __stage.getPresetManager)();
            const presetScripts = presetManager?.readPresetExtensionField({ path: 'regex_scripts' });
            return Array.isArray(presetScripts) ? presetScripts : [];
        }
        default:
            __stage.console.warn(`getScriptsByType: Invalid script type ${scriptType}`);
            return [];
    }
}

function getCurrentPresetAPI() {
    return (0, __stage.getPresetManager)()?.apiId ?? null;
}

function getCurrentPresetName() {
    return (0, __stage.getPresetManager)()?.getSelectedPresetName() ?? null;
}

const regex_placement = {
    /**
     * @deprecated MD Display is deprecated. Do not use.
     */
    MD_DISPLAY: 0,
    USER_INPUT: 1,
    AI_OUTPUT: 2,
    SLASH_COMMAND: 3,
    // 4 - sendAs (legacy)
    WORLD_INFO: 5,
    REASONING: 6,
};

const substitute_find_regex = {
    NONE: 0,
    RAW: 1,
    ESCAPED: 2,
};

function sanitizeRegexMacro(x) {
    return (x && typeof x === 'string') ?
        x.replaceAll(/[\n\r\t\v\f\0.^$*+?{}[\]\\/|()]/gs, function (s) {
            switch (s) {
                case '\n':
                    return '\\n';
                case '\r':
                    return '\\r';
                case '\t':
                    return '\\t';
                case '\v':
                    return '\\v';
                case '\f':
                    return '\\f';
                case '\0':
                    return '\\0';
                default:
                    return '\\' + s;
            }
        }) : x;
}

function getRegexedString(rawString, placement, { characterOverride, isMarkdown, isPrompt, isEdit, depth } = {}) {
    // WTF have you passed me?
    if (typeof rawString !== 'string') {
        __stage.console.warn('getRegexedString: rawString is not a string. Returning empty string.');
        return '';
    }

    let finalString = rawString;
    if (__stage.extension_settings.disabledExtensions.includes('regex') || !rawString || placement === undefined) {
        return finalString;
    }

    const allRegex = getRegexScripts({ allowedOnly: true });
    allRegex.forEach((script) => {
        if (
            // Script applies to Markdown and input is Markdown
            (script.markdownOnly && isMarkdown) ||
            // Script applies to Generate and input is Generate
            (script.promptOnly && isPrompt) ||
            // Script applies to all cases when neither "only"s are true, but there's no need to do it when `isMarkdown`, the as source (chat history) should already be changed beforehand
            (!script.markdownOnly && !script.promptOnly && !isMarkdown && !isPrompt)
        ) {
            if (isEdit && !script.runOnEdit) {
                __stage.console.debug(`getRegexedString: Skipping script ${script.scriptName} because it does not run on edit`);
                return;
            }

            // Check if the depth is within the min/max depth
            if (typeof depth === 'number') {
                if (!isNaN(script.minDepth) && script.minDepth !== null && script.minDepth >= -1 && depth < script.minDepth) {
                    __stage.console.debug(`getRegexedString: Skipping script ${script.scriptName} because depth ${depth} is less than minDepth ${script.minDepth}`);
                    return;
                }

                if (!isNaN(script.maxDepth) && script.maxDepth !== null && script.maxDepth >= 0 && depth > script.maxDepth) {
                    __stage.console.debug(`getRegexedString: Skipping script ${script.scriptName} because depth ${depth} is greater than maxDepth ${script.maxDepth}`);
                    return;
                }
            }

            if (script.placement.includes(placement)) {
                finalString = runRegexScript(script, finalString, { characterOverride });
            }
        }
    });

    return finalString;
}

function runRegexScript(regexScript, rawString, { characterOverride } = {}) {
    let newString = rawString;
    if (!regexScript || !!(regexScript.disabled) || !regexScript?.findRegex || !rawString) {
        return newString;
    }

    const getRegexString = () => {
        switch (Number(regexScript.substituteRegex)) {
            case substitute_find_regex.NONE:
                return regexScript.findRegex;
            case substitute_find_regex.RAW:
                return (0, __stage.substituteParamsExtended)(regexScript.findRegex);
            case substitute_find_regex.ESCAPED:
                return (0, __stage.substituteParamsExtended)(regexScript.findRegex, {}, sanitizeRegexMacro);
            default:
                __stage.console.warn(`runRegexScript: Unknown substituteRegex value ${regexScript.substituteRegex}. Using raw regex.`);
                return regexScript.findRegex;
        }
    };
    const regexString = getRegexString();
    const findRegex = RegexProvider.instance.get(regexString);

    // The user skill issued. Return with nothing.
    if (!findRegex) {
        return newString;
    }

    // Run replacement. Currently does not support the Overlay strategy
    newString = rawString.replace(findRegex, function (match) {
        const args = [...arguments];
        const replaceString = regexScript.replaceString.replace(/{{match}}/gi, '$0');
        const replaceWithGroups = replaceString.replaceAll(/\$(\d+)|\$<([^>]+)>/g, (_, num, groupName) => {
            if (num) {
                // Handle numbered capture groups ($1, $2, etc.)
                match = args[Number(num)];
            } else if (groupName) {
                // Handle named capture groups ($<name>)
                const groups = args[args.length - 1];
                match = groups && typeof groups === 'object' && groups[groupName];
            }

            // No match found - return the empty string
            if (!match) {
                return '';
            }

            // Remove trim strings from the match
            const filteredMatch = filterString(match, regexScript.trimStrings, { characterOverride });

            return filteredMatch;
        });

        // Substitute at the end
        return (0, __stage.substituteParams)(replaceWithGroups);
    });

    return newString;
}

function filterString(rawString, trimStrings, { characterOverride } = {}) {
    let finalString = rawString;
    trimStrings.forEach((trimString) => {
        const subTrimString = (0, __stage.substituteParams)(trimString, { name2Override: characterOverride });
        finalString = finalString.replaceAll(subTrimString, '');
    });

    return finalString;
}
return { SCRIPT_TYPES, SCRIPT_TYPE_UNKNOWN, DEFAULT_GET_REGEX_SCRIPTS_OPTIONS, RegexProvider, getRegexScripts, getScriptsByType, getCurrentPresetAPI, getCurrentPresetName, regex_placement, substitute_find_regex, sanitizeRegexMacro, getRegexedString, runRegexScript, filterString };
}
