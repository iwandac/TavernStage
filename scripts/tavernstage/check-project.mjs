import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const json = (path) => JSON.parse(read(path));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
const manifest = json('tavernstage.json');
const pkg = json('package.json');
const lock = json('package-lock.json');

assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.name, 'TavernStage');
assert.equal(manifest.mainBranch, 'main');
assert.equal(manifest.repository, 'https://github.com/iwandac/TavernStage');
assert.equal(manifest.upstream.repository, 'https://github.com/SillyTavern/SillyTavern');
assert.equal(manifest.upstream.branch, 'release');
assert.equal(manifest.upstream.remote, 'upstream');
assert.equal(manifest.upstream.trackingRef, 'refs/remotes/upstream/release');
assert.equal(manifest.upstream.previewTrackingRef, 'refs/remotes/upstream/staging');
assert.ok(!Object.hasOwn(manifest.upstream, 'trackingBranch'), 'Do not reintroduce fork mirror branches.');
assert.deepEqual(manifest.evolutionPolicy, {
    ecosystemGoal: 'complete-st-ecosystem',
    upstreamUpdates: 'continuous-reviewed-integration',
    migrationCost: 'accepted-to-meet-host-requirements',
    scopeReductionRequiresOwnerDecision: true,
});
assert.match(manifest.upstream.commit, /^[0-9a-f]{40}$/);
assert.equal(manifest.stage, 'headless-g2');
assert.equal(manifest.runtimeAvailable, true);
assert.deepEqual(manifest.runtime, {
    entrypoint: 'src/tavernstage/managed-runtime.js',
    coreEntrypoint: 'src/tavernstage/runtime.js',
    stability: 'experimental',
    acceptedGate: 'G2',
    productionReady: false,
});
assert.match(read(manifest.runtime.entrypoint), /export function createRuntime/);
assert.match(read(manifest.runtime.coreEntrypoint), /export function createSession/);
assert.match(read(manifest.runtime.coreEntrypoint), /export async function runTurn/);
assert.equal(manifest.runtimeVersion, null);
assert.equal(manifest.releaseTagPrefix, 'tavernstage-v');
assert.equal(pkg.name, 'tavernstage');
assert.equal(pkg.private, true, 'Do not publish the inherited server package as a new runtime.');
assert.equal(pkg.repository.url, `${manifest.repository}.git`);
assert.equal(pkg.license, 'AGPL-3.0');
assert.equal(pkg.version, manifest.upstream.packageVersion);
assert.equal(lock.name, pkg.name);
assert.equal(lock.packages[''].name, pkg.name);
assert.equal(lock.version, pkg.version);
assert.equal(lock.packages[''].version, pkg.version);
assert.deepEqual(lock.packages[''].dependencies, pkg.dependencies);
assert.deepEqual(lock.packages[''].devDependencies, pkg.devDependencies);

// Git history is the provenance authority. Normalise checkout line endings only.
git('merge-base', '--is-ancestor', manifest.upstream.commit, 'HEAD');
const normalise = (value) => value.replace(/\r\n/g, '\n');
assert.equal(normalise(read('LICENSE')), normalise(git('show', `${manifest.upstream.commit}:LICENSE`)));
const baselinePkg = JSON.parse(git('show', `${manifest.upstream.commit}:package.json`));
assert.equal(baselinePkg.version, manifest.upstream.packageVersion);

assert.match(read('README.md'), /^# TavernStage/m);
const githubFiles = readdirSync(new URL('../../.github/', import.meta.url));
assert.ok(!githubFiles.some((name) => /^readme(?:\.|$)/i.test(name)), 'Root README must be the GitHub project entry.');
const workflows = readdirSync(new URL('../../.github/workflows/', import.meta.url)).sort();
assert.deepEqual(workflows, ['tavernstage-checks.yml'], 'Review inherited/new workflows before enabling them.');
const workflow = read('.github/workflows/tavernstage-checks.yml');
assert.ok(!/pull_request_target|\bwrite\b|secrets\.|npm publish/.test(workflow));
// Inspect tracked paths, not local files: ignored research must never be a CI dependency.
const inheritedAssetDocs = new Set([
    'backups/!README.md',
    'default/scaffold/README.md',
    'public/css/!USER-CSS-README.md',
    'public/scripts/extensions/tts/lib/README.md',
    'public/scripts/extensions/tts/readme.md',
]);
for (const path of git('ls-files', '-z').split('\0').filter(Boolean)) {
    assert.ok(!/^(?:doc|docs)\//i.test(path), `Local-only document is tracked: ${path}`);
    if (/\.(?:md|rst|adoc)$/i.test(path)) {
        assert.ok(path === 'README.md' || inheritedAssetDocs.has(path), `Only README and inherited asset documentation may be tracked: ${path}`);
    }
}
console.log('TavernStage identity, provenance, lock, workflow and documentation checks passed. Run the separate runtime and extraction gates; this check alone does not validate behavior.');
