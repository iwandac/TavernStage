import assert from 'node:assert/strict';
import test from 'node:test';
import * as chevrotain from 'chevrotain';
import { createCore as diagnosticsCore } from '../../public/scripts/tavernstage/scripts-macros-engine-MacroDiagnostics.js';
import { createCore as flagsCore } from '../../public/scripts/tavernstage/scripts-macros-engine-MacroFlags.js';
import { createCore as lexerCore } from '../../public/scripts/tavernstage/scripts-macros-engine-MacroLexer.js';
import { createCore as parserCore } from '../../public/scripts/tavernstage/scripts-macros-engine-MacroParser.js';
import { createCore as registryCore } from '../../public/scripts/tavernstage/scripts-macros-engine-MacroRegistry.js';
import { createCore as walkerCore } from '../../public/scripts/tavernstage/scripts-macros-engine-MacroCstWalker.js';
import { createCore as engineCore } from '../../public/scripts/tavernstage/scripts-macros-engine-MacroEngine.js';
import { createCore as envCore } from '../../public/scripts/tavernstage/scripts-macros-engine-MacroEnvBuilder.js';
import { createCore as utilsCore } from '../../public/scripts/tavernstage/scripts-utils.js';

// Protocol fixtures only: built-in definition groups are exercised by the full runtime gate.
function createFixture(user = 'User') {
    const diagnostics = [];
    const vars = new Map();
    const localVariables = {
        get: key => vars.get(key), set: (key, value) => vars.set(key, value),
        has: key => vars.has(key), inc: key => { const value = Number(vars.get(key) ?? 0) + 1; vars.set(key, value); return value; },
    };
    const local = {
        chevrotain, Math, Date, ELSE_MARKER: '\uE000fixture-else\uE000',
        console: Object.fromEntries(['log', 'warn', 'error', 'debug'].map(level => [level, (...args) => diagnostics.push({ level, args })])),
        name1: user, name2: 'Character', selected_group: null, groups: [], characters: [],
        getGeneratingModel: () => 'fixture-model',
        getCharacterCardFieldsLazy: () => ({ description: 'Fixture character' }),
        SillyTavern: { getContext: () => ({ variables: { local: localVariables, global: localVariables } }) },
    };
    const bindings = new Proxy(local, { get(target, key) {
        assert.ok(Reflect.has(target, key), `Unexpected host dependency: ${String(key)}`);
        return Reflect.get(target, key);
    } });
    Object.assign(local, utilsCore(bindings), diagnosticsCore(bindings), flagsCore(bindings));
    for (const [name, factory] of [
        ['MacroLexer', lexerCore], ['MacroParser', parserCore], ['MacroRegistry', registryCore],
        ['MacroCstWalker', walkerCore], ['MacroEngine', engineCore], ['MacroEnvBuilder', envCore],
    ]) {
        const result = factory(bindings);
        const singleton = result[name].instance;
        assert.equal(result[name].instance, singleton, `${name} retains singleton within one factory`);
        Object.assign(local, result, { [name]: singleton });
    }
    const env = text => local.MacroEnvBuilder.buildFromRawEnv({ content: text, replaceCharacterCard: true });
    return { local, diagnostics, vars, evaluate: text => local.MacroEngine.evaluate(text, env(text)) };
}

test('modern factories construct without DOM and evaluate nested registered macros', () => {
    const fixture = createFixture('Alice');
    fixture.local.MacroRegistry.registerMacro('user', { handler: ({ env }) => env.names.user });
    fixture.local.MacroRegistry.registerMacro('echo', { unnamedArgs: 1, handler: ({ args }) => args[0] });
    assert.equal(fixture.evaluate('Hello {{echo::{{user}}}}!'), 'Hello Alice!');
    assert.equal(fixture.evaluate('<USER>'), 'Alice');
});

test('registry, parser, lexer and environment provider state are isolated across factories', () => {
    const a = createFixture('Alice');
    const b = createFixture('Bob');
    for (const name of ['MacroLexer', 'MacroParser', 'MacroRegistry', 'MacroCstWalker', 'MacroEngine', 'MacroEnvBuilder']) {
        assert.notEqual(a.local[name], b.local[name]);
    }
    assert.notEqual(a.local.MacroLexer.tokens, b.local.MacroLexer.tokens);
    a.local.MacroRegistry.registerMacro('privateFixture', { handler: () => 'only A' });
    assert.equal(a.evaluate('{{privateFixture}}'), 'only A');
    assert.equal(b.evaluate('{{privateFixture}}'), '{{privateFixture}}');
    assert.equal(b.local.MacroRegistry.hasMacro('privateFixture'), false);
});

test('variable shorthand reaches only the explicit session variable projection', () => {
    const a = createFixture();
    const b = createFixture();
    assert.equal(a.evaluate('{{.score=4}}{{.score++}}/{{.score}}'), '5/5');
    assert.equal(a.vars.get('score'), 5);
    assert.equal(b.vars.has('score'), false);
});

test('runtime diagnostics retain upstream recoverable behavior instead of throwing', () => {
    const fixture = createFixture();
    fixture.local.MacroRegistry.registerMacro('one', { unnamedArgs: 1, handler: ({ args }) => args[0] });
    assert.equal(fixture.evaluate('{{one}}'), '{{one}}');
    assert.ok(fixture.diagnostics.some(entry => entry.level === 'warn'));
    const error = fixture.local.createMacroRuntimeError({ message: 'fixture', macroName: 'one' });
    assert.equal(error.name, 'MacroRuntimeError');
    assert.equal(error.macroName, 'one');
});
