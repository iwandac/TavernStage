import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRuntime, createMemoryAuthority } from '../../src/tavernstage/managed-runtime.js';

const defaults = JSON.parse(readFileSync(new URL('../../default/content/settings.json', import.meta.url)));
const hash = 'a'.repeat(64);
function input(sessionId = 'session-a') {
    return { sessionId, profileId: 'protocol', profileDigest: hash, generation: 0, userName: 'User',
        character: { name: sessionId, description: `Only ${sessionId}`, avatar: 'fixture.png', data: { extensions: {} } },
        history: [], chatMetadata: {}, worlds: {}, profile: {
            settings: { ...structuredClone(defaults.oai_settings), chat_completion_source: 'custom', stream_openai: false,
                function_calling: false, custom_model: 'protocol-fixture', custom_prompt_post_processing: '', openai_max_tokens: 128, openai_max_context: 8192 },
            powerUser: { ...structuredClone(defaults.power_user), experimental_macro_engine: true, auto_swipe: false, auto_continue: { enabled: false }, reasoning: { add_to_prompts: false } },
            extensionSettings: structuredClone(defaults.extension_settings),
            worldSettings: { selected_world_info: [], world_info: { globalSelect: [] }, world_info_depth: 2,
                world_info_budget: 25, world_info_budget_cap: 0, world_info_min_activations: 0,
                world_info_min_activations_depth_max: 0, world_info_recursive: true, world_info_max_recursion_steps: 0,
                world_info_character_strategy: 1, world_info_include_names: true, world_info_case_sensitive: false,
                world_info_insertion_strategy: { evenly: 0, character_first: 1, global_first: 2 },
                world_info_logic: { AND_ANY: 0, NOT_ALL: 1, NOT_ANY: 2, AND_ALL: 3 },
                world_info_match_whole_words: true, world_info_overflow_alert: false, world_info_use_group_scoring: false,
                world_info_position: { before: 0, after: 1, ANTop: 2, ANBottom: 3, atDepth: 4, EMTop: 5, EMBottom: 6, outlet: 7 } },
        } };
}
const completion = text => ({ choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }] });
const tokenizer = { countText: async text => Math.ceil(text.length / 4), countMessages: async messages => Math.ceil(JSON.stringify(messages).length / 4) };
const request = (sessionId = 'session-a', runId = 'run-a', text = 'Hello') => ({ sessionId, runId, text,
    profileId: 'protocol', profileDigest: hash, generation: 0, baseRevision: 0, deadlineAtMs: Date.now() + 60_000 });

test('same ST core commits full capsule once and refuses reused run ID with changed input', async () => {
    let calls = 0;
    const authority = createMemoryAuthority();
    const runtime = createRuntime({ authority, host: { ...tokenizer, generate: async () => { calls++; return completion('Hello back'); } } });
    await runtime.prepareSession(input());
    const req = request();
    const result = await runtime.runTurn(req);
    assert.equal(result.status, 'committed', JSON.stringify(result));
    assert.equal((await runtime.readSession(req)).history.at(-1).mes, 'Hello back');
    assert.equal((await runtime.runTurn(req)).status, 'committed');
    assert.equal(calls, 1);
    await assert.rejects(runtime.runTurn({ ...req, text: 'different' }), /run-identity-conflict/);
    const capsule = await authority.read(req.sessionId);
    assert.equal(capsule.input.profile.extensionSettings != null, true);
    assert.equal(capsule.input.profile.accountStorage instanceof Array, true);
    runtime.dispose();
});

test('unknown model result rehydrates original run by query without another generation', async () => {
    const authority = createMemoryAuthority(); let generations = 0; let queries = 0;
    const host = { ...tokenizer, generate: async () => { generations++; throw new Error('ack lost'); } };
    const first = createRuntime({ authority, host }); await first.prepareSession(input());
    const req = request(undefined, undefined, '{{setvar::x::42}} {{getvar::x}} {{random::red::blue}} {{roll 1d6}}');
    assert.equal((await first.runTurn(req)).status, 'suspended'); first.dispose();
    const pending = await authority.read(req.sessionId);
    assert.ok(pending.runs[0].randomSources.length > 0);
    assert.ok(pending.runs[0].diceRolls.length > 0);
    const second = createRuntime({ authority, host: { ...host, queryModel: async context => { queries++; return { status: 'complete', operationId: context.operationId, payloadDigest: context.payloadDigest, result: completion('Recovered') }; } } });
    const recovered = await second.recoverRun(req);
    assert.equal(recovered.status, 'committed', JSON.stringify(recovered));
    assert.equal(generations, 1); assert.equal(queries, 1);
    assert.equal((await second.readSession(req)).chatMetadata.variables.x, '42');
    second.dispose();
});

