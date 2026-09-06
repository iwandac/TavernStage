import tiktoken from 'tiktoken';
import { countOpenAI, countTiktokenMessages } from '../../public/scripts/tavernstage/token-count.js';
import { createCore as createUtils } from '../../public/scripts/tavernstage/scripts-utils.js';
import { excludeKeysByYaml } from '../util.js';
import { chatCompletionBody, customBodyParameters } from './request-body.js';
import { readChatStream } from './stream-response.js';
import { getRuntimeErrorCode, RuntimeTransportError } from './runtime-errors.js';
import { setTimeout as delay } from 'node:timers/promises';

/** Explicit local G1 adapter. Construction performs no network or user-file reads. */
export function createOllamaHost({ baseUrl, model, modelDigest, timeoutMs = 240_000, maxRetries = 0, onExchange }, fetcher = globalThis.fetch) {
    const base = new URL(baseUrl);
    if (base.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(base.hostname)
        || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
        throw new TypeError('An explicit literal-loopback Ollama origin is required');
    }
    if (model !== 'qwen3.6:latest' || !/^[a-f0-9]{64}$/.test(modelDigest)) {
        throw new TypeError('G1 host requires the explicitly selected qwen3.6 model and digest');
    }
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000) throw new TypeError('Invalid deadline');
    if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 2) throw new TypeError('Invalid retry limit');
    const tokenizerModel = 'gpt-3.5-turbo'; // Original ST custom qwen3.6 fallback, not a claim of Qwen token accuracy.
    const tokenizer = tiktoken.encoding_for_model(tokenizerModel);
    const { getStringHash } = createUtils({ Math });
    const cache = Object.create(null);
    let disposed = false;
    const assertLive = () => { if (disposed) throw new Error('Ollama host disposed'); };
    const countMessages = async (messages, full = false) => {
        assertLive();
        if (Object.keys(cache).length > 1024) for (const key of Object.keys(cache)) delete cache[key];
        return countOpenAI(messages, full, {
            getModel: () => tokenizerModel, cache, hash: getStringHash,
            countOne: message => countTiktokenMessages([message], tokenizerModel, tokenizer, () => {}),
        });
    };
    return {
        supportsStreaming: true,
        tokenizerName: tokenizerModel,
        countMessages,
        countText: async (text, padding, { powerUser }) => {
            assertLive();
            if (typeof text !== 'string' || !text.length) return 0;
            // ST uses UTF-8 estimation only for its OpenAI shadow prompt, not world-info budgeting.
            if (padding === powerUser.token_padding) return Math.ceil(new TextEncoder().encode(text).length / 3.35) + (padding ?? 0);
            return countMessages({ role: 'system', content: text }, true);
        },
        generate: async (data, { signal, onDraft, parseToolCalls } = {}) => {
            assertLive();
            signal?.throwIfAborted();
            if (data.chat_completion_source !== 'custom' || data.model !== model || typeof data.stream !== 'boolean'
                || data.custom_prompt_post_processing || data.json_schema || data.custom_include_headers) {
                throw new Error('Unsupported G1 transport profile; no request was sent');
            }
            const bodyParams = customBodyParameters(data, false);
            if (Array.isArray(data.stop) && data.stop.length) bodyParams.stop = data.stop;
            if (Array.isArray(data.tools) && data.tools.length) {
                bodyParams.tools = data.tools;
                bodyParams.tool_choice = data.tool_choice;
            }
            const body = chatCompletionBody(structuredClone(data), false, '', bodyParams);
            excludeKeysByYaml(body, data.custom_exclude_body);
            if (body.model !== model || body.stream !== data.stream || body.response_format || body.json_schema || !Array.isArray(body.messages)
                || (body.n !== undefined && body.n !== 1) || (body.tools?.length > 4)
                || !Number.isInteger(body.max_tokens ?? body.max_completion_tokens)
                || (body.max_tokens ?? body.max_completion_tokens) < 1 || (body.max_tokens ?? body.max_completion_tokens) > 4096
                || body.messages.some(message => typeof message.content !== 'string' && message.content !== null
                    && !(message.role === 'assistant' && message.content === undefined && Array.isArray(message.tool_calls) && message.tool_calls.length))) {
                throw new Error('Final request violates the fixed model/non-streaming text boundary');
            }
            const deadline = new AbortController();
            const timer = setTimeout(() => deadline.abort(new RuntimeTransportError('runtime-timeout')), timeoutMs);
            const boundedSignal = AbortSignal.any([deadline.signal, ...(signal ? [signal] : [])]);
            let result;
            try {
                for (let attempt = 0; ; attempt++) {
                    try {
                        boundedSignal.throwIfAborted();
                        const tagsResponse = await fetchResponse(fetcher, new URL('/api/tags', base), { signal: boundedSignal, redirect: 'error' });
                        const tags = await readBoundedJson(tagsResponse, boundedSignal, 1024 * 1024);
                        if (!Array.isArray(tags?.models)) throw new RuntimeTransportError('invalid-response');
                        if (!tags.models.some(entry => entry?.name === model && entry.digest === modelDigest)) throw new RuntimeTransportError('model-mismatch', 'Ollama model digest changed');
                        boundedSignal.throwIfAborted();
                        const response = await fetchResponse(fetcher, new URL('/v1/chat/completions', base), {
                            method: 'POST', headers: { 'Content-Type': 'application/json' }, redirect: 'error',
                            body: JSON.stringify(body), signal: boundedSignal,
                        });
                        result = data.stream
                            ? await readChatStream(response, { signal: boundedSignal, onDraft, parseToolCalls })
                            : await readBoundedJson(response, boundedSignal, 2 * 1024 * 1024);
                        boundedSignal.throwIfAborted();
                        if (!Array.isArray(result?.choices) || result.choices.length !== 1
                            || !result.choices[0]?.message || !['stop', 'length', 'tool_calls'].includes(result.choices[0].finish_reason)) {
                            throw new RuntimeTransportError('invalid-response', 'Invalid Ollama chat response');
                        }
                        break;
                    } catch (error) {
                        if (boundedSignal.aborted) throw signal?.aborted
                            ? new RuntimeTransportError('runtime-cancelled') : new RuntimeTransportError('runtime-timeout');
                        if (attempt >= maxRetries || !['provider-unavailable', 'provider-rate-limited', 'stream-interrupted'].includes(getRuntimeErrorCode(error))) throw error;
                        // Only inference is retried. Core history, tools and receipt hooks run once,
                        // after success. Each parser owns new text; no draft clear or concatenation.
                        await delay(attempt === 0 ? 250 : 750, undefined, { signal: boundedSignal });
                    }
                }
            } catch (error) {
                if (boundedSignal.aborted) throw signal?.aborted
                    ? new RuntimeTransportError('runtime-cancelled') : new RuntimeTransportError('runtime-timeout');
                throw error;
            } finally { clearTimeout(timer); }
            await onExchange?.({ request: structuredClone(body), response: structuredClone(result) });
            return result;
        },
        dispose: () => { if (!disposed) { disposed = true; tokenizer.free(); } },
    };
}

