import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOllamaHost } from '../../src/tavernstage/ollama-host.js';
import { chatCompletionBody, customBodyParameters } from '../../src/tavernstage/request-body.js';
import { countOpenAI, countTiktokenMessages } from '../../public/scripts/tavernstage/token-count.js';

const options = { baseUrl: 'http://127.0.0.1:11434', model: 'qwen3.6:latest', modelDigest: 'a'.repeat(64) };
const request = () => ({ chat_completion_source: 'custom', model: options.model, stream: false,
    messages: [{ role: 'user', content: 'Hello' }], temperature: 0, max_tokens: 32,
    custom_include_body: 'reasoning_effort: none' });
const response = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });

test('shared ST counter preserves message padding, cache and full adjustment', async () => {
    let calls = 0;
    const host = { getModel: () => 'gpt-3.5-turbo', cache: {}, hash: x => x, countOne: () => { calls++; return 8; } };
    const message = { role: 'user', content: 'Hello' };
    assert.equal(await countOpenAI([message, message], true, host), 15);
    assert.equal(await countOpenAI(message, false, host), 5);
    assert.equal(calls, 1);
    assert.equal(countTiktokenMessages([message], 'gpt-3.5-turbo', { encode: s => Array(s.length) }, assert.fail), 15);
    assert.equal(countTiktokenMessages([message], 'gpt-3.5-turbo-0301', { encode: s => Array(s.length) }, assert.fail), 25);
});

test('actual tiktoken is used for world-info, UTF8 estimate only for ST shadow prompt', async () => {
    const host = createOllamaHost(options, () => assert.fail('Tokenization must be offline'));
    try {
        assert.equal(await host.countMessages({ role: 'system', content: 'Hello' }, true), 7);
        assert.equal(await host.countText('Hello', undefined, { powerUser: { token_padding: 64 } }), 7);
        assert.equal(await host.countText('你好', 64, { powerUser: { token_padding: 64 } }), 66);
    } finally { host.dispose(); }
    await assert.rejects(host.countMessages({ role: 'user', content: 'x' }), /disposed/);
});

test('custom request body preserves ST YAML overrides and logprob conversion', () => {
    const data = { ...request(), logprobs: 3, custom_include_body: 'temperature: 0.7\nreasoning_effort: none' };
    const body = chatCompletionBody(data, false, '', customBodyParameters(data, false));
    assert.equal(body.temperature, .7);
    assert.equal(body.logprobs, true);
    assert.equal(body.top_logprobs, 3);
    assert.equal(body.reasoning_effort, 'none');
    assert.deepEqual(body.messages, data.messages);
});

test('transport validates installed model then sends one bounded, non-redirecting request', async () => {
    const calls = [];
    const host = createOllamaHost(options, async (url, init) => {
        calls.push({ url: String(url), init });
        return url.pathname === '/api/tags'
            ? response({ models: [{ name: options.model, digest: options.modelDigest }] })
            : response({ choices: [{ message: { role: 'assistant', content: 'Hello back' }, finish_reason: 'stop' }] });
    });
    try {
        const data = request();
        data.messages.push({ role: 'assistant', tool_calls: [{ id: 'call-test', type: 'function', function: { name: 'lookup', arguments: '{}' } }] });
        data.messages.push({ role: 'tool', tool_call_id: 'call-test', content: 'recorded result' });
        const result = await host.generate(data);
        assert.equal(result.choices[0].message.content, 'Hello back');
        assert.deepEqual(calls.map(x => new URL(x.url).pathname), ['/api/tags', '/v1/chat/completions']);
        assert.ok(calls.every(x => x.init.redirect === 'error' && x.init.signal instanceof AbortSignal));
        const body = JSON.parse(calls[1].init.body);
        assert.equal(body.reasoning_effort, 'none');
        assert.equal(body.chat_completion_source, undefined);
        assert.deepEqual(body.messages, data.messages);
    } finally { host.dispose(); }
});

test('remote endpoints, model substitution, unsupported media and pre-aborted work never send', async () => {
    assert.throws(() => createOllamaHost({ ...options, baseUrl: 'https://example.com' }), /loopback/);
    let calls = 0;
    const host = createOllamaHost(options, () => { calls++; assert.fail('Unexpected network request'); });
    try {
        await assert.rejects(host.generate({ ...request(), custom_include_body: 'model: other' }), /fixed model/);
        await assert.rejects(host.generate({ ...request(), messages: [{ role: 'user', content: [] }] }), /text boundary/);
        await assert.rejects(host.generate({ ...request(), custom_include_body: 'response_format: {type: json_schema, json_schema: {}}' }), /text boundary/);
        await assert.rejects(host.generate(request(), { signal: AbortSignal.abort() }), /abort/i);
        assert.equal(calls, 0);
    } finally { host.dispose(); }
});

test('changed model digest stops before any inference', async () => {
    let calls = 0;
    const host = createOllamaHost(options, async () => { calls++; return response({ models: [] }); });
    try {
        await assert.rejects(host.generate(request()), /digest changed/);
        assert.equal(calls, 1);
    } finally { host.dispose(); }
});
