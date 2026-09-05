// TavernStage shared core, extracted from public/scripts/macros/definitions/chat-macros.js.
// SillyTavern ancestry and AGPL-3.0 license are retained in repository history.
// Free state and host dependencies are explicit per-session bindings.
export function createCore(__stage) {
function registerChatMacros() {
    __stage.MacroRegistry.registerMacro('lastMessage', {
        category: __stage.MacroCategory.CHAT,
        description: 'Last message in the chat.',
        returns: 'Last message in the chat.',
        handler: () => String(getLastMessage() ?? ''),
    });

    __stage.MacroRegistry.registerMacro('lastMessageId', {
        category: __stage.MacroCategory.CHAT,
        description: 'Index of the last message in the chat.',
        returns: 'Index of the last message in the chat.',
        returnType: __stage.MacroValueType.INTEGER,
        handler: () => String(getLastMessageId() ?? ''),
    });

    __stage.MacroRegistry.registerMacro('lastUserMessage', {
        category: __stage.MacroCategory.CHAT,
        description: 'Last user message in the chat.',
        returns: 'Last user message in the chat.',
        handler: () => String(getLastUserMessage() ?? ''),
    });

    __stage.MacroRegistry.registerMacro('lastCharMessage', {
        category: __stage.MacroCategory.CHAT,
        description: 'Last character/bot message in the chat.',
        returns: 'Last character/bot message in the chat.',
        handler: () => String(getLastCharMessage() ?? ''),
    });

    __stage.MacroRegistry.registerMacro('firstIncludedMessageId', {
        category: __stage.MacroCategory.CHAT,
        description: 'Index of the first message included in the current context.',
        returns: 'Index of the first message included in the context.',
        returnType: __stage.MacroValueType.INTEGER,
        handler: () => String(getFirstIncludedMessageId() ?? ''),
    });

    __stage.MacroRegistry.registerMacro('firstDisplayedMessageId', {
        category: __stage.MacroCategory.CHAT,
        description: 'Index of the first displayed message in the chat.',
        returns: 'Index of the first displayed message in the chat.',
        returnType: __stage.MacroValueType.INTEGER,
        handler: () => String(getFirstDisplayedMessageId() ?? ''),
    });

    __stage.MacroRegistry.registerMacro('lastSwipeId', {
        category: __stage.MacroCategory.CHAT,
        description: '1-based index of the last swipe for the last message.',
        returns: '1-based index of the last swipe.',
        returnType: __stage.MacroValueType.INTEGER,
        handler: () => String(getLastSwipeId() ?? ''),
    });

    __stage.MacroRegistry.registerMacro('currentSwipeId', {
        category: __stage.MacroCategory.CHAT,
        description: '1-based index of the current swipe.',
        returns: '1-based index of the current swipe.',
        returnType: __stage.MacroValueType.INTEGER,
        handler: () => String(getCurrentSwipeId() ?? ''),
    });

    __stage.MacroRegistry.registerMacro('allChatRange', {
        category: __stage.MacroCategory.CHAT,
        description: 'Range of all message IDs in the chat (e.g. "0-10"). Empty string if the chat is empty.',
        returns: 'Range string from 0 to last message ID, or empty string.',
        handler: () => {
            if (!Array.isArray(__stage.chat) || __stage.chat.length === 0) {
                return '';
            }
            return `0-${__stage.chat.length - 1}`;
        },
    });
}

function getLastMessageId({ exclude_swipe_in_propress = true, filter = null } = {}) {
    if (!Array.isArray(__stage.chat) || __stage.chat.length === 0) {
        return null;
    }

    for (let i = __stage.chat.length - 1; i >= 0; i--) {
        const message = __stage.chat[i];

        if (exclude_swipe_in_propress && message.swipes && message.swipe_id >= message.swipes.length) {
            continue;
        }

        if (!filter || filter(message)) {
            return i;
        }
    }

    return null;
}

function getLastMessage() {
    const mid = getLastMessageId();
    return typeof mid === 'number' ? (__stage.chat[mid]?.mes ?? '') : '';
}

function getLastUserMessage() {
    const mid = getLastMessageId({ filter: m => m.is_user && !m.is_system });
    return typeof mid === 'number' ? (__stage.chat[mid]?.mes ?? '') : '';
}

function getLastCharMessage() {
    const mid = getLastMessageId({ filter: m => !m.is_user && !m.is_system });
    return typeof mid === 'number' ? (__stage.chat[mid]?.mes ?? '') : '';
}

function getFirstIncludedMessageId() {
    const value = __stage.chat_metadata.lastInContextMessageId;
    return typeof value === 'number' ? value : null;
}

function getFirstDisplayedMessageId() { return __stage.generationHost.firstDisplayedMessageId(); }

function getLastSwipeId() {
    const mid = getLastMessageId({ exclude_swipe_in_propress: false });
    if (typeof mid !== 'number') {
        return null;
    }
    const swipes = __stage.chat[mid]?.swipes;
    return Array.isArray(swipes) ? swipes.length : null;
}

function getCurrentSwipeId() {
    const mid = getLastMessageId({ exclude_swipe_in_propress: false });
    if (typeof mid !== 'number') {
        return null;
    }
    const swipeId = __stage.chat[mid]?.swipe_id;
    return typeof swipeId === 'number' ? swipeId + 1 : null;
}
return { registerChatMacros, getLastMessageId, getLastMessage, getLastUserMessage, getLastCharMessage, getFirstIncludedMessageId, getFirstDisplayedMessageId, getLastSwipeId, getCurrentSwipeId };
}
