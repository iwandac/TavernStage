import { randomUUID } from 'node:crypto';
import Handlebars from 'handlebars';
import moment from 'moment';
import seedrandom from 'seedrandom';
import droll from 'droll';
import * as chevrotain from 'chevrotain';
import { createCore as diagnosticsCore } from '../../public/scripts/tavernstage/scripts-macros-engine-MacroDiagnostics.js';
import { createCore as flagsCore } from '../../public/scripts/tavernstage/scripts-macros-engine-MacroFlags.js';
import { createCore as lexerCore } from '../../public/scripts/tavernstage/scripts-macros-engine-MacroLexer.js';
import { createCore as parserCore } from '../../public/scripts/tavernstage/scripts-macros-engine-MacroParser.js';
import { createCore as registryCore } from '../../public/scripts/tavernstage/scripts-macros-engine-MacroRegistry.js';
import { createCore as walkerCore } from '../../public/scripts/tavernstage/scripts-macros-engine-MacroCstWalker.js';
import { createCore as engineCore } from '../../public/scripts/tavernstage/scripts-macros-engine-MacroEngine.js';
import { createCore as envCore } from '../../public/scripts/tavernstage/scripts-macros-engine-MacroEnvBuilder.js';
import { createCore as coreDefinitions } from '../../public/scripts/tavernstage/scripts-macros-definitions-core-macros.js';
import { createCore as envDefinitions } from '../../public/scripts/tavernstage/scripts-macros-definitions-env-macros.js';
import { createCore as stateDefinitions } from '../../public/scripts/tavernstage/scripts-macros-definitions-state-macros.js';
import { createCore as chatDefinitions } from '../../public/scripts/tavernstage/scripts-macros-definitions-chat-macros.js';
import { createCore as timeDefinitions } from '../../public/scripts/tavernstage/scripts-macros-definitions-time-macros.js';
import { createCore as variableDefinitions } from '../../public/scripts/tavernstage/scripts-macros-definitions-variable-macros.js';
import { createCore as instructDefinitions } from '../../public/scripts/tavernstage/scripts-macros-definitions-instruct-macros.js';
import * as constants from '../../public/scripts/constants.js';
import { event_types } from '../../public/scripts/events.js';
import { createCore as scriptCore } from '../../public/scripts/tavernstage/script.js';
import { createCore as openaiCore } from '../../public/scripts/tavernstage/scripts-openai.js';
import { createCore as promptCore } from '../../public/scripts/tavernstage/scripts-PromptManager.js';
import { createCore as worldCore } from '../../public/scripts/tavernstage/scripts-world-info.js';
import { createCore as macroCore } from '../../public/scripts/tavernstage/scripts-macros.js';
import { createCore as regexCore } from '../../public/scripts/tavernstage/scripts-extensions-regex-engine.js';
import { createCore as variableCore } from '../../public/scripts/tavernstage/scripts-variables.js';
import { createCore as utilsCore } from '../../public/scripts/tavernstage/scripts-utils.js';
import { createCore as powerCore } from '../../public/scripts/tavernstage/scripts-power-user.js';
import { createCore as reasoningCore } from '../../public/scripts/tavernstage/scripts-reasoning.js';
import { createCore as instructCore } from '../../public/scripts/tavernstage/scripts-instruct-mode.js';
import { createCore as noteCore } from '../../public/scripts/tavernstage/scripts-authors-note.js';
import { createCore as toolCore } from '../../public/scripts/tavernstage/scripts-tool-calling.js';

const sessions = new WeakMap();
const unsupported = capability => { throw new Error(`TavernStage host capability unavailable: ${capability}`); };
const copy = value => structuredClone(value);

/**
 * Create an isolated in-memory ST session. The host supplies tokenization and model
 * transport; this entrypoint does not read files, open sockets or install extensions.
 * Profile is the explicit ST settings projection, not a browser-global singleton.
 */
