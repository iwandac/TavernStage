// TavernStage shared core, extracted from public/scripts/macros/definitions/state-macros.js.
// SillyTavern ancestry and AGPL-3.0 license are retained in repository history.
// Free state and host dependencies are explicit per-session bindings.
export function createCore(__stage) {
let lastGenerationTypeValue = '';

let lastGenerationTypeTrackingInitialized = false;

function ensureLastGenerationTypeTracking() {
    if (lastGenerationTypeTrackingInitialized) {
        return;
    }
    lastGenerationTypeTrackingInitialized = true;

    try {
        __stage.eventSource?.on?.(__stage.event_types.GENERATION_STARTED, (type, _params, isDryRun) => {
            if (isDryRun) return;
            lastGenerationTypeValue = type || 'normal';
        });

        __stage.eventSource?.on?.(__stage.event_types.CHAT_CHANGED, () => {
            lastGenerationTypeValue = '';
        });
    } catch {
        // In non-runtime environments (tests), eventSource may be undefined or not fully initialized.
    }
}

function registerStateMacros() {
    ensureLastGenerationTypeTracking();

    __stage.MacroRegistry.registerMacro('lastGenerationType', {
        category: __stage.MacroCategory.STATE,
        description: 'Type of the last queued generation request (e.g. "normal", "impersonate", "regenerate", "quiet", "swipe", "continue"). Empty if none yet or chat was switched.',
        returns: 'Type of the last queued generation request.',
        handler: () => lastGenerationTypeValue,
    });

    // Macro that checks if an extension is enabled
    __stage.MacroRegistry.registerMacro('hasExtension', {
        category: __stage.MacroCategory.STATE,
        unnamedArgs: [{
            name: 'extensionName',
            type: 'string',
            description: 'The name of the extension to check',
        }],
        description: 'Checks if a specific extension is enabled. If the extension does not exist, returns false.',
        returns: 'true if the extension is enabled, false otherwise.',
        handler: ({ unnamedArgs: [extensionName] }) => {
            const extension = (0, __stage.findExtension)(extensionName);
            return String(extension?.enabled ?? false);
        },
    });
}
return { lastGenerationTypeValue, lastGenerationTypeTrackingInitialized, ensureLastGenerationTypeTracking, registerStateMacros };
}
