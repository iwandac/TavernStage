// TavernStage shared core, extracted from public/scripts/macros/definitions/instruct-macros.js.
// SillyTavern ancestry and AGPL-3.0 license are retained in repository history.
// Free state and host dependencies are explicit per-session bindings.
export function createCore(__stage) {
function registerInstructMacros() {
    /**
     * Helper to register macros that just expose a value from power_user.instruct.
     * The first name is the primary, subsequent names become visible aliases.
     * @param {string[]} names - First is primary, rest are aliases.
     * @param {() => string} getValue
     * @param {() => boolean} isEnabled
     * @param {string} description
     * @param {string} [category=MacroCategory.PROMPTS]
     */
    function registerSimple(names, getValue, isEnabled, description, category = __stage.MacroCategory.PROMPTS) {
        const [primary, ...aliasNames] = names;
        const aliases = aliasNames.map(alias => ({ alias }));

        __stage.MacroRegistry.registerMacro(primary, {
            category,
            description,
            aliases: aliases.length > 0 ? aliases : undefined,
            handler: () => (isEnabled() ? (getValue() ?? '') : ''),
        });
    }

    const instEnabled = () => !!__stage.power_user.instruct.enabled;
    const sysEnabled = () => !!__stage.power_user.sysprompt.enabled;

    // Instruct template macros
    registerSimple(['instructStoryStringPrefix'], () => __stage.power_user.instruct.story_string_prefix, instEnabled, 'Instruct story string prefix.');
    registerSimple(['instructStoryStringSuffix'], () => __stage.power_user.instruct.story_string_suffix, instEnabled, 'Instruct story string suffix.');

    registerSimple(['instructUserPrefix', 'instructInput'], () => __stage.power_user.instruct.input_sequence, instEnabled, 'Instruct input / user prefix sequence.');
    registerSimple(['instructUserSuffix'], () => __stage.power_user.instruct.input_suffix, instEnabled, 'Instruct input / user suffix sequence.');

    registerSimple(['instructAssistantPrefix', 'instructOutput'], () => __stage.power_user.instruct.output_sequence, instEnabled, 'Instruct output / assistant prefix sequence.');
    registerSimple(['instructAssistantSuffix', 'instructSeparator'], () => __stage.power_user.instruct.output_suffix, instEnabled, 'Instruct output / assistant suffix sequence.');

    registerSimple(['instructSystemPrefix'], () => __stage.power_user.instruct.system_sequence, instEnabled, 'Instruct system prefix sequence.');
    registerSimple(['instructSystemSuffix'], () => __stage.power_user.instruct.system_suffix, instEnabled, 'Instruct system suffix sequence.');

    registerSimple(['instructFirstAssistantPrefix', 'instructFirstOutputPrefix'], () => __stage.power_user.instruct.first_output_sequence || __stage.power_user.instruct.output_sequence, instEnabled, 'Instruct first assistant / output prefix sequence');
    registerSimple(['instructLastAssistantPrefix', 'instructLastOutputPrefix'], () => __stage.power_user.instruct.last_output_sequence || __stage.power_user.instruct.output_sequence, instEnabled, 'Instruct last assistant / output prefix sequence.');

    registerSimple(['instructStop'], () => __stage.power_user.instruct.stop_sequence, instEnabled, 'Instruct stop sequence.');
    registerSimple(['instructUserFiller'], () => __stage.power_user.instruct.user_alignment_message, instEnabled, 'Instruct user alignment filler.');
    registerSimple(['instructSystemInstructionPrefix'], () => __stage.power_user.instruct.last_system_sequence, instEnabled, 'Instruct system instruction prefix sequence.');

    registerSimple(['instructFirstUserPrefix', 'instructFirstInput'], () => __stage.power_user.instruct.first_input_sequence || __stage.power_user.instruct.input_sequence, instEnabled, 'Instruct first user / input prefix sequence.');
    registerSimple(['instructLastUserPrefix', 'instructLastInput'], () => __stage.power_user.instruct.last_input_sequence || __stage.power_user.instruct.input_sequence, instEnabled, 'Instruct last user / input prefix sequence.');

    // System prompt macros
    registerSimple(['defaultSystemPrompt', 'instructSystem', 'instructSystemPrompt'], () => __stage.power_user.sysprompt.content, sysEnabled, 'Default system prompt.');

    __stage.MacroRegistry.registerMacro('systemPrompt', {
        category: __stage.MacroCategory.PROMPTS,
        description: 'Active system prompt text (optionally overridden by character prompt)',
        handler: ({ env }) => {
            const isEnabled = !!__stage.power_user.sysprompt.enabled;
            if (!isEnabled) return '';

            if (__stage.power_user.prefer_character_prompt && env.character.charPrompt) {
                return env.character.charPrompt;
            }
            return __stage.power_user.sysprompt.content ?? '';
        },
    });

    // Context template macros
    registerSimple(['exampleSeparator', 'chatSeparator'], () => __stage.power_user.context.example_separator, () => true, 'Separator used between example chat blocks in text completion prompts.');
    registerSimple(['chatStart'], () => __stage.power_user.context.chat_start, () => true, 'Chat start marker used in text completion prompts.');
}
return { registerInstructMacros };
}
