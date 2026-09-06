import { RuntimeTransportError } from './runtime-errors.js';

/** Bounded OpenAI SSE framing. Tool deltas are reduced by the shared ST parser. */
export async function readChatStream(response, { signal, parseToolCalls, onDraft,
    maxBytes = 2 * 1024 * 1024, maxFrames = 8192, maxOutputBytes = 16 * 1024 } = {}) {
    if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) throw new RuntimeTransportError('invalid-response', 'Expected an SSE response');
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let buffer = '', text = '', reasoning = '', bytes = 0, frames = 0, finish = null, done = false;
    const calls = [];
    const cancel = () => { void reader.cancel(signal.reason).catch(() => {}); };
    signal?.addEventListener('abort', cancel, { once: true });
    async function frame(source) {
        if (!source.trim()) return;
        if (++frames > maxFrames) throw new Error('SSE frame budget exceeded');
        const data = source.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
        if (!data) return;
        if (data === '[DONE]') { done = true; return; }
        if (done) throw new Error('SSE content after completion');
        const chunk = JSON.parse(data);
        if (chunk.error) throw new Error('Provider stream error');
        if (!Array.isArray(chunk.choices)) throw new Error('Invalid SSE choices');
        for (const choice of chunk.choices) {
            if (choice.index !== 0) throw new Error('Unsupported SSE choice index');
            if (choice.finish_reason != null) finish = choice.finish_reason;
            const delta = choice.delta ?? {};
            if (delta.content != null && typeof delta.content !== 'string') throw new Error('Unsupported stream content');
            if (typeof delta.content === 'string') text += delta.content;
            if (typeof delta.reasoning === 'string') reasoning += delta.reasoning;
            if (typeof delta.reasoning_content === 'string') reasoning += delta.reasoning_content;
            if (Buffer.byteLength(text) > maxOutputBytes || Buffer.byteLength(reasoning) > maxOutputBytes) throw new Error('Stream output budget exceeded');
            if (delta.tool_calls) {
                if (!Array.isArray(delta.tool_calls) || delta.tool_calls.length > 4 || typeof parseToolCalls !== 'function'
                    || delta.tool_calls.some(call => !Number.isInteger(call.index) || call.index < 0 || call.index >= 4)) throw new Error('Invalid streaming tool delta');
                parseToolCalls(calls, chunk);
            }
            // Content only. Hidden reasoning and tool parameters never become
            // presentation drafts; final ST regex/cleanup still runs normally.
            if (delta.content) await onDraft?.({ text, provisional: true });
        }
    }
    try {
        while (!done) {
            signal?.throwIfAborted();
            let item;
            try { item = await reader.read(); } catch { throw new RuntimeTransportError('stream-interrupted'); }
            signal?.throwIfAborted();
            if (item.done) { buffer += decoder.decode(); break; }
            bytes += item.value.byteLength;
            if (bytes > maxBytes) throw new Error('SSE byte budget exceeded');
            buffer += decoder.decode(item.value, { stream: true });
            buffer = buffer.replaceAll('\r\n', '\n');
            if (buffer.length > 128 * 1024 && !buffer.includes('\n\n')) throw new Error('SSE frame too large');
            let end;
            while ((end = buffer.indexOf('\n\n')) >= 0) {
                const source = buffer.slice(0, end); buffer = buffer.slice(end + 2);
                await frame(source);
            }
        }
        if (buffer.trim()) await frame(buffer);
        if (!done || finish == null) throw new RuntimeTransportError('stream-interrupted', 'Incomplete model stream');
        if (!['stop', 'length', 'tool_calls'].includes(finish)) throw new RuntimeTransportError('invalid-response', 'Unsupported model completion');
        const message = { role: 'assistant', content: text };
        if (reasoning) message.reasoning = reasoning;
        if (calls[0]?.length) message.tool_calls = calls[0];
        return { choices: [{ index: 0, message, finish_reason: finish }] };
    } catch (error) {
        if (signal?.aborted) throw signal.reason;
        if (error instanceof RuntimeTransportError) throw error;
        if (/budget|frame too large/.test(error?.message)) throw new RuntimeTransportError('resource-limit', 'Stream resource budget exceeded');
        throw new RuntimeTransportError('invalid-response', 'Invalid model stream');
    } finally {
        signal?.removeEventListener('abort', cancel);
        await reader.cancel().catch(() => {}); reader.releaseLock();
    }
}
