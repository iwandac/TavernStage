const fs = require('node:fs');
const path = require('node:path');
const acorn = require('acorn');
const scope = require('eslint-scope');
const { sameSource, assertWritable } = require('./extraction-io.cjs');
const root = path.resolve(__dirname, '../..');
const specs = {
 'script.js': ['Generate','getCharacterCardFieldsLazy','getCharacterCardFields','parseMesExamples','baseChatReplace','substituteParams','substituteParamsExtended','substituteParamsLegacy','cleanUpMessage','getBiasStrings','removeMacros','extractMessageBias','getMaxPromptTokens','getMaxContextTokens','getMaxResponseTokens','extractMessageFromData','extractTitleFromData','extractImagesFromData','extractMultiSwipes','getNextMessageId','getExtensionPrompt','getExtensionPromptByName','getExtensionPromptMaxDepth','getAllExtensionPrompts','setExtensionPrompt','getExtensionPromptRoleByName','removeDepthPrompts','flushWIInjections','doChatInject','addPersonaDescriptionExtensionPrompt','saveReply','sendMessageAsUser'],
 'scripts/openai.js': ['setOpenAIMessages','setOpenAIMessageExamples','parseExampleIntoIndividual','formatWorldInfo','populationInjectionPrompts','populateChatHistory','populateDialogueExamples','getPromptPosition','getPromptRole','populateChatCompletion','preparePromptsForChatCompletion','prepareOpenAIMessages','createGenerationParameters','getChatCompletionModel','getReasoningEffort','getVerbosity','TokenHandler','IdentifierNotFoundError','TokenBudgetExceededError','InvalidCharacterNameError','Message','MessageCollection','ChatCompletion'],
 'scripts/PromptManager.js': ['Prompt','PromptCollection','PromptManager','INJECTION_POSITION','DEFAULT_DEPTH','DEFAULT_ORDER','chatCompletionDefaultPrompts'],
 'scripts/world-info.js': ['WorldInfoBuffer','WorldInfoTimedEffects','getWorldInfoPrompt','checkWorldInfo','filterGroupsByScoring','filterGroupsByTimedEffects','filterByInclusionGroups','getSortedEntries','getCharacterLore','getGlobalLore','getChatLore','getPersonaLore','parseDecorators','convertCharacterBook','world_info_insertion_strategy','world_info_logic','scan_state','world_info_position','wi_anchor_position','DEFAULT_DEPTH','DEFAULT_WEIGHT','MAX_SCAN_DEPTH','defaultGlobalScanData'],
 'scripts/macros.js': ['MacrosParser','evaluateMacros'],
 'scripts/extensions/regex/engine.js': ['RegexProvider','getRegexScripts','getScriptsByType','getRegexedString','runRegexScript','SCRIPT_TYPES','SCRIPT_TYPE_UNKNOWN','DEFAULT_GET_REGEX_SCRIPTS_OPTIONS','regex_placement'],
};
const standard = new Set(['undefined','NaN','Infinity','Object','Array','String','Number','Boolean','BigInt','RegExp','Map','Set','WeakMap','WeakSet','Promise','Error','TypeError','RangeError','JSON','Symbol','Reflect','Intl','ArrayBuffer','Uint8Array','TextEncoder','TextDecoder','URL','URLSearchParams','AbortController','AbortSignal','parseInt','parseFloat','isNaN','isFinite','encodeURIComponent','decodeURIComponent','atob','btoa']);
const mode = process.argv[2] || '--check';
if (!['--check', '--write', '--inspect'].includes(mode)) throw new Error('Use --check, --write or --inspect');
if (mode === '--write') assertWritable(root);
const sha = JSON.parse(fs.readFileSync(path.join(root, 'tavernstage.json'), 'utf8')).upstream.commit;
if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Invalid pinned upstream SHA');
function readPristine(source) {
 let content = require('node:child_process').execFileSync('git', ['show', sha + ':public/' + source], { cwd: root, encoding: 'utf8' });
 if (source === 'scripts/tool-calling.js') content = require('./upstream-tool-delta.cjs')(content);
 if (content.includes('TavernStage shared core')) throw new Error('Derived source cannot be an extraction input: ' + source);
 return content;
}
function save(filename, content) {
 if (mode === '--check') {
  if (!fs.existsSync(filename) || !sameSource(fs.readFileSync(filename, 'utf8'), content)) throw new Error('Extraction drift: ' + path.relative(root, filename));
 } else {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, content);
 }
}
specs['script.js'].push('createLazyFields','getStoppingStrings','extension_prompt_types','extension_prompt_roles','getGeneratingApi','getGeneratingModel','addChatsPreamble','addChatsSeparator');
specs['scripts/PromptManager.js'].push('promptManagerDefaultPromptOrder');
specs['scripts/world-info.js'].push('sortFn','KNOWN_DECORATORS','METADATA_KEY','parseRegexFromString','newWorldInfoEntryDefinition','newWorldInfoEntryTemplate');
specs['scripts/macros.js'].push('getChatIdHash','getLastMessageId','getFirstIncludedMessageId','getFirstDisplayedMessageId','getLastMessage','getLastUserMessage','getLastCharMessage','getLastSwipeId','getCurrentSwipeId','getBannedWordsMacro','getTimeSinceLastMessage','getRandomReplaceMacro','getPickReplaceMacro','getDiceRollMacro','getTimeDiffMacro','getOutletPrompt');
specs['scripts/extensions/regex/engine.js'].push('filterString','sanitizeRegexMacro','substitute_find_regex','getCurrentPresetAPI','getCurrentPresetName');
specs['scripts/variables.js']=['getLocalVariable','setLocalVariable','getGlobalVariable','setGlobalVariable','addLocalVariable','addGlobalVariable','incrementLocalVariable','incrementGlobalVariable','decrementLocalVariable','decrementGlobalVariable','getVariableMacros'];
specs['scripts/utils.js']=['escapeRegex','getStringHash','stringFormat','trimToEndSentence','isTrueBoolean','isFalseBoolean','isDigitsOnly','regexFromString','convertValueType','timestampToMoment'];
specs['scripts/power-user.js']=['collapseNewlines','fixMarkdown','renderStoryString','persona_description_positions'];
specs['scripts/reasoning.js']=['PromptReasoning','extractReasoningFromData','extractReasoningSignatureFromData','parseReasoningInSwipes','parseReasoningFromString','getReasoningTemplateByName'];
specs['scripts/reasoning.js'].push('ReasoningType');
specs['scripts/utils.js'].push('dateCache','parseTimestamp','trimSpaces','countOccurrences','isOdd','onlyUnique');
specs['scripts/power-user.js'].push('validateStoryString','storage_keys');
specs['scripts/instruct-mode.js']=['getInstructMacros'];
specs['scripts/openai.js'].push('chat_completion_sources','character_names_behavior','continue_postfix_types','custom_prompt_post_processing_types','openrouter_middleout_types','reasoning_effort_types','verbosity_levels','tool_reasoning_modes','interleaved_reasoning_providers','ZAI_ENDPOINT','SILICONFLOW_ENDPOINT','MINIMAX_ENDPOINT','openai_max_stop_strings','openrouter_website_model','default_settings','default_wi_format','default_new_chat_prompt','default_new_group_chat_prompt','default_new_example_chat_prompt','default_continue_nudge_prompt','default_bias','default_personality_format','default_scenario_format','default_group_nudge_prompt','default_bias_presets','getEffectiveToolReasoningMode','getToolReasoningMode','isReasoningSignatureSupported');
specs['scripts/openai.js'].push('max_4k','default_impersonation_prompt');
specs['scripts/PromptManager.js'].push('promptManagerDefaultPromptOrders');
specs['scripts/power-user.js'].push('getCustomStoppingStrings');
specs['scripts/authors-note.js']=['setFloatingPrompt','metadata_keys','MODULE_NAME','chara_note_position'];
specs['scripts/tool-calling.js']=['ToolDefinition','ToolManager','stringify','tryParse','isJson'];
specs['script.js'].push('setInContextMessages','getMediaDisplay','getMediaIndex');
specs['scripts/macros.js'].push('initMacros');
specs['scripts/authors-note.js'].push('registerAuthorsNoteMacros');
specs['scripts/variables.js'].push('existsLocalVariable','existsGlobalVariable','deleteLocalVariable','deleteGlobalVariable');
specs['scripts/reasoning.js'].push('registerReasoningMacros');
for (const leaf of ['core','env','state','chat','time','variable','instruct']) {
 const source=`scripts/macros/definitions/${leaf}-macros.js`;
 const pristine = readPristine(source);
 const parsed=acorn.parse(pristine,{ecmaVersion:'latest',sourceType:'module'});
 specs[source]=parsed.body.map(top=>top.type==='ExportNamedDeclaration'?top.declaration:top).filter(Boolean).flatMap(node=>node.id?.name?[node.id.name]:node.type==='VariableDeclaration'?node.declarations.map(d=>d.id.name).filter(Boolean):[]);
}
for (const [source, names] of Object.entries(specs)) {
 const filename = path.join(root,'public',source);
 let original = readPristine(source);
 const ast = acorn.parse(original,{ecmaVersion:'latest',sourceType:'module',ranges:true});
 const entries=[];
 for(const top of ast.body) {
  const node = top.type === 'ExportNamedDeclaration' ? top.declaration : top;
  if(!node) continue;
  const id = node.id?.name ?? (node.type==='VariableDeclaration' && node.declarations.length===1 ? node.declarations[0].id.name : null);
  if(names.includes(id)) entries.push({id,node,top});
 }
 const missing=names.filter(name=>!entries.some(e=>e.id===name));
 if(missing.length) throw Error(source+' missing '+missing);
 let joined = entries.map(e=>original.slice(e.node.start,e.node.end)).join('\n\n');
 if(source==='script.js'||source==='scripts/macros.js') {
  joined=joined.replaceAll("String($('#send_textarea').val())",'generationHost.readInput()')
   .replaceAll("$('#send_textarea').val('')[0].dispatchEvent(new Event('input', { bubbles: true }));",'generationHost.writeInput(\'\');')
   .replaceAll("$('#send_textarea').val(getMessage)[0].dispatchEvent(new Event('input', { bubbles: true }));",'generationHost.writeInput(getMessage);');
 }
 if(source==='scripts/macros.js')joined=joined.replace("Number(document.querySelector('#chat .mes')?.getAttribute('mesid'))",'generationHost.firstDisplayedMessageId()');
 if(source==='script.js') joined=joined.replace("    chatElement.find('.mes').removeClass('lastInContext');\r\n",'').replace("    chatElement.find('.mes').removeClass('lastInContext');\n",'').replace(/    const lastMessageBlock = chatElement\.find\([\s\S]*?\n    }\r?\n\r?\n    \/\/ Update last id to chat\./,'    generationHost.presentContextCount(msgInContextCount);\n\n    // Update last id to chat.');
 if(source==='scripts/authors-note.js') joined=joined.replace("$('#extension_floating_prompt').val()",'generationHost.readAuthorNote()').replace("$('#extension_floating_counter').text('(disabled)');","generationHost.presentAuthorNoteCounter('(disabled)');").replace("$('#extension_floating_counter').text(shouldAddPrompt ? '0' : messagesTillInsertion);","generationHost.presentAuthorNoteCounter(shouldAddPrompt ? '0' : messagesTillInsertion);");
 if(source==='scripts/macros/definitions/core-macros.js') joined=joined.replace("(/** @type {HTMLTextAreaElement} */(document.querySelector('#send_textarea')))?.value ?? ''",'generationHost.readInput()');
 if(source==='scripts/macros/definitions/chat-macros.js') joined=joined.replace(/function getFirstDisplayedMessageId\(\) \{[\s\S]*?\n\}/,'function getFirstDisplayedMessageId() { return generationHost.firstDisplayedMessageId(); }');
 if(source==='scripts/macros/definitions/variable-macros.js') joined=joined.replace('SillyTavern.getContext()','getVariableContext()');
 if(source==='scripts/tool-calling.js') joined=joined.replace('static #formatToolInvocationMessage(invocations) {', 'static #formatToolInvocationMessage(invocations) {\n        if (typeof toolPresentation === "function") return toolPresentation(invocations);');
 const parsed=acorn.parse(joined,{ecmaVersion:'latest',sourceType:'module',ranges:true});
 const analyzed=scope.analyze(parsed,{ecmaVersion:2024,sourceType:'module',optimistic:true,ignoreEval:true});
 const refs=analyzed.globalScope.through.filter(ref=>!standard.has(ref.identifier.name));
 const globals=[...new Set(refs.map(r=>r.identifier.name))].sort();
 console.log(source+' => '+entries.length+' declarations; ports: '+globals.join(', '));
 if(mode==='--inspect') continue;
 const parents=new Map();
 function walk(node) { if(!node||typeof node!=='object')return; for(const [key,value] of Object.entries(node)) { if(key==='range')continue; if(Array.isArray(value)) for(const item of value){if(item?.type){parents.set(item,node);walk(item)}} else if(value?.type){parents.set(value,node);walk(value)} } }
 walk(parsed);
 const changes=new Map();
 for(const {identifier:id} of refs) {
  const parent=parents.get(id);
  const replacement=parent?.type==='Property'&&parent.shorthand&&parent.value===id ? id.name+': __stage.'+id.name : (parent?.type==='CallExpression'&&parent.callee===id)||(parent?.type==='TaggedTemplateExpression'&&parent.tag===id) ? '(0, __stage.'+id.name+')' : '__stage.'+id.name;
  changes.set(id.start,{start:id.start,end:id.end,text:replacement});
 }
 let transformed=joined;
 for(const edit of [...changes.values()].sort((a,b)=>b.start-a.start)) transformed=transformed.slice(0,edit.start)+edit.text+transformed.slice(edit.end);
 const slug=source.replace(/\.js$/,'').replaceAll('/','-');
 const sharedPath=path.join(root,'public/scripts/tavernstage',slug+'.js');

 save(sharedPath,`// TavernStage shared core, extracted from public/${source}.\n// SillyTavern ancestry and AGPL-3.0 license are retained in repository history.\n// Free state and host dependencies are explicit per-session bindings.\nexport function createCore(__stage) {\n${transformed}\nreturn { ${entries.map(e=>e.id).join(', ')} };\n}\n`);
 const edits=entries.map(e=>({start:e.node.start,end:e.node.end,text:e.node.type==='FunctionDeclaration' ? `${e.node.async?'async ':''}function ${e.id}(...args) { return getTavernStageCore().${e.id}.apply(this, args); }` : `const ${e.id} = getTavernStageCore().${e.id};`}));
 for(const edit of edits.sort((a,b)=>b.start-a.start))original=original.slice(0,edit.start)+edit.text+original.slice(edit.end);
 let relative=path.relative(path.dirname(filename),sharedPath).replaceAll('\\','/');if(!relative.startsWith('.'))relative='./'+relative;
 const writers=new Set(refs.filter(ref=>ref.isWrite()).map(ref=>ref.identifier.name));
 const contextPresentation=source==='script.js'?`, presentContextCount: count => { chatElement.find('.mes').removeClass('lastInContext'); const lastMessageBlock = chatElement.find('.mes:not([is_system="true"]), .mes.toolCall').eq(-count); lastMessageBlock.addClass('lastInContext'); if (lastMessageBlock.length === 0) { const firstMessageId = getFirstDisplayedMessageId(); chatElement.find(\`.mes[mesid="\${firstMessageId}"]\`).addClass('lastInContext'); } }`:'';
 const special=globals.includes('generationHost')?`const generationHost = { readInput: () => String($('#send_textarea').val()), writeInput: value => { $('#send_textarea').val(value)[0].dispatchEvent(new Event('input', { bubbles: true })); }, firstDisplayedMessageId: () => Number(document.querySelector('#chat .mes')?.getAttribute('mesid')), readAuthorNote: () => $('#extension_floating_prompt').val(), presentAuthorNoteCounter: value => $('#extension_floating_counter').text(value)${contextPresentation} };\n`:'';
 const binding=`\n// TavernStage shared core. Getters retain this browser host's live state.\nimport { createCore as createTavernStageCore } from '${relative}';\n${special}${globals.includes('getVariableContext')?'const getVariableContext = () => SillyTavern.getContext();\n':''}var tavernStageCore;\nfunction getTavernStageCore() {\n return tavernStageCore ??= createTavernStageCore({\n${globals.map(name=>`  get ${name}() { return ${name}; },${writers.has(name)?` set ${name}(value) { ${name} = value; },`:''}`).join('\n')}\n });\n}\n`;
 save(filename,(globals.includes('toolPresentation') ? 'const toolPresentation = null;\n' : '')+binding+original);
}
