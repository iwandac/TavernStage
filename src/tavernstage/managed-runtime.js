import { createHash, randomUUID } from 'node:crypto';
import seedrandom from 'seedrandom';
import droll from 'droll';
import { createSession, runTurn as runCore, exportSession, disposeSession } from './runtime.js';

const clone = value => structuredClone(value);
const bytes = value => Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const terminal = new Set(['committed', 'cancelled', 'failed']);
const DAY = 86_400_000;
const CAPSULE_VERSION = 1;
const fail = (code) => Object.assign(new Error(code), { code });
const identity = value => typeof value === 'string' && /^[\w.:-]{1,128}$/.test(value);

// This is a reference contract adapter, not a durable database. Production hosts
// must preserve CAS atomicity and retired session IDs across process restarts.
export function createMemoryAuthority({ maxSessions = 32, now = Date.now } = {}) {
    if (!Number.isInteger(maxSessions) || maxSessions < 1 || maxSessions > 32) throw fail('invalid-session-limit');
    const records = new Map();
    return {
        async read(id) { return clone(records.get(id) ?? null); },
        async create(value) {
            if (records.has(value.sessionId)) return false;
            if (records.size >= maxSessions) throw fail('session-capacity');
            records.set(value.sessionId, clone(value)); return true;
        },
        async compareAndSwap(id, expectedVersion, next, fence = {}) {
            const current = records.get(id);
            if (!current || current.version !== expectedVersion || next.sessionId !== id
                || next.version !== expectedVersion + 1 || next.generation < current.generation
                || current.deleted || (fence.generation !== undefined && current.generation !== fence.generation)
                || (fence.revision !== undefined && current.revision !== fence.revision)
                || (fence.deadlineAtMs !== undefined && now() >= fence.deadlineAtMs)) return false;
            records.set(id, clone(next)); return true;
        },
    };
}

/**
 * Explicit durable-host orchestration around the SAME ST Generate/tool loop.
 * The host owns authorization, CAS, transport, tool receipts and deletion fences.
 * Recovery replays only journaled responses; an ambiguous external result is
 * queried by its original operation ID, never inferred or submitted again.
 */
