// TavernStage shared core, extracted from public/script.js.
// SillyTavern ancestry and AGPL-3.0 license are retained in repository history.
// Free state and host dependencies are explicit per-session bindings.
export function createCore(__stage) {
const extension_prompt_types = {
    NONE: -1,
    IN_PROMPT: 0,
    IN_CHAT: 1,
    BEFORE_PROMPT: 2,
};

const extension_prompt_roles = {
    SYSTEM: 0,
    USER: 1,
    ASSISTANT: 2,
};

function getMediaDisplay(mes) {
    const value = mes?.extra?.media_display || __stage.power_user.media_display || __stage.MEDIA_DISPLAY.LIST;
    return Object.values(__stage.MEDIA_DISPLAY).includes(value) ? value : __stage.MEDIA_DISPLAY.LIST;
}

function getMediaIndex(mes) {
    if (!Array.isArray(mes?.extra?.media)) {
        return 0;
    }
    const value = mes.extra?.media_index;
    if (isNaN(value) || value < 0 || value >= mes.extra.media.length) {
        return 0;
    }
    return value;
}

function substituteParamsExtended(content, additionalMacro = {}, postProcessFn = (x) => x) {
    return substituteParams(content, { dynamicMacros: additionalMacro, postProcessFn });
}

function substituteParamsLegacy(content, _name1, _name2, _original, _group, _replaceCharacterCard = true, additionalMacro = {}, postProcessFn = (x) => x) {
    if (!content) {
        return '';
    }

    // If experimental macro engine is enabled, use it. This code will be cleaned up in the future.
    if (__stage.power_user?.experimental_macro_engine) {
        return substituteParams(content, {
            name1Override: _name1,
            name2Override: _name2,
            original: _original,
            groupOverride: _group,
            replaceCharacterCard: _replaceCharacterCard ?? true,
            dynamicMacros: additionalMacro ?? {},
            postProcessFn: postProcessFn ?? ((x) => x),
        });
    }

    // Try to roughly detect experimental macro features to show the onboarding if needed.
    // This does not have to be 100% accurate, only best effort what we can quickly check.
    // Only do this if the warning wasn't shown yet, to prevent needless regex checks.
    if (__stage.accountStorage.getItem('slash_command_experimental_engine_warning_shown') !== 'true') {
        let feature = /** @type {string|null} */ (null);
        if (/{{\s*if/.test(content)) feature = '{{if}} macro';
        else if (/{{\s*\//.test(content)) feature = 'scoped macro';
        else if (/{{\s*[!?~#/]/.test(content)) feature = 'macro flags';
        else if (/{{\s*[.$]/.test(content)) feature = 'variable shorthands';
        else if (/\{\{(?:(?!\}\}).)*\{\{(?=[\s\S]*?\}\}[\s\S]*?\}\})/.test(content)) feature = 'nested macro';
        else if (/{{(?:greeting|charFirstMessage)(?:::\d+)?}}/i.test(content)) feature = 'greeting macro';

        if (feature) void (0, __stage.onboardingExperimentalMacroEngine)(feature);
    }

    const environment = {};

    if (typeof _original === 'string') {
        let originalSubstituted = false;
        environment.original = () => {
            if (originalSubstituted) {
                return '';
            }

            originalSubstituted = true;
            return _original;
        };
    }

    const getGroupValue = (includeMuted) => {
        if (typeof _group === 'string') {
            return _group;
        }

        if (__stage.selected_group) {
            const members = __stage.groups.find(x => x.id === __stage.selected_group)?.members;
            /** @type {string[]} */
            const disabledMembers = __stage.groups.find(x => x.id === __stage.selected_group)?.disabled_members ?? [];
            const isMuted = x => includeMuted ? true : !disabledMembers.includes(x);
            const names = Array.isArray(members)
                ? members.filter(isMuted).map(m => __stage.characters.find(c => c.avatar === m)?.name).filter(Boolean).join(', ')
                : '';
            return names;
        } else {
            return _name2 ?? __stage.name2;
        }
    };

    const getNotCharValue = () => {
        const currentUser = _name1 ?? __stage.name1;
        const currentSpeaker = _name2 ?? __stage.name2;

        // Single character chat
        if (!__stage.selected_group) {
            return currentUser;
        }

        // Group chat
        const members = __stage.groups.find(x => x.id === __stage.selected_group)?.members;

        if (!Array.isArray(members)) {
            return currentUser;
        }

        const memberNames = members
            .map(m => __stage.characters.find(c => c.avatar === m)?.name)
            .filter(Boolean); // Filter out any null/undefined names

        // Filter out the current speaker and add the user
        const otherMembers = memberNames.filter(name => name !== currentSpeaker);
        otherMembers.push(currentUser);

        return otherMembers.join(', ');
    };

    if (_replaceCharacterCard) {
        const fields = getCharacterCardFields();
        environment.charPrompt = fields.system || '';
        environment.charInstruction = environment.charJailbreak = fields.jailbreak || '';
        environment.description = fields.description || '';
        environment.personality = fields.personality || '';
        environment.scenario = fields.scenario || '';
        environment.persona = fields.persona || '';
        environment.mesExamples = () => {
            const isInstruct = __stage.power_user.instruct.enabled && __stage.main_api !== 'openai';
            const mesExamplesArray = parseMesExamples(fields.mesExamples, isInstruct);
            if (isInstruct) {
                const instructExamples = (0, __stage.formatInstructModeExamples)(mesExamplesArray, __stage.name1, __stage.name2);
                return instructExamples.join('');
            }
            return mesExamplesArray.join('');
        };
        environment.mesExamplesRaw = fields.mesExamples || '';
        environment.charVersion = fields.version || '';
        environment.char_version = fields.version || '';
        environment.charDepthPrompt = fields.charDepthPrompt || '';
        environment.creatorNotes = fields.creatorNotes || '';
    }

    // Must be substituted last so that they're replaced inside {{description}}
    environment.user = _name1 ?? __stage.name1;
    environment.char = _name2 ?? __stage.name2;
    environment.group = environment.charIfNotGroup = getGroupValue(true);
    environment.groupNotMuted = getGroupValue(false);
    environment.notChar = getNotCharValue();
    environment.model = getGeneratingModel();

    if (additionalMacro && typeof additionalMacro === 'object') {
        Object.assign(environment, additionalMacro);
    }

    return (0, __stage.evaluateMacros)(content, environment, postProcessFn);
}

function substituteParams(content, options = {}) {
    if (!content) return '';

    if (typeof content !== 'string') {
        __stage.console.warn('substituteParams: content will be coerced to string', content);
        content = String(content);
    }

    // Handle legacy signature calls to substituteParams
    // We'll simply re-route them to a temporary legacy function. In the future, we'll remove this and cleanly build the options object ourselves.
    const isOptionsObject = options && typeof options === 'object' && !Array.isArray(options);
    if (!isOptionsObject) {
        return substituteParamsLegacy.call(this, ...arguments);
    }

    // Keep the new macro engine behind a feature switch for now
    if (!__stage.power_user?.experimental_macro_engine) {
        return substituteParamsLegacy(content, options.name1Override, options.name2Override, options.original, options.groupOverride, options.replaceCharacterCard, options.dynamicMacros, options.postProcessFn);
    }

    const ctx = /** @type {import('./scripts/macros/engine/MacroEnvBuilder.js').MacroEnvRawContext} */ ({
        content,
        name1Override: options.name1Override,
        name2Override: options.name2Override,
        original: options.original,
        groupOverride: options.groupOverride,
        replaceCharacterCard: options.replaceCharacterCard ?? true,
        dynamicMacros: options.dynamicMacros ?? {},
        postProcessFn: options.postProcessFn ?? ((x) => x),
    });

    const env = __stage.MacroEnvBuilder.buildFromRawEnv(ctx);
    const result = __stage.MacroEngine.evaluate(content, env);
    return result;
}

function getStoppingStrings(isImpersonate, isContinue, api = __stage.main_api) {
    // Only custom stop strings apply to Chat Completion
    if (api === 'openai') {
        return (0, __stage.getCustomStoppingStrings)();
    }

    const result = [];

    if (__stage.power_user.context.names_as_stop_strings) {
        const charString = `\n${__stage.name2}:`;
        const userString = `\n${__stage.name1}:`;
        result.push(isImpersonate ? charString : userString);

        result.push(userString);

        if (isContinue && Array.isArray(__stage.chat) && __stage.chat[__stage.chat.length - 1]?.is_user) {
            result.push(charString);
        }

        // Add group members as stopping strings if generating for a specific group member or user. (Allow slash commands to work around name stopping string restrictions)
        if (__stage.selected_group && (__stage.name2 || isImpersonate)) {
            const group = __stage.groups.find(x => x.id === __stage.selected_group);

            if (group && Array.isArray(group.members)) {
                const names = group.members
                    .map(x => __stage.characters.find(y => y.avatar == x))
                    .filter(x => x && x.name && x.name !== __stage.name2)
                    .map(x => `\n${x.name}:`);
                result.push(...names);
            }
        }
    }

    result.push(...(0, __stage.getInstructStoppingSequences)());
    result.push(...(0, __stage.getCustomStoppingStrings)());

    if (__stage.power_user.single_line) {
        result.unshift('\n');
    }

    return result.filter(x => x).filter(__stage.onlyUnique);
}

function extractMessageBias(message) {
    if (!message) {
        return '';
    }

    try {
        const biasHandlebars = __stage.Handlebars.create();
        const biasMatches = [];
        biasHandlebars.registerHelper('bias', function (text) {
            biasMatches.push(text);
            return '';
        });
        const template = biasHandlebars.compile(message);
        template({});

        if (biasMatches && biasMatches.length > 0) {
            return ` ${biasMatches.join(' ')}`;
        }

        return '';
    } catch {
        return '';
    }
}

function addPersonaDescriptionExtensionPrompt() {
    const INJECT_TAG = 'PERSONA_DESCRIPTION';
    setExtensionPrompt(INJECT_TAG, '', extension_prompt_types.IN_PROMPT, 0);

    if (!__stage.power_user.persona_description || __stage.power_user.persona_description_position === __stage.persona_description_positions.NONE) {
        return;
    }

    const promptPositions = [__stage.persona_description_positions.BOTTOM_AN, __stage.persona_description_positions.TOP_AN];

    if (promptPositions.includes(__stage.power_user.persona_description_position) && __stage.shouldWIAddPrompt) {
        const originalAN = __stage.extension_prompts[__stage.NOTE_MODULE_NAME].value;
        const ANWithDesc = __stage.power_user.persona_description_position === __stage.persona_description_positions.TOP_AN
            ? `${__stage.power_user.persona_description}\n${originalAN}`
            : `${originalAN}\n${__stage.power_user.persona_description}`;

        setExtensionPrompt(__stage.NOTE_MODULE_NAME, ANWithDesc, __stage.chat_metadata[__stage.metadata_keys.position], __stage.chat_metadata[__stage.metadata_keys.depth], __stage.extension_settings.note.allowWIScan, __stage.chat_metadata[__stage.metadata_keys.role]);
    }

    if (__stage.power_user.persona_description_position === __stage.persona_description_positions.AT_DEPTH) {
        setExtensionPrompt(INJECT_TAG, __stage.power_user.persona_description, extension_prompt_types.IN_CHAT, __stage.power_user.persona_description_depth, true, __stage.power_user.persona_description_role);
    }
}

async function getAllExtensionPrompts() {
    const values = [];

    for (const prompt of Object.values(__stage.extension_prompts)) {
        const value = prompt?.value?.trim();

        if (!value) {
            continue;
        }

        const hasFilter = typeof prompt.filter === 'function';
        if (hasFilter && !await prompt.filter()) {
            continue;
        }

        values.push(value);
    }

    return substituteParams(values.join('\n'));
}

async function getExtensionPromptByName(moduleName) {
    if (!moduleName) {
        return '';
    }

    const prompt = __stage.extension_prompts[moduleName];

    if (!prompt) {
        return '';
    }

    const hasFilter = typeof prompt.filter === 'function';

    if (hasFilter && !await prompt.filter()) {
        return '';
    }

    return substituteParams(prompt.value);
}

function getExtensionPromptMaxDepth() {
    return __stage.MAX_INJECTION_DEPTH;
    /*
    const prompts = Object.values(extension_prompts);
    const maxDepth = Math.max(...prompts.map(x => x.depth ?? 0));
    // Clamp to 1 <= depth <= MAX_INJECTION_DEPTH
    return Math.max(Math.min(maxDepth, MAX_INJECTION_DEPTH), 1);
    */
}

async function getExtensionPrompt(position = extension_prompt_types.IN_PROMPT, depth = undefined, separator = '\n', role = undefined, wrap = true) {
    const filterByFunction = async (prompt) => {
        const hasFilter = typeof prompt.filter === 'function';
        if (hasFilter && !await prompt.filter()) {
            return false;
        }
        return true;
    };
    const promptPromises = Object.keys(__stage.extension_prompts)
        .sort()
        .map((x) => __stage.extension_prompts[x])
        .filter(x => x.position == position && x.value)
        .filter(x => depth === undefined || x.depth === undefined || x.depth === depth)
        .filter(x => role === undefined || x.role === undefined || x.role === role)
        .filter(filterByFunction);
    const prompts = await Promise.all(promptPromises);

    let values = prompts.map(x => x.value.trim()).join(separator);
    if (wrap && values.length && !values.startsWith(separator)) {
        values = separator + values;
    }
    if (wrap && values.length && !values.endsWith(separator)) {
        values = values + separator;
    }
    if (values.length) {
        values = substituteParams(values);
    }
    return values;
}

function baseChatReplace(value, name1Override = null, name2Override = null) {
    if (typeof value === 'string' && value.length > 0) {
        value = substituteParams(value, { name1Override, name2Override, replaceCharacterCard: false });

        if (__stage.power_user.collapse_newlines) {
            value = (0, __stage.collapseNewlines)(value);
        }

        value = value.replace(/\r/g, '');
    }
    return value;
}

function createLazyFields(resolvers) {
    const result = /** @type {CharacterCardFields} */ ({});
    for (const [key, resolver] of Object.entries(resolvers)) {
        let cached;
        let resolved = false;
        Object.defineProperty(result, key, {
            get() {
                if (!resolved) {
                    cached = resolver();
                    resolved = true;
                }
                return cached;
            },
            enumerable: true,
            configurable: true,
        });
    }
    return result;
}

function getCharacterCardFieldsLazy({ chid = undefined } = {}) {
    const currentChid = chid ?? __stage.this_chid;
    const character = __stage.characters[currentChid];

    // For group chats, we need to check if group cards should be used
    const useGroupCards = __stage.selected_group && character;
    const groupCardsLazy = useGroupCards ? (0, __stage.getGroupCharacterCardsLazy)(__stage.selected_group, Number(currentChid)) : null;

    /** @type {Record<string, () => string|string[]>} */
    const resolvers = {
        persona: () => baseChatReplace(__stage.power_user.persona_description?.trim()),
        system: () => {
            if (!character) return '';
            const systemPrompt = __stage.chat_metadata.system_prompt || character.data?.system_prompt || '';
            return __stage.power_user.prefer_character_prompt ? baseChatReplace(systemPrompt.trim()) : '';
        },
        jailbreak: () => {
            if (!character) return '';
            return __stage.power_user.prefer_character_jailbreak ? baseChatReplace(character.data?.post_history_instructions?.trim()) : '';
        },
        version: () => character?.data?.character_version ?? '',
        charDepthPrompt: () => {
            if (!character) return '';
            return baseChatReplace(character.data?.extensions?.depth_prompt?.prompt?.trim());
        },
        creatorNotes: () => {
            if (!character) return '';
            return baseChatReplace(character.data?.creator_notes?.trim());
        },
        // These four fields may be overridden by group cards
        description: () => {
            if (groupCardsLazy) return groupCardsLazy.description;
            if (!character) return '';
            return baseChatReplace(character.description?.trim());
        },
        personality: () => {
            if (groupCardsLazy) return groupCardsLazy.personality;
            if (!character) return '';
            return baseChatReplace(character.personality?.trim());
        },
        scenario: () => {
            if (groupCardsLazy) return groupCardsLazy.scenario;
            if (!character) return '';
            const scenarioText = __stage.chat_metadata.scenario || character.scenario || '';
            return baseChatReplace(scenarioText.trim());
        },
        mesExamples: () => {
            if (groupCardsLazy) return groupCardsLazy.mesExamples;
            if (!character) return '';
            const exampleDialog = __stage.chat_metadata.mes_example || character.mes_example || '';
            return baseChatReplace(exampleDialog.trim());
        },
        firstMessage: () => {
            if (!character) return '';
            const firstMes = character.first_mes?.trim() || '';
            return baseChatReplace(firstMes);
        },
        alternateGreetings: () => {
            if (!character) return [];
            const altGreetings = character.data?.alternate_greetings;
            if (!Array.isArray(altGreetings)) return [];
            return altGreetings.map(greeting => baseChatReplace(greeting?.trim()));
        },
    };

    return createLazyFields(resolvers);
}

function getCharacterCardFields({ chid = undefined } = {}) {
    const lazy = getCharacterCardFieldsLazy({ chid });

    // Resolve all lazy fields into a plain object
    return {
        system: lazy.system,
        mesExamples: lazy.mesExamples,
        description: lazy.description,
        personality: lazy.personality,
        persona: lazy.persona,
        scenario: lazy.scenario,
        jailbreak: lazy.jailbreak,
        version: lazy.version,
        charDepthPrompt: lazy.charDepthPrompt,
        creatorNotes: lazy.creatorNotes,
        firstMessage: lazy.firstMessage,
        alternateGreetings: lazy.alternateGreetings,
    };
}

function parseMesExamples(examplesStr, isInstruct) {
    if (!examplesStr || examplesStr.length === 0 || examplesStr === '<START>') {
        return [];
    }

    if (!examplesStr.startsWith('<START>')) {
        examplesStr = '<START>\n' + examplesStr.trim();
    }

    const exampleSeparator = __stage.power_user.context.example_separator ? `${substituteParams(__stage.power_user.context.example_separator)}\n` : '';
    const blockHeading = (__stage.main_api === 'openai' || isInstruct) ? '<START>\n' : exampleSeparator;
    const splitExamples = examplesStr.split(/<START>/gi).slice(1).map(block => `${blockHeading}${block.trim()}\n`);

    return splitExamples;
}

async function Generate(type, { automatic_trigger, force_name2, quiet_prompt, quietToLoud, skipWIAN, force_chid, signal, quietImage, quietName, jsonSchema = null, depth = 0 } = {}, dryRun = false) {
    __stage.console.log('Generate entered');
    (0, __stage.setGenerationProgress)(0);
    __stage.generation_started = new __stage.Date();

    // Prevent generation from shallow characters
    await (0, __stage.unshallowCharacter)(__stage.this_chid);

    // Occurs every time, even if the generation is aborted due to slash commands execution
    await __stage.eventSource.emit(__stage.event_types.GENERATION_STARTED, type, { automatic_trigger, force_name2, quiet_prompt, quietToLoud, skipWIAN, force_chid, signal, quietImage }, dryRun);

    // Don't recreate abort controller if signal is passed
    if (!(__stage.abortController && signal)) {
        __stage.abortController = new AbortController();
    }

    // OpenAI doesn't need instruct mode. Use OAI main prompt instead.
    const isInstruct = __stage.power_user.instruct.enabled && __stage.main_api !== 'openai';
    const isImpersonate = type == 'impersonate';

    if (!(dryRun || depth || type == 'regenerate' || type == 'swipe' || type == 'quiet')) {
        const interruptedByCommand = await (0, __stage.processCommands)(__stage.generationHost.readInput());

        if (interruptedByCommand) {
            //$("#send_textarea").val('')[0].dispatchEvent(new Event('input', { bubbles:true }));
            (0, __stage.unblockGeneration)(type);
            return Promise.resolve();
        }
    }

    // Occurs only if the generation is not aborted due to slash commands execution
    await __stage.eventSource.emit(__stage.event_types.GENERATION_AFTER_COMMANDS, type, { automatic_trigger, force_name2, quiet_prompt, quietToLoud, skipWIAN, force_chid, signal, quietImage }, dryRun);

    if (__stage.main_api == 'kobold' && __stage.kai_settings.streaming_kobold && !__stage.kai_flags.can_use_streaming) {
        __stage.toastr.error((0, __stage.t)`Streaming is enabled, but the version of Kobold used does not support token streaming.`, undefined, { timeOut: 10000, preventDuplicates: true });
        (0, __stage.unblockGeneration)(type);
        return Promise.resolve();
    }

    if ((0, __stage.isHordeGenerationNotAllowed)()) {
        (0, __stage.unblockGeneration)(type);
        return Promise.resolve();
    }

    if (!dryRun) {
        // Ping server to make sure it is still alive
        const pingResult = await (0, __stage.pingServer)();

        if (!pingResult) {
            (0, __stage.unblockGeneration)(type);
            __stage.toastr.error((0, __stage.t)`Verify that the server is running and accessible.`, (0, __stage.t)`ST Server cannot be reached`);
            throw new Error('Server unreachable');
        }

        // Hide swipes if not in a dry run.
        (0, __stage.hideSwipeButtons)();
        // If generated any message, set the flag to indicate it can't be recreated again.
        __stage.chat_metadata.tainted = true;
    }

    if (__stage.selected_group && !__stage.is_group_generating) {
        if (!dryRun) {
            // Returns the promise that generateGroupWrapper returns; resolves when generation is done
            return (0, __stage.generateGroupWrapper)(false, type, { quiet_prompt, force_chid, signal: __stage.abortController.signal, quietImage, jsonSchema });
        }

        const characterIndexMap = new Map(__stage.characters.map((char, index) => [char.avatar, index]));
        const group = __stage.groups.find((x) => x.id === __stage.selected_group);

        const enabledMembers = group.members.reduce((acc, member) => {
            if (!group.disabled_members.includes(member) && !acc.includes(member)) {
                acc.push(member);
            }
            return acc;
        }, []);

        const memberIds = enabledMembers
            .map((member) => characterIndexMap.get(member))
            .filter((index) => index !== undefined && index !== null);

        if (memberIds.length > 0) {
            if (__stage.menu_type != 'character_edit') (0, __stage.setCharacterId)(memberIds[0]);
            (0, __stage.setCharacterName)('');
        } else {
            __stage.console.log('No enabled members found');
            (0, __stage.unblockGeneration)(type);
            return Promise.resolve();
        }
    }

    //#########QUIET PROMPT STUFF##############
    //this function just gives special care to novel quiet instruction prompts
    if (quiet_prompt) {
        quiet_prompt = substituteParams(quiet_prompt);
        quiet_prompt = __stage.main_api == 'novel' && !quietToLoud ? (0, __stage.adjustNovelInstructionPrompt)(quiet_prompt) : quiet_prompt;
    }

    const hasBackendConnection = __stage.online_status !== 'no_connection';

    // We can't do anything because we're not in a chat right now. (Unless it's a dry run, in which case we need to
    // assemble the prompt so we can count its tokens regardless of whether a chat is active.)
    if (!dryRun && !hasBackendConnection) {
        __stage.is_send_press = false;
        return Promise.resolve();
    }

    const lastMessage = __stage.chat[__stage.chat.length - 1];

    let textareaText;
    if (type !== 'regenerate' && type !== 'swipe' && type !== 'quiet' && !isImpersonate && !dryRun && !depth) {
        __stage.is_send_press = true;
        textareaText = __stage.generationHost.readInput();
        __stage.generationHost.writeInput('');
    } else {
        textareaText = '';
        if (__stage.chat.length && lastMessage.is_user) {
            //do nothing? why does this check exist?
        } else if (type !== 'quiet' && type !== 'swipe' && !isImpersonate && !dryRun && !depth && __stage.chat.length) {
            (0, __stage.deleteItemizedPromptForMessage)(__stage.chat.length - 1);
            __stage.chat.length = __stage.chat.length - 1;
            await (0, __stage.removeLastMessage)();
            await __stage.eventSource.emit(__stage.event_types.MESSAGE_DELETED, __stage.chat.length);
        }
    }

    const isContinue = type == 'continue';

    // Rewrite the generation timer to account for the time passed for all the continuations.
    if (isContinue && __stage.chat.length) {
        const prevFinished = lastMessage.gen_finished;
        const prevStarted = lastMessage.gen_started;

        if (prevFinished && prevStarted) {
            const timePassed = Number(prevFinished) - Number(prevStarted);
            __stage.generation_started = new __stage.Date(__stage.Date.now() - timePassed);
            lastMessage.gen_started = __stage.generation_started;
        }
    }

    if (!dryRun) {
        (0, __stage.deactivateSendButtons)();
    }

    let { messageBias, promptBias, isUserPromptBias } = getBiasStrings(textareaText, type);

    //*********************************
    //PRE FORMATING STRING
    //*********************************

    // These generation types should not attach pending files to the chat
    const noAttachTypes = [
        'regenerate',
        'swipe',
        'impersonate',
        'quiet',
        'continue',
    ];
    //for normal messages sent from user..
    if ((textareaText != '' || ((0, __stage.hasPendingFileAttachment)() && !noAttachTypes.includes(type))) && !automatic_trigger && type !== 'quiet' && !dryRun && !depth) {
        // If user message contains no text other than bias - send as a system message
        if (messageBias && !removeMacros(textareaText)) {
            (0, __stage.sendSystemMessage)(__stage.system_message_types.GENERIC, ' ', { bias: messageBias });
        } else {
            await sendMessageAsUser(textareaText, messageBias);
        }
    } else if (textareaText == '' && !automatic_trigger && !dryRun && [undefined, 'normal'].includes(type) && __stage.main_api == 'openai' && __stage.oai_settings.send_if_empty.trim().length > 0 && !depth) {
        // Use send_if_empty if set and the user message is empty. Only when sending messages normally
        await sendMessageAsUser(__stage.oai_settings.send_if_empty.trim(), messageBias);
    }

    let {
        description,
        personality,
        persona,
        scenario,
        mesExamples,
        system,
        jailbreak,
        charDepthPrompt,
        creatorNotes,
    } = getCharacterCardFields();

    // Depth prompt (character-specific A/N)
    removeDepthPrompts();
    const groupDepthPrompts = (0, __stage.getGroupDepthPrompts)(__stage.selected_group, Number(__stage.this_chid));

    if (__stage.selected_group && Array.isArray(groupDepthPrompts) && groupDepthPrompts.length > 0) {
        groupDepthPrompts.forEach((value, index) => {
            const role = getExtensionPromptRoleByName(value.role);
            setExtensionPrompt(__stage.inject_ids.DEPTH_PROMPT_INDEX(index), value.text, extension_prompt_types.IN_CHAT, value.depth, __stage.extension_settings.note.allowWIScan, role);
        });
    } else {
        const depthPromptText = charDepthPrompt || '';
        const depthPromptDepth = __stage.characters[__stage.this_chid]?.data?.extensions?.depth_prompt?.depth ?? __stage.depth_prompt_depth_default;
        const depthPromptRole = getExtensionPromptRoleByName(__stage.characters[__stage.this_chid]?.data?.extensions?.depth_prompt?.role ?? __stage.depth_prompt_role_default);
        setExtensionPrompt(__stage.inject_ids.DEPTH_PROMPT, depthPromptText, extension_prompt_types.IN_CHAT, depthPromptDepth, __stage.extension_settings.note.allowWIScan, depthPromptRole);
    }

    // First message in fresh 1-on-1 chat reacts to user/character settings changes
    if (__stage.chat.length) {
        __stage.chat[0].mes = substituteParams(__stage.chat[0].mes);
    }

    // Collect messages with usable content
    const canUseTools = __stage.ToolManager.isToolCallingSupported();
    const canPerformToolCalls = !dryRun && __stage.ToolManager.canPerformToolCalls(type) && depth < __stage.ToolManager.RECURSE_LIMIT;
    let coreChat = __stage.chat.filter(x => !x.is_system || (canUseTools && Array.isArray(x.extra?.tool_invocations)));
    if (type === 'swipe') {
        coreChat.pop();
    }

    coreChat = await Promise.all(coreChat.map(async (/** @type {ChatMessage} */ chatItem, index) => {
        let message = chatItem.mes;
        let regexType = chatItem.is_user ? __stage.regex_placement.USER_INPUT : __stage.regex_placement.AI_OUTPUT;
        let options = { isPrompt: true, depth: (coreChat.length - index - (isContinue ? 2 : 1)) };

        let regexedMessage = (0, __stage.getRegexedString)(message, regexType, options);
        regexedMessage = await (0, __stage.appendFileContent)(chatItem, regexedMessage);

        const titles = [];
        if (chatItem?.extra?.append_title && chatItem?.extra?.title) {
            titles.push(chatItem.extra.title);
        }
        if (Array.isArray(chatItem?.extra?.media)) {
            for (const mediaItem of chatItem.extra.media) {
                if (mediaItem?.title && mediaItem?.append_title) {
                    titles.push(mediaItem.title);
                }
            }
        }
        if (titles.length > 0) {
            regexedMessage = `${regexedMessage}\n\n${titles.join('\n\n')}`;
        }

        return {
            ...chatItem,
            mes: regexedMessage,
            index,
        };
    }));

    const promptReasoning = new __stage.PromptReasoning();
    for (let i = coreChat.length - 1; i >= 0; i--) {
        const depth = coreChat.length - i - (isContinue ? 2 : 1);
        const isPrefix = isContinue && i === coreChat.length - 1;

        // In group chats, only include reasoning from the currently generating character
        const isOtherGroupMember = __stage.selected_group && coreChat[i].name !== __stage.name2;

        coreChat[i] = {
            ...coreChat[i],
            mes: isOtherGroupMember
                ? coreChat[i].mes
                : promptReasoning.addToMessage(
                    coreChat[i].mes,
                    (0, __stage.getRegexedString)(
                        String(coreChat[i].extra?.reasoning ?? ''),
                        __stage.regex_placement.REASONING,
                        { isPrompt: true, depth: depth },
                    ),
                    isPrefix,
                    coreChat[i].extra?.reasoning_duration,
                ),
        };
        if (promptReasoning.isLimitReached()) {
            break;
        }
    }

    // Determine token limit
    let this_max_context = getMaxPromptTokens();

    if (!dryRun) {
        __stage.console.debug('Running extension interceptors');
        const aborted = await (0, __stage.runGenerationInterceptors)(coreChat, this_max_context, type);

        if (aborted) {
            __stage.console.debug('Generation aborted by extension interceptors');
            (0, __stage.unblockGeneration)(type);
            return Promise.resolve();
        }
    } else {
        __stage.console.debug('Skipping extension interceptors for dry run');
    }

    // Adjust token limit for Horde
    let adjustedParams;
    if (__stage.main_api == 'koboldhorde' && (__stage.horde_settings.auto_adjust_context_length || __stage.horde_settings.auto_adjust_response_length)) {
        try {
            adjustedParams = await (0, __stage.adjustHordeGenerationParams)(__stage.max_context, __stage.amount_gen);
        } catch {
            (0, __stage.unblockGeneration)(type);
            return Promise.resolve();
        }
        if (__stage.horde_settings.auto_adjust_context_length) {
            this_max_context = (adjustedParams.maxContextLength - adjustedParams.maxLength);
        }
    }

    // Fetches the combined prompt for both negative and positive prompts
    const cfgGuidanceScale = (0, __stage.getGuidanceScale)();
    const useCfgPrompt = cfgGuidanceScale && cfgGuidanceScale.value !== 1;

    // Adjust max context based on CFG prompt to prevent overfitting
    if (useCfgPrompt) {
        const negativePrompt = (0, __stage.getCfgPrompt)(cfgGuidanceScale, true, true)?.value || '';
        const positivePrompt = (0, __stage.getCfgPrompt)(cfgGuidanceScale, false, true)?.value || '';
        if (negativePrompt || positivePrompt) {
            const previousMaxContext = this_max_context;
            const [negativePromptTokenCount, positivePromptTokenCount] = await Promise.all([(0, __stage.getTokenCountAsync)(negativePrompt), (0, __stage.getTokenCountAsync)(positivePrompt)]);
            const decrement = __stage.Math.max(negativePromptTokenCount, positivePromptTokenCount);
            this_max_context -= decrement;
            __stage.console.log(`Max context reduced by ${decrement} tokens of CFG prompt (${previousMaxContext} -> ${this_max_context})`);
        }
    }

    __stage.console.log(`Core/all messages: ${coreChat.length}/${__stage.chat.length}`);

    if ((promptBias && !isUserPromptBias) || __stage.power_user.always_force_name2 || __stage.main_api == 'novel') {
        force_name2 = true;
    }

    if (isImpersonate) {
        force_name2 = false;
    }

    let mesExamplesArray = parseMesExamples(mesExamples, isInstruct);

    // Set non-WI AN
    (0, __stage.setFloatingPrompt)();

    // Add WI to prompt (and also inject WI to AN value via hijack)
    // Make quiet prompt available for WIAN
    setExtensionPrompt(__stage.inject_ids.QUIET_PROMPT, quiet_prompt || '', extension_prompt_types.IN_PROMPT, 0, true);
    const chatForWI = coreChat.map(x => __stage.world_info_include_names ? `${x.name}: ${x.mes}` : x.mes).reverse();
    /** @type {import('./scripts/world-info.js').WIGlobalScanData} */
    const globalScanData = {
        personaDescription: persona,
        characterDescription: description,
        characterPersonality: personality,
        characterDepthPrompt: charDepthPrompt,
        scenario: scenario,
        creatorNotes: creatorNotes,
        trigger: __stage.GENERATION_TYPE_TRIGGERS.includes(type) ? type : 'normal',
    };
    const { worldInfoString, worldInfoBefore, worldInfoAfter, worldInfoExamples, worldInfoDepth, outletEntries } = await (0, __stage.getWorldInfoPrompt)(chatForWI, this_max_context, dryRun, globalScanData);
    setExtensionPrompt(__stage.inject_ids.QUIET_PROMPT, '', extension_prompt_types.IN_PROMPT, 0, true);

    // Add message example WI
    for (const example of worldInfoExamples) {
        const exampleMessage = example.content;

        if (exampleMessage.length === 0) {
            continue;
        }

        const formattedExample = baseChatReplace(exampleMessage);
        const cleanedExample = parseMesExamples(formattedExample, isInstruct);

        // Insert depending on before or after position
        if (example.position === __stage.wi_anchor_position.before) {
            mesExamplesArray.unshift(...cleanedExample);
        } else {
            mesExamplesArray.push(...cleanedExample);
        }
    }

    // At this point, the raw message examples can be created
    const mesExamplesRawArray = [...mesExamplesArray];

    if (mesExamplesArray && isInstruct) {
        mesExamplesArray = (0, __stage.formatInstructModeExamples)(mesExamplesArray, __stage.name1, __stage.name2);
    }

    if (skipWIAN !== true) {
        __stage.console.log('skipWIAN not active, adding WIAN');
        // Add all depth WI entries to prompt
        flushWIInjections();
        if (Array.isArray(worldInfoDepth)) {
            worldInfoDepth.forEach((e) => {
                const joinedEntries = e.entries.join('\n');
                setExtensionPrompt(__stage.inject_ids.CUSTOM_WI_DEPTH_ROLE(e.depth, e.role), joinedEntries, extension_prompt_types.IN_CHAT, e.depth, false, e.role);
            });
        }
        if (outletEntries && typeof outletEntries === 'object' && Object.keys(outletEntries).length > 0) {
            Object.entries(outletEntries).forEach(([key, value]) => {
                setExtensionPrompt(__stage.inject_ids.CUSTOM_WI_OUTLET(key), value.join('\n'), extension_prompt_types.NONE, 0);
            });
        }
    } else {
        __stage.console.log('skipping WIAN');
    }

    // Add persona description to prompt
    addPersonaDescriptionExtensionPrompt();

    // Prepare the system prompt for Text Completion APIs
    if (__stage.main_api !== 'openai') {
        if (__stage.power_user.sysprompt.enabled) {
            system = __stage.power_user.prefer_character_prompt && system
                ? substituteParams(system, { original: __stage.power_user.sysprompt.content ?? '' })
                : baseChatReplace(__stage.power_user.sysprompt.content);
            system = isInstruct ? substituteParams(system, { original: __stage.power_user.sysprompt.content ?? '' }) : system;
        } else {
            // Nullify if it's not enabled
            system = '';
        }
    }

    // Collect before / after story string injections
    const beforeScenarioAnchor = await getExtensionPrompt(extension_prompt_types.BEFORE_PROMPT);
    const afterScenarioAnchor = await getExtensionPrompt(extension_prompt_types.IN_PROMPT);

    const storyStringParams = {
        description: description,
        personality: personality,
        persona: __stage.power_user.persona_description_position == __stage.persona_description_positions.IN_PROMPT ? persona : '',
        scenario: scenario,
        system: system,
        char: __stage.name2,
        user: __stage.name1,
        wiBefore: worldInfoBefore,
        wiAfter: worldInfoAfter,
        loreBefore: worldInfoBefore,
        loreAfter: worldInfoAfter,
        anchorBefore: beforeScenarioAnchor.trim(),
        anchorAfter: afterScenarioAnchor.trim(),
        mesExamples: mesExamplesArray.join(''),
        mesExamplesRaw: mesExamplesRawArray.join(''),
    };

    // Render the story string and combine with injections
    const storyString = (0, __stage.renderStoryString)(storyStringParams);
    let combinedStoryString = isInstruct ? (0, __stage.formatInstructModeStoryString)(storyString) : storyString;

    // Inject the story string as in-chat prompt (if needed)
    const applyStoryStringInject = __stage.main_api !== 'openai' && __stage.power_user.context.story_string_position === extension_prompt_types.IN_CHAT;
    if (applyStoryStringInject) {
        const depth = __stage.power_user.context.story_string_depth ?? 1;
        const role = __stage.power_user.context.story_string_role ?? extension_prompt_roles.SYSTEM;
        setExtensionPrompt(__stage.inject_ids.STORY_STRING, combinedStoryString, extension_prompt_types.IN_CHAT, depth, false, role);
        // Remove to prevent duplication
        combinedStoryString = '';
    } else {
        setExtensionPrompt(__stage.inject_ids.STORY_STRING, '', extension_prompt_types.IN_CHAT, 0);
    }

    // Story string rendered, safe to remove
    if (__stage.power_user.strip_examples) {
        mesExamplesArray = [];
    }

    // Inject all Depth prompts. Chat Completion does it separately
    let injectedIndices = [];
    if (__stage.main_api !== 'openai') {
        injectedIndices = await doChatInject(coreChat, isContinue);
    }

    if (__stage.main_api !== 'openai' && __stage.power_user.sysprompt.enabled) {
        jailbreak = __stage.power_user.prefer_character_jailbreak && jailbreak
            ? substituteParams(jailbreak, { original: __stage.power_user.sysprompt.post_history ?? '' })
            : baseChatReplace(__stage.power_user.sysprompt.post_history);

        // Only inject the jb if there is one
        if (jailbreak) {
            // When continuing generation of previous output, last user message precedes the message to continue
            if (isContinue) {
                coreChat.splice(coreChat.length - 1, 0, { mes: jailbreak, is_user: true });
            } else {
                // This operation will result in the injectedIndices indexes being off by one
                coreChat.push({ mes: jailbreak, is_user: true });
                // Add +1 to the elements to correct for the new PHI/Jailbreak message.
                injectedIndices.forEach(__stage.shiftUpByOne);
            }
        }
    }

    let chat2 = [];
    let continue_mag = '';
    let userMessageIndices = [];
    const lastUserMessageIndex = coreChat.findLastIndex(x => x.is_user);

    for (let i = coreChat.length - 1, j = 0; i >= 0; i--, j++) {
        if (__stage.main_api == 'openai') {
            chat2[i] = coreChat[j].mes;
            if (i === 0 && isContinue) {
                chat2[i] = chat2[i].slice(0, chat2[i].lastIndexOf(coreChat[j].mes) + coreChat[j].mes.length);
                continue_mag = coreChat[j].mes;
            }
            continue;
        }

        chat2[i] = (0, __stage.formatMessageHistoryItem)(coreChat[j], isInstruct, false);

        if (j === 0 && isInstruct) {
            // Reformat with the first output sequence (if any)
            chat2[i] = (0, __stage.formatMessageHistoryItem)(coreChat[j], isInstruct, __stage.force_output_sequence.FIRST);
        }

        if (lastUserMessageIndex >= 0 && j === lastUserMessageIndex && isInstruct && !isImpersonate) {
            // Reformat with the last input sequence (if any)
            chat2[i] = (0, __stage.formatMessageHistoryItem)(coreChat[j], isInstruct, __stage.force_output_sequence.LAST);
        }

        // Do not suffix the message for continuation
        if (i === 0 && isContinue) {
            // Pick something that's very unlikely to be in a message
            const FORMAT_TOKEN = '\u0000\ufffc\u0000\ufffd';

            if (isInstruct) {
                const originalMessage = String(coreChat[j].mes ?? '');
                coreChat[j].mes = originalMessage.replaceAll(FORMAT_TOKEN, '') + FORMAT_TOKEN;
                // Reformat with the last output sequence (if any)
                chat2[i] = (0, __stage.formatMessageHistoryItem)(coreChat[j], isInstruct, __stage.force_output_sequence.LAST);
                coreChat[j].mes = originalMessage;
            }

            chat2[i] = chat2[i].includes(FORMAT_TOKEN)
                ? chat2[i].slice(0, chat2[i].lastIndexOf(FORMAT_TOKEN))
                : chat2[i].slice(0, chat2[i].lastIndexOf(coreChat[j].mes) + coreChat[j].mes.length);
            continue_mag = coreChat[j].mes;
        }

        if (coreChat[j].is_user) {
            userMessageIndices.push(i);
        }
    }

    let addUserAlignment = isInstruct && __stage.power_user.instruct.user_alignment_message;
    let userAlignmentMessage = '';

    if (addUserAlignment) {
        const alignmentMessage = {
            name: __stage.name1,
            mes: substituteParams(__stage.power_user.instruct.user_alignment_message),
            is_user: true,
        };
        userAlignmentMessage = (0, __stage.formatMessageHistoryItem)(alignmentMessage, isInstruct, __stage.force_output_sequence.FIRST);
    }

    let oaiMessages = [];
    let oaiMessageExamples = [];

    if (__stage.main_api === 'openai') {
        oaiMessages = (0, __stage.setOpenAIMessages)(coreChat);
        oaiMessageExamples = (0, __stage.setOpenAIMessageExamples)(mesExamplesArray);
    }

    // hack for regeneration of the first message
    if (chat2.length == 0) {
        chat2.push('');
    }

    let examplesString = '';
    let chatString = addChatsPreamble(addChatsSeparator(''));
    let cyclePrompt = '';

    async function getMessagesTokenCount() {
        const encodeString = [
            combinedStoryString,
            examplesString,
            userAlignmentMessage,
            chatString,
            modifyLastPromptLine(''),
            cyclePrompt,
        ].join('').replace(/\r/gm, '');
        return (0, __stage.getTokenCountAsync)(encodeString, __stage.power_user.token_padding);
    }

    // Force pinned examples into the context
    let pinExmString;
    if (__stage.power_user.pin_examples) {
        pinExmString = examplesString = mesExamplesArray.join('');
    }

    // Only add the chat in context if past the greeting message
    if (isContinue && (chat2.length > 1 || __stage.main_api === 'openai')) {
        cyclePrompt = chat2.shift();
        // Adjust indices to account for the shift
        injectedIndices = injectedIndices.map(__stage.shiftDownByOne).filter(x => x >= 0);
        userMessageIndices = userMessageIndices.map(__stage.shiftDownByOne).filter(x => x >= 0);
    }

    // Collect enough messages to fill the context
    let arrMes = new Array(chat2.length);
    let tokenCount = await getMessagesTokenCount();
    let lastAddedIndex = 0;

    // Pre-allocate all injections first.
    // If it doesn't fit - user shot himself in the foot
    for (const index of injectedIndices) {
        // not needed for OAI prompting
        if (__stage.main_api == 'openai') {
            break;
        }

        const item = chat2[index];

        if (typeof item !== 'string') {
            continue;
        }

        tokenCount += await (0, __stage.getTokenCountAsync)(item.replace(/\r/gm, ''));
        if (tokenCount < this_max_context) {
            chatString = chatString + item;
            arrMes[index] = item;
            lastAddedIndex = __stage.Math.max(lastAddedIndex, index);
        } else {
            break;
        }
    }

    for (let i = 0; i < chat2.length; i++) {
        // not needed for OAI prompting
        if (__stage.main_api == 'openai') {
            break;
        }

        // Skip already injected messages
        if (arrMes[i] !== undefined) {
            continue;
        }

        const item = chat2[i];

        if (typeof item !== 'string') {
            continue;
        }

        tokenCount += await (0, __stage.getTokenCountAsync)(item.replace(/\r/gm, ''));
        if (tokenCount < this_max_context) {
            chatString = chatString + item;
            arrMes[i] = item;
            lastAddedIndex = __stage.Math.max(lastAddedIndex, i);
        } else {
            break;
        }
    }

    // Add user alignment message if last message is not a user message
    const stoppedAtUser = userMessageIndices.includes(lastAddedIndex);
    if (addUserAlignment && !stoppedAtUser) {
        tokenCount += await (0, __stage.getTokenCountAsync)(userAlignmentMessage.replace(/\r/gm, ''));
        chatString = userAlignmentMessage + chatString;
        arrMes.push(userAlignmentMessage);
        injectedIndices.push(arrMes.length - 1);
    }

    // Unsparse the array. Adjust injected indices
    const newArrMes = [];
    const newInjectedIndices = [];
    for (let i = 0; i < arrMes.length; i++) {
        if (arrMes[i] !== undefined) {
            newArrMes.push(arrMes[i]);
            if (injectedIndices.includes(i)) {
                newInjectedIndices.push(newArrMes.length - 1);
            }
        }
    }

    arrMes = newArrMes;
    injectedIndices = newInjectedIndices;

    if (__stage.main_api !== 'openai') {
        setInContextMessages(arrMes.length - injectedIndices.length, type);
    }

    // Estimate how many unpinned example messages fit in the context
    tokenCount = await getMessagesTokenCount();
    let count_exm_add = 0;
    if (!__stage.power_user.pin_examples) {
        for (let example of mesExamplesArray) {
            tokenCount += await (0, __stage.getTokenCountAsync)(example.replace(/\r/gm, ''));
            examplesString += example;
            if (tokenCount < this_max_context) {
                count_exm_add++;
            } else {
                break;
            }
        }
    }

    let mesSend = [];
    __stage.console.debug('calling runGenerate');

    if (isContinue) {
        // Coping mechanism for OAI spacing
        if (__stage.main_api === 'openai' && !cyclePrompt.endsWith(' ')) {
            cyclePrompt += __stage.oai_settings.continue_postfix;
            continue_mag += __stage.oai_settings.continue_postfix;
        }
    }

    const originalType = type;

    if (!dryRun) {
        __stage.is_send_press = true;
    }

    let generatedPromptCache = cyclePrompt || '';
    if (generatedPromptCache.length == 0 || type === 'continue') {
        __stage.console.debug('generating prompt');
        chatString = '';
        arrMes = arrMes.reverse();
        arrMes.forEach(function (item, i, arr) {
            // OAI doesn't need all of this
            if (__stage.main_api === 'openai') {
                return;
            }

            // Cohee: This removes a newline from the end of the last message in the context
            // Last prompt line will add a newline if it's not a continuation
            // In instruct mode it only removes it if wrap is enabled and it's not a quiet generation
            if (i === arrMes.length - 1 && type !== 'continue') {
                if (!isInstruct || (__stage.power_user.instruct.wrap && type !== 'quiet')) {
                    item = item.replace(/\n?$/, '');
                }
            }

            mesSend[mesSend.length] = { message: item, extensionPrompts: [] };
        });
    }

    let mesExmString = '';

    function setPromptString() {
        if (__stage.main_api == 'openai') {
            return;
        }

        __stage.console.debug('--setting Prompt string');
        mesExmString = pinExmString ?? mesExamplesArray.slice(0, count_exm_add).join('');

        if (mesSend.length) {
            mesSend[mesSend.length - 1].message = modifyLastPromptLine(mesSend[mesSend.length - 1].message);
        }
    }

    function modifyLastPromptLine(lastMesString) {
        //#########QUIET PROMPT STUFF PT2##############

        // Add quiet generation prompt at depth 0
        if (quiet_prompt && quiet_prompt.length) {
            // here name1 is forced for all quiet prompts..why?
            const name = __stage.name1;
            //checks if we are in instruct, if so, formats the chat as such, otherwise just adds the quiet prompt
            const quietAppend = isInstruct ? (0, __stage.formatInstructModeChat)(name, quiet_prompt, false, true, '', __stage.name1, __stage.name2, false) : `\n${quiet_prompt}`;

            //This begins to fix quietPrompts (particularly /sysgen) for instruct
            //previously instruct input sequence was being appended to the last chat message w/o '\n'
            //and no output sequence was added after the input's content.
            //TODO: respect output_sequence vs last_output_sequence settings
            //TODO: decide how to prompt this to clarify who is talking 'Narrator', 'System', etc.
            if (isInstruct) {
                lastMesString += quietAppend; // + power_user.instruct.output_sequence + '\n';
            } else {
                lastMesString += quietAppend;
            }


            // Ross: bailing out early prevents quiet prompts from respecting other instruct prompt toggles
            // for sysgen, SD, and summary this is desireable as it prevents the AI from responding as char..
            // but for idle prompting, we want the flexibility of the other prompt toggles, and to respect them as per settings in the extension
            // need a detection for what the quiet prompt is being asked for...

            // Bail out early?
            if (!isInstruct && !quietToLoud) {
                return lastMesString;
            }
        }


        // Get instruct mode line
        if (isInstruct && !isContinue) {
            const name = (quiet_prompt && !quietToLoud && !isImpersonate) ? (quietName ?? 'System') : (isImpersonate ? __stage.name1 : __stage.name2);
            const isQuiet = quiet_prompt && type == 'quiet';
            lastMesString += (0, __stage.formatInstructModePrompt)(name, isImpersonate, promptBias, __stage.name1, __stage.name2, isQuiet, quietToLoud);
        }

        // Get non-instruct impersonation line
        if (!isInstruct && isImpersonate && !isContinue) {
            const name = __stage.name1;
            if (!lastMesString.endsWith('\n')) {
                lastMesString += '\n';
            }
            lastMesString += name + ':';
        }

        // Add character's name
        // Force name append on continue (if not continuing on user message or first message)
        const isContinuingOnFirstMessage = __stage.chat.length === 1 && isContinue;
        if (!isInstruct && force_name2 && !isContinuingOnFirstMessage) {
            if (!lastMesString.endsWith('\n')) {
                lastMesString += '\n';
            }
            if (!isContinue || !(__stage.chat[__stage.chat.length - 1]?.is_user)) {
                lastMesString += `${__stage.name2}:`;
            }
        }

        return lastMesString;
    }

    async function checkPromptSize() {
        __stage.console.debug('---checking Prompt size');
        setPromptString();
        const jointMessages = mesSend.map((e) => `${e.extensionPrompts.join('')}${e.message}`).join('');
        const prompt = [
            combinedStoryString,
            mesExmString,
            addChatsPreamble(addChatsSeparator(jointMessages)),
            '\n',
            modifyLastPromptLine(''),
            generatedPromptCache,
        ].join('').replace(/\r/gm, '');
        let thisPromptContextSize = await (0, __stage.getTokenCountAsync)(prompt, __stage.power_user.token_padding);

        if (thisPromptContextSize > this_max_context) {        //if the prepared prompt is larger than the max context size...
            if (count_exm_add > 0) {                            // ..and we have example messages..
                count_exm_add--;                            // remove the example messages...
                await checkPromptSize();                            // and try agin...
            } else if (mesSend.length > 0) {                    // if the chat history is longer than 0
                mesSend.shift();                            // remove the first (oldest) chat entry..
                await checkPromptSize();                            // and check size again..
            } else {
                //end
                __stage.console.debug(`---mesSend.length = ${mesSend.length}`);
            }
        }
    }

    if (generatedPromptCache.length > 0 && __stage.main_api !== 'openai') {
        __stage.console.debug('---Generated Prompt Cache length: ' + generatedPromptCache.length);
        await checkPromptSize();
    } else {
        __stage.console.debug('---calling setPromptString ' + generatedPromptCache.length);
        setPromptString();
    }

    // For prompt bit itemization
    let mesSendString = '';

    async function getCombinedPrompt(isNegative) {
        // Only return if the guidance scale doesn't exist or the value is 1
        // Also don't return if constructing the neutral prompt
        if (isNegative && !useCfgPrompt) {
            return;
        }

        // OAI has its own prompt manager. No need to do anything here
        if (__stage.main_api === 'openai') {
            return '';
        }

        // Deep clone
        let finalMesSend = (0, __stage.structuredClone)(mesSend);

        if (useCfgPrompt) {
            const cfgPrompt = (0, __stage.getCfgPrompt)(cfgGuidanceScale, isNegative);
            if (cfgPrompt.value) {
                if (cfgPrompt.depth === 0) {
                    finalMesSend[finalMesSend.length - 1].message +=
                        /\s/.test(finalMesSend[finalMesSend.length - 1].message.slice(-1))
                            ? cfgPrompt.value
                            : ` ${cfgPrompt.value}`;
                } else {
                    // TODO: Make all extension prompts use an array/splice method
                    const lengthDiff = mesSend.length - cfgPrompt.depth;
                    const cfgDepth = lengthDiff >= 0 ? lengthDiff : 0;
                    const cfgMessage = finalMesSend[cfgDepth];
                    if (cfgMessage) {
                        if (!Array.isArray(finalMesSend[cfgDepth].extensionPrompts)) {
                            finalMesSend[cfgDepth].extensionPrompts = [];
                        }
                        finalMesSend[cfgDepth].extensionPrompts.push(`${cfgPrompt.value}\n`);
                    }
                }
            }
        }

        // Add prompt bias after everything else
        // Always run with continue
        if (!isInstruct && !isImpersonate) {
            if (promptBias.trim().length !== 0) {
                finalMesSend[finalMesSend.length - 1].message +=
                    /\s/.test(finalMesSend[finalMesSend.length - 1].message.slice(-1))
                        ? promptBias.trimStart()
                        : ` ${promptBias.trimStart()}`;
            }
        }

        // Flattens the multiple prompt objects to a string.
        const combine = () => {
            // Right now, everything is suffixed with a newline
            mesSendString = finalMesSend.map((e) => `${e.extensionPrompts.join('')}${e.message}`).join('');

            // add a custom dingus (if defined)
            mesSendString = addChatsSeparator(mesSendString);

            // add chat preamble
            mesSendString = addChatsPreamble(mesSendString);

            let combinedPrompt = [
                combinedStoryString,
                mesExmString,
                mesSendString,
                generatedPromptCache,
            ].join('').replace(/\r/gm, '');

            if (__stage.power_user.collapse_newlines) {
                combinedPrompt = (0, __stage.collapseNewlines)(combinedPrompt);
            }

            return combinedPrompt;
        };

        finalMesSend.forEach((item, i) => {
            item.injected = injectedIndices.includes(finalMesSend.length - i - 1);
        });

        let data = {
            api: __stage.main_api,
            combinedPrompt: null,
            description,
            personality,
            persona,
            scenario,
            char: __stage.name2,
            user: __stage.name1,
            worldInfoBefore,
            worldInfoAfter,
            beforeScenarioAnchor,
            afterScenarioAnchor,
            storyString,
            mesExmString,
            mesSendString,
            finalMesSend,
            generatedPromptCache,
            main: system,
            jailbreak,
            naiPreamble: __stage.nai_settings.preamble,
        };

        // Before returning the combined prompt, give available context related information to all subscribers.
        await __stage.eventSource.emit(__stage.event_types.GENERATE_BEFORE_COMBINE_PROMPTS, data);

        // If one or multiple subscribers return a value, forfeit the responsibillity of flattening the context.
        return !data.combinedPrompt ? combine() : data.combinedPrompt;
    }

    let finalPrompt = await getCombinedPrompt(false);

    const eventData = { prompt: finalPrompt, dryRun: dryRun };
    await __stage.eventSource.emit(__stage.event_types.GENERATE_AFTER_COMBINE_PROMPTS, eventData);
    finalPrompt = eventData.prompt;

    let maxLength = Number(__stage.amount_gen); // how many tokens the AI will be requested to generate
    let thisPromptBits = [];

    let generate_data;
    switch (__stage.main_api) {
        case 'koboldhorde':
        case 'kobold':
            if (__stage.main_api == 'koboldhorde' && __stage.horde_settings.auto_adjust_response_length) {
                maxLength = __stage.Math.min(maxLength, adjustedParams.maxLength);
                maxLength = __stage.Math.max(maxLength, __stage.MIN_LENGTH); // prevent validation errors
            }

            generate_data = {
                prompt: finalPrompt,
                gui_settings: true,
                max_length: maxLength,
                max_context_length: __stage.max_context,
                api_server: __stage.kai_settings.api_server,
            };

            if (__stage.kai_settings.preset_settings != 'gui') {
                const isHorde = __stage.main_api == 'koboldhorde';
                const presetSettings = __stage.koboldai_settings[__stage.koboldai_setting_names[__stage.kai_settings.preset_settings]];
                const maxContext = (adjustedParams && __stage.horde_settings.auto_adjust_context_length) ? adjustedParams.maxContextLength : __stage.max_context;
                generate_data = (0, __stage.getKoboldGenerationData)(finalPrompt, presetSettings, maxLength, maxContext, isHorde, type);
            }
            break;
        case 'textgenerationwebui': {
            const cfgValues = useCfgPrompt ? { guidanceScale: cfgGuidanceScale, negativePrompt: await getCombinedPrompt(true) } : null;
            generate_data = await (0, __stage.getTextGenGenerationData)(finalPrompt, maxLength, isImpersonate, isContinue, cfgValues, type);
            break;
        }
        case 'novel': {
            const cfgValues = useCfgPrompt ? { guidanceScale: cfgGuidanceScale } : null;
            const presetSettings = __stage.novelai_settings[__stage.novelai_setting_names[__stage.nai_settings.preset_settings_novel]];
            generate_data = (0, __stage.getNovelGenerationData)(finalPrompt, presetSettings, maxLength, isImpersonate, isContinue, cfgValues, type);
            break;
        }
        case 'openai': {
            let [prompt, counts] = await (0, __stage.prepareOpenAIMessages)({
                name2: __stage.name2,
                charDescription: description,
                charPersonality: personality,
                scenario: scenario,
                worldInfoBefore: worldInfoBefore,
                worldInfoAfter: worldInfoAfter,
                extensionPrompts: __stage.extension_prompts,
                bias: promptBias,
                type: type,
                quietPrompt: quiet_prompt,
                quietImage: quietImage,
                cyclePrompt: cyclePrompt,
                systemPromptOverride: system,
                jailbreakPromptOverride: jailbreak,
                messages: oaiMessages,
                messageExamples: oaiMessageExamples,
            }, dryRun);
            generate_data = { prompt: prompt };

            // TODO: move these side-effects somewhere else, so this switch-case solely sets generate_data
            // counts will return false if the user has not enabled the token breakdown feature
            if (counts) {
                (0, __stage.parseTokenCounts)(counts, thisPromptBits);
            }

            if (!dryRun) {
                setInContextMessages(__stage.openai_messages_count, type);
            }
            break;
        }
    }

    await __stage.eventSource.emit(__stage.event_types.GENERATE_AFTER_DATA, generate_data, dryRun);

    if (dryRun) {
        return Promise.resolve();
    }

    /**
     * Saves itemized prompt bits and calls streaming or non-streaming generation API.
     * @returns {Promise<void|*|Awaited<*>|String|{fromStream}|string|undefined|Object>}
     * @throws {Error|object} Error with message text, or Error with response JSON (OAI/Horde), or the actual response JSON (novel|textgenerationwebui|kobold)
     */
    async function finishGenerating() {
        if (__stage.power_user.console_log_prompts) {
            __stage.console.log(generate_data.prompt);
        }

        __stage.console.debug('rungenerate calling API');

        (0, __stage.showStopButton)();

        //set array object for prompt token itemization of this message
        let currentArrayEntry = Number(thisPromptBits.length - 1);
        let additionalPromptStuff = {
            ...thisPromptBits[currentArrayEntry],
            rawPrompt: generate_data.prompt || generate_data.input,
            mesId: getNextMessageId(type),
            allAnchors: await getAllExtensionPrompts(),
            chatInjects: injectedIndices?.map(index => arrMes[arrMes.length - index - 1])?.join('') || '',
            summarizeString: (__stage.extension_prompts['1_memory']?.value || ''),
            authorsNoteString: (__stage.extension_prompts['2_floating_prompt']?.value || ''),
            smartContextString: (__stage.extension_prompts.chromadb?.value || ''),
            chatVectorsString: (__stage.extension_prompts['3_vectors']?.value || ''),
            dataBankVectorsString: (__stage.extension_prompts['4_vectors_data_bank']?.value || ''),
            worldInfoString: worldInfoString,
            storyString: storyString,
            beforeScenarioAnchor: beforeScenarioAnchor,
            afterScenarioAnchor: afterScenarioAnchor,
            examplesString: examplesString,
            mesSendString: mesSendString,
            generatedPromptCache: generatedPromptCache,
            promptBias: promptBias,
            finalPrompt: finalPrompt,
            charDescription: description,
            charPersonality: personality,
            scenarioText: scenario,
            this_max_context: this_max_context,
            padding: __stage.power_user.token_padding,
            main_api: __stage.main_api,
            instruction: __stage.main_api !== 'openai' && __stage.power_user.sysprompt.enabled ? substituteParams(__stage.power_user.prefer_character_prompt && system ? system : __stage.power_user.sysprompt.content) : '',
            userPersona: (__stage.power_user.persona_description_position == __stage.persona_description_positions.IN_PROMPT ? (persona || '') : ''),
            tokenizer: (0, __stage.getFriendlyTokenizerName)(__stage.main_api).tokenizerName || '',
            presetName: (0, __stage.getPresetManager)()?.getSelectedPresetName() || '',
            messagesCount: __stage.main_api !== 'openai' ? mesSend.length : oaiMessages.length,
            examplesCount: __stage.main_api !== 'openai' ? (pinExmString ? mesExamplesArray.length : count_exm_add) : oaiMessageExamples.length,
        };

        //console.log(additionalPromptStuff);
        const itemizedIndex = __stage.itemizedPrompts.findIndex((item) => item.mesId === additionalPromptStuff.mesId);

        if (itemizedIndex !== -1) {
            __stage.itemizedPrompts[itemizedIndex] = additionalPromptStuff;
        } else {
            __stage.itemizedPrompts.push(additionalPromptStuff);
        }

        __stage.console.debug(`pushed prompt bits to itemizedPrompts array. Length is now: ${__stage.itemizedPrompts.length}`);

        if ((0, __stage.isStreamingEnabled)() && type !== 'quiet') {
            continue_mag = promptReasoning.removePrefix(continue_mag);
            __stage.streamingProcessor = new __stage.StreamingProcessor(type, force_name2, __stage.generation_started, continue_mag, promptReasoning);
            if (isContinue) {
                // Save reply does add cycle text to the prompt, so it's not needed here
                __stage.streamingProcessor.firstMessageText = '';
            }

            __stage.streamingProcessor.generator = await (0, __stage.sendStreamingRequest)(type, generate_data, { jsonSchema });

            (0, __stage.hideSwipeButtons)();
            let getMessage = await __stage.streamingProcessor.generate();
            let messageChunk = cleanUpMessage({
                getMessage: getMessage,
                isImpersonate: isImpersonate,
                isContinue: isContinue,
                displayIncompleteSentences: false,
            });

            if (isContinue) {
                getMessage = continue_mag + getMessage;
            }

            const isStreamFinished = __stage.streamingProcessor && !__stage.streamingProcessor.isStopped && __stage.streamingProcessor.isFinished;
            const isStreamWithToolCalls = __stage.streamingProcessor && Array.isArray(__stage.streamingProcessor.toolCalls) && __stage.streamingProcessor.toolCalls.length;
            if (canPerformToolCalls && isStreamFinished && isStreamWithToolCalls) {
                const lastMessage = __stage.chat[__stage.chat.length - 1];
                const hasToolCalls = __stage.ToolManager.hasToolCalls(__stage.streamingProcessor.toolCalls);
                const shouldDeleteMessage = type !== 'swipe' && ['', '...'].includes(lastMessage?.mes) && !lastMessage?.extra?.reasoning && ['', '...'].includes(__stage.streamingProcessor?.result);
                hasToolCalls && shouldDeleteMessage && await (0, __stage.deleteLastMessage)();
                if (hasToolCalls && !shouldDeleteMessage) {
                    await __stage.streamingProcessor.finalizeIntermediaryMessage(__stage.streamingProcessor.messageId, getMessage, { unlockUI: false });
                }
                const invocationResult = await __stage.ToolManager.invokeFunctionTools(__stage.streamingProcessor.toolCalls, {
                    reasoningText: __stage.streamingProcessor.reasoningHandler.reasoning,
                });
                const shouldStopGeneration = (!invocationResult.invocations.length && shouldDeleteMessage) || invocationResult.stealthCalls.length;
                if (hasToolCalls) {
                    if (shouldStopGeneration) {
                        if (Array.isArray(invocationResult.errors) && invocationResult.errors.length) {
                            __stage.ToolManager.showToolCallError(invocationResult.errors);
                        }
                        (0, __stage.unblockGeneration)(type);
                        __stage.streamingProcessor = null;
                        return;
                    }

                    __stage.streamingProcessor = null;
                    depth = depth + 1;
                    await __stage.ToolManager.saveFunctionToolInvocations(invocationResult.invocations);
                    return Generate('normal', { automatic_trigger, force_name2, quiet_prompt, quietToLoud, skipWIAN, force_chid, signal, quietImage, quietName, depth }, dryRun);
                }
            }

            if (isStreamFinished) {
                await __stage.streamingProcessor.onFinishStreaming(__stage.streamingProcessor.messageId, getMessage);
                __stage.streamingProcessor = null;
                (0, __stage.triggerAutoContinue)(messageChunk, isImpersonate);
                return Object.defineProperties(new String(getMessage), {
                    'messageChunk': { value: messageChunk },
                    'fromStream': { value: true },
                });
            }
        } else {
            return await (0, __stage.sendGenerationRequest)(type, generate_data, { jsonSchema });
        }
    }

    return finishGenerating().then(onSuccess, onError);

    /**
     * Handles the successful response from the generation API.
     * @param data
     * @returns {Promise<String|{fromStream}|*|string|string|void|Awaited<*>|undefined>}
     * @throws {Error} Throws an error if the response data contains an error message
     */
    async function onSuccess(data) {
        if (!data) return;

        if (data?.fromStream) {
            return data;
        }

        let messageChunk = '';

        // if an error was returned in data (textgenwebui), show it and throw it
        if (data.error) {
            (0, __stage.unblockGeneration)(type);

            if (data?.response) {
                __stage.toastr.error(data.response, (0, __stage.t)`API Error`, { preventDuplicates: true });
            }
            throw new Error(data?.response);
        }

        if (jsonSchema) {
            (0, __stage.unblockGeneration)(type);
            return (0, __stage.extractJsonFromData)(data, { returnInvalidJson: jsonSchema.returnInvalid ?? false });
        }

        //const getData = await response.json();
        let getMessage = extractMessageFromData(data);
        let title = extractTitleFromData(data);
        let reasoning = (0, __stage.extractReasoningFromData)(data);
        let imageUrls = extractImagesFromData(data);
        const reasoningSignature = (0, __stage.extractReasoningSignatureFromData)(data);
        __stage.kobold_horde_model = title;

        const swipes = extractMultiSwipes(data, type);

        messageChunk = cleanUpMessage({
            getMessage: getMessage,
            isImpersonate: isImpersonate,
            isContinue: isContinue,
            displayIncompleteSentences: false,
        });


        reasoning = (0, __stage.getRegexedString)(reasoning, __stage.regex_placement.REASONING);

        if (__stage.power_user.trim_spaces) {
            reasoning = reasoning.trim();
        }

        if (isContinue) {
            continue_mag = promptReasoning.removePrefix(continue_mag);
            getMessage = continue_mag + getMessage;
        }

        //Formating
        const displayIncomplete = type === 'quiet' && !quietToLoud;
        getMessage = cleanUpMessage({
            getMessage: getMessage,
            isImpersonate: isImpersonate,
            isContinue: isContinue,
            displayIncompleteSentences: displayIncomplete,
        });

        if (isImpersonate) {
            __stage.generationHost.writeInput(getMessage);
            await __stage.eventSource.emit(__stage.event_types.IMPERSONATE_READY, getMessage);
        } else if (type == 'quiet') {
            (0, __stage.unblockGeneration)(type);
            return getMessage;
        } else {
            // Without streaming we'll be having a full message on continuation. Treat it as a last chunk.
            if (originalType !== 'continue') {
                ({ type, getMessage } = await saveReply({ type, getMessage, title, swipes, reasoning, imageUrls, reasoningSignature }));
            } else {
                ({ type, getMessage } = await saveReply({ type: 'appendFinal', getMessage, title, swipes, reasoning, imageUrls, reasoningSignature }));
            }

            // This relies on `saveReply` having been called to add the message to the chat, so it must be last.
            (0, __stage.parseAndSaveLogprobs)(data, continue_mag);
        }

        if (canPerformToolCalls) {
            const hasToolCalls = __stage.ToolManager.hasToolCalls(data);
            const shouldDeleteMessage = type !== 'swipe' && ['', '...'].includes(getMessage) && !reasoning;
            hasToolCalls && shouldDeleteMessage && await (0, __stage.deleteLastMessage)();
            const invocationResult = await __stage.ToolManager.invokeFunctionTools(data, { reasoningText: reasoning });
            const shouldStopGeneration = (!invocationResult.invocations.length && shouldDeleteMessage) || invocationResult.stealthCalls.length;
            if (hasToolCalls) {
                if (shouldStopGeneration) {
                    if (Array.isArray(invocationResult.errors) && invocationResult.errors.length) {
                        __stage.ToolManager.showToolCallError(invocationResult.errors);
                    }
                    (0, __stage.unblockGeneration)(type);
                    return;
                }

                depth = depth + 1;
                await __stage.ToolManager.saveFunctionToolInvocations(invocationResult.invocations);
                return Generate('normal', { automatic_trigger, force_name2, quiet_prompt, quietToLoud, skipWIAN, force_chid, signal, quietImage, quietName, depth }, dryRun);
            }
        }

        if (type !== 'quiet') {
            (0, __stage.playMessageSound)();
        }

        const isAborted = __stage.abortController && __stage.abortController.signal.aborted;
        if (!isAborted && __stage.power_user.auto_swipe && (0, __stage.generatedTextFiltered)(getMessage)) {
            __stage.is_send_press = false;
            return await (0, __stage.swipe)(null, __stage.SWIPE_DIRECTION.RIGHT, { source: __stage.SWIPE_SOURCE.AUTO_SWIPE, repeated: true, forceMesId: __stage.chat.length - 1 });
        }

        __stage.console.debug('/api/chats/save called by /Generate');
        await (0, __stage.saveChatConditional)();
        (0, __stage.unblockGeneration)(type);
        __stage.streamingProcessor = null;

        if (type !== 'quiet') {
            (0, __stage.triggerAutoContinue)(messageChunk, isImpersonate);
        }

        // Don't break the API chain that expects a single string in return
        return Object.defineProperty(new String(getMessage), 'messageChunk', { value: messageChunk });
    }

    /**
     * Exception handler for finishGenerating
     * @param {Error|object} exception Error or response JSON
     * @throws {Error|object} Re-throws the exception
     */
    function onError(exception) {
        // if the response JSON was thrown (novel|textgenerationwebui|kobold), show the error message
        if (typeof exception?.error?.message === 'string') {
            __stage.toastr.error(exception.error.message, (0, __stage.t)`Text generation error`, { timeOut: 10000, extendedTimeOut: 20000 });
        }

        (0, __stage.unblockGeneration)(type);
        __stage.console.log(exception);
        __stage.streamingProcessor = null;
        throw exception;
    }
}

async function doChatInject(messages, isContinue) {
    const injectedMessages = [];
    let totalInsertedMessages = 0;
    messages.reverse();

    const maxDepth = getExtensionPromptMaxDepth();
    for (let i = 0; i <= maxDepth; i++) {
        // Order of priority (most important go lower)
        const roles = [extension_prompt_roles.SYSTEM, extension_prompt_roles.USER, extension_prompt_roles.ASSISTANT];
        const names = {
            [extension_prompt_roles.SYSTEM]: '',
            [extension_prompt_roles.USER]: __stage.name1,
            [extension_prompt_roles.ASSISTANT]: __stage.name2,
        };
        const roleMessages = [];
        const separator = '\n';
        const wrap = false;

        for (const role of roles) {
            const extensionPrompt = String(await getExtensionPrompt(extension_prompt_types.IN_CHAT, i, separator, role, wrap)).trimStart();
            const isNarrator = role === extension_prompt_roles.SYSTEM;
            const isUser = role === extension_prompt_roles.USER;
            const name = names[role];

            if (extensionPrompt) {
                roleMessages.push({
                    name: name,
                    is_user: isUser,
                    mes: extensionPrompt,
                    extra: {
                        type: isNarrator ? __stage.system_message_types.NARRATOR : null,
                    },
                });
            }
        }

        if (roleMessages.length) {
            const depth = isContinue && i === 0 ? 1 : i;
            const injectIdx = __stage.Math.min(depth + totalInsertedMessages, messages.length);
            messages.splice(injectIdx, 0, ...roleMessages);
            totalInsertedMessages += roleMessages.length;
            injectedMessages.push(...roleMessages);
        }
    }

    const injectedIndices = injectedMessages.map(msg => messages.indexOf(msg));
    messages.reverse();
    return injectedIndices;
}

function flushWIInjections() {
    const depthPrefix = __stage.inject_ids.CUSTOM_WI_DEPTH;
    const outletPrefix = __stage.inject_ids.CUSTOM_WI_OUTLET('');

    for (const key of Object.keys(__stage.extension_prompts)) {
        if (key.startsWith(depthPrefix) || key.startsWith(outletPrefix)) {
            delete __stage.extension_prompts[key];
        }
    }
}

function getNextMessageId(type) {
    return type == 'swipe' ? __stage.chat.length - 1 : __stage.chat.length;
}

function getBiasStrings(textareaText, type) {
    if (type == 'impersonate' || type == 'continue') {
        return { messageBias: '', promptBias: '', isUserPromptBias: false };
    }

    let promptBias = '';
    let messageBias = extractMessageBias(textareaText);

    // If user input is not provided, retrieve the bias of the most recent relevant message
    if (!textareaText) {
        for (let i = __stage.chat.length - 1; i >= 0; i--) {
            const mes = __stage.chat[i];
            if (type === 'swipe' && __stage.chat.length - 1 === i) {
                continue;
            }
            if (mes && (mes.is_user || mes.is_system || mes.extra?.type === __stage.system_message_types.NARRATOR)) {
                if (mes.extra?.bias?.trim()?.length > 0) {
                    promptBias = mes.extra.bias;
                }
                break;
            }
        }
    }

    promptBias = messageBias || promptBias || __stage.power_user.user_prompt_bias || '';
    const isUserPromptBias = promptBias === __stage.power_user.user_prompt_bias;

    // Substitute params for everything
    messageBias = substituteParams(messageBias);
    promptBias = substituteParams(promptBias);

    return { messageBias, promptBias, isUserPromptBias };
}

function removeMacros(str) {
    return (str ?? '').replace(/\{\{[\s\S]*?\}\}/gm, '').trim();
}

async function sendMessageAsUser(messageText, messageBias, insertAt = null, compact = false, name = __stage.name1, avatar = __stage.user_avatar) {
    messageText = (0, __stage.getRegexedString)(messageText, __stage.regex_placement.USER_INPUT);

    const message = {
        name: name,
        is_user: true,
        is_system: false,
        send_date: (0, __stage.getMessageTimeStamp)(),
        mes: substituteParams(messageText),
        extra: {
            isSmallSys: compact,
        },
    };

    if (__stage.power_user.message_token_count_enabled) {
        message.extra.token_count = await (0, __stage.getTokenCountAsync)(message.mes, 0);
    }

    // Lock user avatar to a persona.
    if (avatar in __stage.power_user.personas) {
        message.force_avatar = (0, __stage.getThumbnailUrl)('persona', avatar);
    }

    if (messageBias) {
        message.extra.bias = messageBias;
        message.mes = removeMacros(message.mes);
    }

    await (0, __stage.populateFileAttachment)(message);
    (0, __stage.statMesProcess)(message, 'user', __stage.characters, __stage.this_chid, '');

    __stage.chat_metadata.tainted = true;

    if (typeof insertAt === 'number' && insertAt >= 0 && insertAt <= __stage.chat.length) {
        __stage.chat.splice(insertAt, 0, message);
        await (0, __stage.saveChatConditional)();
        await __stage.eventSource.emit(__stage.event_types.MESSAGE_SENT, insertAt);
        await (0, __stage.reloadCurrentChat)();
        await __stage.eventSource.emit(__stage.event_types.USER_MESSAGE_RENDERED, insertAt);
    } else {
        __stage.chat.push(message);
        await (0, __stage.saveChatConditional)();
        const chat_id = (__stage.chat.length - 1);
        await __stage.eventSource.emit(__stage.event_types.MESSAGE_SENT, chat_id);
        (0, __stage.addOneMessage)(message);
        await __stage.eventSource.emit(__stage.event_types.USER_MESSAGE_RENDERED, chat_id);
    }

    return message;
}

function getMaxContextTokens() {
    if (__stage.main_api == 'kobold' || __stage.main_api == 'koboldhorde' || __stage.main_api == 'textgenerationwebui') {
        return __stage.max_context;
    }
    if (__stage.main_api == 'novel') {
        let this_max_context = Number(__stage.max_context);
        if (__stage.nai_settings.model_novel.includes('clio')) {
            this_max_context = __stage.Math.min(__stage.max_context, 8192);
        }
        if (__stage.nai_settings.model_novel.includes('kayra')) {
            this_max_context = __stage.Math.min(__stage.max_context, 8192);

            const subscriptionLimit = (0, __stage.getKayraMaxContextTokens)();
            if (typeof subscriptionLimit === 'number' && this_max_context > subscriptionLimit) {
                this_max_context = subscriptionLimit;
                __stage.console.log(`NovelAI subscription limit reached. Max context size is now ${this_max_context}`);
            }
        }
        if (__stage.nai_settings.model_novel.includes('erato')) {
            // subscriber limits coming soon
            this_max_context = __stage.Math.min(__stage.max_context, 8192);

            // Added special tokens and whatnot
            this_max_context -= 10;
        }
        return this_max_context;
    }
    if (__stage.main_api == 'openai') {
        return __stage.oai_settings.openai_max_context;
    }
    return 1487;
}

function getMaxResponseTokens() {
    if (__stage.main_api == 'kobold' || __stage.main_api == 'koboldhorde' || __stage.main_api == 'textgenerationwebui' || __stage.main_api == 'novel') {
        return __stage.amount_gen;
    }
    if (__stage.main_api == 'openai') {
        return __stage.oai_settings.openai_max_tokens;
    }
    return 0;
}

function getMaxPromptTokens(overrideResponseLength = null) {
    if (typeof overrideResponseLength !== 'number' || overrideResponseLength <= 0 || isNaN(overrideResponseLength)) {
        overrideResponseLength = null;
    }

    return getMaxContextTokens() - (overrideResponseLength || getMaxResponseTokens());
}

function addChatsPreamble(mesSendString) {
    return __stage.main_api === 'novel'
        ? substituteParams(__stage.nai_settings.preamble) + '\n' + mesSendString
        : mesSendString;
}

function addChatsSeparator(mesSendString) {
    if (__stage.power_user.context.chat_start) {
        return substituteParams(__stage.power_user.context.chat_start + '\n') + mesSendString;
    } else {
        return mesSendString;
    }
}

function setInContextMessages(msgInContextCount, type) {

    if (type === 'swipe' || type === 'regenerate' || type === 'continue') {
        msgInContextCount++;
    }

    __stage.generationHost.presentContextCount(msgInContextCount);

    // Update last id to chat. No metadata save on purpose, gets hopefully saved via another call
    const lastMessageId = __stage.Math.max(0, __stage.chat.length - msgInContextCount);
    __stage.chat_metadata.lastInContextMessageId = lastMessageId;
}

function extractTitleFromData(data) {
    if (__stage.main_api == 'koboldhorde') {
        return data.workerName;
    }

    return undefined;
}

function extractImagesFromData(data, { mainApi = null, chatCompletionSource = null } = {}) {
    switch (mainApi ?? __stage.main_api) {
        case 'openai': {
            switch (chatCompletionSource ?? __stage.oai_settings.chat_completion_source) {
                case __stage.chat_completion_sources.VERTEXAI:
                case __stage.chat_completion_sources.MAKERSUITE: {
                    const inlineData = data?.responseContent?.parts?.filter(x => x.inlineData && !x.thought)?.map(x => x.inlineData);
                    if (Array.isArray(inlineData) && inlineData.length > 0) {
                        return inlineData.map(x => `data:${x.mimeType};base64,${x.data}`).filter(__stage.isDataURL);
                    }
                } break;
                case __stage.chat_completion_sources.OPENROUTER: {
                    const imageUrl = data?.choices[0]?.message?.images?.filter(x => x.type === 'image_url')?.map(x => x?.image_url?.url);
                    if (Array.isArray(imageUrl) && imageUrl.length > 0) {
                        return imageUrl.filter(__stage.isDataURL);
                    }
                    // TODO: Handle remote URLs
                }
            }
        } break;
    }

    return [];
}

function extractMessageFromData(data, activeApi = null) {
    function getResult() {
        if (typeof data === 'string') {
            return data;
        }

        switch (activeApi ?? __stage.main_api) {
            case 'kobold':
                return data.results[0].text;
            case 'koboldhorde':
                return data.text;
            case 'textgenerationwebui':
                return data.choices?.[0]?.text ?? data.choices?.[0]?.message?.content ?? data.content ?? data.response ?? data[0]?.content ?? '';
            case 'novel':
                return data.output;
            case 'openai':
                return data?.content?.filter(p => p.type === 'text')?.map(p => p.text)?.join('\n\n') ?? data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? data?.text ?? data?.message?.content?.[0]?.text ?? data?.message?.tool_plan ?? '';
            default:
                return '';
        }
    }

    const result = getResult();
    return Array.isArray(result) ? result.map(x => x.text).filter(x => x).join('') : result;
}

function extractMultiSwipes(data, type) {
    const swipes = [];

    if (!data) {
        return swipes;
    }

    if (type === 'continue' || type === 'impersonate' || type === 'quiet') {
        return swipes;
    }

    if (__stage.main_api === 'textgenerationwebui' && __stage.textgen_settings.type === __stage.textgen_types.LLAMACPP) {
        if (!Array.isArray(data)) {
            return swipes;
        }

        const multiSwipeCount = data.length - 1;
        if (multiSwipeCount <= 0) {
            return swipes;
        }

        for (let i = 1; i < data.length; i++) {
            const text = data?.[i]?.content ?? '';
            swipes.push(text);
        }
    }

    if (__stage.main_api === 'openai' || (__stage.main_api === 'textgenerationwebui' && [__stage.textgen_types.MANCER, __stage.textgen_types.VLLM, __stage.textgen_types.APHRODITE, __stage.textgen_types.TABBY, __stage.textgen_types.INFERMATICAI].includes(__stage.textgen_settings.type))) {
        if (!Array.isArray(data.choices)) {
            return swipes;
        }

        const multiSwipeCount = data.choices.length - 1;

        if (multiSwipeCount <= 0) {
            return swipes;
        }

        for (let i = 1; i < data.choices.length; i++) {
            const text = data?.choices[i]?.message?.content ?? data?.choices[i]?.text ?? '';
            swipes.push(text);
        }
    }

    const cleanedSwipes = swipes.map(text => cleanUpMessage({
        getMessage: text,
        isImpersonate: false,
        isContinue: false,
        displayIncompleteSentences: false,
    }));

    return cleanedSwipes;
}

function cleanUpMessage({ getMessage, isImpersonate, isContinue, displayIncompleteSentences = false, stoppingStrings = null, includeUserPromptBias = true, trimNames = true, trimWrongNames = true } = {}) {
    if (arguments.length > 0 && typeof arguments[0] !== 'object') {
        __stage.console.trace('cleanUpMessage called with positional arguments. Please use an object instead.');
        [getMessage, isImpersonate, isContinue, displayIncompleteSentences, stoppingStrings, includeUserPromptBias, trimNames, trimWrongNames] = arguments;
    }

    if (!getMessage) {
        return '';
    }

    // Add the prompt bias before anything else
    if (
        includeUserPromptBias &&
        __stage.power_user.user_prompt_bias &&
        !isImpersonate &&
        !isContinue &&
        __stage.power_user.user_prompt_bias.length !== 0
    ) {
        getMessage = substituteParams(__stage.power_user.user_prompt_bias) + getMessage;
    }

    // Allow for caching of stopping strings. getStoppingStrings is an expensive function, especially with macros
    // enabled, so for streaming, we call it once and then pass it into each cleanUpMessage call.
    if (!stoppingStrings) {
        stoppingStrings = getStoppingStrings(isImpersonate, isContinue, __stage.main_api);
    }

    for (const stoppingString of stoppingStrings) {
        if (stoppingString.length) {
            for (let j = stoppingString.length; j > 0; j--) {
                if (getMessage.slice(-j) === stoppingString.slice(0, j)) {
                    getMessage = getMessage.slice(0, -j);
                    break;
                }
            }
        }
    }

    // Regex uses vars, so add before formatting
    getMessage = (0, __stage.getRegexedString)(getMessage, isImpersonate ? __stage.regex_placement.USER_INPUT : __stage.regex_placement.AI_OUTPUT);

    if (__stage.power_user.collapse_newlines) {
        getMessage = (0, __stage.collapseNewlines)(getMessage);
    }

    // trailing invisible whitespace before every newlines, on a multiline string
    // "trailing whitespace on newlines       \nevery line of the string    \n?sample text" ->
    // "trailing whitespace on newlines\nevery line of the string\nsample text"
    getMessage = getMessage.replace(/[^\S\r\n]+$/gm, '');

    if (trimWrongNames) {
        // If this is an impersonation, delete the entire response if it starts with "{{char}}:"
        // If this isn't an impersonation, delete the entire response if it starts with "{{user}}:"
        // Also delete any trailing text that starts with the wrong name.
        // This only occurs if the corresponding "power_user.allow_nameX_display" is false.

        let wrongName = isImpersonate
            ? (!__stage.power_user.allow_name2_display ? __stage.name2 : '')  // char
            : (!__stage.power_user.allow_name1_display ? __stage.name1 : '');  // user

        if (wrongName) {
            // If the message starts with the wrong name, delete the entire response
            let startIndex = getMessage.indexOf(`${wrongName}:`);
            if (startIndex === 0) {
                getMessage = '';
                __stage.console.debug(`Message started with the wrong name: "${wrongName}" - response was deleted.`);
            }

            // If there is trailing text starting with the wrong name, trim it off.
            startIndex = getMessage.indexOf(`\n${wrongName}:`);
            if (startIndex >= 0) {
                getMessage = getMessage.substring(0, startIndex);
            }
        }
    }

    if (getMessage.indexOf('<|endoftext|>') != -1) {
        getMessage = getMessage.substring(0, getMessage.indexOf('<|endoftext|>'));
    }
    const isInstruct = __stage.power_user.instruct.enabled && __stage.main_api !== 'openai';
    const isNotEmpty = (str) => str && str.trim() !== '';
    if (isInstruct && __stage.power_user.instruct.stop_sequence) {
        if (getMessage.indexOf(__stage.power_user.instruct.stop_sequence) != -1) {
            getMessage = getMessage.substring(0, getMessage.indexOf(__stage.power_user.instruct.stop_sequence));
        }
    }
    // Hana: Only use the first sequence (should be <|model|>)
    // of the prompt before <|user|> (as KoboldAI Lite does it).
    if (isInstruct && isNotEmpty(__stage.power_user.instruct.input_sequence)) {
        if (getMessage.indexOf(__stage.power_user.instruct.input_sequence) != -1) {
            getMessage = getMessage.substring(0, getMessage.indexOf(__stage.power_user.instruct.input_sequence));
        }
    }

    // Remove instruct sequences leaking to the output
    if (isInstruct && __stage.power_user.instruct.sequences_as_stop_strings) {
        const sequences = [
            { value: __stage.power_user.instruct.input_sequence, apply: isImpersonate && isNotEmpty(__stage.power_user.instruct.input_sequence) },
            { value: __stage.power_user.instruct.output_sequence, apply: !isImpersonate && isNotEmpty(__stage.power_user.instruct.output_sequence) },
            { value: __stage.power_user.instruct.last_output_sequence, apply: !isImpersonate && isNotEmpty(__stage.power_user.instruct.last_output_sequence) },
        ];
        for (const seq of sequences.filter(s => s.apply)) {
            seq.value.split('\n').filter(line => line.trim() !== '').forEach(line => { getMessage = getMessage.replaceAll(line, ''); });
        }
    }

    // clean-up group message from excessive generations
    if (__stage.selected_group) {
        getMessage = (0, __stage.cleanGroupMessage)(getMessage);
    }

    if (!__stage.power_user.allow_name2_display) {
        const name2Escaped = (0, __stage.escapeRegex)(__stage.name2);
        getMessage = getMessage.replace(new RegExp(`(^|\n)${name2Escaped}:\\s*`, 'g'), '$1');
    }

    if (isImpersonate) {
        getMessage = getMessage.trim();
    }

    if (__stage.power_user.auto_fix_generated_markdown) {
        getMessage = (0, __stage.fixMarkdown)(getMessage, false);
    }

    if (trimNames) {
        // If this is an impersonation, trim "{{user}}:" from the beginning
        // If this isn't an impersonation, trim "{{char}}:" from the beginning.
        // Only applied when the corresponding "power_user.allow_nameX_display" is false.
        const nameToTrim2 = isImpersonate
            ? (!__stage.power_user.allow_name1_display ? __stage.name1 : '')  // user
            : (!__stage.power_user.allow_name2_display ? __stage.name2 : '');  // char

        if (nameToTrim2 && getMessage.startsWith(nameToTrim2 + ':')) {
            getMessage = getMessage.replace(nameToTrim2 + ':', '');
            getMessage = getMessage.trimStart();
        }
    }

    if (isImpersonate) {
        getMessage = getMessage.trim();
    }

    if (!displayIncompleteSentences && __stage.power_user.trim_sentences) {
        getMessage = (0, __stage.trimToEndSentence)(getMessage);
    }

    if (__stage.power_user.trim_spaces && !__stage.PromptReasoning.getLatestPrefix()) {
        getMessage = getMessage.trim();
    }

    return getMessage;
}

async function saveReply({ type, getMessage, fromStreaming = false, title = '', swipes = [], reasoning = '', imageUrls = [], reasoningSignature = null }) {
    // Backward compatibility
    if (arguments.length > 1 && typeof arguments[0] !== 'object') {
        __stage.console.trace('saveReply called with positional arguments. Please use an object instead.');
        [type, getMessage, fromStreaming, title, swipes, reasoning, imageUrls, reasoningSignature] = arguments;
    }

    const lastMessage = __stage.chat[__stage.chat.length - 1];

    if (type != 'append' && type != 'continue' && type != 'appendFinal' && __stage.chat.length && (lastMessage.swipe_id === undefined ||
        lastMessage.is_user)) {
        type = 'normal';
    }

    if (__stage.chat.length && (!lastMessage.extra || typeof lastMessage.extra !== 'object')) {
        lastMessage.extra = {};
    }

    // Coerce null/undefined to empty string
    if (__stage.chat.length && !lastMessage.extra.reasoning) {
        lastMessage.extra.reasoning = '';
    }

    if (!reasoning) {
        reasoning = '';
    }

    let oldMessage = '';
    const generationFinished = new __stage.Date();
    if (type === 'swipe') {
        oldMessage = lastMessage.mes;
        lastMessage.swipes.length++;
        if (lastMessage.swipe_id === lastMessage.swipes.length - 1) {
            lastMessage.title = title;
            lastMessage.mes = getMessage;
            lastMessage.gen_started = __stage.generation_started;
            lastMessage.gen_finished = generationFinished;
            lastMessage.send_date = (0, __stage.getMessageTimeStamp)();
            lastMessage.extra.api = getGeneratingApi();
            lastMessage.extra.model = getGeneratingModel();
            lastMessage.extra.reasoning = reasoning;
            lastMessage.extra.reasoning_duration = null;
            lastMessage.extra.reasoning_signature = reasoningSignature;
            await (0, __stage.processImageAttachment)(lastMessage, { imageUrls });
            if (__stage.power_user.message_token_count_enabled) {
                const tokenCountText = (reasoning || '') + lastMessage.mes;
                lastMessage.extra.token_count = await (0, __stage.getTokenCountAsync)(tokenCountText, 0);
            }
            const chat_id = (__stage.chat.length - 1);
            !fromStreaming && await __stage.eventSource.emit(__stage.event_types.MESSAGE_RECEIVED, chat_id, type);
            (0, __stage.addOneMessage)(__stage.chat[chat_id], { type: 'swipe' });
            !fromStreaming && await __stage.eventSource.emit(__stage.event_types.CHARACTER_MESSAGE_RENDERED, chat_id, type);
        } else {
            lastMessage.mes = getMessage;
        }
    } else if (type === 'append' || type === 'continue') {
        __stage.console.debug('Trying to append.');
        oldMessage = lastMessage.mes;
        lastMessage.title = title;
        lastMessage.mes += getMessage;
        lastMessage.gen_started = __stage.generation_started;
        lastMessage.gen_finished = generationFinished;
        lastMessage.send_date = (0, __stage.getMessageTimeStamp)();
        lastMessage.extra.api = getGeneratingApi();
        lastMessage.extra.model = getGeneratingModel();
        lastMessage.extra.reasoning = reasoning;
        lastMessage.extra.reasoning_duration = null;
        lastMessage.extra.reasoning_signature = reasoningSignature;
        await (0, __stage.processImageAttachment)(lastMessage, { imageUrls });
        if (__stage.power_user.message_token_count_enabled) {
            const tokenCountText = (reasoning || '') + lastMessage.mes;
            lastMessage.extra.token_count = await (0, __stage.getTokenCountAsync)(tokenCountText, 0);
        }
        const chat_id = (__stage.chat.length - 1);
        !fromStreaming && await __stage.eventSource.emit(__stage.event_types.MESSAGE_RECEIVED, chat_id, type);
        (0, __stage.addOneMessage)(__stage.chat[chat_id], { type: 'swipe' });
        !fromStreaming && await __stage.eventSource.emit(__stage.event_types.CHARACTER_MESSAGE_RENDERED, chat_id, type);
    } else if (type === 'appendFinal') {
        oldMessage = lastMessage.mes;
        __stage.console.debug('Trying to appendFinal.');
        lastMessage.title = title;
        lastMessage.mes = getMessage;
        lastMessage.gen_started = __stage.generation_started;
        lastMessage.gen_finished = generationFinished;
        lastMessage.send_date = (0, __stage.getMessageTimeStamp)();
        lastMessage.extra.api = getGeneratingApi();
        lastMessage.extra.model = getGeneratingModel();
        lastMessage.extra.reasoning += reasoning;
        lastMessage.extra.reasoning_signature = reasoningSignature;
        await (0, __stage.processImageAttachment)(lastMessage, { imageUrls });
        // We don't know if the reasoning duration extended, so we don't update it here on purpose.
        if (__stage.power_user.message_token_count_enabled) {
            const tokenCountText = (reasoning || '') + lastMessage.mes;
            lastMessage.extra.token_count = await (0, __stage.getTokenCountAsync)(tokenCountText, 0);
        }
        const chat_id = (__stage.chat.length - 1);
        !fromStreaming && await __stage.eventSource.emit(__stage.event_types.MESSAGE_RECEIVED, chat_id, type);
        (0, __stage.addOneMessage)(__stage.chat[chat_id], { type: 'swipe' });
        !fromStreaming && await __stage.eventSource.emit(__stage.event_types.CHARACTER_MESSAGE_RENDERED, chat_id, type);
    } else {
        __stage.console.debug('entering chat update routine for non-swipe post');
        const newMessage = {};
        __stage.chat.push(newMessage);
        newMessage.extra = {};
        newMessage.name = __stage.name2;
        newMessage.is_user = false;
        newMessage.send_date = (0, __stage.getMessageTimeStamp)();
        newMessage.extra.api = getGeneratingApi();
        newMessage.extra.model = getGeneratingModel();
        newMessage.extra.reasoning = reasoning;
        newMessage.extra.reasoning_duration = null;
        newMessage.extra.reasoning_signature = reasoningSignature;
        if (__stage.power_user.trim_spaces) {
            getMessage = getMessage.trim();
        }
        newMessage.mes = getMessage;
        newMessage.title = title;
        newMessage.gen_started = __stage.generation_started;
        newMessage.gen_finished = generationFinished;

        if (__stage.power_user.message_token_count_enabled) {
            const tokenCountText = (reasoning || '') + newMessage.mes;
            newMessage.extra.token_count = await (0, __stage.getTokenCountAsync)(tokenCountText, 0);
        }

        if (__stage.selected_group) {
            __stage.console.debug('entering chat update for groups');
            let avatarImg = 'img/ai4.png';
            if (__stage.characters[__stage.this_chid].avatar != 'none') {
                avatarImg = (0, __stage.getThumbnailUrl)('avatar', __stage.characters[__stage.this_chid].avatar);
            }
            newMessage.force_avatar = avatarImg;
            newMessage.original_avatar = __stage.characters[__stage.this_chid].avatar;
            newMessage.extra.gen_id = __stage.group_generation_id;
        }

        await (0, __stage.processImageAttachment)(newMessage, { imageUrls });
        const chat_id = (__stage.chat.length - 1);

        !fromStreaming && await __stage.eventSource.emit(__stage.event_types.MESSAGE_RECEIVED, chat_id, type);
        (0, __stage.addOneMessage)(__stage.chat[chat_id]);
        !fromStreaming && await __stage.eventSource.emit(__stage.event_types.CHARACTER_MESSAGE_RENDERED, chat_id, type);
    }

    const item = __stage.chat[__stage.chat.length - 1];
    if (item.swipe_info === undefined) {
        item.swipe_info = [];
    }
    if (item.swipe_id !== undefined) {
        const swipeId = item.swipe_id;
        item.swipes[swipeId] = item.mes;
        item.swipe_info[swipeId] = {
            send_date: item.send_date,
            gen_started: item.gen_started,
            gen_finished: item.gen_finished,
            extra: (0, __stage.structuredClone)(item.extra),
        };
    } else {
        item.swipe_id = 0;
        item.swipes = [];
        item.swipes[0] = item.mes;
        item.swipe_info[0] = {
            send_date: item.send_date,
            gen_started: item.gen_started,
            gen_finished: item.gen_finished,
            extra: (0, __stage.structuredClone)(item.extra),
        };
    }

    if (Array.isArray(swipes) && swipes.length > 0) {
        const swipeInfoExtra = (0, __stage.structuredClone)(item.extra ?? {});
        delete swipeInfoExtra.token_count;
        delete swipeInfoExtra.reasoning;
        delete swipeInfoExtra.reasoning_duration;
        const swipeInfo = {
            send_date: item.send_date,
            gen_started: item.gen_started,
            gen_finished: item.gen_finished,
            extra: swipeInfoExtra,
        };
        const swipeInfoArray = Array(swipes.length).fill().map(() => (0, __stage.structuredClone)(swipeInfo));
        (0, __stage.parseReasoningInSwipes)(swipes, swipeInfoArray, item.extra?.reasoning_duration);
        item.swipes.push(...swipes);
        item.swipe_info.push(...swipeInfoArray);
    }

    (0, __stage.statMesProcess)(item, type, __stage.characters, __stage.this_chid, oldMessage);
    return { type, getMessage };
}

function getGeneratingApi() {
    switch (__stage.main_api) {
        case 'openai':
            return __stage.oai_settings.chat_completion_source || 'openai';
        case 'textgenerationwebui':
            return __stage.textgen_settings.type === __stage.textgen_types.OOBA ? 'textgenerationwebui' : __stage.textgen_settings.type;
        default:
            return __stage.main_api;
    }
}

function getGeneratingModel(mes) {
    let model = '';
    switch (__stage.main_api) {
        case 'kobold':
            model = __stage.online_status;
            break;
        case 'novel':
            model = __stage.nai_settings.model_novel;
            break;
        case 'openai':
            model = (0, __stage.getChatCompletionModel)();
            break;
        case 'textgenerationwebui':
            model = __stage.online_status;
            break;
        case 'koboldhorde':
            model = __stage.kobold_horde_model;
            break;
    }
    return model;
}

function setExtensionPrompt(key, value, position, depth, scan = false, role = extension_prompt_roles.SYSTEM, filter = null) {
    __stage.extension_prompts[key] = {
        value: String(value),
        position: Number(position),
        depth: Number(depth),
        scan: !!scan,
        role: Number(role ?? extension_prompt_roles.SYSTEM),
        filter: filter,
    };
}

function getExtensionPromptRoleByName(roleName) {
    // If the role is already a valid number, return it
    if (typeof roleName === 'number' && Object.values(extension_prompt_roles).includes(roleName)) {
        return roleName;
    }

    switch (roleName) {
        case 'system':
            return extension_prompt_roles.SYSTEM;
        case 'user':
            return extension_prompt_roles.USER;
        case 'assistant':
            return extension_prompt_roles.ASSISTANT;
    }

    // Skill issue?
    return extension_prompt_roles.SYSTEM;
}

function removeDepthPrompts() {
    for (const key of Object.keys(__stage.extension_prompts)) {
        if (key.startsWith(__stage.inject_ids.DEPTH_PROMPT)) {
            delete __stage.extension_prompts[key];
        }
    }
}
return { extension_prompt_types, extension_prompt_roles, getMediaDisplay, getMediaIndex, substituteParamsExtended, substituteParamsLegacy, substituteParams, getStoppingStrings, extractMessageBias, addPersonaDescriptionExtensionPrompt, getAllExtensionPrompts, getExtensionPromptByName, getExtensionPromptMaxDepth, getExtensionPrompt, baseChatReplace, createLazyFields, getCharacterCardFieldsLazy, getCharacterCardFields, parseMesExamples, Generate, doChatInject, flushWIInjections, getNextMessageId, getBiasStrings, removeMacros, sendMessageAsUser, getMaxContextTokens, getMaxResponseTokens, getMaxPromptTokens, addChatsPreamble, addChatsSeparator, setInContextMessages, extractTitleFromData, extractImagesFromData, extractMessageFromData, extractMultiSwipes, cleanUpMessage, saveReply, getGeneratingApi, getGeneratingModel, setExtensionPrompt, getExtensionPromptRoleByName, removeDepthPrompts };
}