export function createSession({ character, userName = 'User', history = [], chatMetadata = {}, profile, worlds = {}, id = randomUUID() }, host) {
    if (typeof character?.name !== 'string' || !character.name || typeof character.description !== 'string') throw new TypeError('An imported ST character projection with top-level name and description is required');
    if (!profile?.powerUser || !profile?.settings || !profile?.extensionSettings) throw new TypeError('An explicit ST profile is required');
    if (typeof host?.countMessages !== 'function' || typeof host?.countText !== 'function' || typeof host?.generate !== 'function') throw new TypeError('Tokenizer and model host ports are required');
    // droll owns its random source internally. Never claim a deterministic session
    // while letting dice escape to the process-global Math.random.
    if (host.random && !host.dice) throw new TypeError('A controlled random source also requires an explicit dice host');
    if (host.dice && (typeof host.dice.roll !== 'function' || typeof host.dice.validate !== 'function')) throw new TypeError('A dice host must provide the droll roll/validate contract');
    // These closures outlive the call; later caller edits must not replace a
    // session's preset permissions, extension projection or world-book source.
    profile = copy(profile);
    worlds = copy(worlds);
    const settings = copy(profile.settings);
    const powerUser = copy(profile.powerUser);
    if (settings.chat_completion_source !== 'custom') unsupported('provider: only custom chat-completion host is currently adapted');
    if (settings.stream_openai && !host.supportsStreaming) unsupported('streaming host');
    if (powerUser.auto_swipe || powerUser.auto_continue?.enabled) unsupported('automatic continuation');
    for (const message of history) {
        if (message.extra?.file || message.extra?.media?.length || message.extra?.image || message.extra?.video || message.extra?.audio) unsupported('media-bearing history');
    }
    const state = {
        id, revision: 0, running: false, disposed: false,
        character: copy(character), history: copy(history), metadata: copy(chatMetadata),
        events: [], requests: [], worldActivations: [], diagnostics: [], faults: [],
    };
    const listeners = new Map();
    const emit = async (type, ...args) => {
        for (const listener of listeners.get(type) ?? []) await listener(...args);
        state.events.push({ type, args: copy(args) });
        if (state.events.length > 256) state.events.shift();
        if (type === event_types.WORLD_INFO_ACTIVATED) state.worldActivations.push(copy(args));
        await host.onEvent?.({ type, args: copy(args) });
    };
    const presentation = (type, ...args) => host.onPresentation?.({ type, args });
    const clock = host.now ?? Date.now;
    const SessionDate = class extends Date {
        constructor(...args) { super(...(args.length ? args : [clock()])); }
        static now() { return clock(); }
    };
    const sessionMoment = Object.assign((...args) => moment(...(args.length ? args : [clock()])), moment);
    const storage = new Map(profile.accountStorage ?? []);
    const local = {
        ...constants, Date: SessionDate, Math: Object.assign(Object.create(Math), { random: host.random ?? Math.random }),
        structuredClone, chevrotain, Handlebars: Handlebars.create(), moment: sessionMoment, seedrandom: host.seedrandom ?? seedrandom, droll: host.dice ?? droll,
        uuidv4: host.uuid ?? randomUUID,
        _persona_description_positions: { IN_PROMPT: 0, AFTER_CHAR: 1, TOP_AN: 2, BOTTOM_AN: 3, AT_DEPTH: 4, NONE: 9 },
        console: Object.fromEntries(['debug', 'log', 'info', 'table', 'trace', 'warn', 'error'].map(level => [level, (...args) => {
            if (['warn', 'error'].includes(level)) state.diagnostics.push({ level, message: String(args[0]).slice(0, 300) });
        }])),
        toastr: Object.fromEntries(['error', 'warning', 'info', 'success', 'clear'].map(level => [level, (...args) => {
            if (level === 'error') state.diagnostics.push({ level, message: String(args[0]).slice(0, 300) });
            presentation(`notice.${level}`, ...args);
        }])),
        t: (strings, ...values) => typeof strings === 'string' ? strings : strings.reduce((text, part, index) => text + part + (values[index] ?? ''), ''),
        accountStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
        characters: [state.character], this_chid: 0, chat: state.history, chat_metadata: state.metadata,
        power_user: powerUser, oai_settings: settings, extension_settings: copy(profile.extensionSettings),
        extension_prompts: copy(profile.extensionPrompts ?? {}),
        main_api: 'openai', name1: userName, name2: state.character.name ?? state.character.data.name,
        user_avatar: '', selected_group: null, groups: [], is_group_generating: false,
        is_send_press: false, abortController: null, streamingProcessor: null,
        amount_gen: settings.openai_max_tokens, max_context: settings.openai_max_context,
        online_status: 'host-connected', generation_started: null, itemizedPrompts: [],
        openai_messages_count: 0, kobold_horde_model: '', model_list: [], biasCache: undefined,
        kai_settings: {}, kai_flags: {}, nai_settings: {}, textgen_settings: {}, textgenerationwebui_settings: {},
        textgen_types: {}, horde_settings: {}, EPHEMERAL_STOPPING_STRINGS: [],
        reasoning_templates: copy(profile.reasoningTemplates ?? []),
        MAX_INJECTION_DEPTH: 10000, depth_prompt_depth_default: 4, depth_prompt_role_default: 'system',
        NOTE_MODULE_NAME: '2_floating_prompt', shouldWIAddPrompt: false,
        event_types,
        eventSource: { emit, on(type, listener) { const list = listeners.get(type) ?? []; list.push(listener); listeners.set(type, list); } },
        isMobile: () => false,
        findExtension: name => (profile.extensions ?? []).find(extension => extension.name === name),
        textgenerationwebui_banned_in_macros: [],
        getCurrentChatId: () => id, getCurrentLocale: () => 'en',
        getMessageTimeStamp: () => sessionMoment(clock()).format('YYYY-M-D @HH[h] mm[m] ss[s] SSS[ms]'),
        generationHost: {
            readInput: () => local.inputText ?? '', writeInput: text => { local.inputText = text; },
            firstDisplayedMessageId: () => null,
            readAuthorNote: () => state.metadata.note_prompt ?? '',
            presentAuthorNoteCounter: counter => presentation('author-note.counter', counter),
            presentContextCount: count => presentation('prompt.context-count', count),
        },
        getTokenCountAsync: (text, padding) => host.countText(text, padding, { settings, powerUser }),
        getFriendlyTokenizerName: () => ({ tokenizerName: host.tokenizerName ?? 'host-supplied' }),
        getGuidanceScale: () => undefined,
        getGroupDepthPrompts: () => [],
        getGroupNames: () => [],
        getPresetManager: () => ({
            apiId: 'openai',
            getSelectedPresetName: () => profile.presetName ?? 'Explicit host profile',
            getApiId: () => 'openai',
            readPresetExtensionField: ({ path }) => settings.extensions?.[path],
        }),
        getCharaFilename: () => (state.character.avatar ?? state.character.name).replace(/\.[^.]+$/, ''),
        getTagKeyForEntity: () => unsupported('tag matching requires an explicit tag projection'),
        loadWorldInfo: async name => {
            if (!Object.hasOwn(worlds, name)) throw new Error(`Missing explicitly supplied world book: ${name}`);
            return copy(worlds[name]);
        },
        isHordeGenerationNotAllowed: () => false,
        isStreamingEnabled: () => false,
        pingServer: async () => true,
        unshallowCharacter: async () => { if (state.character.shallow) unsupported('shallow character'); },
        processCommands: async text => { if (text.startsWith('/')) unsupported('slash-command host'); return false; },
        hasPendingFileAttachment: () => false,
        populateFileAttachment: async () => {},
        appendFileContent: async (message, text) => {
            if (message.extra?.file) unsupported('attachment content');
            return text;
        },
        processImageAttachment: async (_, { imageUrls }) => { if (imageUrls?.length) unsupported('generated image persistence'); },
        isDataURL: value => /^data:/.test(value),
        isImageInliningSupported: () => false, isVideoInliningSupported: () => false, isAudioInliningSupported: () => false,
        runGenerationInterceptors: async (...args) => {
            for (const interceptor of host.interceptors ?? []) if (await interceptor(...args)) return true;
            return false;
        },
        saveChatConditional: async () => { await host.onCheckpoint?.({ chat: copy(state.history), metadata: copy(state.metadata) }); },
        saveSettingsDebounced: () => {}, saveMetadataDebounced: () => {},
        statMesProcess: (...args) => presentation('statistics.message', ...args),
        addOneMessage: (...args) => presentation('message.render', ...args),
        reloadCurrentChat: () => presentation('chat.render'),
        removeLastMessage: () => presentation('message.remove'),
        deleteLastMessage: async () => { state.history.pop(); await emit('MESSAGE_DELETED', state.history.length); },
        deleteItemizedPromptForMessage: index => { local.itemizedPrompts = local.itemizedPrompts.filter(item => item.mesId !== index); },
        setGenerationProgress: value => presentation('generation.progress', value),
        deactivateSendButtons: () => presentation('generation.busy', true),
        showStopButton: () => presentation('generation.cancel-available'),
        hideSwipeButtons: () => presentation('generation.swipes-hidden'),
        playMessageSound: () => presentation('message.sound'),
        triggerAutoContinue: () => { if (powerUser.auto_continue?.enabled) unsupported('auto-continue'); },
        parseTokenCounts: () => {},
        parseAndSaveLogprobs: data => { if (settings.show_logprobs) unsupported('logprob persistence'); },
        unblockGeneration: () => { local.is_send_press = false; local.flushWIInjections(); presentation('generation.busy', false); },
        debounce: fn => fn, clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
        shiftDownByOne: value => value - 1, shiftUpByOne: value => value + 1,
        system_message_types: { GENERIC: 'generic', NARRATOR: 'narrator' },
        systemUserName: 'System', system_avatar: '',
        fetch: () => unsupported('auxiliary network request'),
    };
    Object.assign(local, copy(profile.worldSettings ?? {}));
    const bindings = new Proxy(local, { get(target, key) {
        if (!Reflect.has(target, key)) { state.faults.push(`binding ${String(key)}`); unsupported(`binding ${String(key)}`); }
        return Reflect.get(target, key);
    } });
    for (const factory of [scriptCore, promptCore, openaiCore, worldCore, macroCore, regexCore, variableCore, utilsCore, powerCore, reasoningCore, instructCore, noteCore, toolCore]) {
        Object.assign(local, factory(bindings));
    }
    local.tokenHandler = new local.TokenHandler((messages, full) => host.countMessages(messages, full, settings));
    local.promptManager = new local.PromptManager();
    local.promptManager.serviceSettings = settings;
    local.promptManager.activeCharacter = { id: local.promptManager.configuration.promptOrder.dummyId };
    local.promptManager.tokenHandler = local.tokenHandler;
    local.promptManager.render = () => presentation('prompt.inspectable');
    local.getContext = () => ({
        chat: state.history, chatMetadata: state.metadata, characters: local.characters, characterId: 0,
        groupId: null, extensionPrompts: local.extension_prompts, setExtensionPrompt: local.setExtensionPrompt,
        name1: local.name1, name2: local.name2,
    });
    local.getVariableContext = () => ({ variables: Object.fromEntries(['Local', 'Global'].map(scope => [scope.toLowerCase(), {
        get: local[`get${scope}Variable`], set: local[`set${scope}Variable`], add: local[`add${scope}Variable`],
        inc: local[`increment${scope}Variable`], dec: local[`decrement${scope}Variable`],
        has: local[`exists${scope}Variable`], del: local[`delete${scope}Variable`],
    }])) });
    local.SillyTavern = { getContext: local.getVariableContext };
    Object.assign(local, diagnosticsCore(bindings), flagsCore(bindings));
    for (const [name, factory] of [
        ['MacroLexer', lexerCore], ['MacroParser', parserCore], ['MacroRegistry', registryCore],
        ['MacroCstWalker', walkerCore], ['MacroEngine', engineCore], ['MacroEnvBuilder', envCore],
    ]) {
        const result = factory(bindings);
        Object.assign(local, result, { [name]: result[name].instance });
    }
    local.macros = local.macroSystem = {
        engine: local.MacroEngine, registry: local.MacroRegistry, envBuilder: local.MacroEnvBuilder,
        lexer: local.MacroLexer, parser: local.MacroParser, cstWalker: local.MacroCstWalker, category: local.MacroCategory,
        register: local.MacroRegistry.registerMacro.bind(local.MacroRegistry),
        registerAlias: local.MacroRegistry.registerMacroAlias.bind(local.MacroRegistry),
    };
    const definitionGroups = [coreDefinitions, envDefinitions, stateDefinitions, chatDefinitions, timeDefinitions, variableDefinitions, instructDefinitions]
        .map(factory => factory(bindings));
    local.ELSE_MARKER = definitionGroups[0].ELSE_MARKER;
    local.initRegisterMacros = () => {
        for (const group of definitionGroups) for (const [name, register] of Object.entries(group)) if (/^register\w+Macros$/.test(name)) register();
    };
    local.sendGenerationRequest = async (type, { prompt }, options) => {
        local.abortController.signal.throwIfAborted();
        if (state.faults.length) throw new Error(`Incomplete host semantics: ${state.faults.join(', ')}`);
        if (local.promptManager.error) throw new Error(`Prompt preparation failed: ${local.promptManager.error}`);
        const { generate_data } = await local.createGenerationParameters(settings, local.getChatCompletionModel(), type, prompt, options);
        // Tool definitions have browser-only toString methods. The network
        // projection, as in ST's JSON transport, deliberately serializes them.
        const request = JSON.parse(JSON.stringify(generate_data));
        state.requests.push(copy(request));
        if (state.requests.length > 16) state.requests.shift();
        const result = await host.generate(request, {
            signal: local.abortController.signal,
            parseToolCalls: (calls, chunk) => local.ToolManager.parseToolCalls(calls, chunk),
        });
        local.abortController.signal.throwIfAborted();
        return result;
    };
    local.Handlebars.registerHelper('trim', () => '{{trim}}');
    local.Handlebars.registerHelper('helperMissing', function () {
        return local.substituteParams(`{{${arguments[arguments.length - 1].name}}}`);
    });
    local.initMacros();
    local.registerAuthorsNoteMacros();
    local.registerReasoningMacros();
    for (const tool of host.tools ?? []) {
        local.ToolManager.registerFunctionTool({ ...tool, action: async parameters => {
            try { return await host.invokeTool(tool.name, copy(parameters), { signal: local.abortController.signal }); }
            catch (error) { local.abortController.abort(error); throw error; }
        } });
    }
    // Formatting is a presentation port, not a replacement tool/prompt loop.
    local.toolPresentation = host.toolPresentation ?? (invocations => JSON.stringify(invocations));
    const session = Object.freeze({ id });
    sessions.set(session, { state, local, host, profile, worlds, storage, userName });
    return session;
}