export function createRuntime({ authority, host, tools = {}, now = Date.now, limits = {} }) {
    for (const name of ['read', 'create', 'compareAndSwap']) if (typeof authority?.[name] !== 'function') throw fail('authority-port-required');
    for (const name of ['generate', 'countText', 'countMessages']) if (typeof host?.[name] !== 'function') throw fail('model-host-required');
    if (host.interceptors?.length) throw fail('unversioned-interceptors-not-recoverable');
    const toolDefinitions = clone(tools.definitions ?? []);
    if (!Array.isArray(toolDefinitions) || toolDefinitions.length > 4 || toolDefinitions.some(tool => !identity(tool.name)
        || typeof tool.description !== 'string' || !tool.parameters || typeof tool.parameters !== 'object'
        || Object.keys(tool).some(key => !['name', 'description', 'parameters', 'displayName'].includes(key)))) throw fail('invalid-tool-definitions');
    const toolsDigest = digest(toolDefinitions);
    const budget = { maxActive: 8, maxRuns: 128, maxCapsuleBytes: 2 * 1024 * 1024,
        maxInputBytes: 32 * 1024, maxOutputBytes: 16 * 1024, maxHistory: 128,
        maxHistoryBytes: 256 * 1024, maxTools: 4, maxDeadlineMs: 300_000, ...limits };
    const ceilings = { maxActive: 8, maxRuns: 128, maxCapsuleBytes: 2 * 1024 * 1024,
        maxInputBytes: 32 * 1024, maxOutputBytes: 16 * 1024, maxHistory: 128,
        maxHistoryBytes: 256 * 1024, maxTools: 4, maxDeadlineMs: 300_000 };
    for (const [key, value] of Object.entries(budget)) if (!Object.hasOwn(ceilings, key) || !Number.isInteger(value) || value < 1 || value > ceilings[key]) throw fail('invalid-runtime-limit');
    const active = new Map();
    const external = new Set();
    let closed = false;
    const checked = value => {
        if (!value || value.capsuleVersion !== CAPSULE_VERSION || !identity(value.sessionId)
            || !identity(value.profileId) || !/^[a-f0-9]{64}$/.test(value.profileDigest)
            || !Number.isSafeInteger(value.version) || value.version < 0 || !Number.isSafeInteger(value.revision) || value.revision < 0
            || !Number.isSafeInteger(value.generation) || value.generation < 0 || !Array.isArray(value.runs)
            || value.runs.length > budget.maxRuns || bytes(value) > budget.maxCapsuleBytes) throw fail('invalid-capsule');
        if (value.deleted) throw fail('session-revoked');
        if (!Number.isSafeInteger(value.createdAtMs) || value.createdAtMs < 0
            || !Number.isSafeInteger(value.expiresAtMs) || value.expiresAtMs <= now()
            || value.expiresAtMs > value.createdAtMs + 7 * DAY) throw fail('session-expired');
        validateInput(value.input);
        if (value.toolsDigest !== toolsDigest) throw fail('tool-profile-mismatch');
        if (new Set(value.runs.map(run => run.runId)).size !== value.runs.length) throw fail('duplicate-run-capsule');
        for (const run of value.runs) {
            if (!identity(run.runId) || !Number.isSafeInteger(run.baseRevision) || run.baseRevision < 0
                || !Number.isFinite(run.deadlineAtMs) || typeof run.text !== 'string' || bytes(run.text) > budget.maxInputBytes
                || !['running', 'suspended', 'committed', 'cancelled', 'failed'].includes(run.status)
                || !['normal', 'regenerate', 'continue', 'swipe'].includes(run.type)
                || !['prepared', 'model-pending', 'model-complete', 'tool-pending', 'tool-complete', 'commit-pending', 'terminal'].includes(run.phase)
                || !identity(run.executionId) || !identity(run.seed) || !Number.isSafeInteger(run.clock) || run.clock < 0
                || !Array.isArray(run.diceRolls) || run.diceRolls.length > 256
                || !Array.isArray(run.randomSources) || run.randomSources.length > 1024
                || !Array.isArray(run.journal) || run.journal.length > 16
                || run.journal.some(entry => !['model', 'tool'].includes(entry.kind)
                    || !['pending', 'complete'].includes(entry.status) || !/^[a-f0-9]{64}$/.test(entry.payloadDigest)
                    || typeof entry.operationId !== 'string' || (entry.status === 'complete' && !Object.hasOwn(entry, 'result')))) throw fail('invalid-run-capsule');
        }
        return value;
    };
    function validateInput(input) {
        if (!input || !Array.isArray(input.history) || input.history.length > budget.maxHistory
            || bytes(input.history) > budget.maxHistoryBytes || bytes(input.character) > 1024 * 1024
            || !Number.isInteger(input.profile?.settings?.openai_max_tokens)
            || input.profile.settings.openai_max_tokens < 1 || input.profile.settings.openai_max_tokens > 4096) throw fail('invalid-session-input');
    }
    async function read(id) {
        if (!identity(id)) throw fail('invalid-session-id');
        const value = await authority.read(id);
        if (!value) throw fail('session-unavailable');
        if (value.sessionId !== id) throw fail('session-identity-mismatch');
        return checked(value);
    }
    async function save(current, next) {
        next.version = current.version + 1;
        checked(next);
        const executing = next.runs.find(run => run.status === 'running'
            || (run.status === 'committed' && current.runs.find(old => old.runId === run.runId)?.status !== 'committed'));
        // The host checks these at the atomic linearization point, not merely
        // when this asynchronous call starts. Cancellation/unknown-result
        // journal writes remain possible after the execution deadline.
        const fence = { generation: current.generation, revision: current.revision,
            ...(executing ? { deadlineAtMs: Math.min(executing.deadlineAtMs, current.expiresAtMs) } : {}) };
        if (!await authority.compareAndSwap(current.sessionId, current.version, clone(next), fence)) throw fail('session-conflict');
        return next;
    }
    function assertFence(capsule, request) {
        if (capsule.generation !== request.generation || capsule.profileId !== request.profileId
            || capsule.profileDigest !== request.profileDigest) throw fail('stale-run-fence');
    }
    function result(capsule, run) {
        return clone({ sessionId: capsule.sessionId, runId: run.runId, status: run.status,
            phase: run.phase, revision: capsule.revision, generation: capsule.generation,
            reply: run.status === 'committed' ? run.reply : undefined, error: run.error,
            pending: run.journal.filter(entry => entry.status === 'pending').map(({ kind, operationId }) => ({ kind, operationId })) });
    }
    async function prepareSession({ sessionId, profileId, profileDigest, generation = 0, expiresAtMs = now() + DAY, ...input }) {
        if (closed) throw fail('runtime-closed');
        const stamp = now();
        const capsule = checked({ capsuleVersion: CAPSULE_VERSION, version: 0, sessionId, profileId, profileDigest,
            generation, revision: 0, createdAtMs: stamp, expiresAtMs: Math.min(expiresAtMs, stamp + DAY),
            input: { ...clone(input), id: sessionId, history: clone(input.history ?? []) }, toolsDigest, runs: [], deleted: false });
        // Validate actual core construction before accepting durable input.
        const probe = createSession(capsule.input, host); disposeSession(probe);
        if (!await authority.create(clone(capsule))) throw fail('session-already-exists');
        return { sessionId, revision: 0, generation, profileId, profileDigest, expiresAtMs: capsule.expiresAtMs };
    }
    async function readRun({ sessionId, runId }) {
        const capsule = await read(sessionId);
        const run = capsule.runs.find(value => value.runId === runId);
        if (!run) throw fail('run-unavailable');
        return result(capsule, run);
    }
    async function execute(request, recover) {
        if (closed) throw fail('runtime-closed');
        if (!identity(request.runId) || !Number.isSafeInteger(request.baseRevision)
            || !Number.isFinite(request.deadlineAtMs) || request.deadlineAtMs > now() + budget.maxDeadlineMs) throw fail('invalid-run');
        if (active.has(request.sessionId)) throw fail('session-busy');
        if (active.size >= budget.maxActive || external.size >= budget.maxActive) throw fail('runtime-capacity');
        // Reserve synchronously before the first await, so simultaneous callers
        // cannot both pass the in-process capacity/one-session guard.
        const controller = new AbortController();
        const executionId = randomUUID();
        active.set(request.sessionId, { controller, runId: request.runId });
        let session, timer, capsule, run;
        const readCurrent = async () => {
            const current = await read(request.sessionId); assertFence(current, request);
            const currentRun = current.runs.find(value => value.runId === request.runId);
            if (!currentRun || terminal.has(currentRun.status) || currentRun.executionId !== executionId) throw fail('run-no-longer-active');
            controller.signal.throwIfAborted();
            if (now() >= request.deadlineAtMs) throw fail('run-deadline');
            return { current, currentRun };
        };
        const updateRun = async mutate => {
            const { current, currentRun } = await readCurrent();
            const next = clone(current); const nextRun = next.runs.find(value => value.runId === request.runId);
            mutate(nextRun, next, currentRun);
            capsule = await save(current, next); run = nextRun;
        };
        const abortable = async promise => {
            controller.signal.throwIfAborted();
            let abort;
            const cancellation = new Promise((_, reject) => { abort = () => reject(controller.signal.reason ?? fail('run-cancelled')); controller.signal.addEventListener('abort', abort, { once: true }); });
            try { return await Promise.race([promise, cancellation]); }
            finally { controller.signal.removeEventListener('abort', abort); }
        };
        const callHost = fn => {
            controller.signal.throwIfAborted();
            if (now() >= request.deadlineAtMs) throw fail('run-deadline');
            if (external.size >= budget.maxActive) throw fail('external-capacity');
            const work = Promise.resolve().then(() => { controller.signal.throwIfAborted(); if (now() >= request.deadlineAtMs) throw fail('run-deadline'); return fn(); });
            external.add(work);
            void work.finally(() => external.delete(work)).catch(() => {});
            return abortable(work);
        };
        try {
            capsule = await read(request.sessionId); assertFence(capsule, request);
            run = capsule.runs.find(value => value.runId === request.runId);
            if (run) {
                if (run.baseRevision !== request.baseRevision || run.deadlineAtMs !== request.deadlineAtMs) throw fail('run-identity-conflict');
                if ((request.text !== undefined && request.text !== run.text) || (request.type !== undefined && request.type !== run.type)) throw fail('run-identity-conflict');
                if (terminal.has(run.status) || !recover) return result(capsule, run);
                const next = clone(capsule);
                run = next.runs.find(value => value.runId === request.runId);
                run.executionId = executionId;
                capsule = await save(capsule, next);
            } else {
                if (recover) throw fail('run-unavailable');
                if (capsule.revision !== request.baseRevision) throw fail('stale-base-revision');
                if (capsule.runs.some(value => !terminal.has(value.status))) throw fail('session-busy');
                if (capsule.runs.length >= budget.maxRuns) throw fail('run-ledger-full');
                if (typeof request.text !== 'string' || bytes(request.text) > budget.maxInputBytes
                    || !['normal', 'regenerate', 'continue', 'swipe'].includes(request.type ?? 'normal')) throw fail('invalid-run-input');
                run = { runId: request.runId, baseRevision: request.baseRevision, deadlineAtMs: request.deadlineAtMs,
                    text: request.text, type: request.type ?? 'normal', status: 'running', phase: 'prepared',
                    clock: now(), seed: randomUUID(), executionId, journal: [], diceRolls: [], randomSources: [], candidate: null };
                const next = clone(capsule); next.runs.push(run); capsule = await save(capsule, next);
            }
            if (request.deadlineAtMs <= now()) throw fail('run-deadline');
            timer = setTimeout(() => controller.abort(fail('run-deadline')), request.deadlineAtMs - now());
            let ordinal = 0;
            let toolCount = 0;
            const diceRolls = clone(run.diceRolls ?? []);
            let diceIndex = 0;
            const randomSources = clone(run.randomSources ?? []);
            let entropyIndex = 0;
            const boundary = async (kind, payload, perform, query) => {
                controller.signal.throwIfAborted();
                const index = ordinal++;
                const payloadDigest = digest(payload);
                const operationId = digest([request.sessionId, request.runId, index, payloadDigest]);
                const existing = run.journal[index];
                if (existing && (existing.kind !== kind || existing.payloadDigest !== payloadDigest)) throw fail('replay-divergence');
                if (existing?.status === 'complete') return clone(existing.result);
                let response;
                if (existing) {
                    if (typeof query !== 'function') throw fail('external-result-unknown');
                    response = await callHost(() => query({ operationId, sessionId: request.sessionId, runId: request.runId,
                        generation: request.generation, payloadDigest, signal: controller.signal,
                        ...(kind === 'tool' ? { actionId: digest([request.sessionId, request.runId, operationId, payload.name, payload.argsDigest]),
                            argsDigest: payload.argsDigest, name: payload.name } : {}) }));
                    if (!response || response.status !== 'complete') throw fail('external-result-unknown');
                    if (response.operationId !== operationId || response.payloadDigest !== payloadDigest) throw fail('query-receipt-mismatch');
                    response = response.result;
                } else {
                    await updateRun(value => { value.phase = `${kind}-pending`; value.status = 'running';
                        value.diceRolls = clone(diceRolls);
                        value.randomSources = clone(randomSources);
                        value.journal.push({ kind, operationId, payloadDigest, status: 'pending' }); });
                    response = await callHost(() => perform({ operationId, payloadDigest }));
                }
                controller.signal.throwIfAborted();
                if (kind === 'tool' && (!response || response.actionId !== digest([request.sessionId, request.runId, operationId, payload.name, payload.argsDigest])
                    || response.argsDigest !== payload.argsDigest || !['committed', 'rejected'].includes(response.status)
                    || !Object.hasOwn(response, 'result'))) throw fail('invalid-tool-receipt');
                if (bytes(response) > budget.maxCapsuleBytes / 2) throw fail('external-result-too-large');
                await updateRun(value => { value.phase = `${kind}-complete`;
                    value.journal[index].status = 'complete'; value.journal[index].result = clone(response); });
                return clone(response);
            };
            if (!run.candidate) {
                const random = seedrandom(run.seed);
                const dice = { validate: droll.validate, roll(formula) {
                    const parsed = droll.parse(formula); if (!parsed) return false;
                    if (parsed.numDice > 1000 || parsed.numSides > 1_000_000) throw fail('dice-budget');
                    const index = diceIndex++;
                    if (index >= 256) throw fail('dice-budget');
                    if (diceRolls[index]) {
                        if (diceRolls[index].formula !== formula) throw fail('dice-replay-divergence');
                        return clone(diceRolls[index].result);
                    }
                    // Use the actual locked droll implementation. Entropy is
                    // persisted before external dispatch, not reimplemented or
                    // supplied by a process-global Math.random override.
                    const result = droll.roll(formula);
                    diceRolls.push({ formula, result: clone(result) });
                    return result;
                } };
                session = createSession(capsule.input, {
                    ...host, now: () => run.clock, random, dice,
                    seedrandom: (seed, options) => {
                        if (!options?.entropy) return seedrandom(seed, options);
                        const index = entropyIndex++;
                        if (index >= 1024) throw fail('entropy-budget');
                        if (randomSources[index] && randomSources[index].seed !== seed) throw fail('entropy-replay-divergence');
                        const source = randomSources[index] ??= { seed, values: [] };
                        const rng = seedrandom(seed, options); let offset = 0;
                        return () => {
                            if (offset >= 1024) throw fail('entropy-budget');
                            return source.values[offset++] ??= rng();
                        };
                    },
                    countText: (...args) => callHost(() => host.countText(...args)),
                    countMessages: (...args) => callHost(() => host.countMessages(...args)),
                    uuid: () => digest([run.seed, random()]).slice(0, 32),
                    onCheckpoint: undefined, onPresentation: undefined, onEvent: undefined,
                    tools: clone(toolDefinitions),
                    generate: (data, options) => boundary('model', data, ({ operationId, payloadDigest }) => host.generate(data, {
                        ...options, operationId, payloadDigest, sessionId: request.sessionId, runId: request.runId,
                        generation: request.generation, deadlineAtMs: request.deadlineAtMs,
                        profileId: request.profileId, profileDigest: request.profileDigest,
                        signal: controller.signal, onDraft: async draft => {
                            controller.signal.throwIfAborted();
                            if (bytes(draft.text ?? '') > budget.maxOutputBytes) throw fail('output-budget');
                            await host.onDraft?.({ ...clone(draft), sessionId: request.sessionId, runId: request.runId,
                                baseRevision: request.baseRevision, generation: request.generation });
                        },
                    }), host.queryModel),
                    invokeTool: (name, parameters) => {
                        if (++toolCount > budget.maxTools || typeof tools.execute !== 'function') throw fail('tool-budget-or-port');
                        const argsDigest = digest(parameters);
                        return boundary('tool', { name, parameters, argsDigest }, async ({ operationId, payloadDigest }) => {
                            const actionId = digest([request.sessionId, request.runId, operationId, name, argsDigest]);
                            const receipt = await tools.execute({ actionId, argsDigest, name, parameters: clone(parameters),
                                sessionId: request.sessionId, runId: request.runId, generation: request.generation,
                                operationId, payloadDigest, signal: controller.signal });
                            if (!receipt || receipt.actionId !== actionId || receipt.argsDigest !== argsDigest
                                || !['committed', 'rejected'].includes(receipt.status) || !Object.hasOwn(receipt, 'result')) throw fail('invalid-tool-receipt');
                            return receipt;
                        }, tools.query).then(receipt => {
                            if (!receipt || receipt.argsDigest !== argsDigest || !['committed', 'rejected'].includes(receipt.status)) throw fail('invalid-tool-receipt');
                            return receipt.result;
                        });
                    },
                });
                const outcome = await abortable(runCore(session, { text: run.text, type: run.type }, { signal: controller.signal }));
                if (bytes(outcome.reply) > budget.maxOutputBytes) throw fail('output-budget');
                const candidate = exportSession(session); validateInput(candidate);
                await updateRun(value => { value.candidate = candidate; value.reply = outcome.reply; value.phase = 'commit-pending'; });
            }
            await updateRun((value, next) => {
                if (next.revision !== request.baseRevision) throw fail('stale-base-revision');
                next.input = value.candidate; value.candidate = null; value.status = 'committed'; value.phase = 'terminal';
                next.revision++; next.expiresAtMs = Math.min(now() + DAY, next.createdAtMs + 7 * DAY);
            });
            return result(capsule, run);
        } catch (error) {
            if (!run || error.code === 'run-identity-conflict') throw error;
            // Reread resolves a lost CAS acknowledgement; do not overwrite a
            // successful commit, cancellation or a newer authorization fence.
            try {
                const current = await read(request.sessionId); assertFence(current, request);
                const existing = current.runs.find(value => value.runId === request.runId);
                if (!existing) throw error;
                if (terminal.has(existing.status) || existing.executionId !== executionId) return result(current, existing);
                const next = clone(current); const value = next.runs.find(value => value.runId === request.runId);
                value.error = now() >= request.deadlineAtMs ? 'run-deadline' : error.code ?? (controller.signal.aborted ? 'run-cancelled' : 'runtime-error');
                value.status = controller.signal.aborted || value.error === 'run-deadline' ? 'cancelled'
                    : value.journal.some(entry => entry.status === 'pending') || value.candidate ? 'suspended' : 'failed';
                value.phase = value.status === 'suspended' ? value.phase : 'terminal';
                const saved = await save(current, next); return result(saved, value);
            } catch { throw error; }
        } finally {
            clearTimeout(timer); if (session) disposeSession(session);
            if (active.get(request.sessionId)?.controller === controller) active.delete(request.sessionId);
        }
    }
    async function cancelRun(request) {
        const current = await read(request.sessionId); assertFence(current, request);
        const run = current.runs.find(value => value.runId === request.runId);
        if (!run) throw fail('run-unavailable');
        if (terminal.has(run.status)) return result(current, run);
        const next = clone(current); const cancelled = next.runs.find(value => value.runId === request.runId);
        cancelled.status = 'cancelled'; cancelled.phase = 'terminal'; cancelled.error = 'run-cancelled'; cancelled.candidate = null;
        const saved = await save(current, next);
        active.get(request.sessionId)?.controller.abort(fail('run-cancelled'));
        return result(saved, cancelled);
    }
    return Object.freeze({ prepareSession, runTurn: request => execute(request, false), recoverRun: request => execute(request, true),
        readRun, cancelRun, readSession: async ({ sessionId }) => {
            const value = await read(sessionId); return clone({ sessionId, revision: value.revision, generation: value.generation,
                history: value.input.history, chatMetadata: value.input.chatMetadata, expiresAtMs: value.expiresAtMs });
        },
        dispose() { closed = true; for (const value of active.values()) value.controller.abort(fail('runtime-disposed')); },
        inspect() { return { active: active.size, external: external.size, maxActive: budget.maxActive }; },
    });
}
