
// TavernStage shared core. Getters retain this browser host's live state.
import { createCore as createTavernStageCore } from '../../tavernstage/scripts-macros-definitions-state-macros.js';
var tavernStageCore;
function getTavernStageCore() {
 return tavernStageCore ??= createTavernStageCore({
  get MacroCategory() { return MacroCategory; },
  get MacroRegistry() { return MacroRegistry; },
  get eventSource() { return eventSource; },
  get event_types() { return event_types; },
  get findExtension() { return findExtension; },
 });
}
import { MacroRegistry, MacroCategory } from '../engine/MacroRegistry.js';
import { eventSource, event_types } from '../../events.js';
import { findExtension } from '/scripts/extensions.js';

const lastGenerationTypeValue = getTavernStageCore().lastGenerationTypeValue;
const lastGenerationTypeTrackingInitialized = getTavernStageCore().lastGenerationTypeTrackingInitialized;

function ensureLastGenerationTypeTracking(...args) { return getTavernStageCore().ensureLastGenerationTypeTracking.apply(this, args); }

/**
 * Registers macros that depend on runtime application state or event tracking
 * rather than static environment fields.
 */
export function registerStateMacros(...args) { return getTavernStageCore().registerStateMacros.apply(this, args); }
