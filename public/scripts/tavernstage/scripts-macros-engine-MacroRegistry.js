// TavernStage shared core, extracted from public/scripts/macros/engine/MacroRegistry.js.
// Upstream 8172dcd0ee672d3cd9a5e5f7af134f91a45cd2b8; AGPL-3.0; source declarations: MacroCategory:19; MacroValueType:51; MacroRegistry:175; isIdentifierValid:693; isArgsValid:707; validateArgTypes:736; isValueOfType:769; detectMacroSource:796
// Per-session classes; callers explicitly obtain each class.instance after binding dependencies.
export function createCore(__stage) {
const MacroCategory = Object.freeze({
    /** Basic utilities and text manipulation (newline, noop, trim, reverse, comment) */
    UTILITY: 'utility',
    /** Randomization and dice rolling (random, pick, roll) */
    RANDOM: 'random',
    /** Participant names and name lists (user, char, group, notChar) */
    NAMES: 'names',
    /** Character card fields and persona (description, personality, scenario, mesExamples, persona) */
    CHARACTER: 'character',
    /** Chat history, messages, and swipes */
    CHAT: 'chat',
    /** Date, time, and duration macros */
    TIME: 'time',
    /** Local and global variable operations */
    VARIABLE: 'variable',
    /** Prompt templates for text completion (instruct sequences, system prompts, author's notes, context templates) */
    PROMPTS: 'prompts',
    /** Runtime application state (model, API, lastGenerationType, isMobile) */
    STATE: 'state',
    /** Macros that don't fit in any of the other categories, but don't really need/deserve their own */
    MISC: 'misc',
    /** Macros that are registered but not assigned to a category (any macro should have a category, so let the extension author know...) */
    UNCATEGORIZED: 'uncategorized',
});

const MacroValueType = Object.freeze({
    /** String value of any kind */
    STRING: 'string',
    /** Integer value (natural number, no decimal spaces) */
    INTEGER: 'integer',
    /** Number value (decimal spaces allowed, includes integers values) */
    NUMBER: 'number',
    /** Boolean value (true/false, 1/0, yes/no, on/off) */
    BOOLEAN: 'boolean',
});

class MacroRegistry {
    /** @type {MacroRegistry} */ static #instance;
    /** @type {MacroRegistry} */ static get instance() { return MacroRegistry.#instance ?? (MacroRegistry.#instance = new MacroRegistry()); }

    /** @type {Map<string, MacroDefinition>} */
    #macros;

    /**
     * @private
     */
    constructor() {
        /** @type {Map<string, MacroDefinition>} */
        this.#macros = new Map();
    }

    /**
     * Registers a macro with the registry.
     * Errors during registration are caught and logged, the macro will not be registered, and the function returns null.
     *
     * @param {string} name - Macro name (identifier).
     * @param {MacroDefinitionOptions} options - Macro registration options including handler and metadata.
     * @returns {MacroDefinition|null} The registered definition, or null if registration failed.
     */
    registerMacro(name, options) {
        // Extract name early for error logging
        name = typeof name === 'string' ? name.trim() : String(name);

        try {
            // Detect extension/third-party status from call stack
            const { isExtension, isThirdParty, source } = detectMacroSource();

            // Build the definition using the shared helper
            const definition = this.buildMacroDefFromOptions(name, options, {
                source: { name: source, isExtension, isThirdParty },
            });

            // Register the primary macro
            this.#registerMacroEntry(name, definition);

            // Register alias entries pointing to the same definition
            for (const { alias, visible } of definition.aliases) {
                this.#registerMacroEntry(alias, definition, { primaryMacroName: name, aliasVisible: visible });
            }

            return definition;
        } catch (error) {
            (0, __stage.logMacroRegisterError)({
                message: `Failed to register macro "${name}". The macro will not be available.`,
                macroName: name,
                error,
            });
            return null;
        }
    }

    /**
     * Registers an alias for an existing macro.
     * The alias will point to the same handler and metadata as the original macro.
     * Errors during registration are caught and logged, the alias will not be registered, and the function returns false.
     *
     * @param {string} targetMacroName - The name of the existing macro to create an alias for.
     * @param {string} aliasName - The alias name (identifier).
     * @param {Object} [options] - Alias registration options.
     * @param {boolean} [options.visible=true] - Whether this alias appears in documentation/autocomplete.
     * @returns {boolean} True if the alias was registered successfully, false if registration failed.
     */
    registerMacroAlias(targetMacroName, aliasName, { visible = true } = {}) {
        // Extract names early for error logging
        targetMacroName = typeof targetMacroName === 'string' ? targetMacroName.trim() : String(targetMacroName);
        aliasName = typeof aliasName === 'string' ? aliasName.trim() : String(aliasName);

        try {
            // Validate alias name
            if (!isIdentifierValid(aliasName)) {
                throw new Error(`Alias name "${aliasName}" is invalid. Must start with a letter, followed by alphanumeric characters or hyphens.`);
            }

            // Check that alias is not the same as target (case insensitive)
            if (aliasName.toLowerCase() === targetMacroName.toLowerCase()) {
                throw new Error(`Alias name "${aliasName}" cannot be the same as the target macro name (case insensitive).`);
            }

            // Check that target macro exists
            const targetDefinition = this.getMacro(targetMacroName);
            if (!targetDefinition) {
                throw new Error(`Target macro "${targetMacroName}" is not registered.`);
            }

            // Get the primary definition (in case target is itself an alias)
            const primaryDefinition = targetDefinition.aliasOf ? this.getMacro(targetDefinition.aliasOf) : targetDefinition;
            if (!primaryDefinition) {
                throw new Error(`Could not resolve primary definition for target macro "${targetMacroName}".`);
            }

            // Detect extension/third-party status from call stack
            const { isExtension, isThirdParty, source } = detectMacroSource();

            // Create alias definition with source detection
            const aliasDefinition = {
                ...primaryDefinition,
                source: { name: source, isExtension, isThirdParty },
            };

            // Register the alias using the shared utility
            this.#registerMacroEntry(aliasName, aliasDefinition, { primaryMacroName: primaryDefinition.name, aliasVisible: visible });

            return true;
        } catch (error) {
            (0, __stage.logMacroRegisterError)({
                message: `Failed to register alias "${aliasName}" for macro "${targetMacroName}". The alias will not be available.`,
                macroName: aliasName,
                error,
            });
            return false;
        }
    }

    /**
     * Shared utility for registering macro entries (primary or alias).
     *
     * @param {string} name - The registration name (primary macro or alias).
     * @param {MacroDefinition} definition - The definition to register.
     * @param {Object} [options={}] - Options for alias registration.
     * @param {string} [options.primaryMacroName=null] - For aliases, the primary macro name.
     * @param {boolean} [options.aliasVisible=null] - For aliases, visibility flag.
     */
    #registerMacroEntry(name, definition, { primaryMacroName = null, aliasVisible = null } = {}) {
        const nameKey = name.toLowerCase();

        if (this.#macros.has(nameKey)) {
            const warningType = primaryMacroName ? `Alias "${name}" for macro "${primaryMacroName}"` : `Macro "${name}"`;
            const warningMessage = primaryMacroName ? 'overwrites an existing macro.' : 'is already registered and will be overwritten.';
            (0, __stage.logMacroRegisterWarning)({ macroName: primaryMacroName || name, message: `${warningType} ${warningMessage}` });
        }

        /** @type {MacroDefinition} */
        const entry = primaryMacroName ? {
            ...definition,
            name: name, // The lookup name is the alias (preserves original casing for display)
            aliasOf: primaryMacroName,
            aliasVisible: aliasVisible,
        } : definition;

        this.#macros.set(nameKey, entry);
    }

    /**
     * Unregisters a macro.
     *
     * @param {string} name - Macro name (identifier).
     * @returns {boolean} True if a macro was removed.
     */
    unregisterMacro(name) {
        if (typeof name !== 'string' || !name.trim()) throw new Error('Macro name must be a non-empty string');
        name = name.trim();
        return this.#macros.delete(name.toLowerCase());
    }

    /**
     * Checks whether a macro with the given name is registered.
     *
     * @param {string} name - Macro name (identifier).
     * @returns {boolean}
     */
    hasMacro(name) {
        if (typeof name !== 'string' || !name.trim()) return false;
        name = name.trim();
        return this.#macros.has(name.toLowerCase());
    }

    /**
     * Returns the macro definition for a given name.
     *
     * @param {string} name - Macro name (identifier).
     * @returns {MacroDefinition|undefined}
     */
    getMacro(name) {
        if (typeof name !== 'string' || !name.trim()) return undefined;
        name = name.trim();
        return this.#macros.get(name.toLowerCase());
    }

    /**
     * Returns the primary (non-alias) definition for a macro.
     * If given an alias name, returns the primary definition it points to.
     *
     * @param {string} name - Macro name or alias.
     * @returns {MacroDefinition|undefined}
     */
    getPrimaryMacro(name) {
        const def = this.getMacro(name);
        if (!def) return undefined;
        return def.aliasOf ? this.getMacro(def.aliasOf) : def;
    }

    /**
     * Returns an array of all registered macros.
     *
     * @param {Object} [options] - Filter options.
     * @param {boolean} [options.excludeAliases=false] - If true, excludes alias entries (only returns primary definitions).
     * @param {boolean} [options.excludeHiddenAliases=false] - If true, excludes alias entries where visible=false.
     * @returns {MacroDefinition[]}
     */
    getAllMacros({ excludeAliases = false, excludeHiddenAliases = false } = {}) {
        let macros = Array.from(this.#macros.values());
        if (excludeAliases) {
            macros = macros.filter(m => !m.aliasOf);
        } else if (excludeHiddenAliases) {
            macros = macros.filter(m => !m.aliasOf || m.aliasVisible !== false);
        }
        return macros;
    }

    /**
     * Executes a macro for a given call.
     *
     * @param {MacroCall} call - Macro call information.
     * @param {Object} [options] - Additional options.
     * @param {MacroDefinition} [options.defOverride] - Override the macro definition.
     * @returns {string}
     */
    executeMacro(call, { defOverride } = {}) {
        const name = call.name;
        const def = defOverride || this.getMacro(name);
        if (!def) {
            throw new Error(`Macro "${name}" is not registered`);
        }

        const args = Array.isArray(call.args) ? call.args : [];

        if (!isArgsValid(def, args)) {
            const expectedMin = def.list ? def.minArgs + def.list.min : def.minArgs;
            const expectedMax = def.list && def.list.max !== null
                ? def.maxArgs + def.list.max
                : (def.list ? null : def.maxArgs);

            const expectation = (() => {
                if (expectedMax !== null && expectedMax !== expectedMin) return `between ${expectedMin} and ${expectedMax}`;
                if (expectedMax !== null && expectedMax === expectedMin) return `${expectedMin}`;
                return `at least ${expectedMin}`;
            })();

            const message = `Macro "${def.name}" called with ${args.length} unnamed arguments but expects ${expectation}.`;
            if (def.strictArgs) {
                throw (0, __stage.createMacroRuntimeError)({ message, call, def });
            }
            (0, __stage.logMacroRuntimeWarning)({ message, call, def });
        }

        // Compute unnamed args (required + optional, up to maxArgs)
        const unnamedArgsCount = __stage.Math.min(args.length, def.maxArgs);
        const unnamedArgsValues = args.slice(0, unnamedArgsCount);
        const listValues = !def.list ? null : args.length > def.maxArgs ? args.slice(def.maxArgs) : [];

        // Perform best-effort type validation for documented positional arguments.
        // This can throw an error if the arguments are invalid.
        validateArgTypes(call, def, unnamedArgsValues);

        const namedArgs = null;

        /** @type {MacroExecutionContext} */
        const executionContext = {
            name: def.name,
            args,
            unnamedArgs: unnamedArgsValues,
            list: listValues,
            namedArgs,
            flags: call.flags,
            isScoped: call.isScoped,
            raw: call.rawInner,
            rawOriginal: call.rawWithBraces,
            rawArgs: call.rawArgs,
            env: call.env,
            cstNode: call.cstNode,
            range: call.range,
            globalOffset: call.globalOffset,
            normalize: __stage.MacroEngine.normalizeMacroResult.bind(__stage.MacroEngine),
            trimContent: __stage.MacroEngine.trimScopedContent.bind(__stage.MacroEngine),
            resolve: (text, { offsetDelta = 0 } = {}) => __stage.MacroEngine.evaluate(text, call.env, {
                contextOffset: call.globalOffset + offsetDelta,
            }),
            warn: (message, error = undefined) => (0, __stage.logMacroRuntimeWarning)({ message, call, def, error }),
        };

        const result = def.handler(executionContext);
        return executionContext.normalize(result);
    }

    /**
     * Builds a MacroDefinition from MacroDefinitionOptions.
     *
     * This is the core logic building the actual registered macro from an options object
     * that has nearly everything as optional args.
     *
     * The options object is highly flexible and allows defining all aspects of a macro
     * through optional properties. This method processes and validates the options to
     * create a proper MacroDefinition that can be registered with the engine.
     *
     * Validation includes checking for required fields, validating argument definitions,
     * and ensuring the handler function is callable.
     * It throws errors for invalid configurations.
     *
     * @param {string} name - Macro name (identifier).
     * @param {MacroDefinitionOptions} options - Macro definition options.
     * @param {Object} [buildOptions] - Additional options for building.
     * @param {MacroSource} [buildOptions.source] - Source information. Defaults to dynamic source.
     * @returns {MacroDefinition} The built macro definition.
     * @throws {Error} If validation fails.
     */
    buildMacroDefFromOptions(name, options, { source } = {}) {
        name = typeof name === 'string' ? name.trim() : String(name);

        if (!isIdentifierValid(name)) throw new Error(`Macro name "${name}" is invalid. Must start with a letter, followed by alphanumeric characters or hyphens.`);
        if (!options || typeof options !== 'object') throw new Error(`Macro "${name}" options must be a non-null object.`);

        const {
            aliases: rawAliases,
            category: rawCategory,
            unnamedArgs: rawUnnamedArgs,
            list: rawList,
            strictArgs: rawStrictArgs,
            description: rawDescription,
            returns: rawReturns,
            returnType: rawReturnType,
            displayOverride: rawDisplayOverride,
            exampleUsage: rawExampleUsage,
            delayArgResolution: rawDelayArgResolution,
            handler,
        } = options;

        if (typeof handler !== 'function') throw new Error(`Macro "${name}" options.handler must be a function.`);

        /** @type {MacroResolvedAlias[]} */
        const aliases = [];
        if (rawAliases !== undefined && rawAliases !== null) {
            if (!Array.isArray(rawAliases)) throw new Error(`Macro "${name}" options.aliases must be an array.`);
            for (const [i, aliasDef] of rawAliases.entries()) {
                if (!aliasDef || typeof aliasDef !== 'object') throw new Error(`Macro "${name}" options.aliases[${i}] must be an object.`);
                if (typeof aliasDef.alias !== 'string' || !aliasDef.alias.trim()) throw new Error(`Macro "${name}" options.aliases[${i}].alias must be a non-empty string.`);
                const aliasName = aliasDef.alias.trim();
                if (!isIdentifierValid(aliasName)) throw new Error(`Macro "${name}" options.aliases[${i}].alias "${aliasName}" is invalid. Must start with a letter, followed by word chars or hyphens.`);
                if (aliasName.toLowerCase() === name.toLowerCase()) throw new Error(`Macro "${name}" options.aliases[${i}].alias cannot be the same as the macro name (insensitive).`);
                const visible = aliasDef.visible !== false;
                aliases.push({ alias: aliasName, visible });
            }
        }

        /** @type {MacroCategory|string} */
        let category = MacroCategory.UNCATEGORIZED;
        if (typeof rawCategory === 'string' && rawCategory.trim()) {
            category = rawCategory.trim();
        }

        let minArgs = 0;
        let maxArgs = 0;
        /** @type {MacroUnnamedArgDef[]} */
        let unnamedArgDefs = [];
        if (rawUnnamedArgs !== undefined) {
            if (Array.isArray(rawUnnamedArgs)) {
                let foundOptional = false;
                unnamedArgDefs = rawUnnamedArgs.map((def, index) => {
                    if (!def || typeof def !== 'object') throw new Error(`Macro "${name}" options.unnamedArgs[${index}] must be an object when using argument definitions.`);
                    if (typeof def.name !== 'string' || !def.name.trim()) throw new Error(`Macro "${name}" options.unnamedArgs[${index}].name must be a non-empty string when using argument definitions.`);

                    if (foundOptional && !def.optional) {
                        throw new Error(`Macro "${name}" options.unnamedArgs[${index}] is required but follows an optional argument. Optional args must be a suffix.`);
                    }
                    if (def.optional) foundOptional = true;

                    /** @type {MacroUnnamedArgDef} */
                    const normalized = {
                        name: def.name.trim(),
                        optional: def.optional || false,
                        defaultValue: def.defaultValue?.trim(),
                        type: Array.isArray(def.type) && def.type.length === 0 ? 'string' : def.type ?? 'string',
                        sampleValue: def.sampleValue?.trim(),
                        description: typeof def.description === 'string' ? def.description : undefined,
                    };

                    const validTypes = ['string', 'integer', 'number', 'boolean'];
                    const type = Array.isArray(normalized.type) ? normalized.type : [normalized.type];
                    if (type.some(t => !validTypes.includes(t))) {
                        throw new Error(`Macro "${name}" options.unnamedArgs[${index}].type must be one of "string", "integer", "number", or "boolean" when provided.`);
                    }

                    return normalized;
                });

                maxArgs = unnamedArgDefs.length;
                minArgs = unnamedArgDefs.findIndex(d => d.optional);
                if (minArgs === -1) minArgs = maxArgs;
            } else if (typeof rawUnnamedArgs === 'number') {
                if (!Number.isInteger(rawUnnamedArgs) || rawUnnamedArgs < 0) {
                    throw new Error(`Macro "${name}" options.unnamedArgs must be a non-negative integer when provided.`);
                }
                minArgs = rawUnnamedArgs;
                maxArgs = rawUnnamedArgs;
                unnamedArgDefs = Array.from({ length: rawUnnamedArgs }, (_, i) => ({
                    name: `arg${i + 1}`,
                    optional: false,
                    type: 'string',
                    sampleValue: `arg${i + 1}`,
                }));
            } else {
                throw new Error(`Macro "${name}" options.unnamedArgs must be a non-negative integer or an array of argument definitions when provided.`);
            }
        }

        /** @type {{ min: number, max: (number|null) }|null} */
        let list = null;
        if (rawList !== undefined) {
            if (typeof rawList === 'boolean') {
                list = rawList ? { min: 0, max: null } : null;
            } else if (typeof rawList === 'object' && rawList !== null) {
                if (typeof rawList.min !== 'number' || rawList.min < 0) throw new Error(`Macro "${name}" options.list.min must be a non-negative integer when provided.`);
                if (rawList.max !== undefined && typeof rawList.max !== 'number') throw new Error(`Macro "${name}" options.list.max must be a number when provided.`);
                if (rawList.max !== undefined && rawList.max < rawList.min) throw new Error(`Macro "${name}" options.list.max must be greater than or equal to options.list.min.`);
                list = { min: rawList.min, max: rawList.max ?? null };
            } else {
                throw new Error(`Macro "${name}" options.list must be a boolean or an object with numeric min/max when provided.`);
            }
        }

        let strictArgs = true;
        if (rawStrictArgs !== undefined) {
            if (typeof rawStrictArgs !== 'boolean') throw new Error(`Macro "${name}" options.strictArgs must be a boolean when provided.`);
            strictArgs = rawStrictArgs;
        }

        let description = '<no description>';
        if (rawDescription !== undefined) {
            if (typeof rawDescription !== 'string') throw new Error(`Macro "${name}" options.description must be a string when provided.`);
            description = rawDescription;
        }

        let returns = null;
        if (rawReturns !== undefined && rawReturns !== null) {
            if (typeof rawReturns !== 'string') throw new Error(`Macro "${name}" options.returns must be a string when provided.`);
            returns = rawReturns || '<empty string>';
        }

        const validTypes = ['string', 'integer', 'number', 'boolean'];
        let returnType = /** @type {MacroValueType|MacroValueType[]} */ ('string');
        if (rawReturnType !== undefined && rawReturnType !== null) {
            returnType = Array.isArray(rawReturnType) && rawReturnType.length === 0 ? 'string' : rawReturnType;
            const typesToValidate = Array.isArray(returnType) ? returnType : [returnType];
            if (typesToValidate.some(t => !validTypes.includes(t))) {
                throw new Error(`Macro "${name}" options.returnType must be one of "string", "integer", "number", or "boolean" (or an array of these) when provided.`);
            }
        }

        let displayOverride = null;
        if (rawDisplayOverride !== undefined && rawDisplayOverride !== null) {
            if (typeof rawDisplayOverride !== 'string') throw new Error(`Macro "${name}" options.displayOverride must be a string when provided.`);
            displayOverride = rawDisplayOverride.trim();
            if (displayOverride && !displayOverride.startsWith('{{')) {
                (0, __stage.logMacroRegisterWarning)({ macroName: name, message: `Macro "${name}" options.displayOverride should include curly braces. Auto-wrapping.` });
                displayOverride = `{{${displayOverride}}}`;
            }
        }

        /** @type {string[]} */
        let exampleUsage = [];
        if (rawExampleUsage !== undefined && rawExampleUsage !== null) {
            const examples = Array.isArray(rawExampleUsage) ? rawExampleUsage : [rawExampleUsage];
            for (const [i, ex] of examples.entries()) {
                if (typeof ex !== 'string') throw new Error(`Macro "${name}" options.exampleUsage[${i}] must be a string.`);
                let trimmed = ex.trim();
                if (trimmed && !trimmed.startsWith('{{')) {
                    (0, __stage.logMacroRegisterWarning)({ macroName: name, message: `Macro "${name}" options.exampleUsage[${i}] should include curly braces. Auto-wrapping.` });
                    trimmed = `{{${trimmed}}}`;
                }
                if (trimmed) exampleUsage.push(trimmed);
            }
        }

        let delayArgResolution = false;
        if (rawDelayArgResolution !== undefined) {
            if (typeof rawDelayArgResolution !== 'boolean') throw new Error(`Macro "${name}" options.delayArgResolution must be a boolean when provided.`);
            delayArgResolution = rawDelayArgResolution;
        }

        /** @type {MacroDefinition} */
        const definition = {
            name: name,
            aliases,
            category,
            minArgs,
            maxArgs,
            unnamedArgDefs,
            list,
            strictArgs,
            description,
            returns,
            returnType,
            displayOverride,
            exampleUsage,
            delayArgResolution,
            handler,
            source: source ?? { name: 'dynamic', isExtension: false, isThirdParty: false },
            aliasOf: null,
            aliasVisible: null,
        };

        return definition;
    }
}

function isIdentifierValid(name, { allowComment = true } = {}) {
    if (typeof name !== 'string' || !name.trim()) return false;
    if (allowComment && name === '//') return true;
    return __stage.MACRO_IDENTIFIER_PATTERN.test(name);
}

function isArgsValid(def, args) {
    const hasListArgs = def.list !== null;

    // Without list: args must be between minArgs and maxArgs (inclusive)
    if (!hasListArgs) {
        return args.length >= def.minArgs && args.length <= def.maxArgs;
    }

    // With list: args must be at least minArgs + list.min
    const minRequired = def.minArgs + def.list.min;
    if (args.length < minRequired) return false;

    // List items are everything after maxArgs positional slots
    const listCount = __stage.Math.max(0, args.length - def.maxArgs);
    if (def.list.max !== null && listCount > def.list.max) return false;

    return true;
}

function validateArgTypes(call, def, unnamedArgs) {
    if (def.unnamedArgDefs.length === 0) return;

    const defs = def.unnamedArgDefs;
    const count = __stage.Math.min(defs.length, unnamedArgs.length);
    for (let i = 0; i < count; i++) {
        const argDef = defs[i];
        const value = unnamedArgs[i];
        if (!argDef || !argDef.type || typeof value !== 'string') {
            // Misconfigured macro definition: always surface as an error.
            throw new Error(`Macro "${call.name}" (position ${i + 1}) has invalid definition or type.`);
        }

        const types = Array.isArray(argDef.type) ? argDef.type : [argDef.type];
        if (!types.some(type => isValueOfType(value, type))) {
            const argName = argDef.name || `Argument ${i + 1}`;
            const optionalLabel = argDef.optional ? ' (optional)' : '';
            const message = `Macro "${call.name}" (position ${i + 1}${optionalLabel}) argument "${argName}" expected type ${argDef.type} but got value "${value}".`;
            if (def.strictArgs) {
                throw (0, __stage.createMacroRuntimeError)({ message, call, def: def });
            }
            (0, __stage.logMacroRuntimeWarning)({ message, call, def: def });
        }
    }
}

function isValueOfType(value, type) {
    const trimmed = value.trim();

    if (type === 'string') {
        return true;
    }
    if (type === 'integer') {
        return /^-?\d+$/.test(trimmed);
    }
    if (type === 'number') {
        const n = Number(trimmed);
        return Number.isFinite(n);
    }
    if (type === 'boolean') {
        return (0, __stage.isTrueBoolean)(trimmed) || (0, __stage.isFalseBoolean)(trimmed);
    }

    // Unknown type: treat it as invalid.
    return false;
}

function detectMacroSource() {
    const stack = new Error().stack?.split('\n').map(line => line.trim()) ?? [];

    const isExtension = stack.some(line => line.includes('/scripts/extensions/'));
    const isThirdParty = stack.some(line => line.includes('/scripts/extensions/third-party/'));

    let source = 'unknown';
    if (isThirdParty) {
        const match = stack.find(line => line.includes('/scripts/extensions/third-party/'));
        if (match) {
            source = match.replace(/^.*?\/scripts\/extensions\/third-party\/([^/]+)\/.*$/, '$1');
        }
    } else if (isExtension) {
        const match = stack.find(line => line.includes('/scripts/extensions/'));
        if (match) {
            source = match.replace(/^.*?\/scripts\/extensions\/([^/]+)\/.*$/, '$1');
        }
    } else {
        // Find the first meaningful caller outside MacroRegistry
        const callerIdx = stack.findIndex(line =>
            line.includes('registerMacro') && line.includes('MacroRegistry'),
        );
        if (callerIdx >= 0 && callerIdx + 1 < stack.length) {
            const callerLine = stack[callerIdx + 1];
            // Extract script path from stack frame
            const scriptMatch = callerLine.match(/\/((?:scripts\/)?(?:macros\/)?[^/]+\.js)/);
            if (scriptMatch) {
                source = scriptMatch[1];
            }
        }
    }

    return { isExtension, isThirdParty, source };
}
return { MacroCategory, MacroValueType, MacroRegistry, isIdentifierValid, isArgsValid, validateArgTypes, isValueOfType, detectMacroSource };
}