/** Initialize an empty chat using ST's first-message regex and macro semantics. */
export function initializeGreeting(session, { greetingIndex = 0 } = {}) {
    const owned = sessions.get(session);
    if (!owned || owned.state.disposed || owned.state.running || owned.state.history.length) throw new Error('Greeting requires an empty idle session');
    const { state, local } = owned;
    const greetings = [state.character.first_mes || '', ...(state.character.data?.alternate_greetings ?? [])];
    if (!Number.isInteger(greetingIndex) || greetingIndex < 0 || greetingIndex >= greetings.length) throw new TypeError('Invalid greeting index');
    const text = greetings[greetingIndex];
    if (typeof text !== 'string') throw new TypeError('Invalid greeting');
    if (text) {
        const message = { name: local.name2, is_user: false, is_system: false,
            send_date: local.getMessageTimeStamp(), mes: local.getRegexedString(text, local.regex_placement.AI_OUTPUT), extra: {} };
        state.history.push(message);
        message.mes = local.substituteParams(message.mes);
    }
    return readSession(session);
}

export async function runTurn(session, { text = '', type = 'normal' } = {}, { signal } = {}) {
    const owned = sessions.get(session);
    if (!owned || owned.state.disposed) throw new Error('Session unavailable');
    const { state, local } = owned;
    if (state.running) throw new Error('Session already has an active turn');
    if (!['normal', 'regenerate', 'continue', 'swipe'].includes(type)) unsupported(`generation type ${type}`);
    if (typeof text !== 'string' || text.length > 128_000) throw new TypeError('Invalid bounded input');
    signal?.throwIfAborted();
    state.running = true;
    local.inputText = text;
    local.abortController = new AbortController();
    const cancel = () => local.abortController.abort(signal.reason);
    signal?.addEventListener('abort', cancel, { once: true });
    try {
        const reply = await local.Generate(type, { signal: local.abortController.signal }, false);
        local.abortController.signal.throwIfAborted();
        if (reply === undefined) throw new Error('Generation ended without a confirmed reply');
        state.revision++;
        return { reply: String(reply), ...readSession(session) };
    } finally {
        signal?.removeEventListener('abort', cancel);
        state.running = false;
    }
}

export function readSession(session) {
    const owned = sessions.get(session);
    if (!owned || owned.state.disposed) throw new Error('Session unavailable');
    const { state } = owned;
    return copy({ id: state.id, revision: state.revision, chat: state.history, chatMetadata: state.metadata,
        requests: state.requests, events: state.events, activatedWorldInfo: state.worldActivations, diagnostics: state.diagnostics });
}

export function disposeSession(session) {
    const owned = sessions.get(session);
    if (!owned) return;
    owned.state.disposed = true;
    owned.local.abortController?.abort('Session disposed');
    sessions.delete(session);
}

/** Complete rehydration input, not merely visible chat. No callbacks or credentials. */
export function exportSession(session) {
    const owned = sessions.get(session);
    if (!owned || owned.state.disposed || owned.state.running) throw new Error('Session cannot be exported');
    const { state, local, profile, worlds, storage, userName } = owned;
    return copy({ id: state.id, character: state.character, userName, history: state.history,
        chatMetadata: state.metadata, worlds, profile: { ...profile, settings: local.oai_settings,
            powerUser: local.power_user, extensionSettings: local.extension_settings,
            extensionPrompts: local.extension_prompts, accountStorage: [...storage] } });
}
