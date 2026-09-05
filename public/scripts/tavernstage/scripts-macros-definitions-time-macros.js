// TavernStage shared core, extracted from public/scripts/macros/definitions/time-macros.js.
// SillyTavern ancestry and AGPL-3.0 license are retained in repository history.
// Free state and host dependencies are explicit per-session bindings.
export function createCore(__stage) {
function registerTimeMacros() {
    // Time and date macros
    __stage.MacroRegistry.registerMacro('time', {
        category: __stage.MacroCategory.TIME,
        // Optional single list argument: UTC offset, e.g. {{time::UTC+2}}
        unnamedArgs: [
            {
                name: 'offset',
                optional: true,
                defaultValue: 'null',
                type: __stage.MacroValueType.STRING,
                sampleValue: 'UTC+2',
                description: 'UTC offset in the format UTC±(offset).',
            },
        ],
        description: 'Current local time, or UTC offset when called as {{time::UTC±(offset)}}',
        returns: 'A time string in the format HH:mm.',
        displayOverride: '{{time::[UTC±(offset)]}}',
        exampleUsage: ['{{time}}', '{{time::UTC+2}}', '{{time::UTC-7}}'],
        handler: ({ unnamedArgs: [offsetSpec] }) => {
            if (!offsetSpec) return (0, __stage.moment)().format('LT');

            const match = /^UTC([+-]\d+)$/.exec(offsetSpec);
            if (!match) return (0, __stage.moment)().format('LT');

            const offset = Number.parseInt(match[1], 10);
            if (Number.isNaN(offset)) return (0, __stage.moment)().format('LT');

            return (0, __stage.moment)().utc().utcOffset(offset).format('LT');
        },
    });

    __stage.MacroRegistry.registerMacro('date', {
        category: __stage.MacroCategory.TIME,
        description: 'Current local date as a string in the local short format.',
        returns: 'Current local date in local short format.',
        handler: () => (0, __stage.moment)().format('LL'),
    });

    __stage.MacroRegistry.registerMacro('weekday', {
        category: __stage.MacroCategory.TIME,
        description: 'Current weekday name.',
        returns: 'Current weekday name.',
        handler: () => (0, __stage.moment)().format('dddd'),
    });

    __stage.MacroRegistry.registerMacro('isotime', {
        category: __stage.MacroCategory.TIME,
        description: 'Current time in HH:mm format.',
        returns: 'Current time in HH:mm format.',
        handler: () => (0, __stage.moment)().format('HH:mm'),
    });

    __stage.MacroRegistry.registerMacro('isodate', {
        category: __stage.MacroCategory.TIME,
        description: 'Current date in YYYY-MM-DD format.',
        returns: 'Current date in YYYY-MM-DD format.',
        handler: () => (0, __stage.moment)().format('YYYY-MM-DD'),
    });

    __stage.MacroRegistry.registerMacro('datetimeformat', {
        category: __stage.MacroCategory.TIME,
        unnamedArgs: [
            {
                name: 'format',
                sampleValue: 'YYYY-MM-DD HH:mm:ss',
                description: 'Moment.js format string.',
                type: 'string',
            },
        ],
        description: 'Formats the current date/time using the given moment.js format string.',
        returns: 'Formatted date/time string.',
        exampleUsage: ['{{datetimeformat::YYYY-MM-DD HH:mm:ss}}', '{{datetimeformat::LLLL}}'],
        handler: ({ unnamedArgs: [format] }) => (0, __stage.moment)().format(format),
    });

    __stage.MacroRegistry.registerMacro('idleDuration', {
        aliases: [{ alias: 'idle_duration', visible: false }],
        category: __stage.MacroCategory.TIME,
        description: 'Human-readable duration since the last user message.',
        returns: 'Human-readable duration since the last user message.',
        handler: () => getTimeSinceLastMessage(),
    });

    // Time difference between two values
    __stage.MacroRegistry.registerMacro('timeDiff', {
        category: __stage.MacroCategory.TIME,
        unnamedArgs: [
            {
                name: 'left',
                sampleValue: '2023-01-01 12:00:00',
                description: 'Left time value.',
                type: 'string',
            },
            {
                name: 'right',
                sampleValue: '2023-01-01 15:00:00',
                description: 'Right time value.',
                type: 'string',
            },
        ],
        description: 'Human-readable difference between two times. Order of times does not matter, it will return the absolute difference.',
        returns: 'Human-readable difference between two times.',
        displayOverride: '{{timeDiff::left::right}}', // Shorten this, otherwise it's too long. Full dates don't really help for understanding the macro.
        exampleUsage: ['{{ timeDiff :: 2023-01-01 12:00:00 :: 2023-01-01 15:00:00 }}'],
        handler: ({ unnamedArgs: [left, right] }) => {
            const diff = __stage.moment.duration((0, __stage.moment)(left).diff((0, __stage.moment)(right)));
            return diff.humanize(true);
        },
    });
}

function getTimeSinceLastMessage() {
    const now = (0, __stage.moment)();

    if (Array.isArray(__stage.chat) && __stage.chat.length > 0) {
        let lastMessage;
        let takeNext = false;

        for (let i = __stage.chat.length - 1; i >= 0; i--) {
            const message = __stage.chat[i];

            if (message.is_system) {
                continue;
            }

            if (message.is_user && takeNext) {
                lastMessage = message;
                break;
            }

            takeNext = true;
        }

        if (lastMessage?.send_date) {
            const lastMessageDate = (0, __stage.timestampToMoment)(lastMessage.send_date);
            const duration = __stage.moment.duration(now.diff(lastMessageDate));
            return duration.humanize();
        }
    }

    return 'just now';
}
return { registerTimeMacros, getTimeSinceLastMessage };
}
