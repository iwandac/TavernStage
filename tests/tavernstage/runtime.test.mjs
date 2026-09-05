import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createSession, disposeSession, readSession, runTurn } from '../../src/tavernstage/runtime.js';
import { createCore as scriptCore } from '../../public/scripts/tavernstage/script.js';
import { createCore as regexCore } from '../../public/scripts/tavernstage/scripts-extensions-regex-engine.js';

const defaults = JSON.parse(readFileSync(new URL('../../default/content/settings.json', import.meta.url)));
function input() {
    return {
        character: { name: 'Protocol fixture', description: 'Protocol fixture only', avatar: 'fixture.png' },
        profile: {
            settings: { ...structuredClone(defaults.oai_settings), chat_completion_source: 'custom', stream_openai: false },
            powerUser: { ...structuredClone(defaults.power_user), experimental_macro_engine: true, auto_swipe: false, auto_continue: { enabled: false } },
            extensionSettings: structuredClone(defaults.extension_settings),
        },
        history: [{ name: 'User', is_user: true, mes: 'Initial', extra: {} }],
    };
}
const host = { countMessages: async () => { throw new Error('Unexpected tokenizer call'); }, countText: async () => { throw new Error('Unexpected tokenizer call'); }, generate: async () => { throw new Error('Unexpected model call'); } };

test('sessions own cloned input and snapshots without browser globals or implicit transport', () => {
    assert.equal(typeof globalThis.document, 'undefined');
    const source = input();
    const a = createSession(source, host);
    const b = createSession(source, host);
    source.history[0].mes = 'Caller mutation';
    const snapshot = readSession(a);
    snapshot.chat[0].mes = 'Snapshot mutation';
    assert.equal(readSession(a).chat[0].mes, 'Initial');
    assert.equal(readSession(b).chat[0].mes, 'Initial');
    assert.notEqual(a.id, b.id);
    disposeSession(a);
    assert.throws(() => readSession(a), /unavailable/);
    assert.equal(readSession(b).chat.length, 1);
    disposeSession(b);
});

test('unsupported profiles and non-normalized cards fail before any model request', () => {
    assert.throws(() => createSession(input(), { ...host, random: () => 0 }), /explicit dice host/);
    const raw = input();
    raw.character = { data: { name: 'Raw', description: 'Not an imported ST projection' } };
    assert.throws(() => createSession(raw, host), /imported ST character projection/);
    for (const mutate of [
        value => { value.profile.settings.chat_completion_source = 'openai'; },
        value => { value.profile.settings.stream_openai = true; },
        value => { value.profile.powerUser.auto_swipe = true; },
        value => { value.history[0].extra.media = [{ type: 'image', url: 'https://invalid.example/image' }]; },
    ]) {
        const source = input(); mutate(source);
        assert.throws(() => createSession(source, host), /capability unavailable/);
    }
});

test('already cancelled and invalid turns cannot mutate the session', async () => {
    const session = createSession(input(), host);
    const before = readSession(session);
    await assert.rejects(runTurn(session, { text: 'Not accepted' }, { signal: AbortSignal.abort(new Error('cancelled')) }), /cancelled/);
    await assert.rejects(runTurn(session, { text: 'Not accepted', type: 'quiet' }), /generation type/);
    assert.deepEqual(readSession(session), before);
    disposeSession(session);
});

test('world sources and preset/extension projections are snapshotted at session creation', async () => {
    const source = input();
    let worldReads = 0;
    const book = { entries: {} };
    source.worlds = { get fixture() { worldReads++; return book; } };
    source.profile.extensions = [{ name: 'fixture', enabled: true }];
    const session = createSession(source, host);
    assert.equal(worldReads, 1, 'the supplied world source is read and cloned at construction, not deferred');
    source.profile.extensions[0].enabled = false;
    book.entries.changed = { content: 'caller mutation' };
    // The deliberately absent token host stops this protocol-only turn after
    // shared Generate has evaluated and inserted the user message.
    await assert.rejects(runTurn(session, { text: '{{hasExtension::fixture}}' }));
    assert.equal(readSession(session).chat.at(-1).mes, 'true');
    assert.equal(worldReads, 1);
    disposeSession(session);
});

test('same-source in-context state preserves regeneration and continuation offsets', () => {
    const local = { Math, chat: Array.from({ length: 10 }, () => ({})), chat_metadata: {}, generationHost: { presentContextCount() {} } };
    const shared = scriptCore(local);
    for (const [type, expected] of [['normal', 7], ['regenerate', 6], ['swipe', 6], ['continue', 6]]) {
        shared.setInContextMessages(3, type);
        assert.equal(local.chat_metadata.lastInContextMessageId, expected, type);
    }
});

test('same-source preset regex permissions use the explicit API identity', () => {
    const script = { id: 'fixture', findRegex: 'x', replaceString: 'y', placement: [1], disabled: false };
    const local = {
        extension_settings: { regex: [], character_allowed_regex: [], preset_allowed_regex: { openai: ['Fixture'] } },
        getPresetManager: () => ({ apiId: 'openai', getSelectedPresetName: () => 'Fixture', readPresetExtensionField: () => [script] }),
        characters: [], this_chid: undefined,
    };
    const shared = regexCore(local);
    assert.deepEqual(shared.getRegexScripts({ allowedOnly: true }).map(value => value.id), ['fixture']);
});
