import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOllamaHost } from '../../src/tavernstage/ollama-host.js';
import { chatCompletionBody, customBodyParameters } from '../../src/tavernstage/request-body.js';
import { countOpenAI, countTiktokenMessages } from '../../public/scripts/tavernstage/token-count.js';
import { getRuntimeErrorCode } from '../../src/tavernstage/runtime-errors.js';

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

const tags = () => response({ models: [{ name: options.model, digest: options.modelDigest }] });
const completion = (reason = 'stop') => response({ choices: [{ message: { role: 'assistant', content: 'accepted' }, finish_reason: reason }] });
const stream = (text, reason) => new Response(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: text } }] })}\n\n`
    + (reason ? `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: reason }] })}\n\ndata: [DONE]\n\n` : ''),
{ headers: { 'Content-Type': 'text/event-stream' } });

test('length succeeds once for streaming and non-streaming even with retries enabled', async () => {
    for (const streaming of [false, true]) {
        let generations = 0, exchanges = 0;
        const host = createOllamaHost({ ...options, maxRetries: 2, onExchange() { exchanges++; } }, async url => {
            if (url.pathname === '/api/tags') return tags();
            generations++;
            return streaming ? stream('accepted', 'length') : completion('length');
        });
        try {
            const result = await host.generate({ ...request(), stream: streaming });
            assert.equal(result.choices[0].finish_reason, 'length');
            assert.equal(result.choices[0].message.content, 'accepted');
            assert.equal(generations, 1); assert.equal(exchanges, 1);
        } finally { host.dispose(); }
    }
});

test('transient failures retry at most twice and commit hook sees only final success', async () => {
    let generations = 0, exchanges = 0;
    const host = createOllamaHost({ ...options, maxRetries: 2, onExchange() { exchanges++; } }, async url => {
        if (url.pathname === '/api/tags') return tags();
        if (++generations === 1) return new Response('', { status: 429 });
        if (generations === 2) throw new TypeError('fetch failed');
        return completion();
    });
    try {
        await host.generate(request());
        assert.equal(generations, 3); assert.equal(exchanges, 1);
    } finally { host.dispose(); }
});

test('retry replaces interrupted draft only when the replacement produces content', async () => {
    const drafts = []; let generations = 0;
    const host = createOllamaHost({ ...options, maxRetries: 2 }, async url => {
        if (url.pathname === '/api/tags') return tags();
        if (++generations === 1) return stream('old partial');
        assert.deepEqual(drafts, ['old partial']);
        return stream('new response', 'stop');
    });
    try {
        const result = await host.generate({ ...request(), stream: true }, { onDraft: draft => drafts.push(draft.text) });
        assert.deepEqual(drafts, ['old partial', 'new response']);
        assert.equal(result.choices[0].message.content, 'new response');
        assert.equal(generations, 2);
    } finally { host.dispose(); }
});

test('default is no retry; enabled retries stop after three attempts with safe code', async () => {
    for (const retries of [undefined, 2]) {
        let calls = 0;
        const host = createOllamaHost({ ...options, maxRetries: retries }, async () => { calls++; return new Response('', { status: 503 }); });
        try {
            await assert.rejects(host.generate(request()), error => getRuntimeErrorCode(error) === 'provider-unavailable');
            assert.equal(calls, retries === 2 ? 3 : 1);
        } finally { host.dispose(); }
    }
});

test('cancellation during retry backoff sends no further request', async () => {
    let calls = 0; const controller = new AbortController(); let timer;
    const host = createOllamaHost({ ...options, maxRetries: 2 }, async () => {
        calls++; timer = setTimeout(() => controller.abort(), 30);
        return new Response('', { status: 503 });
    });
    try {
        await assert.rejects(host.generate(request(), { signal: controller.signal }), error => getRuntimeErrorCode(error) === 'runtime-cancelled');
        assert.equal(calls, 1);
    } finally { clearTimeout(timer); host.dispose(); }
});

test('one deadline includes attempts and backoff rather than resetting per request', async () => {
    let calls = 0; const start = Date.now();
    const host = createOllamaHost({ ...options, maxRetries: 2, timeoutMs: 320 }, async () => {
        calls++; return new Response('', { status: 503 });
    });
    try {
        await assert.rejects(host.generate(request()), error => getRuntimeErrorCode(error) === 'runtime-timeout');
        assert.equal(calls, 2);
        assert.ok(Date.now() - start < 900);
    } finally { host.dispose(); }
});

test('digest, invalid JSON/schema, resource limits and HTTP client rejection do not retry', async () => {
    for (const bad of [() => response({ models: [] }), () => new Response('bad json'),
        () => response({ models: 'invalid' }), () => new Response('x'.repeat(1024 * 1024 + 1)),
        () => new Response('', { status: 400 })]) {
        let calls = 0;
        const host = createOllamaHost({ ...options, maxRetries: 2 }, async () => { calls++; return bad(); });
        try {
            await assert.rejects(host.generate(request()));
            assert.equal(calls, 1);
        } finally { host.dispose(); }
    }
    assert.throws(() => createOllamaHost({ ...options, maxRetries: 3 }), /retry limit/);
});

test('broken stream transport retries but malformed protocol and output budget do not', async () => {
    for (const kind of ['broken', 'malformed', 'oversized']) {
        let generations = 0;
        const host = createOllamaHost({ ...options, maxRetries: 2 }, async url => {
            if (url.pathname === '/api/tags') return tags();
            if (++generations > 1) return stream('recovered', 'stop');
            if (kind === 'broken') return new Response(new ReadableStream({ start(controller) { controller.error(new TypeError('terminated')); } }), { headers: { 'Content-Type': 'text/event-stream' } });
            if (kind === 'malformed') return new Response('data: invalid JSON\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
            return stream('x'.repeat(16 * 1024 + 1), 'stop');
        });
        try {
            const task = host.generate({ ...request(), stream: true });
            if (kind === 'broken') {
                assert.equal((await task).choices[0].message.content, 'recovered');
                assert.equal(generations, 2);
            } else {
                await assert.rejects(task, error => getRuntimeErrorCode(error) === (kind === 'oversized' ? 'resource-limit' : 'invalid-response'));
                assert.equal(generations, 1);
            }
        } finally { host.dispose(); }
    }
});

test('deadline cancels stalled streaming response without retry or draft erasure', async () => {
    let generations = 0, cancelled = false; const drafts = [];
    const host = createOllamaHost({ ...options, maxRetries: 2, timeoutMs: 80 }, async url => {
        if (url.pathname === '/api/tags') return tags();
        generations++;
        return new Response(new ReadableStream({ start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"choices":[{"index":0,"delta":{"content":"partial"}}]}\n\n'));
        }, cancel() { cancelled = true; } }), { headers: { 'Content-Type': 'text/event-stream' } });
    });
    try {
        await assert.rejects(host.generate({ ...request(), stream: true }, { onDraft: draft => drafts.push(draft.text) }), error => getRuntimeErrorCode(error) === 'runtime-timeout');
        assert.equal(generations, 1); assert.equal(cancelled, true);
        assert.deepEqual(drafts, ['partial']);
    } finally { host.dispose(); }
});

test('successful inference is never repeated when the exchange hook fails', async () => {
    let generations = 0;
    const host = createOllamaHost({ ...options, maxRetries: 2, onExchange() { throw new TypeError('receipt unavailable'); } }, async url => {
        if (url.pathname === '/api/tags') return tags();
        generations++; return completion();
    });
    try {
        await assert.rejects(host.generate(request()), /receipt unavailable/);
        assert.equal(generations, 1);
    } finally { host.dispose(); }
});
