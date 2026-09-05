// TavernStage shared core, extracted from public/scripts/power-user.js.
// SillyTavern ancestry and AGPL-3.0 license are retained in repository history.
// Free state and host dependencies are explicit per-session bindings.
export function createCore(__stage) {
const persona_description_positions = __stage._persona_description_positions;

const storage_keys = {
    storyStringValidationCache: 'StoryStringValidationCache',
};

function collapseNewlines(x) {
    return x.replaceAll(/\n+/g, '\n');
}

function fixMarkdown(text, forDisplay) {
    // Find pairs of formatting characters and capture the text in between them
    const format = /([*_]{1,2})([\s\S]*?)\1/gm;
    let matches = [];
    let match;
    while ((match = format.exec(text)) !== null) {
        matches.push(match);
    }

    // Iterate through the matches and replace adjacent spaces immediately beside formatting characters
    let newText = text;
    for (let i = matches.length - 1; i >= 0; i--) {
        let matchText = matches[i][0];
        let replacementText = matchText.replace(/(\*|_)([\t \u00a0\u1680\u2000-\u200a\u202f\u205f\u3000\ufeff]+)|([\t \u00a0\u1680\u2000-\u200a\u202f\u205f\u3000\ufeff]+)(\*|_)/g, '$1$4');
        newText = newText.slice(0, matches[i].index) + replacementText + newText.slice(matches[i].index + matchText.length);
    }

    // Don't auto-fix asterisks if this is a message clean-up procedure.
    // It botches the continue function. Apply this to display only.
    if (!forDisplay) {
        return newText;
    }

    const splitText = newText.split('\n');

    // Fix asterisks, and quotes that are not paired
    for (let index = 0; index < splitText.length; index++) {
        const line = splitText[index];
        const charsToCheck = ['*', '"'];
        for (const char of charsToCheck) {
            if (line.includes(char) && (0, __stage.isOdd)((0, __stage.countOccurrences)(line, char))) {
                splitText[index] = line.trimEnd() + char;
            }
        }
    }

    newText = splitText.join('\n');

    return newText;
}

function renderStoryString(params, { customStoryString = null, customInstructSettings = null, customContextSettings = null } = {}) {
    try {
        const instructSettings = (0, __stage.structuredClone)(customInstructSettings ?? __stage.power_user.instruct);
        const contextSettings = (0, __stage.structuredClone)(customContextSettings ?? __stage.power_user.context);
        const storyString = customStoryString ?? contextSettings.story_string;
        const storyStringPosition = contextSettings.story_string_position ?? __stage.extension_prompt_types.IN_PROMPT;

        // Validate and log possible warnings/errors
        validateStoryString(storyString, params);

        // compile the story string template into a function, with no HTML escaping
        const compiledTemplate = __stage.Handlebars.compile(storyString, { noEscape: true });

        // render the story string template with the given params
        let output = compiledTemplate(params);

        // substitute {{macro}} params that are not defined in the story string
        output = (0, __stage.substituteParams)(output, params.user, params.char);

        // remove leading newlines
        output = output.replace(/^\n+/, '');

        // add a newline to the end of the story string if it doesn't have one
        if (output.length > 0 && !output.endsWith('\n') && storyStringPosition !== __stage.extension_prompt_types.IN_CHAT) {
            if (!instructSettings.enabled || (instructSettings.wrap && !instructSettings.story_string_suffix)) {
                output += '\n';
            }
        }

        return output;
    } catch (e) {
        __stage.toastr.error('Check the story string template for validity', 'Error rendering story string');
        __stage.console.error('Error rendering story string', e);
        throw e; // rethrow the error
    }
}

function validateStoryString(storyString, params) {
    /** @type {{hashCache: {[hash: string]: {fieldsWarned: {[key: string]: boolean}}}}} */
    const cache = JSON.parse(__stage.accountStorage.getItem(storage_keys.storyStringValidationCache)) ?? { hashCache: {} };

    const hash = (0, __stage.getStringHash)(storyString);

    // Initialize the cache for the current hash if it doesn't exist
    if (!cache.hashCache[hash]) {
        cache.hashCache[hash] = { fieldsWarned: {} };
    }

    const currentCache = cache.hashCache[hash];
    const fieldsToWarn = [];

    function validateMissingField(field, fallbackLegacyField = null) {
        const contains = storyString.includes(`{{${field}}}`) || (!!fallbackLegacyField && storyString.includes(`{{${fallbackLegacyField}}}`));
        if (!contains && params[field]) {
            const wasLogged = currentCache.fieldsWarned[field];
            if (!wasLogged) {
                fieldsToWarn.push(field);
                currentCache.fieldsWarned[field] = true;
            }
            __stage.console.warn(`The story string does not contain {{${field}}}, but it would contain content:\n`, params[field]);
        }
    }

    validateMissingField('description');
    validateMissingField('personality');
    validateMissingField('persona');
    validateMissingField('scenario');
    // validateMissingField('system');
    validateMissingField('wiBefore', 'loreBefore');
    validateMissingField('wiAfter', 'loreAfter');

    if (fieldsToWarn.length > 0) {
        const fieldsList = fieldsToWarn.map(field => `{{${field}}}`).join(', ');
        __stage.toastr.warning(`The story string does not contain the following fields, but they would contain content: ${fieldsList}`, 'Story String Validation');
    }

    __stage.accountStorage.setItem(storage_keys.storyStringValidationCache, JSON.stringify(cache));
}

function getCustomStoppingStrings(limit = undefined) {
    function getPermanent() {
        try {
            // If there's no custom stopping strings, return an empty array
            if (!__stage.power_user.custom_stopping_strings) {
                return [];
            }

            // Parse the JSON string
            let strings = JSON.parse(__stage.power_user.custom_stopping_strings);

            // Make sure it's an array
            if (!Array.isArray(strings)) {
                return [];
            }

            // Make sure all the elements are strings and non-empty.
            strings = strings.filter(s => typeof s === 'string' && s.length > 0);

            // Substitute params if necessary
            if (__stage.power_user.custom_stopping_strings_macro) {
                strings = strings.map(x => (0, __stage.substituteParams)(x));
            }

            return strings;
        } catch (error) {
            // If there's an error, return an empty array
            __stage.console.warn('Error parsing custom stopping strings:', error);
            return [];
        }
    }

    const permanent = getPermanent();
    const ephemeral = __stage.EPHEMERAL_STOPPING_STRINGS;
    const strings = [...permanent, ...ephemeral];

    // Apply the limit. If limit is 0, return all strings.
    if (limit > 0) {
        return strings.slice(0, limit);
    }

    return strings;
}
return { persona_description_positions, storage_keys, collapseNewlines, fixMarkdown, renderStoryString, validateStoryString, getCustomStoppingStrings };
}
