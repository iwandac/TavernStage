// Extracted from ST public/scripts/tokenizers.js and src/endpoints/tokenizers.js.
// Both original hosts and the Node adapter call these same algorithms.
export async function countOpenAI(messages, full, { getModel, cache, hash, countOne }) {
    if (!Array.isArray(messages)) messages = [messages];
    let token_count = -1;
    for (const message of messages) {
        const model = getModel();
        if (model === 'claude') full = true;
        const cacheKey = `${model}-${hash(JSON.stringify(message))}`;
        const cachedCount = cache[cacheKey];
        if (typeof cachedCount === 'number') {
            token_count += cachedCount;
        } else {
            const count = Number(await countOne(message));
            token_count += count;
            cache[cacheKey] = count;
        }
    }
    if (!full) token_count -= 2;
    return token_count;
}

export function countTiktokenMessages(messages, queryModel, tokenizer, warn) {
    let num_tokens = 0;
    const tokensPerName = queryModel.includes('gpt-3.5-turbo-0301') ? -1 : 1;
    const tokensPerMessage = queryModel.includes('gpt-3.5-turbo-0301') ? 4 : 3;
    for (const msg of messages) {
        try {
            num_tokens += tokensPerMessage;
            for (const [key, value] of Object.entries(msg)) {
                num_tokens += tokenizer.encode(value).length;
                if (key == 'name') num_tokens += tokensPerName;
            }
        } catch {
            warn('Error tokenizing message:', msg);
        }
    }
    num_tokens += 3;
    // Preserve ST's 0301 compatibility padding, including partial encoding failure.
    if (queryModel.includes('gpt-3.5-turbo-0301')) num_tokens += 9;
    return num_tokens;
}
