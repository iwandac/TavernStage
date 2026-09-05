// Extracted from ST's chat-completions backend; shared by Express and Node hosts.
import { mergeObjectWithYaml } from '../util.js';

export function customBodyParameters(body, isTextCompletion) {
    const bodyParams = { logprobs: body.logprobs, top_logprobs: undefined };
    if (!isTextCompletion && bodyParams.logprobs > 0) {
        bodyParams.top_logprobs = bodyParams.logprobs;
        bodyParams.logprobs = true;
    }
    mergeObjectWithYaml(bodyParams, body.custom_include_body);
    return bodyParams;
}

export function chatCompletionBody(body, isTextCompletion, textPrompt, bodyParams) {
    return {
        messages: isTextCompletion === false ? body.messages : undefined,
        prompt: isTextCompletion === true ? textPrompt : undefined,
        model: body.model,
        temperature: body.temperature,
        max_tokens: body.max_tokens,
        max_completion_tokens: body.max_completion_tokens,
        stream: body.stream,
        presence_penalty: body.presence_penalty,
        frequency_penalty: body.frequency_penalty,
        top_p: body.top_p,
        top_k: body.top_k,
        stop: isTextCompletion === false ? body.stop : undefined,
        logit_bias: body.logit_bias,
        seed: body.seed,
        n: body.n,
        ...bodyParams,
    };
}
