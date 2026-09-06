const CODES = new Set(['runtime-timeout', 'runtime-cancelled', 'provider-unavailable',
    'provider-rate-limited', 'stream-interrupted', 'invalid-response', 'model-mismatch', 'resource-limit']);

/** Safe transport classification; messages never contain provider bodies or user input. */
export class RuntimeTransportError extends Error {
    constructor(code, message = code) {
        super(message);
        this.name = 'RuntimeTransportError';
        this.code = CODES.has(code) ? code : 'runtime-failed';
    }
}

export function getRuntimeErrorCode(error) {
    if (error instanceof RuntimeTransportError) return error.code;
    if (error?.name === 'TimeoutError') return 'runtime-timeout';
    if (error?.name === 'AbortError') return 'runtime-cancelled';
    return 'runtime-failed';
}
