// TavernStage shared core, extracted from public/scripts/macros/definitions/env-macros.js.
// SillyTavern ancestry and AGPL-3.0 license are retained in repository history.
// Free state and host dependencies are explicit per-session bindings.
export function createCore(__stage) {
function registerEnvMacros() {
    // Names and participant macros (from MacroEnv.names)
    __stage.MacroRegistry.registerMacro('user', {
        category: __stage.MacroCategory.NAMES,
        description: 'Your current Persona username.',
        returns: 'Persona username.',
        handler: ({ env }) => env.names.user,
    });

    __stage.MacroRegistry.registerMacro('char', {
        category: __stage.MacroCategory.NAMES,
        description: 'The character\'s name.',
        returns: 'Character name.',
        handler: ({ env }) => env.names.char,
    });

    __stage.MacroRegistry.registerMacro('group', {
        aliases: [{ alias: 'charIfNotGroup', visible: false }],
        category: __stage.MacroCategory.NAMES,
        description: 'Comma-separated list of group member names (including muted) or the character name in solo chats.',
        returns: 'List of group member names.',
        handler: ({ env }) => env.names.group ?? '',
    });

    __stage.MacroRegistry.registerMacro('groupNotMuted', {
        category: __stage.MacroCategory.NAMES,
        description: 'Comma-separated list of group member names excluding muted members.',
        returns: 'List of group member names excluding muted members.',
        handler: ({ env }) => env.names.groupNotMuted ?? '',
    });

    __stage.MacroRegistry.registerMacro('notChar', {
        category: __stage.MacroCategory.NAMES,
        description: 'Comma-separated list of all participants except the current speaker.',
        returns: 'List of all participants except the current speaker.',
        handler: ({ env }) => env.names.notChar ?? '',
    });

    // Character card field macros (from MacroEnv.character)
    __stage.MacroRegistry.registerMacro('charPrompt', {
        category: __stage.MacroCategory.CHARACTER,
        description: 'The character\'s Main Prompt override.',
        returns: 'Character Main Prompt override.',
        handler: ({ env }) => env.character.charPrompt ?? '',
    });

    __stage.MacroRegistry.registerMacro('charInstruction', {
        category: __stage.MacroCategory.CHARACTER,
        description: 'The character\'s Post-History Instructions override.',
        returns: 'Character Post-History Instructions override.',
        handler: ({ env }) => env.character.charInstruction ?? '',
    });

    __stage.MacroRegistry.registerMacro('charDescription', {
        aliases: [{ alias: 'description' }],
        category: __stage.MacroCategory.CHARACTER,
        description: 'The character\'s description.',
        returns: 'Character description.',
        handler: ({ env }) => env.character.description ?? '',
    });

    __stage.MacroRegistry.registerMacro('charPersonality', {
        aliases: [{ alias: 'personality' }],
        category: __stage.MacroCategory.CHARACTER,
        description: 'The character\'s personality.',
        returns: 'Character personality.',
        handler: ({ env }) => env.character.personality ?? '',
    });

    __stage.MacroRegistry.registerMacro('charScenario', {
        aliases: [{ alias: 'scenario' }],
        category: __stage.MacroCategory.CHARACTER,
        description: 'The character\'s scenario.',
        returns: 'Character scenario.',
        handler: ({ env }) => env.character.scenario ?? '',
    });

    __stage.MacroRegistry.registerMacro('persona', {
        category: __stage.MacroCategory.CHARACTER,
        description: 'Your current Persona description.',
        returns: 'Persona description.',
        handler: ({ env }) => env.character.persona ?? '',
    });

    __stage.MacroRegistry.registerMacro('mesExamplesRaw', {
        category: __stage.MacroCategory.CHARACTER,
        description: 'Unformatted dialogue examples from the character card.',
        returns: 'Unformatted dialogue examples.',
        handler: ({ env }) => env.character.mesExamplesRaw ?? '',
    });

    __stage.MacroRegistry.registerMacro('mesExamples', {
        category: __stage.MacroCategory.CHARACTER,
        description: 'The character\'s dialogue examples, formatted for instruct mode when enabled.',
        returns: 'Formatted dialogue examples.',
        handler: ({ env }) => {
            const raw = env.character.mesExamplesRaw ?? '';
            if (!raw) return '';

            const isInstruct = !!__stage.power_user?.instruct?.enabled && __stage.main_api !== 'openai';
            const parsed = (0, __stage.parseMesExamples)(raw, isInstruct);

            if (!Array.isArray(parsed) || parsed.length === 0) {
                return '';
            }
            if (!isInstruct) {
                return parsed.join('');
            }

            const formatted = (0, __stage.formatInstructModeExamples)(parsed, env.names.user, env.names.char);
            return Array.isArray(formatted) ? formatted.join('') : '';
        },
    });

    __stage.MacroRegistry.registerMacro('charDepthPrompt', {
        category: __stage.MacroCategory.CHARACTER,
        description: 'The character\'s @ Depth Note.',
        returns: 'Character @ Depth Note.',
        handler: ({ env }) => env.character.charDepthPrompt ?? '',
    });

    __stage.MacroRegistry.registerMacro('charCreatorNotes', {
        aliases: [{ alias: 'creatorNotes' }],
        category: __stage.MacroCategory.CHARACTER,
        description: 'Creator notes from the character card.',
        returns: 'Creator notes.',
        handler: ({ env }) => env.character.creatorNotes ?? '',
    });

    __stage.MacroRegistry.registerMacro('charFirstMessage', {
        aliases: [{ alias: 'greeting' }],
        category: __stage.MacroCategory.CHARACTER,
        unnamedArgs: [
            {
                name: 'index',
                optional: true,
                defaultValue: '0',
                type: __stage.MacroValueType.INTEGER,
                description: '0-based index. 0 (default) returns the main greeting, 1 and up return alternate greetings.',
            },
        ],
        description: 'The character\'s first message / greeting. Optionally specify an index to access alternate greetings.',
        returns: 'Character greeting at the given index, or empty string if out of bounds.',
        exampleUsage: ['{{greeting}}', '{{greeting::0}}', '{{greeting::1}}'],
        handler: ({ env, unnamedArgs: [index] }) => {
            const i = Number(index ?? 0);
            if (i === 0) return env.character.firstMessage ?? '';
            const altGreetings = env.character.alternateGreetings;
            if (!Array.isArray(altGreetings)) return '';
            return altGreetings[i - 1] ?? '';
        },
    });

    // Character version macros (legacy variants and documented {{charVersion}})
    __stage.MacroRegistry.registerMacro('charVersion', {
        aliases: [
            { alias: 'version', visible: false }, // Legacy alias
            { alias: 'char_version', visible: false }, // Legacy underscore variant
        ],
        category: __stage.MacroCategory.CHARACTER,
        description: 'The character\'s version number.',
        returns: 'Character version number.',
        handler: ({ env }) => env.character.version ?? '',
    });

    // System / env extras macros (from MacroEnv.system / MacroEnv.extra)
    __stage.MacroRegistry.registerMacro('model', {
        category: __stage.MacroCategory.STATE,
        description: 'Model name for the currently selected API (Chat Completion or Chat Completion).',
        returns: 'Model name.',
        handler: ({ env }) => env.system.model,
    });

    __stage.MacroRegistry.registerMacro('original', {
        category: __stage.MacroCategory.CHARACTER,
        description: 'Original message content for {{original}} substitution in in character prompt overrides.',
        returns: 'Original message content.',
        handler: ({ env }) => {
            const value = env.functions.original();
            return value;
        },
    });

    // Device / environment macros
    __stage.MacroRegistry.registerMacro('isMobile', {
        category: __stage.MacroCategory.STATE,
        description: '"true" if currently running in a mobile environment, "false" otherwise.',
        returns: 'Whether the environment is mobile.',
        returnType: __stage.MacroValueType.BOOLEAN,
        handler: () => String((0, __stage.isMobile)()),
    });
}
return { registerEnvMacros };
}
