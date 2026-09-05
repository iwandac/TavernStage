// TavernStage shared core, extracted from public/scripts/macros/engine/MacroEnvBuilder.js.
// Upstream 8172dcd0ee672d3cd9a5e5f7af134f91a45cd2b8; AGPL-3.0; source declarations: env_provider_order:36; MacroEnvBuilder:48; getGroupValue:189
// Per-session classes; callers explicitly obtain each class.instance after binding dependencies.
export function createCore(__stage) {
const env_provider_order = {
    EARLIEST: 0,
    EARLY: 10,
    NORMAL: 50,
    LATE: 90,
    LATEST: 100,
};

class MacroEnvBuilder {
    /** @type {MacroEnvBuilder} */ static #instance;
    /** @type {MacroEnvBuilder} */ static get instance() { return MacroEnvBuilder.#instance ?? (MacroEnvBuilder.#instance = new MacroEnvBuilder()); }

    /** @type {{ fn: MacroEnvProvider, order: env_provider_order }[]} */
    #providers;

    constructor() {
        this.#providers = [];
    }

    /**
     * Registers a provider that can augment the MacroEnv with additional
     * data (for extensions, extra context, etc.).
     *
     * Should be called once during initialization.
     *
     * @param {MacroEnvProvider} provider
     * @param {env_provider_order} [order=env_provider_order.NORMAL]
     * @returns {void}
     */
    registerProvider(provider, order = env_provider_order.NORMAL) {
        if (typeof provider !== 'function') throw new Error('Provider must be a function');
        this.#providers.push({ fn: provider, order });
    }

    /**
     * Builds a MacroEnv from the raw arguments that are conceptually the
     * same as substituteParams receives, plus a bundle of global helpers.
     *
     * @param {MacroEnvRawContext} ctx
     * @returns {MacroEnv}
     */
    buildFromRawEnv(ctx) {
        // Create the env first, we will populate it step by step.
        // Some fields are marked as required, so we have to fill them with dummy fields here
        /** @type {MacroEnv} */
        const env = {
            content: ctx.content,
            contentHash: (0, __stage.getStringHash)(ctx.content),
            names: { user: '', char: '', group: '', groupNotMuted: '', notChar: '' },
            character: {},
            system: { model: '' },
            functions: { postProcess: (x) => x },
            dynamicMacros: {},
            extra: {},
        };

        if (ctx.replaceCharacterCard) {
            // Use lazy fields - each property is only resolved when accessed
            const fields = (0, __stage.getCharacterCardFieldsLazy)();
            if (fields) {
                // Define lazy getters on env.character that delegate to fields
                const fieldMappings = /** @type {const} */ ([
                    ['charPrompt', 'system'],
                    ['charInstruction', 'jailbreak'],
                    ['description', 'description'],
                    ['personality', 'personality'],
                    ['scenario', 'scenario'],
                    ['persona', 'persona'],
                    ['mesExamplesRaw', 'mesExamples'],
                    ['version', 'version'],
                    ['charDepthPrompt', 'charDepthPrompt'],
                    ['creatorNotes', 'creatorNotes'],
                    ['firstMessage', 'firstMessage'],
                    ['alternateGreetings', 'alternateGreetings'],
                ]);
                for (const [envKey, fieldKey] of fieldMappings) {
                    Object.defineProperty(env.character, envKey, {
                        get() {
                            const value = fields[fieldKey];
                            // alternateGreetings should default to [] instead of ''
                            if (envKey === 'alternateGreetings') {
                                return Array.isArray(value) ? value : [];
                            }
                            return value || '';
                        },
                        enumerable: true,
                        configurable: true,
                    });
                }
            }
        }

        // Names
        env.names.user = ctx.name1Override ?? __stage.name1 ?? '';
        env.names.char = ctx.name2Override ?? __stage.name2 ?? '';
        env.names.group = getGroupValue(ctx, { currentChar: env.names.char, includeMuted: true });
        env.names.groupNotMuted = getGroupValue(ctx, { currentChar: env.names.char, includeMuted: false });
        env.names.notChar = getGroupValue(ctx, { currentChar: env.names.char, filterOutChar: true, includeUser: env.names.user });

        // System
        env.system.model = (0, __stage.getGeneratingModel)();

        // Functions
        // original (one-shot) and arbitrary additional values
        if (typeof ctx.original === 'string') {
            let originalSubstituted = false;
            env.functions.original = () => {
                if (originalSubstituted) return '';
                originalSubstituted = true;
                return ctx.original;
            };
        }
        env.functions.postProcess = typeof ctx.postProcessFn === 'function' ? ctx.postProcessFn : (x) => x;

        // Dynamic, per-call macros that should be visible only for this evaluation run.
        // Keys are normalized to lowercase for case-insensitive matching.
        if (ctx.dynamicMacros && typeof ctx.dynamicMacros === 'object') {
            for (const [key, value] of Object.entries(ctx.dynamicMacros)) {
                env.dynamicMacros[key.toLowerCase()] = value;
            }
        }

        // Let providers augment the env, if any are registered. Apply them in order,
        // so callers can influence when their provider runs relative to others.
        const orderedProviders = this.#providers.slice().sort((a, b) => a.order - b.order);
        for (const { fn } of orderedProviders) {
            try {
                fn(env, ctx);
            } catch (e) {
                // Provider errors should not break macro evaluation
                (0, __stage.logMacroGeneralError)({ message: 'MacroEnvBuilder: Provider error', error: e });
            }
        }

        return env;
    }
}

function getGroupValue(ctx, { currentChar = null, includeMuted = false, filterOutChar = false, includeUser = null }) {
    if (typeof ctx.groupOverride === 'string') {
        return ctx.groupOverride;
    }

    if (!__stage.selected_group) return filterOutChar ? (includeUser || '') : (currentChar ?? '');

    const groupEntry = Array.isArray(__stage.groups) ? __stage.groups.find(x => x && x.id === __stage.selected_group) : null;
    const members = /** @type {string[]} */ (groupEntry?.members ?? []);
    const disabledMembers = /** @type {string[]} */ (groupEntry?.disabled_members ?? []);

    const names = Array.isArray(members)
        ? members
            .filter(((id) => includeMuted ? true : !disabledMembers.includes(id)))
            .map(m => Array.isArray(__stage.characters) ? __stage.characters.find(c => c && c.avatar === m) : null)
            .filter(c => !!c && typeof c.name === 'string')
            .filter(c => !filterOutChar || c.name !== currentChar)
            .map(c => c.name)
            .join(', ')
        : '';

    return names;
}
return { env_provider_order, MacroEnvBuilder, getGroupValue };
}
