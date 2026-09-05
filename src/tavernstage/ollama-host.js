import tiktoken from 'tiktoken';
import { countOpenAI, countTiktokenMessages } from '../../public/scripts/tavernstage/token-count.js';
import { createCore as createUtils } from '../../public/scripts/tavernstage/scripts-utils.js';
import { excludeKeysByYaml } from '../util.js';
import { chatCompletionBody, customBodyParameters } from './request-body.js';

/** Explicit local G1 adapter. Construction performs no network or user-file reads. */
export function createOllamaHost({ baseUrl, model, modelDigest, timeoutMs = 240_000, onExchange }, fetcher = globalThis.fetch) {
    const base = new URL(baseUrl);
    if (base.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(base.hostname)
        || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
        throw new TypeError('An explicit literal-loopback Ollama origin is required');
    }
    if (model !== 'qwen3.6:latest' || !/^[a-f0-9]{64}$/.test(modelDigest)) {
        throw new TypeError('G1 host requires the explicitly selected qwen3.6 model and digest');
    }
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000) throw new TypeError('Invalid deadline');
    const tokenizerModel = 'gpt-3.5-turbo'; // Original ST custom qwen3.6 fallback, not a claim of Qwen token accuracy.
    const tokenizer = tiktoken.encoding_for_model(tokenizerModel);
    const { getStringHash } = createUtils({ Math });
    const cache = Object.create(null);
    let disposed = false;
    const assertLive = () => { if (disposed) throw new Error('Ollama host disposed'); };
    const countMessages = async (messages, full = false) => {
        assertLive();
        return countOpenAI(messages, full, {
            getModel: () => tokenizerModel, cache, hash: getStringHash,
            countOne: message => countTiktokenMessages([message], tokenizerModel, tokenizer, () => {}),
        });
    };
    return {
        tokenizerName: tokenizerModel,
        countMessages,
        countText: async (text, padding, { powerUser }) => {
            assertLive();
            if (typeof text !== 'string' || !text.length) return 0;
            // ST uses UTF-8 estimation only for its OpenAI shadow prompt, not world-info budgeting.
            if (padding === powerUser.token_padding) return Math.ceil(new TextEncoder().encode(text).length / 3.35) + (padding ?? 0);
            return countMessages({ role: 'system', content: text }, true);
        },
        generate: async (data, { signal } = {}) => {
            assertLive();
            signal?.throwIfAborted();
            if (data.chat_completion_source !== 'custom' || data.model !== model || data.stream
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
            if (body.model !== model || body.stream !== false || body.response_format || body.json_schema || !Array.isArray(body.messages)
                || body.messages.some(message => typeof message.content !== 'string' && message.content !== null
                    && !(message.role === 'assistant' && message.content === undefined && Array.isArray(message.tool_calls) && message.tool_calls.length))) {
                throw new Error('Final request violates the fixed model/non-streaming text boundary');
            }
            const boundedSignal = AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])]);
            const tagsResponse = await fetcher(new URL('/api/tags', base), { signal: boundedSignal, redirect: 'error' });
            if (!tagsResponse.ok) throw new Error(`Ollama model inspection failed: ${tagsResponse.status}`);
            const tags = await tagsResponse.json();
            if (!tags.models?.some(entry => entry.name === model && entry.digest === modelDigest)) throw new Error('Ollama model digest changed');
            boundedSignal.throwIfAborted();
            const response = await fetcher(new URL('/v1/chat/completions', base), {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, redirect: 'error',
                body: JSON.stringify(body), signal: boundedSignal,
            });
            if (!response.ok) throw new Error(`Ollama generation failed: ${response.status}`);
            const result = await response.json();
            boundedSignal.throwIfAborted();
            if (!Array.isArray(result.choices) || !result.choices.length) throw new Error('Invalid Ollama chat response');
            await onExchange?.({ request: structuredClone(body), response: structuredClone(result) });
            return result;
        },
        dispose: () => { if (!disposed) { disposed = true; tokenizer.free(); } },
    };
}
