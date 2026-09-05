import assert from 'node:assert/strict';
import test from 'node:test';
import { readChatStream } from '../../src/tavernstage/stream-response.js';
import { createCore } from '../../public/scripts/tavernstage/scripts-tool-calling.js';

const encoder = new TextEncoder();
const chunk = delta => `data: ${JSON.stringify({ choices: [{ index: 0, delta }] })}\r\n\r\n`;
const end = reason => `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: reason }] })}\n\n`;
const done = 'data: [DONE]\n\n';
function response(text, split = 7) {
    const bytes = encoder.encode(text);
    return new Response(new ReadableStream({ start(controller) {
        for (let i = 0; i < bytes.length; i += split) controller.enqueue(bytes.slice(i, i + split));
        controller.close();
    } }), { headers: { 'Content-Type': 'text/event-stream' } });
}

test('split UTF8 SSE preserves text and does not expose reasoning as draft', async () => {
    const drafts = [];
    const result = await readChatStream(response(chunk({ content: '你好' }) + chunk({ reasoning_content: 'private analysis' }) + chunk({ content: '世界' }) + end('stop') + done, 1), { onDraft: value => drafts.push(value) });
    assert.equal(result.choices[0].message.content, '你好世界');
    assert.equal(result.choices[0].message.reasoning, 'private analysis');
    assert.deepEqual(drafts.map(value => value.text), ['你好', '你好世界']);
});

test('shared upstream tool-delta fix retains identity and appends arguments', async () => {
    const stage = { main_api: 'openai', oai_settings: { function_calling: true, chat_completion_source: 'custom' },
        getChatCompletionModel: () => 'fixture', model_list: [], custom_prompt_post_processing_types: {},
        chat_completion_sources: { CUSTOM: 'custom' } };
    const { ToolManager } = createCore(stage);
    const call = args => ({ index: 0, id: 'call-A', type: 'function', function: { name: 'act', arguments: args } });
    const result = await readChatStream(response(chunk({ tool_calls: [call('{"x":')] }) + chunk({ tool_calls: [call('1}')] }) + end('tool_calls') + done), {
        parseToolCalls: (calls, value) => ToolManager.parseToolCalls(calls, value),
    });
    assert.deepEqual(result.choices[0].message.tool_calls, [{ index: 0, id: 'call-A', type: 'function', function: { name: 'act', arguments: '{"x":1}' } }]);
});

test('truncation, missing completion, invalid index and budgets fail closed', async () => {
    for (const text of [chunk({ content: 'partial' }), chunk({ content: 'partial' }) + end('length') + done,
        chunk({ content: 'partial' }) + done, chunk({ tool_calls: [{ index: 1_000_000 }] }) + end('tool_calls') + done]) {
        await assert.rejects(readChatStream(response(text)));
    }
    await assert.rejects(readChatStream(response(chunk({ content: 'too much' }) + end('stop') + done), { maxOutputBytes: 2 }), /budget/);
    await assert.rejects(readChatStream(response(chunk({ content: 'hello' }) + end('stop') + done), { maxBytes: 8 }), /budget/);
});

test('abort closes a stalled stream without committing its partial response', async () => {
    let cancelled = false;
    const controller = new AbortController();
    const value = new Response(new ReadableStream({ start(stream) { stream.enqueue(encoder.encode(chunk({ content: 'partial' }))); }, cancel() { cancelled = true; } }), { headers: { 'Content-Type': 'text/event-stream' } });
    const task = readChatStream(value, { signal: controller.signal, onDraft() { controller.abort(new Error('test cancellation')); } });
    await assert.rejects(task, /test cancellation/);
    assert.equal(cancelled, true);
});
