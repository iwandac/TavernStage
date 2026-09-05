// TavernStage shared core, extracted from public/scripts/authors-note.js.
// SillyTavern ancestry and AGPL-3.0 license are retained in repository history.
// Free state and host dependencies are explicit per-session bindings.
export function createCore(__stage) {
const MODULE_NAME = '2_floating_prompt';

const metadata_keys = {
    prompt: 'note_prompt',
    interval: 'note_interval',
    depth: 'note_depth',
    position: 'note_position',
    role: 'note_role',
};

const chara_note_position = {
    replace: 0,
    before: 1,
    after: 2,
};

function setFloatingPrompt() {
    const context = (0, __stage.getContext)();
    if (!context.groupId && context.characterId === undefined) {
        __stage.console.debug('setFloatingPrompt: Not in a chat. Skipping.');
        __stage.shouldWIAddPrompt = false;
        return;
    }

    // take the count of messages
    let lastMessageNumber = Array.isArray(context.chat) && context.chat.length ? context.chat.filter(m => m.is_user).length : 0;

    __stage.console.debug(`
    setFloatingPrompt entered
    ------
    lastMessageNumber = ${lastMessageNumber}
    metadata_keys.interval = ${__stage.chat_metadata[metadata_keys.interval]}
    metadata_keys.position = ${__stage.chat_metadata[metadata_keys.position]}
    metadata_keys.depth = ${__stage.chat_metadata[metadata_keys.depth]}
    metadata_keys.role = ${__stage.chat_metadata[metadata_keys.role]}
    ------
    `);

    // interval 1 should be inserted no matter what
    if (__stage.chat_metadata[metadata_keys.interval] === 1) {
        lastMessageNumber = 1;
    }

    if (lastMessageNumber <= 0 || __stage.chat_metadata[metadata_keys.interval] <= 0) {
        context.setExtensionPrompt(MODULE_NAME, '', __stage.extension_prompt_types.NONE, __stage.MAX_INJECTION_DEPTH);
        __stage.generationHost.presentAuthorNoteCounter('(disabled)');
        __stage.shouldWIAddPrompt = false;
        return;
    }

    const messagesTillInsertion = lastMessageNumber >= __stage.chat_metadata[metadata_keys.interval]
        ? (lastMessageNumber % __stage.chat_metadata[metadata_keys.interval])
        : (__stage.chat_metadata[metadata_keys.interval] - lastMessageNumber);
    const shouldAddPrompt = messagesTillInsertion == 0;
    __stage.shouldWIAddPrompt = shouldAddPrompt;

    let prompt = shouldAddPrompt ? __stage.generationHost.readAuthorNote() : '';
    if (shouldAddPrompt && __stage.extension_settings.note.chara && (0, __stage.getContext)().characterId !== undefined) {
        const charaNote = __stage.extension_settings.note.chara.find((e) => e.name === (0, __stage.getCharaFilename)());

        // Only replace with the chara note if the user checked the box
        if (charaNote && charaNote.useChara) {
            switch (charaNote.position) {
                case chara_note_position.before:
                    prompt = charaNote.prompt + '\n' + prompt;
                    break;
                case chara_note_position.after:
                    prompt = prompt + '\n' + charaNote.prompt;
                    break;
                default:
                    prompt = charaNote.prompt;
                    break;
            }
        }
    }
    context.setExtensionPrompt(
        MODULE_NAME,
        String(prompt),
        __stage.chat_metadata[metadata_keys.position],
        __stage.chat_metadata[metadata_keys.depth],
        __stage.extension_settings.note.allowWIScan,
        __stage.chat_metadata[metadata_keys.role],
    );
    __stage.generationHost.presentAuthorNoteCounter(shouldAddPrompt ? '0' : messagesTillInsertion);
}

function registerAuthorsNoteMacros() {
    if (__stage.power_user.experimental_macro_engine) {
        __stage.macros.register('authorsNote', {
            category: __stage.MacroCategory.PROMPTS,
            description: (0, __stage.t)`The contents of the Author's Note`,
            handler: () => __stage.chat_metadata[metadata_keys.prompt] ?? '',
        });
        __stage.macros.register('charAuthorsNote', {
            category: __stage.MacroCategory.PROMPTS,
            description: (0, __stage.t)`The contents of the Character Author's Note`,
            handler: () => __stage.this_chid !== undefined ? (__stage.extension_settings.note.chara.find((e) => e.name === (0, __stage.getCharaFilename)())?.prompt ?? '') : '',
        });
        __stage.macros.register('defaultAuthorsNote', {
            category: __stage.MacroCategory.PROMPTS,
            description: (0, __stage.t)`The contents of the Default Author's Note`,
            handler: () => __stage.extension_settings.note.default ?? '',
        });
    } else {
        // TODO: Remove this when the experimental macro engine is replacing the old macro engine
        __stage.MacrosParser.registerMacro('authorsNote',
            () => __stage.chat_metadata[metadata_keys.prompt] ?? '',
            (0, __stage.t)`The contents of the Author's Note`,
        );
        __stage.MacrosParser.registerMacro('charAuthorsNote',
            () => __stage.this_chid !== undefined ? (__stage.extension_settings.note.chara.find((e) => e.name === (0, __stage.getCharaFilename)())?.prompt ?? '') : '',
            (0, __stage.t)`The contents of the Character Author's Note`,
        );
        __stage.MacrosParser.registerMacro('defaultAuthorsNote',
            () => __stage.extension_settings.note.default ?? '',
            (0, __stage.t)`The contents of the Default Author's Note`,
        );
    }
}
return { MODULE_NAME, metadata_keys, chara_note_position, setFloatingPrompt, registerAuthorsNoteMacros };
}