test('cancel returns while ignored signal remains bounded and late result cannot commit', async () => {
    let enter; const started = new Promise(resolve => { enter = resolve; });
    let release; const stalled = new Promise(resolve => { release = resolve; });
    const authority = createMemoryAuthority();
    const runtime = createRuntime({ authority, host: { ...tokenizer, generate: () => { enter(); return stalled; } }, limits: { maxActive: 1 } });
    await runtime.prepareSession(input()); const req = request(); const turn = runtime.runTurn(req); await started;
    const cancelled = await runtime.cancelRun(req); assert.equal(cancelled.status, 'cancelled');
    assert.equal((await turn).status, 'cancelled');
    assert.equal(runtime.inspect().active, 0); assert.equal(runtime.inspect().external, 1);
    assert.equal((await runtime.readSession(req)).history.length, 0);
    await assert.rejects(runtime.runTurn({ ...request(), runId: 'run-b' }), /runtime-capacity/);
    release(completion('too late')); await new Promise(resolve => setImmediate(resolve));
    assert.equal(runtime.inspect().external, 0);
    assert.equal((await runtime.readSession(req)).history.length, 0); runtime.dispose();
});

test('lost commit acknowledgement reads durable result without a second inference', async () => {
    const memory = createMemoryAuthority(); let lost = false; let calls = 0;
    const authority = { ...memory, async compareAndSwap(id, version, next) {
        const result = await memory.compareAndSwap(id, version, next);
        if (!lost && next.runs.at(-1)?.status === 'committed') { lost = true; throw new Error('ack lost'); }
        return result;
    } };
    const runtime = createRuntime({ authority, host: { ...tokenizer, generate: async () => { calls++; return completion('Committed'); } } });
    await runtime.prepareSession(input()); const req = request();
    assert.equal((await runtime.runTurn(req)).status, 'committed');
    assert.equal((await runtime.recoverRun(req)).status, 'committed'); assert.equal(calls, 1); runtime.dispose();
});

test('deadline is checked at delayed CAS linearization, not only by the timer', async () => {
    let stamp = Date.now();
    const memory = createMemoryAuthority({ now: () => stamp });
    const req = { ...request(), deadlineAtMs: stamp + 1000 };
    const authority = { ...memory, async compareAndSwap(id, version, next, fence) {
        if (next.runs.at(-1)?.status === 'committed') stamp = req.deadlineAtMs + 1;
        return memory.compareAndSwap(id, version, next, fence);
    } };
    const runtime = createRuntime({ authority, now: () => stamp, host: { ...tokenizer, generate: async () => completion('Too late') } });
    await runtime.prepareSession(input());
    const outcome = await runtime.runTurn(req);
    assert.equal(outcome.status, 'cancelled'); assert.equal(outcome.error, 'run-deadline');
    assert.equal((await runtime.readSession(req)).history.length, 0); runtime.dispose();
});

test('reference authority capacity and damaged capsule identity fail closed', async () => {
    const memory = createMemoryAuthority({ maxSessions: 1 });
    const host = { ...tokenizer, generate: async () => completion('unused') };
    assert.throws(() => createRuntime({ authority: memory, host, limits: { invented: 1 } }), /invalid-runtime-limit/);
    const runtime = createRuntime({ authority: memory, host }); await runtime.prepareSession(input());
    await assert.rejects(runtime.prepareSession(input('session-b')), /session-capacity/);
    const capsule = await memory.read('session-a');
    for (const mutate of [value => { value.createdAtMs = null; }, value => { value.capsuleVersion = 999; }, value => { value.sessionId = 'session-b'; }]) {
        const bad = structuredClone(capsule); mutate(bad);
        const damaged = createRuntime({ authority: { ...memory, read: async () => bad }, host });
        await assert.rejects(damaged.readSession({ sessionId: 'session-a' })); damaged.dispose();
    }
    runtime.dispose();
});