async function fetchResponse(fetcher, url, init) {
    let response;
    try { response = await fetcher(url, init); } catch (error) {
        if (init.signal.aborted) throw init.signal.reason;
        // Redirect rejection is a boundary violation, not a transient outage.
        if (/redirect/i.test(`${error?.message} ${error?.cause?.message}`)) throw new RuntimeTransportError('invalid-response');
        if (error instanceof TypeError || ['ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ETIMEDOUT'].includes(error?.code)) throw new RuntimeTransportError('provider-unavailable');
        throw error;
    }
    if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        throw new RuntimeTransportError(response.status === 429 ? 'provider-rate-limited'
            : response.status >= 500 ? 'provider-unavailable' : 'invalid-response');
    }
    return response;
}

async function readBoundedJson(response, signal, maxBytes) {
    if (!response.body) throw new RuntimeTransportError('invalid-response', 'Missing response body');
    const reader = response.body.getReader();
    const chunks = []; let bytes = 0;
    const cancel = () => { void reader.cancel(signal.reason).catch(() => {}); };
    signal.addEventListener('abort', cancel, { once: true });
    try {
        while (true) {
            signal.throwIfAborted();
            let item;
            try { item = await reader.read(); } catch { throw new RuntimeTransportError('stream-interrupted'); }
            signal.throwIfAborted();
            if (item.done) break;
            bytes += item.value.byteLength;
            if (bytes > maxBytes) throw new RuntimeTransportError('resource-limit', 'Response byte budget exceeded');
            chunks.push(item.value);
        }
        try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
        catch { throw new RuntimeTransportError('invalid-response'); }
    } finally { signal.removeEventListener('abort', cancel); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
