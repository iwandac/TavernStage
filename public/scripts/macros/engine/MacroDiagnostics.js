// TavernStage shared core. Browser imports retain original singleton initialization.
import { createCore as createTavernStageCore } from '../../tavernstage/scripts-macros-engine-MacroDiagnostics.js';
var tavernStageCore;
function getTavernStageCore() {
    return tavernStageCore ??= createTavernStageCore({
        get console() { return console; },
    });
}
/** @typedef {import('./MacroCstWalker.js').MacroCall} MacroCall */
/** @typedef {import('./MacroRegistry.js').MacroDefinition} MacroDefinition */
/** @typedef {import('chevrotain').ILexingError} ILexingError */
/** @typedef {import('chevrotain').IRecognitionException} IRecognitionException */

import { t } from '/scripts/i18n.js';
import { Popup, POPUP_RESULT } from '/scripts/popup.js';
import { power_user } from '/scripts/power-user.js';
import { accountStorage } from '/scripts/util/AccountStorage.js';
import { SimpleMutex } from '/scripts/util/SimpleMutex.js';

/**
 * @typedef {Object} MacroErrorContext
 * @property {string} [macroName]
 * @property {MacroCall} [call]
 * @property {MacroDefinition} [def]
 */

/**
 * Options for creating a macro runtime error.
 *
 * @typedef {MacroErrorContext & { message: string }} MacroRuntimeErrorOptions
 */

/**
 * Options for logging macro warnings or errors.
 *
 * @typedef {MacroErrorContext & { message: string, error?: any }} MacroLogOptions
 */


// Use mutex here so even on parallel usage without awaiting the popup, this will only show up once.
export const onboardingExperimentalMacroEngineMutex = new SimpleMutex(onboardingExperimentalMacroEngineUnsafe);

/**
 * Onboards the user to use the experimental macro engine.
 * Asks the user to enable it if they haven't already.
 *
 * @param {string|null} feature - The feature that requires the experimental macro engine, or null if not applicable or unknown.
 * @returns {Promise<void>} - A promise that resolves when the user has been onboarded.
 */
export const onboardingExperimentalMacroEngine = onboardingExperimentalMacroEngineMutex.update.bind(onboardingExperimentalMacroEngineMutex);

async function onboardingExperimentalMacroEngineUnsafe(feature = null) {
    // Show a popup once telling a user that they are using experimental features that only work with the new engine.
    // Ask them if they want to turn the experimental engine on.
    if (power_user.experimental_macro_engine) return;

    // If already shown, do not show again
    const shown = accountStorage.getItem('slash_command_experimental_engine_warning_shown');
    if (shown === 'true') return;

    const result = await Popup.show.confirm(t`Experimental Macro Engine`, `
        <p>${t`You are using experimental macro features that require the new macro engine.`}</p>
        ${feature ? `<div class="info-block hint">
                <span>${t`Recognized Feature: `}<strong>${feature}</strong></span>
            </div>` : ''}
        <p>${t`For more information on the new macro engine, visit the <br />${`<a href="https://docs.sillytavern.app/usage/core-concepts/macros/">${t`Macro Documentation`}</a>`}.`}</p>
        <p>${t`You can enable the engine any time under:<br />${t`User Settings`} → ${t`Experimental Macro Engine`}`}</p>
        <p>${t`Would you like to enable it now?`}</p>`);
    if (result == POPUP_RESULT.AFFIRMATIVE) {
        power_user.experimental_macro_engine = true;
        $('#experimental_macro_engine').prop('checked', power_user.experimental_macro_engine).trigger('input');
    }

    // Only show this once
    accountStorage.setItem('slash_command_experimental_engine_warning_shown', 'true');
}

/**
 * Creates an error representing a runtime macro invocation problem (such as
 * arity or type mismatches). These errors are intended to be caught by the
 * MacroEngine, which will log them as runtime warnings and leave the macro
 * raw in the evaluated text.
 *
 * @param {MacroRuntimeErrorOptions} options
 * @returns {Error}
 */
export function createMacroRuntimeError(...args) { return getTavernStageCore().createMacroRuntimeError.apply(this, args); }

/**
 * Logs a macro runtime warning with consistent, helpful context. These
 * correspond to issues in how a macro was written in the text (e.g. invalid
 * arguments), not bugs in macro definitions or the engine itself.
 *
 * @param {MacroLogOptions} options
 */
export function logMacroRuntimeWarning(...args) { return getTavernStageCore().logMacroRuntimeWarning.apply(this, args); }

/**
 * Logs an internal macro error (definition or engine bug) with a consistent
 * schema. These are surfaced as red errors in the console.
 *
 * @param {MacroLogOptions} options
 */
export function logMacroInternalError(...args) { return getTavernStageCore().logMacroInternalError.apply(this, args); }

/**
 * Logs a warning during macro registration.
 *
 * @param {{ message: string, macroName?: string, error?: any }} options
 */
export function logMacroRegisterWarning(...args) { return getTavernStageCore().logMacroRegisterWarning.apply(this, args); }

/**
 * Logs an error during macro registration. Used when registration fails
 * and the macro will not be available.
 *
 * @param {{ message: string, macroName?: string, error?: any }} options
 */
export function logMacroRegisterError(...args) { return getTavernStageCore().logMacroRegisterError.apply(this, args); }

/**
 * Logs a macro error with a consistent schema.
 *
 * @param {{ message: string, error?: any }} options
 */
export function logMacroGeneralError(...args) { return getTavernStageCore().logMacroGeneralError.apply(this, args); }

/**
 * Logs lexer/parser syntax warnings for the macro engine with a compact,
 * human-readable payload.
 *
 * @param {{ phase: 'lexing', input: string, errors: ILexingError[] }|{ phase: 'parsing', input: string, errors: IRecognitionException[] }} options
 */
export function logMacroSyntaxWarning(...args) { return getTavernStageCore().logMacroSyntaxWarning.apply(this, args); }

/**
 * Builds a structured payload for macro logging.
 *
 * @param {MacroErrorContext & { error?: any }} ctx
 */
function buildMacroPayload(...args) { return getTavernStageCore().buildMacroPayload.apply(this, args); }

/**
 * Infers the most appropriate macro name from the available context.
 *
 * @param {MacroCall} [call]
 * @param {MacroDefinition} [def]
 * @param {string} [explicit]
 * @returns {string}
 */
function inferMacroName(...args) { return getTavernStageCore().inferMacroName.apply(this, args); }
