// TavernStage shared core, extracted from public/scripts/instruct-mode.js.
// SillyTavern ancestry and AGPL-3.0 license are retained in repository history.
// Free state and host dependencies are explicit per-session bindings.
export function createCore(__stage) {
function getInstructMacros(env) {
    /** @type {{ key: string,value: string, enabled: boolean }[]} */
    const instructMacros = [
        // Instruct template macros
        {
            key: 'instructStoryStringPrefix',
            value: __stage.power_user.instruct.story_string_prefix,
            enabled: __stage.power_user.instruct.enabled,
        },
        {
            key: 'instructStoryStringSuffix',
            value: __stage.power_user.instruct.story_string_suffix,
            enabled: __stage.power_user.instruct.enabled,
        },
        {
            key: 'instructInput|instructUserPrefix',
            value: __stage.power_user.instruct.input_sequence,
            enabled: __stage.power_user.instruct.enabled,
        },
        {
            key: 'instructUserSuffix',
            value: __stage.power_user.instruct.input_suffix,
            enabled: __stage.power_user.instruct.enabled,
        },
        {
            key: 'instructOutput|instructAssistantPrefix',
            value: __stage.power_user.instruct.output_sequence,
            enabled: __stage.power_user.instruct.enabled,
        },
        {
            key: 'instructSeparator|instructAssistantSuffix',
            value: __stage.power_user.instruct.output_suffix,
            enabled: __stage.power_user.instruct.enabled,
        },
        {
            key: 'instructSystemPrefix',
            value: __stage.power_user.instruct.system_sequence,
            enabled: __stage.power_user.instruct.enabled,
        },
        {
            key: 'instructSystemSuffix',
            value: __stage.power_user.instruct.system_suffix,
            enabled: __stage.power_user.instruct.enabled,
        },
        {
            key: 'instructFirstOutput|instructFirstAssistantPrefix',
            value: __stage.power_user.instruct.first_output_sequence || __stage.power_user.instruct.output_sequence,
            enabled: __stage.power_user.instruct.enabled,
        },
        {
            key: 'instructLastOutput|instructLastAssistantPrefix',
            value: __stage.power_user.instruct.last_output_sequence || __stage.power_user.instruct.output_sequence,
            enabled: __stage.power_user.instruct.enabled,
        },
        {
            key: 'instructStop',
            value: __stage.power_user.instruct.stop_sequence,
            enabled: __stage.power_user.instruct.enabled,
        },
        {
            key: 'instructUserFiller',
            value: __stage.power_user.instruct.user_alignment_message,
            enabled: __stage.power_user.instruct.enabled,
        },
        {
            key: 'instructSystemInstructionPrefix',
            value: __stage.power_user.instruct.last_system_sequence,
            enabled: __stage.power_user.instruct.enabled,
        },
        {
            key: 'instructFirstInput|instructFirstUserPrefix',
            value: __stage.power_user.instruct.first_input_sequence || __stage.power_user.instruct.input_sequence,
            enabled: __stage.power_user.instruct.enabled,
        },
        {
            key: 'instructLastInput|instructLastUserPrefix',
            value: __stage.power_user.instruct.last_input_sequence || __stage.power_user.instruct.input_sequence,
            enabled: __stage.power_user.instruct.enabled,
        },
        // System prompt macros
        {
            key: 'systemPrompt',
            value: __stage.power_user.prefer_character_prompt && env.charPrompt ? env.charPrompt : __stage.power_user.sysprompt.content,
            enabled: __stage.power_user.sysprompt.enabled,
        },
        {
            key: 'defaultSystemPrompt|instructSystem|instructSystemPrompt',
            value: __stage.power_user.sysprompt.content,
            enabled: __stage.power_user.sysprompt.enabled,
        },
        // Context template macros
        {
            key: 'chatSeparator',
            value: __stage.power_user.context.example_separator,
            enabled: true,
        },
        {
            key: 'chatStart',
            value: __stage.power_user.context.chat_start,
            enabled: true,
        },
    ];

    const macros = [];

    for (const { key, value, enabled } of instructMacros) {
        const regex = new RegExp(`{{(${key})}}`, 'gi');
        const replace = () => enabled ? value : '';
        macros.push({ regex, replace });
    }

    return macros;
}
return { getInstructMacros };
}
