// TavernStage shared core, extracted from public/scripts/macros/engine/MacroFlags.js.
// Upstream 8172dcd0ee672d3cd9a5e5f7af134f91a45cd2b8; AGPL-3.0; source declarations: MacroFlagType:27; MacroFlagDefinitions:93; ValidFlagSymbols:143; createEmptyFlags:150; parseFlags:168; hasAnyFlag:206; getFlagDefinition:216; isValidFlag:226
// Per-session classes; callers explicitly obtain each class.instance after binding dependencies.
export function createCore(__stage) {
const MacroFlagType = Object.freeze({
    /**
     * Immediate resolve flag (`!`).
     * This macro will be resolved first (in order of appearance) before "normal" macros.
     * @status TBD - Not implemented in v1
     */
    IMMEDIATE: '!',

    /**
     * Delayed resolve flag (`?`).
     * This macro will be resolved last (in order of appearance) after "normal" macros.
     * @status TBD - Not implemented in v1
     */
    DELAYED: '?',

    /**
     * Re-evaluate flag (`~`).
     * Marks a macro for potential re-evaluation.
     * @status TBD - Not implemented in v1
     */
    REEVALUATE: '~',

    /**
     * Filter/pipe flag (`>`).
     * Indicates that this macro should resolve `|` characters as output filters.
     * @status Parsed - Filter feature not yet implemented
     */
    FILTER: '>',

    /**
     * Closing block flag (`/`).
     * Marks this macro as the closing block of a scoped macro with the same identifier.
     * A closing block macro does not support arguments itself.
     * Example: `{{setvar::myvar}}long text{{/setvar}}`
     * @status Implemented - Content between opening and closing tags becomes the last unnamed argument
     */
    CLOSING_BLOCK: '/',

    /**
     * Preserve whitespace flag (`#`).
     * Prevents automatic trimming of scoped content.
     * By default, scoped macro content is trimmed. Use this flag to preserve leading/trailing whitespace.
     * Also provides backwards compatibility with legacy handlebars-style syntax like `{{#if ...}}`.
     * Example: `{{#setvar::myvar}}  content with spaces  {{/setvar}}`
     * @status Implemented - Prevents auto-trim on scoped content
     */
    PRESERVE_WHITESPACE: '#',

    // Note: Variable shorthand (. and $) are NOT flags - they are special prefixes
    // that trigger the variable expression parsing branch. See MacroLexer.js Var tokens.
});

const MacroFlagDefinitions = new Map([
    [MacroFlagType.IMMEDIATE, {
        type: MacroFlagType.IMMEDIATE,
        name: 'Immediate',
        description: 'Resolve this macro before other macros in the same text.',
        implemented: false,
        affectsParser: false,
    }],
    [MacroFlagType.DELAYED, {
        type: MacroFlagType.DELAYED,
        name: 'Delayed',
        description: 'Resolve this macro after other macros in the same text.',
        implemented: false,
        affectsParser: false,
    }],
    [MacroFlagType.REEVALUATE, {
        type: MacroFlagType.REEVALUATE,
        name: 'Re-evaluate',
        description: 'Mark this macro for re-evaluation.',
        implemented: false,
        affectsParser: false,
    }],
    [MacroFlagType.FILTER, {
        type: MacroFlagType.FILTER,
        name: 'Filter',
        description: 'Enable pipe-based output filters for this macro.',
        implemented: false,
        affectsParser: true, // Changes how `|` is parsed
    }],
    [MacroFlagType.CLOSING_BLOCK, {
        type: MacroFlagType.CLOSING_BLOCK,
        name: 'Closing Block',
        description: 'Marks this as a closing block for a scoped macro.',
        implemented: true,
        affectsParser: false,
    }],
    [MacroFlagType.PRESERVE_WHITESPACE, {
        type: MacroFlagType.PRESERVE_WHITESPACE,
        name: 'Preserve Whitespace',
        description: 'Prevent automatic trimming of scoped content (legacy # syntax).',
        implemented: true,
        affectsParser: false,
    }],
]);

const ValidFlagSymbols = new Set(Object.values(MacroFlagType));

function createEmptyFlags() {
    return {
        immediate: false,
        delayed: false,
        reevaluate: false,
        filter: false,
        closingBlock: false,
        preserveWhitespace: false,
        raw: [],
    };
}

function parseFlags(flagSymbols) {
    const flags = createEmptyFlags();

    for (const symbol of flagSymbols) {
        switch (symbol) {
            case MacroFlagType.IMMEDIATE:
                flags.immediate = true;
                break;
            case MacroFlagType.DELAYED:
                flags.delayed = true;
                break;
            case MacroFlagType.REEVALUATE:
                flags.reevaluate = true;
                break;
            case MacroFlagType.FILTER:
                flags.filter = true;
                break;
            case MacroFlagType.CLOSING_BLOCK:
                flags.closingBlock = true;
                break;
            case MacroFlagType.PRESERVE_WHITESPACE:
                flags.preserveWhitespace = true;
                break;
            default:
                __stage.console.warn(`Can't parse unknown macro flag: ${symbol}`);
        }
        flags.raw.push(symbol);
    }

    return flags;
}

function hasAnyFlag(flags) {
    return flags.raw.length > 0;
}

function getFlagDefinition(symbol) {
    return MacroFlagDefinitions.get(symbol);
}

function isValidFlag(symbol) {
    return ValidFlagSymbols.has(symbol);
}
return { MacroFlagType, MacroFlagDefinitions, ValidFlagSymbols, createEmptyFlags, parseFlags, hasAnyFlag, getFlagDefinition, isValidFlag };
}
