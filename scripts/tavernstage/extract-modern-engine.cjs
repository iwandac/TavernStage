const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const acorn = require('acorn');
const scope = require('eslint-scope');
const { sameSource, assertWritable } = require('./extraction-io.cjs');
const root = path.resolve(__dirname, '../..');
const mode = process.argv[2] || '--check';
if (!['--check', '--write', '--inspect'].includes(mode)) throw new Error('Use --check, --write or --inspect');
if (mode === '--write') assertWritable(root);
const commit = JSON.parse(fs.readFileSync(path.join(root, 'tavernstage.json'), 'utf8')).upstream.commit;
if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Invalid pinned upstream SHA');
function save(filename, content) {
    if (mode === '--check') {
        if (!fs.existsSync(filename) || !sameSource(fs.readFileSync(filename, 'utf8'), content)) {
            throw new Error('Extraction drift: ' + path.relative(root, filename));
        }
    } else if (mode === '--write') {
        fs.mkdirSync(path.dirname(filename), { recursive: true });
        fs.writeFileSync(filename, content);
    }
}
const names = ['MacroLexer', 'MacroParser', 'MacroFlags', 'MacroRegistry', 'MacroCstWalker', 'MacroEngine', 'MacroEnvBuilder', 'MacroDiagnostics'];
const standard = new Set(['undefined','NaN','Infinity','Object','Array','String','Number','Boolean','BigInt','RegExp','Map','Set','WeakMap','WeakSet','Promise','Error','TypeError','RangeError','JSON','Symbol','Reflect','Intl','ArrayBuffer','Uint8Array','TextEncoder','TextDecoder','URL','URLSearchParams','AbortController','AbortSignal','parseInt','parseFloat','isNaN','isFinite','encodeURIComponent','decodeURIComponent','atob','btoa']);
function identifiers(node) {
    if (!node) return [];
    if (node.type === 'Identifier') return [node.name];
    if (node.type === 'ObjectPattern') return node.properties.flatMap(p => identifiers(p.value ?? p.argument));
    if (node.type === 'ArrayPattern') return node.elements.flatMap(identifiers);
    if (node.type === 'RestElement') return identifiers(node.argument);
    if (node.type === 'AssignmentPattern') return identifiers(node.left);
    throw new Error(`Unsupported binding pattern: ${node.type}`);
}
for (const name of names) {
    const source = `public/scripts/macros/engine/${name}.js`;
    const original = cp.execFileSync('git', ['show', `${commit}:${source}`], { cwd: root, encoding: 'utf8' });
    if (original.includes('TavernStage shared core')) throw new Error('Derived source is not an extraction input');
    const ast = acorn.parse(original, { ecmaVersion: 'latest', sourceType: 'module', ranges: true, locations: true });
    const entries = [];
    for (const top of ast.body) {
        const node = top.type === 'ExportNamedDeclaration' ? top.declaration : top;
        if (!node || !['VariableDeclaration','FunctionDeclaration','ClassDeclaration'].includes(node.type)) continue;
        const declared = node.type === 'VariableDeclaration' ? node.declarations.flatMap(d => identifiers(d.id)) : [node.id.name];
        if (declared.includes('instance')) continue;
        if (name === 'MacroDiagnostics' && declared.some(id => id.startsWith('onboardingExperimentalMacroEngine'))) continue;
        entries.push({ node, declared });
    }
    const joined = entries.map(e => original.slice(e.node.start, e.node.end)).join('\n\n');
    const parsed = acorn.parse(joined, { ecmaVersion: 'latest', sourceType: 'module', ranges: true });
    const analyzed = scope.analyze(parsed, { ecmaVersion: 2024, sourceType: 'module', optimistic: true, ignoreEval: true });
    const refs = analyzed.globalScope.through.filter(ref => !standard.has(ref.identifier.name));
    const globals = [...new Set(refs.map(ref => ref.identifier.name))].sort();
    const parents = new Map();
    function walk(node) {
        for (const [key, value] of Object.entries(node)) {
            if (key === 'range') continue;
            for (const child of Array.isArray(value) ? value : [value]) {
                if (child?.type) { parents.set(child, node); walk(child); }
            }
        }
    }
    walk(parsed);
    const changes = new Map();
    for (const { identifier: id } of refs) {
        const parent = parents.get(id);
        const call = (parent?.type === 'CallExpression' && parent.callee === id) || (parent?.type === 'TaggedTemplateExpression' && parent.tag === id);
        const shorthand = parent?.type === 'Property' && parent.shorthand && parent.value === id;
        const replacement = shorthand ? `${id.name}: __stage.${id.name}` : call ? `(0, __stage.${id.name})` : `__stage.${id.name}`;
        changes.set(id.start, { start: id.start, end: id.end, text: replacement });
    }
    let transformed = joined;
    for (const edit of [...changes.values()].sort((a,b) => b.start-a.start)) transformed = transformed.slice(0,edit.start)+edit.text+transformed.slice(edit.end);
    const sharedName = `scripts-macros-engine-${name}.js`;
    const provenance = entries.map(e => `${e.declared.join(',')}:${e.node.loc.start.line}`).join('; ');
    const shared = `// TavernStage shared core, extracted from ${source}.\n// Upstream ${commit}; AGPL-3.0; source declarations: ${provenance}\n// Per-session classes; callers explicitly obtain each class.instance after binding dependencies.\nexport function createCore(__stage) {\n${transformed}\nreturn { ${entries.flatMap(e => e.declared).join(', ')} };\n}\n`;
    acorn.parse(shared, { ecmaVersion: 'latest', sourceType: 'module' });
    let browser = original;
    const edits = entries.map(({node,declared}) => ({
        start:node.start,end:node.end,
        text:node.type === 'FunctionDeclaration'
            ? `${node.async ? 'async ' : ''}function ${node.id.name}(...args) { return getTavernStageCore().${node.id.name}.apply(this, args); }`
            : node.type === 'ClassDeclaration'
                ? `const ${node.id.name} = getTavernStageCore().${node.id.name};`
                : `${node.kind} ${node.declarations.map(d => `${original.slice(d.id.start,d.id.end)} = ${d.id.type === 'Identifier' ? `getTavernStageCore().${d.id.name}` : 'getTavernStageCore()'}`).join(', ')};`,
    }));
    for (const edit of edits.sort((a,b) => b.start-a.start)) browser = browser.slice(0,edit.start)+edit.text+browser.slice(edit.end);
    const writers = new Set(refs.filter(ref => ref.isWrite()).map(ref => ref.identifier.name));
    browser = `// TavernStage shared core. Browser imports retain original singleton initialization.\nimport { createCore as createTavernStageCore } from '../../tavernstage/${sharedName}';\nvar tavernStageCore;\nfunction getTavernStageCore() {\n    return tavernStageCore ??= createTavernStageCore({\n${globals.map(id => `        get ${id}() { return ${id}; },${writers.has(id) ? ` set ${id}(value) { ${id} = value; },` : ''}`).join('\n')}\n    });\n}\n${browser}`;
    acorn.parse(browser, { ecmaVersion: 'latest', sourceType: 'module' });
    save(path.join(root, 'public/scripts/tavernstage', sharedName), shared);
    save(path.join(root, source), browser);
    console.log(JSON.stringify({ name, exports:entries.flatMap(e => e.declared), ports:globals }));
}
